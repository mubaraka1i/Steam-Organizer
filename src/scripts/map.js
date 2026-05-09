const PROFILE_STORAGE_KEY = 'guideRail_profile';
const GAMES_STORAGE_KEY = 'guideRail_games';
const THEME_KEY = 'guideRail_theme';

const IGDB_BASE = 'https://api.igdb.com/v4';
const APPROXI_PROXY_BASE = 'https://approxi--approxi-65847.us-east4.hosted.app/p/aliappleton-project?url=';
const APPROXI_PROXY_TOKEN = '68b1d5ba4cde33c593522d9dc0c0ac9898dd023bad0b33a0';

function getApproxiToken() {
  try {
    return APPROXI_PROXY_TOKEN || '';
  } catch (e) {
    return '';
  }
}

const igdbTokenCache = {
  accessToken: null,
  expiresAt: 0,
};

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

async function buildIgdbHeaders(accessToken) {
  return {
    'Client-ID': TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    'Content-Type': 'text/plain',
  };
}

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

function formatHours(playtimeForever) {
  return `${((playtimeForever || 0) / 60).toFixed(1)}h`;
}

function classifyGame(game) {
  const hours = (game.playtime_forever || 0) / 60;
  if (hours === 0) return 'unplayed';
  if (hours >= 100) return 'complete';
  if (hours >= 20) return 'active';
  return 'playing';
}

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


function createNode(game) {
  const card = document.createElement('article');
  card.className = `game-node ${classifyGame(game)}`;

  const title = document.createElement('h4');
  title.textContent = game.name || `App ${game.appid}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${formatHours(game.playtime_forever)} played`;

  // status selector (persisted on the game as `status`)
  const statusSelect = document.createElement('select');
  statusSelect.className = 'status-select';
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

  card.append(title, meta, statusSelect);

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

function saveGames(games) {
  try {
    localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(games));
  } catch (e) {
    console.error('Failed to save games', e);
  }
}

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

function addGame(game) {
  const games = loadGames();
  games.push(game);
  saveGames(games);
  renderMap();
}

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

const PAGE_SIZE = 4;
const trackPages = { mainline: 0, branch: 0, sidetrack: 0 };

function renderTrack(container, games, trackName) {
  container.innerHTML = '';
  const page = trackPages[trackName] || 0;
  const totalPages = Math.max(1, Math.ceil((games.length || 0) / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const pageItems = games.slice(start, start + PAGE_SIZE);

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
    document.getElementById('stat-eta').textContent = String(estimateEtaYear(games));
  } catch (e) {
    document.getElementById('stat-eta').textContent = 'TBA';
  }

  renderTrack(document.getElementById('mainline-track'), mainline, 'mainline');
  renderTrack(document.getElementById('branch-track'), branch, 'branch');
  renderTrack(document.getElementById('sidetrack-track'), sidetracks, 'sidetrack');

  // ensure page indices are within bounds
  ['mainline', 'branch', 'sidetrack'].forEach((t) => {
    const arr = t === 'mainline' ? mainline : t === 'branch' ? branch : sidetracks;
    const pages = Math.max(1, Math.ceil(arr.length / PAGE_SIZE));
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

  const igdbTestBtn = document.getElementById('igdb-test-btn');
  const igdbTitleInput = document.getElementById('igdb-title');
  const igdbStatusEl = document.getElementById('igdb-status');
  const igdbOutputEl = document.getElementById('igdb-output');

  const setIgdbStatus = (message, type = '') => {
    if (igdbStatusEl) {
      igdbStatusEl.textContent = message;
      igdbStatusEl.className = `status-message ${type}`.trim();
    }
  };

  const setIgdbOutput = (value) => {
    if (igdbOutputEl) {
      igdbOutputEl.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    }
  };

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

  if (addBtn && addForm) {
    addBtn.addEventListener('click', () => {
      populateAddForm();
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

    addForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const appid = document.getElementById('game-select').value;
      const track = document.getElementById('game-track').value;
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
      games[idx].track = track === 'unassigned' ? undefined : track;
      saveGames(games);
      addForm.reset();
      addForm.hidden = true;
      addForm.setAttribute('aria-hidden', 'true');
      renderMap();
    });
  }

  if (importInput) {
    importInput.addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (file) handleImportFile(file);
      importInput.value = '';
    });
    if (importBtn) {
      importBtn.addEventListener('click', () => importInput.click());
    }
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
});
