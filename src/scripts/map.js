const PROFILE_STORAGE_KEY = 'guideRail_profile';
const GAMES_STORAGE_KEY = 'guideRail_games';
const THEME_KEY = 'guideRail_theme';

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

  const status = document.createElement('div');
  status.className = 'status';
  const hours = (game.playtime_forever || 0) / 60;
  if (hours === 0) {
    status.textContent = '○ Unplayed';
  } else if (hours >= 100) {
    status.textContent = '✓ Complete';
  } else if (hours >= 20) {
    status.textContent = '▶ Active';
  } else {
    status.textContent = '▶ Playing';
  }

  card.append(title, meta, status);
  return card;
}

function renderTrack(container, games) {
  container.innerHTML = '';
  if (!games.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'game-node unplayed';
    const title = document.createElement('h4');
    title.textContent = 'No games';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = 'Import your library';
    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = '—';
    placeholder.append(title, meta, status);
    container.appendChild(placeholder);
    return;
  }

  games.forEach((game, index) => {
    if (index > 0) {
      const spacer = document.createElement('div');
      spacer.className = 'node-spacer';
      container.appendChild(spacer);
    }
    container.appendChild(createNode(game));
  });
}

function renderMap() {
  const games = loadGames();

  const empty = document.getElementById('map-empty');
  const hasGames = games.length > 0;
  empty.hidden = hasGames;

  const sorted = games.slice().sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0));
  const mainline = sorted.slice(0, 4);
  const branch = sorted.slice(4, 6);
  const sidetracks = sorted.slice(6, 8);

  document.getElementById('stat-games').textContent = String(games.length);
  const totalHours = games.reduce((sum, game) => sum + ((game.playtime_forever || 0) / 60), 0);
  document.getElementById('stat-hours').textContent = totalHours.toLocaleString(undefined, { maximumFractionDigits: 0 });
  document.getElementById('stat-unplayed').textContent = String(games.filter((game) => (game.playtime_forever || 0) === 0).length);
  document.getElementById('stat-eta').textContent = 'TBA';

  renderTrack(document.getElementById('mainline-track'), mainline);
  renderTrack(document.getElementById('branch-track'), branch);
  renderTrack(document.getElementById('sidetrack-track'), sidetracks);

  const unplayed = games.filter((game) => (game.playtime_forever || 0) === 0);
  const short = unplayed.filter((game) => game.playtime_forever === 0).length;
  const medium = games.filter((game) => {
    const hours = (game.playtime_forever || 0) / 60;
    return hours >= 5 && hours < 20;
  }).length;
  const long = games.filter((game) => (game.playtime_forever || 0) / 60 >= 20).length;

  document.getElementById('yard-short').textContent = `${short} games`;
  document.getElementById('yard-medium').textContent = `${medium} games`;
  document.getElementById('yard-long').textContent = `${long} games`;
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  renderMap();
});
