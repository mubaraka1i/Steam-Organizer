require("dotenv").config();
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { URL } = require('url');

const STEAM_API_BASE = 'https://api.steampowered.com';
const IGDB_BASE = 'https://api.igdb.com/v4';
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || process.env.IGDB_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || process.env.IGDB_CLIENT_SECRET;
const igdbTokenCache = {
  accessToken: null,
  expiresAt: 0,
};
const PUBLIC_DIR = path.resolve(__dirname);
const PORT = 8000;
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const CONTENT_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function parseFormBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  return new URLSearchParams(body);
}

async function parseJsonBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  if (!body.trim()) {
    return null;
  }

  return JSON.parse(body);
}

function normalizeTitle(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\u2019'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function extractIgdbSlug(value) {
  const text = (value || '').toString().trim();
  if (!text) return '';

  try {
    const parsed = new URL(text);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const gamesIndex = parts.indexOf('games');
    if (gamesIndex !== -1 && parts[gamesIndex + 1]) {
      return parts[gamesIndex + 1].trim();
    }
  } catch (error) {
    // treat as plain text below
  }

  return text
    .toLowerCase()
    .replace(/[\u2019'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toHours(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) {
    return null;
  }

  return Number((Number(seconds) / 3600).toFixed(1));
}

function buildIgdbHeaders(accessToken) {
  return {
    'Client-ID': TWITCH_CLIENT_ID,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'text/plain',
  };
}

async function getIgdbAccessToken() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error('Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET');
  }

  if (igdbTokenCache.accessToken && Date.now() < igdbTokenCache.expiresAt) {
    return igdbTokenCache.accessToken;
  }

  const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
  tokenUrl.searchParams.set('client_id', TWITCH_CLIENT_ID);
  tokenUrl.searchParams.set('client_secret', TWITCH_CLIENT_SECRET);
  tokenUrl.searchParams.set('grant_type', 'client_credentials');

  const response = await fetch(tokenUrl, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to create Twitch token (${response.status})`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error('Twitch token response did not include an access token');
  }

  igdbTokenCache.accessToken = data.access_token;
  igdbTokenCache.expiresAt = Date.now() + Math.max(60, (data.expires_in || 0) - 60) * 1000;
  return igdbTokenCache.accessToken;
}

async function igdbPost(pathname, body) {
  const accessToken = await getIgdbAccessToken();
  const response = await fetch(`${IGDB_BASE}${pathname}`, {
    method: 'POST',
    headers: buildIgdbHeaders(accessToken),
    body,
  });

  if (!response.ok) {
    throw new Error(`IGDB request failed for ${pathname} (${response.status})`);
  }

  return response.json();
}

async function fetchIgdbCompletionTimes(title, slug) {
  const queryTitle = (title || '').toString().trim();
  const querySlug = extractIgdbSlug(slug || queryTitle);
  const searchBody = `fields id,name,slug; search "${queryTitle.replace(/"/g, '\\"')}"; limit 10;`;
  const games = [];

  if (querySlug) {
    try {
      const slugGames = await igdbPost('/games', `fields id,name,slug; where slug = "${querySlug.replace(/"/g, '\\"')}"; limit 10;`);
      if (Array.isArray(slugGames) && slugGames.length) {
        games.push(...slugGames);
      }
    } catch (error) {
      console.error('IGDB slug lookup failed:', error.message);
    }
  }

  if (!games.length) {
    const searchGames = await igdbPost('/games', searchBody);
    if (Array.isArray(searchGames) && searchGames.length) {
      games.push(...searchGames);
    }
  }

  if (!games.length) {
    return null;
  }

  const candidates = [
    ...games.filter((game) => normalizeTitle(game?.name) === normalizeTitle(queryTitle)),
    ...games.filter((game) => normalizeTitle(game?.name) !== normalizeTitle(queryTitle)),
  ];

  for (const game of candidates) {
    if (!game?.id) {
      continue;
    }

    const times = await igdbPost(
      '/game_time_to_beats',
      `fields game_id,hastily,normally,completely,count,checksum,created_at,updated_at; where game_id = ${game.id}; limit 1;`
    );
    const gameTime = Array.isArray(times) ? times[0] || null : null;

    if (!gameTime) {
      continue;
    }

    return {
      gameId: game.id,
      gameName: game.name,
      gameSlug: game.slug || null,
      completionTimesRaw: {
        hastily: gameTime.hastily ?? null,
        normally: gameTime.normally ?? null,
        completely: gameTime.completely ?? null,
        count: gameTime.count ?? null,
        checksum: gameTime.checksum || null,
        created_at: gameTime.created_at || null,
        updated_at: gameTime.updated_at || null,
      },
      completionTimes: {
        hastily: toHours(gameTime.hastily),
        normally: toHours(gameTime.normally),
        completely: toHours(gameTime.completely),
        count: gameTime.count ?? null,
      },
      searchResults: games.slice(0, 10).map((item) => ({ id: item.id, name: item.name, slug: item.slug || null })),
    };
  }

  return {
    gameId: null,
    gameName: games[0]?.name || queryTitle,
    gameSlug: games[0]?.slug || null,
    completionTimesRaw: null,
    completionTimes: null,
    noCompletionData: true,
    searchResults: games.slice(0, 10).map((item) => ({ id: item.id, name: item.name, slug: item.slug || null })),
  };
}

//function getApiKey(params) {
  // return (params.get('apikey') || '').trim();c
// }

function sendBadRequest(res, message) {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

async function sendFile(res, filePath) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = CONTENT_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

async function handleApi(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const params = await parseFormBody(req);
  const steamid = params.get('steamid');
  // const apiKey = getApiKey(params);

  if (!steamid) {
    sendBadRequest(res, 'Missing steamid');
    return;
  }

  //if (!apiKey) {
    //sendBadRequest(res, 'Missing apikey');
    //return;
  //}

  try {
    const apiUrl = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(STEAM_API_KEY)}&steamids=${encodeURIComponent(steamid)}`;
    console.log('Fetching profile:', steamid);

    const steamResponse = await fetch(apiUrl);
    const data = await steamResponse.json();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleResolve(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const params = await parseFormBody(req);
  const vanityurl = params.get('vanityurl');
  // const apiKey = getApiKey(params);

  if (!vanityurl) {
    sendBadRequest(res, 'Missing vanityurl');
    return;
  }

  // if (!apiKey) {
  //   sendBadRequest(res, 'Missing apikey');
  //   return;
  //}

  try {
    const apiUrl = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(STEAM_API_KEY)}&vanityurl=${encodeURIComponent(vanityurl)}`;
    console.log('Resolving vanity URL:', vanityurl);

    const steamResponse = await fetch(apiUrl);
    const data = await steamResponse.json();

    if (data.response && data.response.success === 1) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, steamid: data.response.steamid }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Vanity URL not found' }));
    }
  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }

}

async function handleGames(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const params = await parseFormBody(req);
  const steamid = params.get('steamid');
  //const apiKey = getApiKey(params);

  if (!steamid) {
    sendBadRequest(res, 'Missing steamid');
    return;
  }

  /* if (!apiKey) {
    sendBadRequest(res, 'Missing apikey');
    return;
  } */

  try {
    const apiUrl = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(STEAM_API_KEY)}&steamid=${encodeURIComponent(steamid)}&include_appinfo=1&include_played_free_games=1`;
    console.log('Fetching owned games:', steamid);

    const steamResponse = await fetch(apiUrl);
    const data = await steamResponse.json();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleIgdbCompletionTimes(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    let title = '';
    let slug = '';

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      title = url.searchParams.get('title')?.toString().trim() || '';
      slug = url.searchParams.get('slug')?.toString().trim() || '';
    } else {
      const body = await parseJsonBody(req);
      title = body?.title?.toString().trim() || '';
      slug = body?.slug?.toString().trim() || '';
    }

    const result = await fetchIgdbCompletionTimes(title, slug);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No match found in IGDB', title }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error('Error fetching IGDB completion times:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  console.log(`${req.method} ${pathname}`);

  if (pathname === '/api') {
    await handleApi(req, res);
    return;
  }

  if (pathname === '/resolve') {
    await handleResolve(req, res);
    return;
  }

  if (pathname === '/games') {
    await handleGames(req, res);
    return;
  }

  if (pathname === '/api/igdb-completion-times') {
    await handleIgdbCompletionTimes(req, res);
    return;
  }

  if (pathname === '/map') {
    await sendFile(res, path.join(PUBLIC_DIR, 'map.html'));
    return;
  }

  

  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.join(PUBLIC_DIR, path.normalize(requestedPath));

  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  await sendFile(res, safePath);
}

const server = http.createServer(requestHandler);

server.listen(PORT, () => {
  console.log(`GuideRail server running at http://localhost:${PORT}`);
});
