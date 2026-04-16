const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { URL } = require('url');

const STEAM_API_BASE = 'https://api.steampowered.com';
const PUBLIC_DIR = path.resolve(__dirname);
const PORT = 8000;

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

function getApiKey(params) {
  return (params.get('apikey') || '').trim();
}

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
  const apiKey = getApiKey(params);

  if (!steamid) {
    sendBadRequest(res, 'Missing steamid');
    return;
  }

  if (!apiKey) {
    sendBadRequest(res, 'Missing apikey');
    return;
  }

  try {
    const apiUrl = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${encodeURIComponent(steamid)}`;
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
  const apiKey = getApiKey(params);

  if (!vanityurl) {
    sendBadRequest(res, 'Missing vanityurl');
    return;
  }

  if (!apiKey) {
    sendBadRequest(res, 'Missing apikey');
    return;
  }

  try {
    const apiUrl = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(apiKey)}&vanityurl=${encodeURIComponent(vanityurl)}`;
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
  const apiKey = getApiKey(params);

  if (!steamid) {
    sendBadRequest(res, 'Missing steamid');
    return;
  }

  if (!apiKey) {
    sendBadRequest(res, 'Missing apikey');
    return;
  }

  try {
    const apiUrl = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamid)}&include_appinfo=1&include_played_free_games=1`;
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
