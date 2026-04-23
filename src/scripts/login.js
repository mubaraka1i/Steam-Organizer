
const THEME_KEY = 'guideRail_theme';

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'blue');
}


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

const PROFILE_STORAGE_KEY = 'guideRail_profile';
const GAMES_STORAGE_KEY = 'guideRail_games';
const API_KEY_STORAGE_KEY = 'guideRail_api_key';
const API_PROXY = 'http://127.0.0.1:8000';
const PROXY_DOWN_MESSAGE = 'Proxy server is not running. Start the local proxy at port 8000.';
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

function clearErrorState(inputField) {
  const errorDiv = document.getElementById('login-error');
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.hidden = true;
  }

  if (inputField) {
    inputField.removeAttribute('aria-invalid');
    const defaultHelpId = inputField.id === 'api-key' ? 'api-key-help' : 'username-help';
    inputField.setAttribute('aria-describedby', defaultHelpId);
  }
}

function positionErrorContainer() {
  const header = document.querySelector('.site-header');
  const main = document.querySelector('.site-main');
  const loginBox = document.querySelector('.login-box');
  const errorContainer = document.querySelector('.error-container');

  if (!header || !main || !loginBox || !errorContainer) {
    return;
  }

  const headerBottom = header.getBoundingClientRect().bottom;
  const loginTop = loginBox.getBoundingClientRect().top;
  const mainTop = main.getBoundingClientRect().top;
  const midpoint = headerBottom + ((loginTop - headerBottom) / 2);

  // Center the alert box around the midpoint without letting it go above main content.
  const top = Math.max(0, midpoint - mainTop - (errorContainer.offsetHeight / 2));
  errorContainer.style.top = `${Math.round(top)}px`;
}

function normalizeApiKey(value) {
  return (value || '').trim();
}

// Resolve vanity URL to Steam ID
async function resolveSteamID(vanityUrl, apiKey) {
  try {
    const response = await fetch(`${API_PROXY}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `vanityurl=${encodeURIComponent(vanityUrl)}&apikey=${encodeURIComponent(apiKey)}`
    });

    if (!response.ok) {
      if (response.status === 400) {
        return { steamid: null, reason: 'not_found' };
      }
      return { steamid: null, reason: 'proxy_error' };
    }

    const data = await response.json();
    if (data.success && data.steamid) {
      return { steamid: data.steamid, reason: null };
    }
    console.error('Resolve error:', data);
    return { steamid: null, reason: 'not_found' };
  } catch (error) {
    console.error('Error resolving vanity URL:', error);
    return { steamid: null, reason: 'proxy_unreachable' };
  }
}

// Fetch user profile from Steam
async function getSteamProfile(steamID, apiKey) {
  try {
    const response = await fetch(`${API_PROXY}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `steamid=${encodeURIComponent(steamID)}&apikey=${encodeURIComponent(apiKey)}`
    });

    if (!response.ok) {
      return { profile: null, reason: 'proxy_error' };
    }

    const data = await response.json();
    if (data.response && data.response.players && data.response.players.length > 0) {
      return { profile: data.response.players[0], reason: null };
    }
    console.error('Profile response error:', data);
    return { profile: null, reason: 'profile_unavailable' };
  } catch (error) {
    console.error('Error fetching profile:', error);
    return { profile: null, reason: 'proxy_unreachable' };
  }
}

// Main login handler
async function handleLogin(event) {
  event.preventDefault();

  const inputField = document.getElementById('username');
  const apiKeyField = document.getElementById('api-key');
  const input = inputField.value;
  const apiKey = normalizeApiKey(apiKeyField?.value);
  const button = document.querySelector('button[type="submit"]');
  const errorDiv = document.getElementById('login-error');

  // Reset any previous error before validating a new attempt.
  clearErrorState(inputField);
  clearErrorState(apiKeyField);

  if (!apiKey) {
    showError('Enter your Steam API key before logging in.', apiKeyField, 'api-key-help');
    return;
  }

  // Parse input
  const parsed = parseSteamInput(input);
  if (!parsed) {
    showError('Enter a valid Steam profile URL, custom URL, or 17-digit Steam ID.', inputField);
    return;
  }

  startLoading();
  button.disabled = true;
  inputField.disabled = true;
  if (apiKeyField) {
    apiKeyField.disabled = true;
  }
  button.textContent = 'Validating...';
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);

  try {
    let steamID = parsed.value;

    // If vanity URL, resolve it first
    if (parsed.type === 'vanity') {
      setLoadingStage(1, 28);
      const resolution = await resolveSteamID(parsed.value, apiKey);
      steamID = resolution.steamid;

      if (!steamID) {
        if (resolution.reason === 'proxy_unreachable' || resolution.reason === 'proxy_error') {
          showError(PROXY_DOWN_MESSAGE, inputField);
          return;
        }
        showError('Could not find that Steam username. Check the URL/ID and confirm the profile is public.', inputField);
        return;
      }

      setLoadingStage(1, 52);
    } else {
      setLoadingStage(0, 52);
    }

    setLoadingStage(2, 68);
    button.textContent = 'Fetching profile...';

    // Fetch profile
    const profileResult = await getSteamProfile(steamID, apiKey);
    if (!profileResult.profile) {
      if (profileResult.reason === 'proxy_unreachable' || profileResult.reason === 'proxy_error') {
        showError(PROXY_DOWN_MESSAGE, inputField);
        return;
      }
      showError('Could not load this Steam profile. Verify it is public and try again.', inputField);
      return;
    }

    setLoadingStage(3, 92);
    completeLoading();

    // Success! Store and redirect
    const previousProfileRaw = localStorage.getItem(PROFILE_STORAGE_KEY);
    let previousSteamID = null;

    if (previousProfileRaw) {
      try {
        const previousProfile = JSON.parse(previousProfileRaw);
        previousSteamID = previousProfile?.steamid || null;
      } catch {
        previousSteamID = null;
      }
    }

    if (previousSteamID && previousSteamID !== profileResult.profile.steamid) {
      localStorage.removeItem(GAMES_STORAGE_KEY);
    }

    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileResult.profile));
    setTimeout(() => {
      resetLoading();
      window.location.href = 'profile.html';
    }, 220);
  } catch (error) {
    console.error('Login error:', error);
    showError('Unable to contact the login service. Start the local proxy on port 8000 and retry.', inputField);
  } finally {
    button.disabled = false;
    inputField.disabled = false;
    if (apiKeyField) {
      apiKeyField.disabled = false;
    }
    button.textContent = 'Login';

    // Keep completed state visible on success, otherwise hide/reset.
    if (!errorDiv.hidden) {
      resetLoading();
    }
  }
}

function showError(message, inputField, helpId = 'username-help') {
  const errorDiv = document.getElementById('login-error');
  errorDiv.textContent = message;
  errorDiv.hidden = false;

  // Wait one frame so the element has a measurable height before positioning.
  window.requestAnimationFrame(positionErrorContainer);

  if (inputField) {
    inputField.setAttribute('aria-invalid', 'true');
    inputField.setAttribute('aria-describedby', `${helpId} login-error`);
    inputField.focus();
  }

  errorDiv.focus();
}

// Setup on page load
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'green';
applyTheme(savedTheme);
  initializeLoadingBars();
  resetLoading();
  positionErrorContainer();

  const form = document.querySelector('form');
  const usernameInput = document.getElementById('username');
  const apiKeyInput = document.getElementById('api-key');

  if (apiKeyInput) {
    const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedApiKey) {
      apiKeyInput.value = storedApiKey;
    }
  }

  if (usernameInput) {
    usernameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
      }
    });
  }

  if (form) {
    form.addEventListener('submit', handleLogin);
  }
  const toggleBtn = document.getElementById('theme-toggle'); 
  
  if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    const current = localStorage.getItem(THEME_KEY) || 'green';
    const next = current === 'green' ? 'blue' : 'green';

    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}
});

window.addEventListener('resize', () => {
  const errorDiv = document.getElementById('login-error');
  if (errorDiv && !errorDiv.hidden) {
    positionErrorContainer();
  }
});

window.addEventListener('pageshow', () => {
  resetLoading();
  positionErrorContainer();
});

