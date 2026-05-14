/*
 * This file controls the interactive railroad map
 * system used to organize the user's Steam backlog.
 *
 * 
 * 1. Load saved Steam games from localStorage
 * 2. Organize games into railroad tracks
 * 3. Create visual game nodes/stations
 * 4. Allow games to be moved between tracks
 * 5. Estimate backlog completion progress
 * 6. Support importing/exporting game data
 * 7. Connect to IGDB for completion-time data
 *
 * This file acts as the main "game board"
 * of the GuideRail application.
 */

/*
 * Shared localStorage keys used throughout the app.
 *
 * - profile.html
 * - map.html
 * - eta.html
 *
 * to share the same saved user/game data.
 */
const PROFILE_STORAGE_KEY = 'team03_guideRail_profile';
const GAMES_STORAGE_KEY = 'team03_guideRail_games';
const THEME_KEY = 'team03_guideRail_theme';
const ETA_WEEKLY_STORAGE_KEY = 'team03_guideRail_eta_weekly';

const IGDB_BASE = 'https://api.igdb.com/v4';
const APPROXI_PROXY_BASE = 'https://approxi--approxi-65847.us-east4.hosted.app/p/aliappleton-project?url=';
const APPROXI_PROXY_TOKEN = 'fc4ad495d79dcd63805091a8971fcc0771c9b49bd688d131';

/*
 * Returns the secure proxy token used
 * for authenticated proxy requests.
 *
 * - Steam
 * - IGDB
 */
function getApproxiToken() {
  try {
    return APPROXI_PROXY_TOKEN || '';
  } catch (e) {
    return '';
  }
}

/*
 * Stores temporary IGDB access token data.
 *
 * Instead of requesting a new token every time,
 * the token is cached until it expires.
 *
 * This improves performance and reduces
 * unnecessary API requests.
 */
const igdbTokenCache = {
  accessToken: null,
  expiresAt: 0,
};

/*
 * Parses game names or IGDB URLs entered by the user.
 *
 * Users can enter:
 * - a plain game title
 * - or a full IGDB game URL
 *
 * This function extracts the game title
 * so it can later be searched through IGDB.
 */
function parseIgdbInput(value) {
  const text = String(value || '').trim();
  if (!text) {
    return { title: '', slug: '' };
  }

  try {
    const parsed = new URL(text);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const gamesIndex = parts.indexOf('games');
    if (gamesIndex !== -1 && parts[gamesIndex + 1]) {
      const slug = parts[gamesIndex + 1].trim();
      return { title: slug.replace(/-/g, ' '), slug };
    }
  } catch (error) {
    // Plain text title.
  }

  const slug = text
    .toLowerCase()
    .replace(/[\u2019'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return { title: text, slug };
}

/*
 * Formats IGDB API results into readable JSON text.
 *
 * Used mainly for debugging/testing the
 * IGDB completion-time system.
 */
function formatIgdbResult(result) {
  if (!result) return 'No result returned.';
  if (result.notFound) {
    return JSON.stringify({ error: result.error || 'No match found in IGDB' }, null, 2);
  }
  if (result.raw || result.hours) {
    return JSON.stringify({ raw: result.raw || null, hours: result.hours || null }, null, 2);
  }
  return JSON.stringify(result, null, 2);
}
/*
 * Fetches estimated completion times from IGDB.
 *
 * - main story hours
 * - completionist hours
 * - rushed playthrough hours
 *
 * This data helps GuideRail estimate
 * how long the user's backlog may take
 * to finish.
 */
async function fetchIgdbCompletionTimes(inputValue) {
  const parsed = parseIgdbInput(inputValue);
  const queryTitle = parsed.title.trim();
  const querySlug = parsed.slug.trim();
  
  if (!queryTitle && !querySlug) {
    return { notFound: true, error: 'Please enter a game name or IGDB URL' };
  }

  try {
    let game = null;
    
    // Try slug lookup first if available
    if (querySlug) {
      const slugBody = `fields id,name,slug; where slug = "${querySlug.replace(/"/g, '\\"')}"; limit 1;`;
      const slugResponse = await igdbPost('/games', slugBody);
      if (Array.isArray(slugResponse) && slugResponse.length > 0) {
        game = slugResponse[0];
      }
    }
    
    // Fall back to search if slug didn't find anything
    if (!game) {
      const searchBody = `fields id,name,slug; search "${queryTitle.replace(/"/g, '\\"')}"; limit 5;`;
      const searchResponse = await igdbPost('/games', searchBody);
      if (Array.isArray(searchResponse) && searchResponse.length > 0) {
        game = searchResponse[0];
      }
    }
    
    if (!game) {
      return { notFound: true, error: 'No match found in IGDB', title: queryTitle };
    }
    
    // Fetch completion times for the found game
    const timesBody = `fields hastily,normally,completely,count; where game_id = ${game.id}; limit 1;`;
    const timesResponse = await igdbPost('/game_time_to_beats', timesBody);
    
    if (!Array.isArray(timesResponse) || timesResponse.length === 0) {
      return { notFound: true, error: 'No completion time data found for this game', title: game.name };
    }
    
    const times = timesResponse[0];
    const hours = {
      hastily: times.hastily ? Math.round((times.hastily / 3600) * 10) / 10 : null,
      normally: times.normally ? Math.round((times.normally / 3600) * 10) / 10 : null,
      completely: times.completely ? Math.round((times.completely / 3600) * 10) / 10 : null,
      count: times.count || 0
    };
    
    return { raw: times, hours, gameName: game.name };
  } catch (error) {
    throw new Error(`IGDB lookup failed: ${error.message}`);
  }
}
/*
 * Requests an OAuth access token for IGDB/Twitch.
 *
 * IGDB requires an authenticated access token
 * before game data can be requested.
 *
 * The token is requested through the proxy server
 * so sensitive API credentials stay hidden
 * from the frontend application.
 *
 * Tokens are cached temporarily to avoid
 * repeatedly requesting new ones.
 */
async function getIgdbAccessToken() {
  if (igdbTokenCache.accessToken && Date.now() < igdbTokenCache.expiresAt) {
    return igdbTokenCache.accessToken;
  }

  // Use Approxi proxy to perform the Twitch OAuth token exchange server-side.
  // Approxi will inject the configured TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
  // so the secrets are not exposed in this repository.
  const proxiedTokenUrl = 'https://id.twitch.tv/oauth2/token?client_id={TWITCH_CLIENT_ID}&client_secret={TWITCH_CLIENT_SECRET}&grant_type=client_credentials';
  const proxyUrl = `${APPROXI_PROXY_BASE}${encodeURIComponent(proxiedTokenUrl)}`;

  const proxyToken = getApproxiToken();
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'x-proxy-token': proxyToken,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get Twitch token via proxy (${response.status})`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error('No access token in response from proxy');
  }

  igdbTokenCache.accessToken = data.access_token;
  igdbTokenCache.expiresAt = Date.now() + Math.max(60, (data.expires_in || 0) - 60) * 1000;
  return igdbTokenCache.accessToken;
}
/*
 * Builds the HTTP headers required for IGDB requests.
 *
 * These headers include:
 * - the Twitch client ID
 * - the OAuth access token
 * - content type information
 *
 * IGDB uses these headers to authenticate
 * and validate incoming requests.
 */
async function buildIgdbHeaders(accessToken) {
  return {
    'Client-ID': TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    'Content-Type': 'text/plain',
  };
}
/*
 * Sends a POST request to the IGDB API.
 *
 * This function acts as the main helper
 * for communicating with IGDB endpoints.
 *
 * Requests are routed through the proxy server
 * to protect API credentials and avoid CORS issues.
 */
async function igdbPost(pathname, body) {
  const accessToken = await getIgdbAccessToken();
  const igdbUrl = `${IGDB_BASE}${pathname}`;
  const proxyUrl = `${APPROXI_PROXY_BASE}${encodeURIComponent(igdbUrl)}`;
  
  const proxyToken = getApproxiToken();
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'x-proxy-token': proxyToken,
      // Use Approxi placeholder so the real Client ID is injected server-side
      'Client-ID': '{TWITCH_CLIENT_ID}',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'text/plain'
    },
    body
  });

  if (!response.ok) {
    throw new Error(`IGDB request failed (${response.status})`);
  }

  return response.json();
}
/*
 * Applies the currently selected application theme.
 *
 * If the user selected the blue theme,
 * the light-theme CSS class is added
 * to the page body.
 */
function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'blue');
}

function initThemeToggle() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'green';
  applyTheme(savedTheme);

  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = localStorage.getItem(THEME_KEY) || 'green';
      const next = current === 'green' ? 'blue' : 'green';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
}
/*
 * Loads the current Steam user's display name.
 *
 * The profile data was originally saved
 * during the login process in login.js.
 *
 * Used to personalize the map page.
 */
function loadProfileName() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return 'Guest';
    const profile = JSON.parse(raw);
    return profile?.personaname || 'Guest';
  } catch {
    return 'Guest';
  }
}
/*
 * Loads the current Steam user's display name.
 *
 * The profile data was originally saved
 * during the login process in login.js.
 *
 * Used to personalize the map page.
 */
function loadGames() {
  try {
    const raw = localStorage.getItem(GAMES_STORAGE_KEY);
    if (!raw) return [];
    const games = JSON.parse(raw);
    return Array.isArray(games) ? games : [];
  } catch {
    return [];
  }
}
// Converts Steam minute playtime to hours
function formatHours(playtimeForever) {
  return `${((playtimeForever || 0) / 60).toFixed(1)}h`;
}
/*
 * Classifies a game's activity status
 * based on total playtime.
 *
 * - unplayed
 * - playing
 * - active
 * - complete
 *
 * These classifications help visually
 * style game nodes on the railroad map.
 */
function classifyGame(game) {
  const hours = (game.playtime_forever || 0) / 60;
  if (hours === 0) return 'unplayed';
  if (hours >= 100) return 'complete';
  if (hours >= 20) return 'active';
  return 'playing';
}
/*
 * Estimates the calendar year when the user
 * may finish their backlog.
 *
 * This estimate is based on:
 * - unplayed games
 * - total playtime
 * - estimated hours remaining
 */
function estimateEtaYear(games) {
  const totalBacklogHours = games
    .filter((game) => (game.playtime_forever || 0) === 0)
    .length * 12;
  const activeHours = games.reduce((sum, game) => sum + ((game.playtime_forever || 0) / 60), 0);
  const totalHours = activeHours + totalBacklogHours;
  const currentYear = new Date().getFullYear();
  const months = Math.max(1, Math.ceil(totalHours / 18));
  return currentYear + Math.ceil(months / 12);
}
/*
 * Loads the user's saved weekly gaming schedule.
 *
 * This schedule is shared with eta.js
 * and is used to estimate backlog completion speed.
 */
function loadEtaSchedule() {
  try {
    const raw = localStorage.getItem(ETA_WEEKLY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
/*
 * Loads the user's saved weekly gaming schedule.
 *
 * This schedule is shared with eta.js
 * and is used to estimate backlog completion speed.
 */
function estimateBacklogHours(games) {
  return games.reduce((sum, game) => {
    const track = game.track || 'unassigned';
    const isOnLine = track === 'mainline' || track === 'branch' || track === 'sidetrack';
    const isComplete = String(game.status || '').toLowerCase() === 'complete';
    if (!isOnLine || isComplete) {
      return sum;
    }
    return sum + (Number(game.completionHours) || 0);
  }, 0);
}
/*
 * Calculates the user's total weekly gaming hours
 * from their saved ETA schedule.
 *
 * Monday: 2
 * Tuesday: 3
 * Total: 5
 */

function weeklyHoursFromSchedule(schedule) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days.reduce((sum, day) => sum + (Number(schedule?.[day]) || 0), 0);
}

function formatEtaDays(backlogHours, weeklyHours) {
  if (weeklyHours <= 0) {
    return '0.0 days';
  }
  const days = (backlogHours / weeklyHours) * 7;
  return `${days.toFixed(1)} days`;
}

/*
 * Creates a visual game node/station
 * for the railroad map.
 *
 * Each node contains:
 * - game title
 * - playtime
 * - completion estimate
 * - status controls
 * - track assignment controls
 * - movement controls
 *
 * This is one of the main UI-building
 * functions in the application.
 */
function createNode(game) {
  const card = document.createElement('article');
  card.className = `game-node ${classifyGame(game)}`;

  const title = document.createElement('h4');
  title.textContent = game.name || `App ${game.appid}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${formatHours(game.playtime_forever)} played`;

  const completionField = document.createElement('label');
  completionField.className = 'completion-field';
  completionField.textContent = 'Completion time (hrs)';

  const completionInput = document.createElement('input');
  completionInput.type = 'number';
  completionInput.min = '0';
  completionInput.step = '0.25';
  completionInput.placeholder = '0';
  completionInput.value = game.completionHours !== undefined && game.completionHours !== null ? String(game.completionHours) : '';
  completionInput.addEventListener('input', () => {
    try {
      const games = loadGames();
      const idx = games.findIndex((g) => String(g.appid) === String(game.appid));
      if (idx !== -1) {
        const value = completionInput.value.trim();
        games[idx].completionHours = value === '' ? undefined : Number(value);
        saveGames(games);
      }
    } catch (err) {
      console.error('Failed to save completion time', err);
    }
  });
  completionField.appendChild(completionInput);

  // status selector (persisted on the game as `status`)
  const statusSelect = document.createElement('select');
  statusSelect.className = 'status-select';
  statusSelect.setAttribute('aria-label', 'Game status');
  const statusOptions = [
    ['unplayed', 'Unplayed'],
    ['playing', 'Playing'],
    ['paused', 'Paused'],
    ['complete', 'Complete'],
  ];
  statusOptions.forEach(([val, label]) => {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = label;
    statusSelect.appendChild(o);
  });
  const derived = game.status ? String(game.status).toLowerCase() : classifyGame(game);
  statusSelect.value = derived;
  statusSelect.addEventListener('change', (e) => {
    try {
      const games = loadGames();
      const idx = games.findIndex((g) => String(g.appid) === String(game.appid));
      if (idx !== -1) {
        games[idx].status = statusSelect.value === 'unplayed' ? undefined : statusSelect.value;
        saveGames(games);
        renderMap();
      }
    } catch (err) {
      console.error('Failed to change status', err);
    }
  });

  card.append(title, meta, completionField, statusSelect);

  if (game.url) {
    const play = document.createElement('button');
    play.className = 'btn play-btn';
    play.type = 'button';
    play.textContent = 'Play';
    play.addEventListener('click', () => {
      try {
        window.open(game.url, '_blank', 'noopener');
      } catch (e) {
        console.error('Failed to open game url', e);
      }
    });
    card.appendChild(play);
  }
  // move controls (position within the line) grouped
  const moveWrap = document.createElement('div');
  moveWrap.className = 'move-wrap';
  const moveLeft = document.createElement('button');
  moveLeft.type = 'button';
  moveLeft.className = 'btn move-left';
  moveLeft.setAttribute('aria-label', 'Move earlier on this line');
  moveLeft.textContent = '←';
  moveLeft.addEventListener('click', () => moveGameWithinTrack(game.appid, -1));
  const moveRight = document.createElement('button');
  moveRight.type = 'button';
  moveRight.className = 'btn move-right';
  moveRight.setAttribute('aria-label', 'Move later on this line');
  moveRight.textContent = '→';
  moveRight.addEventListener('click', () => moveGameWithinTrack(game.appid, 1));
  moveWrap.appendChild(moveLeft);
  moveWrap.appendChild(moveRight);
  card.appendChild(moveWrap);
  // assign selector (styled like status)
  const assign = document.createElement('select');
  assign.className = 'status-select assign-select';
  assign.setAttribute('aria-label', 'Game track assignment');
  const opts = [
    ['unassigned', 'Yard'],
    ['mainline', 'Main Line'],
    ['branch', 'Branch'],
    ['sidetrack', 'Sidetrack'],
  ];
  opts.forEach(([val, label]) => {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = label;
    assign.appendChild(o);
  });
  assign.value = game.track || 'unassigned';
  assign.addEventListener('change', (e) => {
    try {
      const games = loadGames();
      const idx = games.findIndex((g) => String(g.appid) === String(game.appid));
      if (idx !== -1) {
        games[idx].track = assign.value === 'unassigned' ? undefined : assign.value;
        saveGames(games);
        renderMap();
      }
    } catch (err) {
      console.error('Failed to assign game', err);
    }
  });
  card.appendChild(assign);
  return card;
}

/*
 * Saves the current game library into localStorage.
 *
 * This allows map changes to persist
 * across page refreshes and browser sessions.
 */
function saveGames(games) {
  try {
    localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(games));
  } catch (e) {
    console.error('Failed to save games', e);
  }
}
/*
 * Moves a game forward or backward
 * within its current railroad track.
 *
 * This changes the visual ordering
 * of game nodes on the map.
 */
function moveGameWithinTrack(appid, dir) {
  try {
    const games = loadGames();
    const idx = games.findIndex((g) => String(g.appid) === String(appid));
    if (idx === -1) return;
    const track = games[idx].track || 'unassigned';
    const same = games.map((g, i) => ({ g, i })).filter((x) => (x.g.track || 'unassigned') === track);
    const pos = same.findIndex((x) => String(x.g.appid) === String(appid));
    if (pos === -1) return;
    if (dir === -1 && pos > 0) {
      // move before previous same-track game
      const [item] = games.splice(idx, 1);
      const refAppid = same[pos - 1].g.appid;
      const refIdx = games.findIndex((g) => String(g.appid) === String(refAppid));
      games.splice(refIdx, 0, item);
      saveGames(games);
      renderMap();
    } else if (dir === 1 && pos < same.length - 1) {
      // move after next same-track game
      const [item] = games.splice(idx, 1);
      const refAppid = same[pos + 1].g.appid;
      const refIdx = games.findIndex((g) => String(g.appid) === String(refAppid));
      games.splice(refIdx + 1, 0, item);
      saveGames(games);
      renderMap();
    }
  } catch (err) {
    console.error('Failed to move game', err);
  }
}
/*
 * Adds a new game into the saved library
 * and rerenders the map UI.
 */
function addGame(game) {
  const games = loadGames();
  games.push(game);
  saveGames(games);
  renderMap();
}

/*
 * Exports the user's saved game library
 * as a downloadable JSON file.
 *
 * This allows:
 * - backups
 * - sharing
 * - importing later
 */
function exportGames() {
  const games = loadGames();
  const blob = new Blob([JSON.stringify(games, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'guideRail_games.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
/*
 * Exports the user's saved game library
 * as a downloadable JSON file.
 *
 * This allows:
 * - backups
 * - sharing
 * - importing later
 */
function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed)) throw new Error('Invalid format');
      saveGames(parsed);
      renderMap();
    } catch (err) {
      console.error('Import failed', err);
      alert('Failed to import library: invalid file');
    }
  };
  reader.readAsText(file);
}
/*
 * Validates imported game JSON structures.
 *
 * Supports multiple possible import formats.
 */
function normalizeGameImportPayload(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && Array.isArray(parsed.games)) {
    return parsed.games;
  }
  if (parsed && parsed.response && Array.isArray(parsed.response.games)) {
    return parsed.response.games;
  }
  return null;
}

/*
 * Populates the add-game form with
 * games from the user's Steam library.
 *
 * Allows users to quickly assign games
 * onto railroad tracks.
 */
function populateAddForm(preselectAppid, preselectTrack) {
  const sel = document.getElementById('game-select');
  const urlInput = document.getElementById('game-url');
  if (!sel) return;
  sel.innerHTML = '';
  const games = loadGames();
  if (!games.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No games in library — import first';
    sel.appendChild(opt);
    if (urlInput) urlInput.value = '';
    return;
  }
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- select a game --';
  sel.appendChild(placeholder);

  games.forEach((g) => {
    const o = document.createElement('option');
    o.value = g.appid;
    const assigned = g.track ? ` (on ${g.track})` : '';
    o.textContent = `${g.name || g.appid}${assigned}`;
    sel.appendChild(o);
  });

  if (preselectAppid) sel.value = String(preselectAppid);
  if (preselectTrack) {
    const trackSel = document.getElementById('game-track');
    if (trackSel) trackSel.value = preselectTrack;
  }
  if (preselectAppid && urlInput) {
    const g = games.find((x) => String(x.appid) === String(preselectAppid));
    urlInput.value = g && g.url ? g.url : '';
  }
}

function getPageSize() {
  // Use a single-item page on small viewports (phones), otherwise show 4 per page
  return window.matchMedia('(max-width: 420px)').matches ? 1 : 4;
}

const trackPages = { mainline: 0, branch: 0, sidetrack: 0 };

function renderTrack(container, games, trackName) {
  container.innerHTML = '';
  const page = trackPages[trackName] || 0;
  const pageSize = getPageSize();
  const totalPages = Math.max(1, Math.ceil((games.length || 0) / pageSize));
  const start = page * pageSize;
  const pageItems = games.slice(start, start + pageSize);

  if (!pageItems.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'track-empty';
    const hint = document.createElement('div');
    hint.className = 'track-hint';
    hint.textContent = 'Empty — add games to this line';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary add-to-line';
    btn.textContent = 'Add to this line';
    btn.addEventListener('click', () => {
      const addForm = document.getElementById('add-game-form');
      if (!addForm) return;
      populateAddForm(null, trackName === 'sidetrack' ? 'sidetrack' : trackName);
      addForm.hidden = false;
      addForm.setAttribute('aria-hidden', 'false');
      const sel = document.getElementById('game-select');
      if (sel) sel.focus();
    });
    placeholder.appendChild(hint);
    placeholder.appendChild(btn);
    container.appendChild(placeholder);
  } else {
    pageItems.forEach((game, index) => {
      if (index > 0) {
        const spacer = document.createElement('div');
        spacer.className = 'node-spacer';
        container.appendChild(spacer);
      }
      container.appendChild(createNode(game));
    });
  }

  // update control button disabled state
  const prevBtn = document.getElementById(`${trackName}-prev`);
  const nextBtn = document.getElementById(`${trackName}-next`);
  if (prevBtn) prevBtn.disabled = page <= 0;
  if (nextBtn) nextBtn.disabled = page >= totalPages - 1;
}

async function renderMap() {
  const games = loadGames();

  const empty = document.getElementById('map-empty');
  const hasGames = games.length > 0;
  empty.hidden = hasGames;

  // Use explicit track assignment. Unassigned games live in the yard.
  const mainline = games.filter((g) => g.track === 'mainline');
  const branch = games.filter((g) => g.track === 'branch');
  const sidetracks = games.filter((g) => g.track === 'sidetrack');
  const unassigned = games.filter((g) => !g.track || g.track === 'unassigned');

  document.getElementById('stat-games').textContent = String(games.length);
  const totalHours = games.reduce((sum, game) => sum + ((game.playtime_forever || 0) / 60), 0);
  document.getElementById('stat-hours').textContent = totalHours.toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById('stat-unplayed').textContent = String(games.filter((game) => (game.playtime_forever || 0) === 0).length);
  try {
    const backlogHours = estimateBacklogHours(games);
    const weeklyHours = weeklyHoursFromSchedule(loadEtaSchedule());
    document.getElementById('stat-eta').textContent = formatEtaDays(backlogHours, weeklyHours);
  } catch (e) {
    document.getElementById('stat-eta').textContent = '0.0 days';
  }

  renderTrack(document.getElementById('mainline-track'), mainline, 'mainline');
  renderTrack(document.getElementById('branch-track'), branch, 'branch');
  renderTrack(document.getElementById('sidetrack-track'), sidetracks, 'sidetrack');

  // ensure page indices are within bounds (use current page size)
  ['mainline', 'branch', 'sidetrack'].forEach((t) => {
    const arr = t === 'mainline' ? mainline : t === 'branch' ? branch : sidetracks;
    const pages = Math.max(1, Math.ceil(arr.length / getPageSize()));
    if ((trackPages[t] || 0) >= pages) trackPages[t] = Math.max(0, pages - 1);
  });

  // Yard shows unassigned games stats
  const unplayed = unassigned.filter((game) => (game.playtime_forever || 0) === 0);
  const short = unplayed.filter((game) => game.playtime_forever === 0).length;
  const medium = unassigned.filter((game) => {
    const hours = (game.playtime_forever || 0) / 60;
    return hours >= 5 && hours < 20;
  }).length;
  const long = unassigned.filter((game) => (game.playtime_forever || 0) / 60 >= 20).length;

  document.getElementById('yard-short').textContent = `${short} games`;
  document.getElementById('yard-medium').textContent = `${medium} games`;
  document.getElementById('yard-long').textContent = `${long} games`;
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  renderMap();

  const etaCalcBtn = document.getElementById('eta-calc-btn');
  if (etaCalcBtn) {
    etaCalcBtn.addEventListener('click', () => {
      renderMap();
      const etaStat = document.getElementById('stat-eta');
      if (etaStat) {
        etaStat.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  const igdbTestBtn = document.getElementById('igdb-test-btn');
  const igdbTitleInput = document.getElementById('igdb-title');
  const igdbStatusEl = document.getElementById('igdb-status');
  const igdbOutputEl = document.getElementById('igdb-output');
  const importPreview = document.getElementById('map-import-preview');
  const importPreviewSummary = document.getElementById('map-import-preview-summary');
  const importPreviewSample = document.getElementById('map-import-preview-sample');
  const importPreviewConfirm = document.getElementById('map-import-confirm-btn');
  const importPreviewCancel = document.getElementById('map-import-cancel-btn');
  let pendingImportFile = null;

  /*
 * Hides the game import preview window.
 *
 * This clears the currently selected import file
 * and removes the preview panel from the page.
 */
  const hideImportPreview = () => {
    pendingImportFile = null;
    if (importPreview) {
      importPreview.hidden = true;
    }
  };
/*
 * Displays a preview of a game library file
 * before importing it.
 *
 * This allows the user to:
 * - verify the file format
 * - preview game names
 * - confirm the import safely
 */
  const showImportPreview = async (file) => {
    // Prevent previewing if required UI elements are missing
    if (!importPreview || !importPreviewSummary || !importPreviewSample) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const games = normalizeGameImportPayload(parsed);
      if (!Array.isArray(games)) {
        throw new Error('Expected a JSON array of games.');
      }

      pendingImportFile = file;
      // Display how many games were detected in the file
      importPreviewSummary.textContent = `${games.length} game${games.length === 1 ? '' : 's'} ready to import from ${file.name}.`;
      const sampleNames = games.slice(0, 3).map((game) => game.name || `App ${game.appid}`);
      importPreviewSample.textContent = sampleNames.length
        ? `Preview: ${sampleNames.join(', ')}${games.length > 3 ? '...' : ''}`
        : 'Preview: no game names found in the file.';
      importPreview.hidden = false;
    } catch (error) {
      pendingImportFile = null;
      importPreviewSummary.textContent = 'Could not preview that file.';
      importPreviewSample.textContent = error.message;
      importPreview.hidden = false;
    }
  };
/*
 * Final confirmation button for importing games.
 *
 * Once confirmed:
 * - the selected file is imported
 * - the preview window closes
 */
  if (importPreviewConfirm) {
    importPreviewConfirm.addEventListener('click', () => {
      if (!pendingImportFile) return;
      handleImportFile(pendingImportFile);
      hideImportPreview();
    });
  }

  if (importPreviewCancel) {
    importPreviewCancel.addEventListener('click', () => {
      hideImportPreview();
    });
  }
/*
 * Updates the IGDB status message area.
 *
 * Used to display:
 * - loading messages
 * - success messages
 * - error messages
 */
  const setIgdbStatus = (message, type = '') => {
    if (igdbStatusEl) {
      igdbStatusEl.textContent = message;
      igdbStatusEl.className = `status-message ${type}`.trim();
    }
  };
// If the value is already text, display it directly.
// Otherwise convert the object into readable JSON text.
  const setIgdbOutput = (value) => {
    if (igdbOutputEl) {
      igdbOutputEl.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    }
  };
/*
 * Handles IGDB completion-time lookups.
 *
 * Users can search for a game title
 * and retrieve estimated completion times
 * from the IGDB database.
 */
  if (igdbTestBtn && igdbTitleInput) {
    igdbTestBtn.addEventListener('click', async () => {
      const title = igdbTitleInput.value.trim();
      if (!title) {
        setIgdbStatus('Enter a game name or IGDB URL first.', 'error');
        return;
      }

      try {
        igdbTestBtn.disabled = true;
        setIgdbStatus(`Looking up ${title}...`, 'loading');
        setIgdbOutput('Waiting for proxy response...');

        const result = await fetchIgdbCompletionTimes(title);
        if (result?.notFound) {
          setIgdbStatus(`No match found for ${title}`, 'error');
          setIgdbOutput({ error: result.error || 'No match found in IGDB', title });
          return;
        }

        setIgdbStatus(`Success: ${title}`, 'success');
        setIgdbOutput(formatIgdbResult(result));
      } catch (error) {
        setIgdbStatus(`Failed: ${error.message}`, 'error');
        setIgdbOutput({ error: error.message });
      } finally {
        igdbTestBtn.disabled = false;
      }
    });
  }
  // Map control bindings
  const addBtn = document.getElementById('add-game-btn');
  const addForm = document.getElementById('add-game-form');
  const importInput = document.getElementById('import-games-input');
  const importBtn = document.getElementById('import-games-btn');
  const exportBtn = document.getElementById('export-games-btn');

  /*
 * Handles tab switching in the add-game form
 * between "From Your Library" and "Manual Entry"
 */
  function setupAddGameTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        
        // Update active tab button
        tabBtns.forEach((b) => b.classList.remove('tab-active'));
        btn.classList.add('tab-active');
        
        // Update active tab content
        tabContents.forEach((content) => {
          if (content.id === `${tabName}-tab`) {
            content.hidden = false;
          } else {
            content.hidden = true;
          }
        });
      });
    });
  }

  /*
 * Opens the add-game form when the user
 * wants to place a game onto a railroad line.
 */
  if (addBtn && addForm) {
    addBtn.addEventListener('click', () => {
      populateAddForm();
      setupAddGameTabs();
      addForm.hidden = false;
      addForm.setAttribute('aria-hidden', 'false');
      const sel = document.getElementById('game-select');
      if (sel) sel.focus();
    });

    const cancel = document.getElementById('cancel-add-game');
    if (cancel) {
      cancel.addEventListener('click', () => {
        addForm.reset();
        addForm.hidden = true;
        addForm.setAttribute('aria-hidden', 'true');
      });
    }
/*
 * Handles submission of the add-game form.
 *
 * This assigns a selected game (from library or manual entry)
 * to one of the railroad tracks.
 */
    addForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const track = document.getElementById('game-track').value;
      const activeTab = document.querySelector('.tab-btn.tab-active');
      const currentTab = activeTab ? activeTab.getAttribute('data-tab') : 'library';
      
      if (currentTab === 'library') {
        // Library selection mode
        const appid = document.getElementById('game-select').value;
        if (!appid) {
          alert('Please select a game from your library first (or import your library).');
          return;
        }
        const games = loadGames();
        const idx = games.findIndex((g) => String(g.appid) === String(appid));
        if (idx === -1) {
          alert('Selected game not found in library. Try importing your library.');
          return;
        }
        // Assign the game to the selected railroad line
        games[idx].track = track === 'unassigned' ? undefined : track;
        saveGames(games);
      } else {
        // Manual entry mode
        const gameName = document.getElementById('game-manual-input').value.trim();
        if (!gameName) {
          alert('Please enter a game name.');
          return;
        }
        const games = loadGames();
        // Create a new game object for manually entered game
        const newGame = {
          appid: `manual_${Date.now()}`,
          name: gameName,
          playtimeHours: 0,
          track: track === 'unassigned' ? undefined : track,
          isManualEntry: true
        };
        games.push(newGame);
        saveGames(games);
      }
      
      addForm.reset();
      addForm.hidden = true;
      addForm.setAttribute('aria-hidden', 'true');
      renderMap();
    });
  }

  if (importInput) {
    importInput.addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (file) showImportPreview(file);
      importInput.value = '';
    });
    if (importBtn) {
      importBtn.addEventListener('click', () => importInput.click());
    }
  }
/*
 * Drag-and-drop support for importing game libraries.
 */
  const mapImportDropZone = document.querySelector('.map-controls') || document.querySelector('.controls-row');
  if (mapImportDropZone && importInput) {
    mapImportDropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    mapImportDropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        showImportPreview(file);
      }
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => exportGames());
  }

  // track pagination buttons
  const tracks = ['mainline', 'branch', 'sidetrack'];
  tracks.forEach((t) => {
    const prev = document.getElementById(`${t}-prev`);
    const next = document.getElementById(`${t}-next`);
    if (prev) prev.addEventListener('click', () => {
      trackPages[t] = Math.max(0, (trackPages[t] || 0) - 1);
      renderMap();
    });
    if (next) next.addEventListener('click', () => {
      trackPages[t] = (trackPages[t] || 0) + 1;
      renderMap();
    });
  });

  // Re-render on resize to adjust page size for small viewports
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderMap(), 120);
  });
});
