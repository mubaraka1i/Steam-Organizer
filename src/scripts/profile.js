const API_PROXY = 'http://127.0.0.1:8000';
const PROFILE_STORAGE_KEY = 'guideRail_profile';
const GAMES_STORAGE_KEY = 'guideRail_games';

function formatDate(unixSeconds) {
  if (!unixSeconds) {
    return 'Unknown';
  }
  return new Date(unixSeconds * 1000).toLocaleString();
}

function logout() {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  localStorage.removeItem(GAMES_STORAGE_KEY);
  window.location.href = 'index.html';
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

function renderGames(games) {
  const grid = document.getElementById('games-grid');
  grid.innerHTML = '';

  if (!games || games.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No imported games yet. Use Import Games to load your library.';
    grid.appendChild(empty);
    return;
  }

  games
    .slice()
    .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
    .forEach((game) => {
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
    setStatus('Could not load games. Check internet/proxy and try again.', 'error');
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
    window.location.href = 'index.html';
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

  restoreStoredGames();

  document.getElementById('import-btn').addEventListener('click', () => {
    importGames(profile.steamid);
  });
  document.getElementById('logout-btn').addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', bootstrapProfile);
