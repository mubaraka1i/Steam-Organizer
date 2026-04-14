// Parse Steam URL/ID to extract the actual Steam ID or vanity URL
function parseSteamInput(input) {
  input = input.trim();

  // Handle direct Steam ID (17-digit number)
  if (/^\d{17}$/.test(input)) {
    return { type: 'steamid', value: input };
  }

  // Handle URLs like https://steamcommunity.com/profiles/123456789
  const profileMatch = input.match(/\/profiles\/(\d+)/);
  if (profileMatch) {
    return { type: 'steamid', value: profileMatch[1] };
  }

  // Handle vanity URLs like https://steamcommunity.com/id/username
  const vanityMatch = input.match(/\/id\/([a-zA-Z0-9-_]+)/i);
  if (vanityMatch) {
    return { type: 'vanity', value: vanityMatch[1] };
  }

  // Handle plain username (like "username" or "my-profile")
  if (/^[a-zA-Z0-9-_]+$/.test(input)) {
    return { type: 'vanity', value: input };
  }

  return null;
}

const API_PROXY = 'http://127.0.0.1:8000';
const loadingMessages = [
  'Validating Steam input...',
  'Resolving vanity URL via /resolve...',
  'Fetching profile via /api...',
  'Signing in...'
];
const TOTAL_LOADING_BARS = 25;

let loadingProgress = 0;
let loadingBars = [];

function initializeLoadingBars() {
  const container = document.getElementById('barsContainer');
  if (!container) {
    return;
  }

  container.innerHTML = '';
  loadingBars = [];

  for (let i = 0; i < TOTAL_LOADING_BARS; i += 1) {
    const bar = document.createElement('div');
    bar.className = 'loading-bar';
    loadingBars.push(bar);
    container.appendChild(bar);
  }
}

function paintLoadingBars(progress) {
  const filledBars = Math.floor((progress / 100) * TOTAL_LOADING_BARS);
  loadingBars.forEach((bar, index) => {
    bar.style.backgroundColor = index < filledBars ? '#968732' : '#3f4738';
  });
}

function updateLoadingUI(progress, message) {
  const percent = document.getElementById('percentText');
  const status = document.getElementById('statusText');
  const track = document.querySelector('.loading-track');

  if (!percent || !status || !track) {
    return;
  }

  paintLoadingBars(progress);
  track.setAttribute('aria-valuenow', String(progress));
  percent.textContent = `${progress}% complete`;

  if (message) {
    status.textContent = message;
  }
}

function showLoading() {
  const panel = document.getElementById('login-loading');
  if (panel) {
    panel.hidden = false;
  }
}

function hideLoading() {
  const panel = document.getElementById('login-loading');
  if (panel) {
    panel.hidden = true;
  }
}

function startLoading() {
  showLoading();
  loadingProgress = 8;
  updateLoadingUI(loadingProgress, loadingMessages[0]);
}

function setLoadingStage(stageIndex, minProgress) {
  const safeIndex = Math.max(0, Math.min(stageIndex, loadingMessages.length - 1));
  loadingProgress = Math.max(loadingProgress, minProgress);
  updateLoadingUI(loadingProgress, loadingMessages[safeIndex]);
}

function completeLoading() {
  loadingProgress = 100;
  updateLoadingUI(loadingProgress, 'All files verified.');
  const percent = document.getElementById('percentText');
  if (percent) {
    percent.textContent = 'Done!';
  }
}

function resetLoading() {
  loadingProgress = 0;
  updateLoadingUI(loadingProgress, loadingMessages[0]);
  hideLoading();
}

// Resolve vanity URL to Steam ID
async function resolveSteamID(vanityUrl) {
  try {
    const response = await fetch(`${API_PROXY}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `vanityurl=${encodeURIComponent(vanityUrl)}`
    });

    const data = await response.json();
    if (data.success && data.steamid) {
      return data.steamid;
    }
    console.error('Resolve error:', data);
    return null;
  } catch (error) {
    console.error('Error resolving vanity URL:', error);
    return null;
  }
}

// Fetch user profile from Steam
async function getSteamProfile(steamID) {
  try {
    const response = await fetch(`${API_PROXY}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `steamid=${encodeURIComponent(steamID)}`
    });

    const data = await response.json();
    if (data.response && data.response.players && data.response.players.length > 0) {
      return data.response.players[0];
    }
    console.error('Profile response error:', data);
    return null;
  } catch (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
}

// Main login handler
async function handleLogin(event) {
  event.preventDefault();

  const inputField = document.getElementById('username');
  const input = inputField.value;
  const button = document.querySelector('button[type="submit"]');
  const errorDiv = document.getElementById('login-error');

  // Reset error
  errorDiv.style.display = 'none';
  errorDiv.textContent = '';

  // Parse input
  const parsed = parseSteamInput(input);
  if (!parsed) {
    showError('Please enter a valid Steam URL or Steam ID.');
    return;
  }

  startLoading();
  button.disabled = true;
  inputField.disabled = true;
  button.textContent = 'Validating...';

  try {
    let steamID = parsed.value;

    // If vanity URL, resolve it first
    if (parsed.type === 'vanity') {
      setLoadingStage(1, 28);
      steamID = await resolveSteamID(parsed.value);
      if (!steamID) {
        showError('Could not resolve Steam username. Make sure the profile exists and is public.');
        return;
      }

      setLoadingStage(1, 52);
    } else {
      setLoadingStage(0, 52);
    }

    setLoadingStage(2, 68);
    button.textContent = 'Fetching profile...';

    // Fetch profile
    const profile = await getSteamProfile(steamID);
    if (!profile) {
      showError('Could not fetch Steam profile. Make sure the profile is public and the proxy server is running.');
      return;
    }

    setLoadingStage(3, 92);
    completeLoading();

    // Success! Store and redirect
    localStorage.setItem('guideRail_profile', JSON.stringify(profile));
    setTimeout(() => {
      resetLoading();
      window.location.href = 'profile.html';
    }, 220);
  } catch (error) {
    console.error('Login error:', error);
    showError('Unable to contact Steam login service. Start the local proxy at port 8000.');
  } finally {
    button.disabled = false;
    inputField.disabled = false;
    button.textContent = 'Login';

    // Keep completed state visible on success, otherwise hide/reset.
    if (document.getElementById('login-error').style.display === 'block') {
      resetLoading();
    }
  }
}

function showError(message) {
  const errorDiv = document.getElementById('login-error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Setup on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeLoadingBars();
  resetLoading();

  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', handleLogin);
  }
});

window.addEventListener('pageshow', () => {
  resetLoading();
});
