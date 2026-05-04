const THEME_KEY = 'guideRail_theme';


function applyTheme(theme) {
  
  document.body.classList.toggle('light-theme', theme === 'blue');
}


function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'green';
  applyTheme(savedTheme);

  const btn = document.getElementById('theme-toggle');

  
  if (btn) {
    btn.addEventListener('click', () => {
      const current = localStorage.getItem(THEME_KEY) || 'green';
      const next = current === 'green' ? 'blue' : 'green';

      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
}
const APPROXI_PROXY_BASE = 'https://approxi--approxi-65847.us-east4.hosted.app/p/aliappleton-project?url=';
const APPROXI_PROXY_TOKEN = '68b1d5ba4cde33c593522d9dc0c0ac9898dd023bad0b33a0';
const STEAM_PROXY_SECRET_PLACEHOLDER = '{STEAM_KEY}';
const PROFILE_STORAGE_KEY = 'guideRail_profile';
const GAMES_STORAGE_KEY = 'guideRail_games';
const API_KEY_STORAGE_KEY = 'guideRail_api_key';
const GAME_PREFERENCES_KEY = 'guideRail_game_preferences';

const DEFAULT_GAME_PREFERENCES = {
  search: '',
  playtime: 'all',
  sort: 'playtime-desc'
};

const VALID_PLAYTIME_FILTERS = new Set(['all', 'unplayed', 'light', 'heavy']);
const VALID_SORT_OPTIONS = new Set(['playtime-desc', 'playtime-asc', 'name-asc', 'name-desc']);

let storedGames = [];
let searchRenderTimeout = null;

const filterState = {
  search: '',
  playtime: 'all',
  sort: 'playtime-desc'
};

function formatDate(unixSeconds) {
  if (!unixSeconds) {
    return 'Unknown';
  }
  return new Date(unixSeconds * 1000).toLocaleString();
}

function logout() {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  localStorage.removeItem(GAMES_STORAGE_KEY);
  renderGames([]);
  window.location.replace('index.html');
}

function setStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
}

function gameImageUrl(appid, iconHash) {
  if (!appid || !iconHash) {
    return '';
  }
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${iconHash}.jpg`;
}

function normalizeText(value) {
  return (value || '').toString().trim().toLowerCase();
}

function loadGamePreferences() {
  const raw = localStorage.getItem(GAME_PREFERENCES_KEY);
  if (!raw) {
    return { ...DEFAULT_GAME_PREFERENCES };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      search: typeof parsed.search === 'string' ? parsed.search : DEFAULT_GAME_PREFERENCES.search,
      playtime: VALID_PLAYTIME_FILTERS.has(parsed.playtime) ? parsed.playtime : DEFAULT_GAME_PREFERENCES.playtime,
      sort: VALID_SORT_OPTIONS.has(parsed.sort) ? parsed.sort : DEFAULT_GAME_PREFERENCES.sort
    };
  } catch {
    return { ...DEFAULT_GAME_PREFERENCES };
  }
}

function saveGamePreferences(preferences) {
  localStorage.setItem(GAME_PREFERENCES_KEY, JSON.stringify(preferences));
}

function readGamePreferenceControls() {
  return {
    search: document.getElementById('pref-search')?.value || '',
    playtime: document.getElementById('pref-filter')?.value || DEFAULT_GAME_PREFERENCES.playtime,
    sort: document.getElementById('pref-sort')?.value || DEFAULT_GAME_PREFERENCES.sort
  };
}

function applyGamePreferences(preferences) {
  const nextPreferences = {
    ...DEFAULT_GAME_PREFERENCES,
    ...preferences
  };

  const searchFieldValue = nextPreferences.search || '';
  const playtimeFieldValue = VALID_PLAYTIME_FILTERS.has(nextPreferences.playtime)
    ? nextPreferences.playtime
    : DEFAULT_GAME_PREFERENCES.playtime;
  const sortFieldValue = VALID_SORT_OPTIONS.has(nextPreferences.sort)
    ? nextPreferences.sort
    : DEFAULT_GAME_PREFERENCES.sort;

  const fieldValues = {
    'game-search': searchFieldValue,
    'game-filter': playtimeFieldValue,
    'game-sort': sortFieldValue,
    'pref-search': searchFieldValue,
    'pref-filter': playtimeFieldValue,
    'pref-sort': sortFieldValue
  };

  Object.entries(fieldValues).forEach(([fieldId, value]) => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = value;
    }
  });

  setFilterStateFromControls();
}

function setFilterStateFromControls() {
  filterState.search = normalizeText(document.getElementById('game-search')?.value);
  filterState.playtime = document.getElementById('game-filter')?.value || 'all';
  filterState.sort = document.getElementById('game-sort')?.value || 'playtime-desc';
}

function getPlaytimeCategory(game) {
  const hours = (game.playtime_forever || 0) / 60;

  if (hours === 0) {
    return 'unplayed';
  }

  if (hours < 10) {
    return 'light';
  }

  return 'heavy';
}

function getVisibleGames(games) {
  const filteredGames = games.filter((game) => {
    const matchesSearch = !filterState.search || normalizeText(game.name).includes(filterState.search);
    const matchesFilter = filterState.playtime === 'all' || getPlaytimeCategory(game) === filterState.playtime;

    return matchesSearch && matchesFilter;
  });

  const sortedGames = filteredGames.slice().sort((leftGame, rightGame) => {
    const leftName = normalizeText(leftGame.name);
    const rightName = normalizeText(rightGame.name);
    const leftPlaytime = leftGame.playtime_forever || 0;
    const rightPlaytime = rightGame.playtime_forever || 0;

    switch (filterState.sort) {
      case 'playtime-asc':
        return leftPlaytime - rightPlaytime || leftName.localeCompare(rightName);
      case 'name-asc':
        return leftName.localeCompare(rightName) || rightPlaytime - leftPlaytime;
      case 'name-desc':
        return rightName.localeCompare(leftName) || rightPlaytime - leftPlaytime;
      case 'playtime-desc':
      default:
        return rightPlaytime - leftPlaytime || leftName.localeCompare(rightName);
    }
  });

  return sortedGames;
}

function updateGamesSummary(totalCount, visibleCount) {
  const summaryEl = document.getElementById('games-summary');
  if (!summaryEl) {
    return;
  }

  if (totalCount === 0) {
    summaryEl.textContent = 'No imported games yet.';
    return;
  }

  summaryEl.textContent = visibleCount === totalCount
    ? `${totalCount} games in your library.`
    : `${visibleCount} of ${totalCount} games shown.`;
}

function renderGames(games) {
  window.clearTimeout(searchRenderTimeout);
  const nextGames = Array.isArray(games) ? games : [];
  storedGames = nextGames;
  const grid = document.getElementById('games-grid');
  const visibleGames = getVisibleGames(storedGames);
  grid.innerHTML = '';

  updateGamesSummary(storedGames.length, visibleGames.length);

  if (!visibleGames.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = storedGames.length === 0
      ? 'No imported games yet. Use Import Games to load your library.'
      : 'No games match your search or filter.';
    grid.appendChild(empty);
    return;
  }

  visibleGames.forEach((game) => {
    const card = document.createElement('article');
    card.className = 'game-card';

    const image = document.createElement('img');
    image.className = 'game-card-image';
    image.alt = `${game.name || 'Steam game'} cover art`;
    const coverUrl = gameImageUrl(game.appid, game.img_icon_url);
    if (coverUrl) {
      image.src = coverUrl;
    }

    const title = document.createElement('h4');
    title.className = 'game-title';
    title.textContent = game.name || `App ${game.appid}`;

    const playtime = document.createElement('p');
    playtime.className = 'game-meta';
    const hours = ((game.playtime_forever || 0) / 60).toFixed(1);
    playtime.textContent = `${hours} hrs played`;

    card.append(image, title, playtime);
    grid.appendChild(card);
  });
}

function refreshGamesView() {
  renderGames(storedGames);
}

function scheduleGamesRefresh() {
  window.clearTimeout(searchRenderTimeout);
  searchRenderTimeout = window.setTimeout(() => {
    renderGames(storedGames);
  }, 90);
}
async function fetchViaApproxi(targetUrl) {
  return fetch(`${APPROXI_PROXY_BASE}${encodeURIComponent(targetUrl)}`, {
    headers: {
      'x-proxy-token': APPROXI_PROXY_TOKEN
    }
  });
}

async function importGames(steamid) {
  const importBtn = document.getElementById('import-btn');
  importBtn.disabled = true;
  setStatus('Loading games from Steam API...', 'loading');

  try {
    const targetUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_PROXY_SECRET_PLACEHOLDER}&steamid=${encodeURIComponent(steamid)}&include_appinfo=1&include_played_free_games=1`;
    const response = await fetchViaApproxi(targetUrl);

    if (!response.ok) {
      throw new Error('Server responded with an error.');
    }

    const data = await response.json();
    if (!data.response || !Array.isArray(data.response.games)) {
      throw new Error('Steam returned no game data.');
    }

    localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(data.response.games));
    renderGames(data.response.games);
    setStatus(`Imported ${data.response.games.length} games successfully.`, 'success');
  } catch (error) {
    console.error('Import error:', error);
    setStatus('Could not load games. Check if account is public or check internet/proxy and try again.', 'error');
  } finally {
    importBtn.disabled = false;
  }
}

function importGamesFromFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      let games = null;

      if (Array.isArray(parsed)) {
        games = parsed;
      } else if (parsed && Array.isArray(parsed.games)) {
        games = parsed.games;
      } else if (parsed && parsed.response && Array.isArray(parsed.response.games)) {
        games = parsed.response.games;
      }

      if (!Array.isArray(games)) {
        alert('Invalid games file format.');
        return;
      }

      localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(games));
      renderGames(games);
      setStatus(`Imported ${games.length} games from file.`, 'success');
    } catch (e) {
      console.error('Import file error:', e);
      alert('Failed to import games file: ' + e.message);
    }
  };
  reader.readAsText(file);
}

function restoreStoredGames() {
  const raw = localStorage.getItem(GAMES_STORAGE_KEY);
  if (!raw) {
    renderGames([]);
    return;
  }

  try {
    const games = JSON.parse(raw);
    renderGames(Array.isArray(games) ? games : []);
  } catch {
    renderGames([]);
  }
}

function bootstrapProfile() {
  const rawProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!rawProfile) {
    window.location.replace('index.html');
    return;
  }

  let profile;
  try {
    profile = JSON.parse(rawProfile);
  } catch {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('username').textContent = profile.personaname || 'Unknown Steam User';
  document.getElementById('avatar').src = profile.avatarfull || '';
  document.getElementById('steamid').textContent = profile.steamid || 'Unavailable';
  document.getElementById('created').textContent = formatDate(profile.timecreated);
  document.getElementById('lastlogoff').textContent = formatDate(profile.lastlogoff);

  applyGamePreferences(loadGamePreferences());
  restoreStoredGames();

  document.getElementById('game-search').addEventListener('input', () => {
    setFilterStateFromControls();
    scheduleGamesRefresh();
  });
  document.getElementById('game-filter').addEventListener('change', () => {
    setFilterStateFromControls();
    renderGames(storedGames);
  });
  document.getElementById('game-sort').addEventListener('change', () => {
    setFilterStateFromControls();
    renderGames(storedGames);
  });

  const importBtnEl = document.getElementById('import-btn');
  const importFileEl = document.getElementById('games-import-file');
  if (importBtnEl && importFileEl) {
    importBtnEl.addEventListener('click', () => importFileEl.click());
  }

  const fetchBtnEl = document.getElementById('fetch-btn');
  if (fetchBtnEl) {
    fetchBtnEl.addEventListener('click', () => importGames(profile.steamid));
  }
  document.getElementById('logout-btn').addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
   const backBtn = document.getElementById("back-to-profile-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "profile.html";
    });
  }
  if (document.getElementById('username')) {
    bootstrapProfile();

    const exportBtn = document.getElementById('export-btn');
    const importFile = document.getElementById('games-import-file');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const data = localStorage.getItem('guideRail_games');

        if (!data) {
          alert('No games to export.');
          return;
        }

        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'guiderail-games.json';
        a.click();

        URL.revokeObjectURL(url);
      });
    }

    if (importFile) {
      importFile.addEventListener('change', (ev) => {
        if (ev.target.files && ev.target.files[0]) {
          importGamesFromFile(ev.target.files[0]);
          ev.target.value = '';
        }
      });
    }
}
});
