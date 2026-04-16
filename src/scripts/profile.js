const API_PROXY = 'http://127.0.0.1:8000';
const PROFILE_STORAGE_KEY = 'guideRail_profile';
const GAMES_STORAGE_KEY = 'guideRail_games';

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
    card.setAttribute('role', 'listitem');

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
async function importGames(steamid) {
  const importBtn = document.getElementById('import-btn');
  importBtn.disabled = true;
  setStatus('Loading games from Steam API...', 'loading');

  try {
    const response = await fetch(`${API_PROXY}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `steamid=${encodeURIComponent(steamid)}`
    });

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

  setFilterStateFromControls();
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

  document.getElementById('import-btn').addEventListener('click', () => {
    importGames(profile.steamid);
  });
  document.getElementById('logout-btn').addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', bootstrapProfile);
