const THEME_KEY = 'team03_guideRail_theme';

/**
 * Applies the selected theme to the page.
 *
 * Toggles the light-theme class depending on whether
 * the user selected the blue theme.
 *
 * @param {string} theme - Theme name to apply.
 */
function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'blue');
}

/**
 * Initializes theme functionality for the profile page.
 *
 * Loads the saved theme from localStorage and attaches
 * the theme toggle button event listener.
 */
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
const PROFILE_STORAGE_KEY = 'team03_guideRail_profile';
const GAMES_STORAGE_KEY = 'team03_guideRail_games';
const GAME_NAME_MAP_KEY = 'team03_guideRail_game_name_map';
const API_KEY_STORAGE_KEY = 'team03_guideRail_api_key';
const GAME_PREFERENCES_KEY = 'team03_guideRail_game_preferences';

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
/**
 * Parses a game title or IGDB URL into searchable values.
 *
 * Extracts the slug from an IGDB URL if present, otherwise
 * generates a slug from plain text input.
 *
 * @param {string} value - Game title or IGDB URL.
 * @returns {{title: string, slug: string}} Parsed title and slug.
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
    // plain text title
  }

  const slug = text
    .toLowerCase()
    .replace(/[\u2019'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return { title: text, slug };
}
/**
 * Formats IGDB API response data into readable text.
 *
 * Handles successful responses, missing games,
 * and raw completion time data formatting.
 *
 * @param {Object} result - IGDB response object.
 * @returns {string} Formatted result string.
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
/**
 * Fetches completion time data from the IGDB API route.
 *
 * Sends a request to the backend API using the parsed
 * title and slug values from the user input.
 *
 * @async
 * @param {string} inputValue - Game title or IGDB URL.
 * @returns {Promise<Object>} Completion time data object.
 */
async function fetchIgdbCompletionTimes(inputValue) {
  const parsed = parseIgdbInput(inputValue);
  const response = await fetch('/api/igdb-completion-times', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: parsed.title, slug: parsed.slug }),
  });

  const data = await response.json().catch(() => ({}));
  if (response.status === 404) {
    return { notFound: true, error: data?.error || 'No match found in IGDB' };
  }
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }

  return data.completionTimesRaw
    ? { raw: data.completionTimesRaw, hours: data.completionTimes || null }
    : (data.completionTimes || data);
}

function formatDate(unixSeconds) {
  if (!unixSeconds) {
    return 'Unknown';
  }
  return new Date(unixSeconds * 1000).toLocaleString();
}
// Logs the user out
function logout() {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  localStorage.removeItem(GAMES_STORAGE_KEY);
  renderGames([]);
  window.location.replace('index.html');
}
/**
 * Displays a status message on the page.
 *
 * Updates the status element text and styling
 * based on the provided message type.
 *
 * @param {string} message - Status text to display.
 * @param {string} type - Status type class.
 */
function setStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
}
/**
 * Builds the Steam image URL for a game icon.
 *
 * @param {number|string} appid - Steam application ID.
 * @param {string} iconHash - Steam image hash.
 * @returns {string} Full Steam image URL.
 */
function gameImageUrl(appid, iconHash) {
  if (!appid || !iconHash) {
    return '';
  }
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${iconHash}.jpg`;
}
/**
 * Normalizes text for searching and comparison.
 *
 * Trims whitespace and converts text to lowercase.
 *
 * @param {*} value - Value to normalize.
 * @returns {string} Normalized text string.
 */
function normalizeText(value) {
  return (value || '').toString().trim().toLowerCase();
}
/**
 * Loads saved game preference settings from localStorage.
 *
 * Validates saved preference values before returning them.
 *
 * @returns {Object} User preference settings object.
 */
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

/**
 * Saves game preference settings into localStorage.
 *
 * @param {Object} preferences - Preference settings to save.
 */
function saveGamePreferences(preferences) {
  localStorage.setItem(GAME_PREFERENCES_KEY, JSON.stringify(preferences));
}

/**
 * Reads the current values from the preference controls.
 *
 * @returns {{search: string, playtime: string, sort: string}}
 * Current preference values.
 */
function readGamePreferenceControls() {
  return {
    search: document.getElementById('pref-search')?.value || '',
    playtime: document.getElementById('pref-filter')?.value || DEFAULT_GAME_PREFERENCES.playtime,
    sort: document.getElementById('pref-sort')?.value || DEFAULT_GAME_PREFERENCES.sort
  };
}
/**
 * Applies saved preference values to all filter controls.
 *
 * Updates form fields and synchronizes the filter state.
 *
 * @param {Object} preferences - Preferences to apply.
 */
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
/**
 * Determines the playtime category for a game.
 *
 * Categories include unplayed, light, and heavy.
 *
 * @param {Object} game - Steam game object.
 * @returns {string} Playtime category.
 */
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
/**
 * Filters and sorts games based on the active filter state.
 *
 * @param {Array<Object>} games - Array of game objects.
 * @returns {Array<Object>} Visible sorted games array.
 */
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
/**
 * Updates the games summary text above the game grid.
 *
 * @param {number} totalCount - Total number of games.
 * @param {number} visibleCount - Number of visible games.
 */
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
/**
 * Retrieves the map button element from the page.
 *
 * @returns {HTMLElement|null} Map button element.
 */
function getMapButton() {
  return document.getElementById('map-btn');
}
/**
 * Shows or hides the map button depending on game availability.
 *
 * @param {boolean} hasGames - Whether games exist.
 */
function updateMapButtonVisibility(hasGames) {
  const mapBtn = getMapButton();
  if (mapBtn) {
    mapBtn.hidden = !hasGames;
  }
}
/**
 * Builds a lookup map of Steam app IDs to game names.
 *
 * @param {Array<Object>} games - Array of game objects.
 * @returns {Object} App ID to game name map.
 */

function buildGameMap(games) {
  const map = {};
  games.forEach((game) => {
    if (game && game.appid) {
      map[String(game.appid)] = game.name || `App ${game.appid}`;
    }
  });
  return map;
}
/**
 * Maps the currently loaded games and opens the map page.
 *
 * Saves the game map into localStorage before redirecting.
 */
function mapCurrentGames() {
  if (!storedGames.length) {
    setStatus('Fetch or import games first.', 'error');
    return;
  }

  const gameMap = buildGameMap(storedGames);
  localStorage.setItem(GAME_NAME_MAP_KEY, JSON.stringify(gameMap));
  setStatus(`Mapped ${Object.keys(gameMap).length} games. Opening map...`, 'loading');
  window.location.href = 'map.html';
}
/**
 * Renders all visible games into the game grid.
 *
 * Applies filtering and sorting before creating
 * the game card elements.
 *
 * @param {Array<Object>} games - Array of game objects.
 */
function renderGames(games) {
  window.clearTimeout(searchRenderTimeout);
  const nextGames = Array.isArray(games) ? games : [];
  storedGames = nextGames;
  const grid = document.getElementById('games-grid');
  const visibleGames = getVisibleGames(storedGames);
  grid.innerHTML = '';
  updateMapButtonVisibility(storedGames.length > 0);

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
/**
 * Delays game rendering to reduce excessive updates
 * during typing or rapid user input.
 */
function scheduleGamesRefresh() {
  window.clearTimeout(searchRenderTimeout);
  searchRenderTimeout = window.setTimeout(() => {
    renderGames(storedGames);
  }, 90);
}
/**
 * Sends a request through the Approxi proxy server.
 *
 * @async
 * @param {string} targetUrl - Target API URL.
 * @returns {Promise<Response>} Fetch response object.
 */
async function fetchViaApproxi(targetUrl) {
  return fetch(`${APPROXI_PROXY_BASE}${encodeURIComponent(targetUrl)}`, {
    headers: {
      'x-proxy-token': APPROXI_PROXY_TOKEN
    }
  });
}
/**
 * Imports Steam games using the Steam Web API.
 *
 * Fetches owned games for the provided Steam ID
 * and stores them in localStorage.
 *
 * @async
 * @param {string} steamid - Steam user ID.
 */

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
    updateMapButtonVisibility(true);
    setStatus('', '');
  } catch (error) {
    console.error('Import error:', error);
    setStatus('Could not load games. Check if account is public or check internet/proxy and try again.', 'error');
  } finally {
    importBtn.disabled = false;
  }
}

/**
 * Imports games from a JSON file.
 *
 * Reads the uploaded file, validates its format,
 * and stores the imported games.
 *
 * @param {File} file - Uploaded JSON file.
 */
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
      updateMapButtonVisibility(true);
      setStatus('', '');
    } catch (e) {
      console.error('Import file error:', e);
      alert('Failed to import games file: ' + e.message);
    }
  };
  reader.readAsText(file);
}
/**
 * Normalizes imported game JSON into a games array.
 *
 * Supports multiple JSON structures from exports.
 *
 * @param {Object|Array} parsed - Parsed JSON data.
 * @returns {Array|null} Normalized games array.
 */
function normalizeImportedGames(parsed) {
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
/**
 * Initializes the profile page after login.
 *
 * Loads profile data, restores saved games,
 * initializes filters, and attaches event listeners.
 */
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
  const importPreviewEl = document.getElementById('games-import-preview');
  const importPreviewSummaryEl = document.getElementById('games-import-preview-summary');
  const importPreviewSampleEl = document.getElementById('games-import-preview-sample');
  const importConfirmBtnEl = document.getElementById('games-import-confirm-btn');
  const importCancelBtnEl = document.getElementById('games-import-cancel-btn');
  let pendingImportFile = null;

  const hideImportPreview = () => {
    pendingImportFile = null;
    if (importPreviewEl) {
      importPreviewEl.hidden = true;
    }
  };

  const showImportPreview = async (file) => {
    if (!importPreviewEl || !importPreviewSummaryEl || !importPreviewSampleEl) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const games = normalizeImportedGames(parsed);
      if (!Array.isArray(games)) {
        throw new Error('Expected a JSON array of games.');
      }

      pendingImportFile = file;
      importPreviewSummaryEl.textContent = `${games.length} game${games.length === 1 ? '' : 's'} ready to import from ${file.name}.`;
      const sampleNames = games.slice(0, 3).map((game) => game.name || `App ${game.appid}`);
      importPreviewSampleEl.textContent = sampleNames.length
        ? `Preview: ${sampleNames.join(', ')}${games.length > 3 ? '...' : ''}`
        : 'Preview: no game names found in the file.';
      importPreviewEl.hidden = false;
    } catch (error) {
      pendingImportFile = null;
      importPreviewSummaryEl.textContent = 'Could not preview that file.';
      importPreviewSampleEl.textContent = error.message;
      importPreviewEl.hidden = false;
    }
  };
  if (importBtnEl && importFileEl) {
    importBtnEl.addEventListener('click', () => importFileEl.click());
  }

  if (importConfirmBtnEl) {
    importConfirmBtnEl.addEventListener('click', () => {
      if (!pendingImportFile) return;
      importGamesFromFile(pendingImportFile);
      hideImportPreview();
    });
  }

  if (importCancelBtnEl) {
    importCancelBtnEl.addEventListener('click', () => {
      hideImportPreview();
    });
  }

  if (importFileEl) {
    importFileEl.addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (file) {
        showImportPreview(file);
      }
      ev.target.value = '';
    });
  }

  const importDropZone = document.querySelector('.import-panel');
  if (importDropZone && importFileEl) {
    importDropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    importDropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        showImportPreview(file);
      }
    });
  }

  const fetchBtnEl = document.getElementById('fetch-btn');
  const mapBtnEl = document.getElementById('map-btn');
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
  if (fetchBtnEl) {
    fetchBtnEl.addEventListener('click', () => importGames(profile.steamid));
  }
  if (mapBtnEl) {
    mapBtnEl.addEventListener('click', mapCurrentGames);
  }
  document.getElementById('logout-btn').addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const savePrefBtn = document.getElementById('save-preferences-btn');
  if (savePrefBtn) {
    applyGamePreferences(loadGamePreferences());
    savePrefBtn.addEventListener('click', () => {
      const preferences = readGamePreferenceControls();
      saveGamePreferences(preferences);
    });
  }

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
        const data = localStorage.getItem('team03_guideRail_games');

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
      // Drag and drop support for importing games JSON
      const importPanel = document.querySelector('.import-panel');
      if (importPanel) {
        importPanel.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; importPanel.classList.add('drag-over'); });
        importPanel.addEventListener('dragenter', (e) => { e.preventDefault(); importPanel.classList.add('drag-over'); });
        importPanel.addEventListener('dragleave', (e) => { e.preventDefault(); importPanel.classList.remove('drag-over'); });
        importPanel.addEventListener('drop', (e) => {
          e.preventDefault();
          importPanel.classList.remove('drag-over');
          const files = e.dataTransfer.files;
          if (files && files[0]) {
              console.debug('import-panel drop:', files[0].name, files[0].type);
              try { importGamesFromFile(files[0]); } catch (err) { console.error('Import from drop failed', err); }
          }
        });
      }
    }
}
});

  // Global fallback: accept a JSON file dropped anywhere on the page when on Profile
  window.addEventListener('dragover', (e) => {
    // Allow drop when over the page
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    try {
      e.preventDefault();
      // Only handle on Profile (username element exists)
      if (!document.getElementById('username')) return;
      const files = e.dataTransfer?.files;
      if (!files || !files.length) return;
      const file = files[0];
      console.debug('global drop detected on profile:', file.name, file.type);
      // Accept .json files or application/json; ignore others
      const isJson = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json') || file.type === '';
      if (isJson) {
        importGamesFromFile(file);
      }
    } catch (err) {
      console.error('Global drop handler error:', err);
    }
  });
