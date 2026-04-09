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

  const input = document.getElementById('username').value;
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

  button.disabled = true;
  button.textContent = 'Validating...';

  try {
    let steamID = parsed.value;

    // If vanity URL, resolve it first
    if (parsed.type === 'vanity') {
      steamID = await resolveSteamID(parsed.value);
      if (!steamID) {
        showError('Could not resolve Steam username. Make sure the profile exists and is public.');
        return;
      }
    }

    button.textContent = 'Fetching profile...';

    // Fetch profile
    const profile = await getSteamProfile(steamID);
    if (!profile) {
      showError('Could not fetch Steam profile. Make sure the profile is public and the proxy server is running.');
      return;
    }

    // Success! Store and redirect
    localStorage.setItem('guideRail_profile', JSON.stringify(profile));
    window.location.href = 'profile.html';
  } catch (error) {
    console.error('Login error:', error);
    showError('Unable to contact Steam login service. Start the local proxy at port 8000.');
  } finally {
    button.disabled = false;
    button.textContent = 'Login';
  }
}

function showError(message) {
  const errorDiv = document.getElementById('login-error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Setup on page load
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', handleLogin);
  }
});
