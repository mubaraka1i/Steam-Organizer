/*
 * This file controls the login system for GuideRail.
 *
 * - Allow the user to enter a Steam profile
 * - Validate Steam IDs and profile URLs
 * - Contact the Steam API through the proxy server
 * - Load the user's Steam profile information
 * - Save account data into localStorage
 * - Redirect the user to profile.html
 *
 * This file acts as the main entry point
 * into the entire application.
 */

// Shared localStorage key used to remember
// the user's selected color theme across pages.
const THEME_KEY = 'team03_guideRail_theme';

/*
 * Applies the selected visual theme to the page.
 *
 * If the saved theme is "blue", the light-theme
 * CSS class is added to the body element.
 *
 * This same theme system is reused throughout
 * the entire application for consistency.
 */
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

const PROFILE_STORAGE_KEY = 'team03_guideRail_profile';
const GAMES_STORAGE_KEY = 'team03_guideRail_games';
const ACCOUNT_LIST_KEY = 'team03_guideRail_account_list';
const APPROXI_PROXY_BASE = 'https://approxi--approxi-65847.us-east4.hosted.app/p/aliappleton-project?url=';
const APPROXI_PROXY_TOKEN = 'fc4ad495d79dcd63805091a8971fcc0771c9b49bd688d131';

function getApproxiToken() {
  try {
    return APPROXI_PROXY_TOKEN || '';
  } catch (e) {
    return '';
  }
}
const STEAM_PROXY_SECRET_PLACEHOLDER = '{STEAM_KEY}';
const PROXY_DOWN_MESSAGE = 'Steam proxy is unavailable. Please try again in a moment.';
const loadingMessages = [
  'Validating Steam input...',
  'Resolving vanity URL via Steam API proxy...',
  'Fetching profile via Steam API proxy...',
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

/*
 * Visually fills in the loading bars during login.
 *
 * The login screen contains multiple small bars
 * that slowly fill as the login process progresses.
 */
function paintLoadingBars(progress) {
  const filledBars = Math.floor((progress / 100) * TOTAL_LOADING_BARS);
  loadingBars.forEach((bar, index) => {
    bar.style.backgroundColor = index < filledBars ? '#968732' : '#3f4738';
  });
}
/*
 * Updates the loading screen UI with progressive visual feedback.
 *
 * - the progress bars
 * - the percentage text
 * - the current loading message
 *
 *
 * This function is repeatedly called during
 * the login process to visually track progress.
 */
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

/*
 * Makes the loading panel visible.
 *
 * The loading panel appears while the app
 * communicates with the Steam API.
 */
function showLoading() {
  const panel = document.getElementById('login-loading');
  if (panel) {
    panel.hidden = false;
  }
}
/*
Hides the loading panel
*/
function hideLoading() {
  const panel = document.getElementById('login-loading');
  if (panel) {
    panel.hidden = true;
  }
}
/*
Starts the laoding panel.

  - shows the loading panel
  - sets the initial progress value
  - displays the first loading message
*/
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

/*
 * Finishes the loading process.
 *
 * This sets progress to 100%
 * and updates the UI to show
 * that login completed successfully.
 */
function completeLoading() {
  loadingProgress = 100;
  updateLoadingUI(loadingProgress, 'All files verified.');
  const percent = document.getElementById('percentText');
  if (percent) {
    percent.textContent = 'Done!';
  }
}

/*
 * Resets the loading screen back
 * to its default state.
 *
 * Used after:
 * - failed login attempts
 * - page reloads
 * - returning to the login page
 */
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
    const defaultHelpId = 'username-help';
    inputField.setAttribute('aria-describedby', defaultHelpId);
  }
}

/*
 * Dynamically positions the error message box
 * on the screen.
 *
 * This keeps the error message visually centered
 * between the page header and login form,
 * even when the browser window changes size.
 */
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

/*
 * Sends API requests through the Approxi proxy.
 *
 * Instead of directly contacting Steam,
 * requests pass through the proxy server.
 *
 * - protect API secrets
 * - avoid browser CORS restrictions
 * - centralize API communication
 */
function fetchViaApproxi(targetUrl) {
  return fetch(`${APPROXI_PROXY_BASE}${encodeURIComponent(targetUrl)}`, {
    headers: {
      'x-proxy-token': getApproxiToken()
    }
  });
}

// Resolve vanity URL to Steam ID
async function resolveSteamID(vanityUrl) {
  try {
    const targetUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_PROXY_SECRET_PLACEHOLDER}&vanityurl=${encodeURIComponent(vanityUrl)}`;
    const response = await fetchViaApproxi(targetUrl);

    if (!response.ok) {
      if (response.status === 400) {
        return { steamid: null, reason: 'not_found' };
      }
      return { steamid: null, reason: 'proxy_error' };
    }

    const data = await response.json();
    if (data.response && data.response.success === 1 && data.response.steamid) {
      return { steamid: data.response.steamid, reason: null };
    }
    console.error('Resolve error:', data);
    return { steamid: null, reason: 'not_found' };
  } catch (error) {
    console.error('Error resolving vanity URL:', error);
    return { steamid: null, reason: 'proxy_unreachable' };
  }
}

// Fetch user profile from Steam
async function getSteamProfile(steamID) {
  try {
    const targetUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_PROXY_SECRET_PLACEHOLDER}&steamids=${encodeURIComponent(steamID)}`;
    const response = await fetchViaApproxi(targetUrl);

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
  const input = inputField.value;
  const button = document.querySelector('button[type="submit"]');
  const errorDiv = document.getElementById('login-error');

  // Reset any previous error before validating a new attempt.
  clearErrorState(inputField);

  // Parse input
  const parsed = parseSteamInput(input);
  if (!parsed) {
    showError('Enter a valid Steam profile URL, custom URL, or 17-digit Steam ID.', inputField);
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
      const resolution = await resolveSteamID(parsed.value);
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
    const profileResult = await getSteamProfile(steamID);
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

    // Save the current profile for quick access and add to saved accounts
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileResult.profile));
    try {
      addOrUpdateSavedAccount({
        steamid: profileResult.profile.steamid,
        displayName: profileResult.profile.personaname || profileResult.profile.steamid,
        lastUsed: Date.now(),
        favorite: false,
        profile: profileResult.profile,
        // apiKey: apiKey
      });
    } catch (e) {
      console.error('Failed to save account:', e);
    }
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
    button.textContent = 'Login';

    // Keep completed state visible on success, otherwise hide/reset.
    if (!errorDiv.hidden) {
      resetLoading();
    }
  }
}

// Account storage + rendering helpers
function loadSavedAccounts() {
  try {
    const accountListRaw = localStorage.getItem(ACCOUNT_LIST_KEY) || '[]';
    const accountIds = JSON.parse(accountListRaw);
    if (!Array.isArray(accountIds)) return [];
    const accounts = [];
    for (const steamid of accountIds) {
      const accountRaw = localStorage.getItem(`team03_guideRail_account_${steamid}`);
      if (accountRaw) {
        try {
          const acct = JSON.parse(accountRaw);
          accounts.push(acct);
        } catch (e) {
          console.error(`Failed to parse account ${steamid}:`, e);
        }
      }
    }
    return accounts;
  } catch (e) {
    return [];
  }
}

function saveSavedAccounts(list) {
  const accountIds = [];
  for (const acct of list) {
    localStorage.setItem(`team03_guideRail_account_${acct.steamid}`, JSON.stringify(acct));
    accountIds.push(acct.steamid);
  }
  localStorage.setItem(ACCOUNT_LIST_KEY, JSON.stringify(accountIds));
}

function addOrUpdateSavedAccount(account) {
  const list = loadSavedAccounts();
  const idx = list.findIndex(a => a.steamid === account.steamid);
  const fullAccount = {
    steamid: account.steamid,
    displayName: account.displayName,
    lastUsed: Date.now(),
    favorite: account.favorite || false,
    profile: account.profile || null,
    // apiKey: account.apiKey || null
  };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...fullAccount };
  } else {
    list.unshift(fullAccount);
  }
  saveSavedAccounts(list);
  renderAccounts();
}

function deleteSavedAccount(steamid) {
  localStorage.removeItem(`team03_guideRail_account_${steamid}`);
  const accountIds = JSON.parse(localStorage.getItem(ACCOUNT_LIST_KEY) || '[]');
  const updated = accountIds.filter(id => id !== steamid);
  localStorage.setItem(ACCOUNT_LIST_KEY, JSON.stringify(updated));
  renderAccounts();
}

function toggleFavoriteAccount(steamid) {
  const list = loadSavedAccounts();
  const idx = list.findIndex(a => a.steamid === steamid);
  if (idx >= 0) {
    list[idx].favorite = !list[idx].favorite;
    saveSavedAccounts(list);
    renderAccounts();
  }
}

/* Renders all saved Steam accounts onto the page.
*
* This creates the clickable account list shown
* on the login screen.
*
* Each saved account can:
* - quickly log in
* - be favorited
* - be deleted
*
* The accounts are loaded from localStorage
* and displayed dynamically using JavaScript.
*/
function renderAccounts(showFavoritesOnly = false) {
  const container = document.getElementById('accountsList');
  if (!container) return;
  const list = loadSavedAccounts();
  const items = showFavoritesOnly ? list.filter(a => a.favorite) : list;
  container.innerHTML = '';

  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'account-item empty';
    li.textContent = 'No saved accounts';
    container.appendChild(li);
    return;
  }

  for (const acct of items) {
    const li = document.createElement('li');
    li.className = 'account-item';
    li.dataset.steamid = acct.steamid;

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'account-select';
    name.textContent = acct.displayName || acct.steamid;
    name.title = acct.profile ? 'Boot into this account' : 'Select this account';

    const fav = document.createElement('button');
    fav.type = 'button';
    fav.className = 'account-fav';
    fav.title = acct.favorite ? 'Unfavorite' : 'Favorite';
    fav.textContent = acct.favorite ? '★' : '☆';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'account-delete';
    del.title = 'Delete account';
    del.textContent = 'Delete';

    li.appendChild(name);
    li.appendChild(fav);
    li.appendChild(del);
    container.appendChild(li);
  }
}
/* Renders all saved Steam accounts onto the page.
*
* This creates the clickable account list shown
* on the login screen.
*
* - quickly log in
* - be favorited
* - be deleted
*
* The accounts are loaded from localStorage
* and displayed dynamically using JavaScript.
*/
function selectAccountToInputs(steamid) {
  const accounts = loadSavedAccounts();
  const acct = accounts.find(a => a.steamid === steamid);
  const usernameInput = document.getElementById('username');
  if (acct && usernameInput) {
    usernameInput.value = acct.steamid;
    usernameInput.focus();
  }
}
/*
 * Automatically logs into a previously
 * saved Steam account.
 *
 * - restores saved profile data
 * - clears old game data
 * - updates the last used timestamp
 * - redirects to profile.html
 *
 * This creates a "quick boot" experience
 * similar to saved accounts in real launchers.
 */
function bootIntoAccount(steamid) {
  const accounts = loadSavedAccounts();
  const acct = accounts.find(a => a.steamid === steamid);
  if (acct && acct.profile) {
    // Set the API key and profile in localStorage
    // localStorage.setItem(API_KEY_STORAGE_KEY, acct.apiKey);
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(acct.profile));
    // Clear games from previous account
    localStorage.removeItem(GAMES_STORAGE_KEY);
    // Update lastUsed timestamp
    acct.lastUsed = Date.now();
    saveSavedAccounts(accounts);
    // Redirect to profile page
    window.location.href = 'profile.html';
  } else {
    alert('Account data incomplete. Please login normally to refresh.');
  }
}

/*
 * Exports saved account data into a JSON file.
 *
 * - back up their saved accounts
 * - transfer accounts between browsers/devices
 * - re-import them later
 */
function exportAccounts() {
  const accounts = loadSavedAccounts();
  const exportData = {
    version: 1,
    exported: new Date().toISOString(),
    accounts: accounts
  };
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `guiderail-accounts-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
/*
 * Imports saved accounts from a JSON file.
 *
 * Imported accounts are merged with any
 * existing saved accounts already stored
 * in localStorage.
 */
function importAccounts(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.accounts && Array.isArray(data.accounts)) {
        const existingAccounts = loadSavedAccounts();
        const newAccounts = data.accounts;
        // Merge: keep existing, add new ones, update if steamid matches
        const merged = [...existingAccounts];
        for (const newAcct of newAccounts) {
          const idx = merged.findIndex(a => a.steamid === newAcct.steamid);
          if (idx >= 0) {
            // Update existing account with imported data
            merged[idx] = { ...merged[idx], ...newAcct };
          } else {
            // Add new account
            merged.push(newAcct);
          }
        }
        saveSavedAccounts(merged);
        renderAccounts();
      } else {
        alert('Invalid import format');
      }
    } catch (e) {
      console.error('Import error:', e);
      alert('Failed to import accounts: ' + e.message);
    }
  };
  reader.readAsText(file);
}

/*
 * Validates imported account JSON structure.
 *
 * Ensures the imported file actually contains
 * an accounts array before importing it.
 */
function normalizeImportedAccounts(parsed) {
  if (parsed && Array.isArray(parsed.accounts)) {
    return parsed.accounts;
  }
  return null;
}
/*
 * Displays an accessible login error message.
 *
 * - shows the error visually
 * - updates accessibility attributes
 * - focuses the input field
 * - positions the error container correctly
 *
 * Used throughout the login flow whenever
 * validation or API requests fail.
 */
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

  // Prevent Enter from accidentally submitting early
  if (usernameInput) {
    usernameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
      }
    });
  }
  // Connect the login form to the main login handler

  if (form) {
    form.addEventListener('submit', handleLogin);
  }
    // Toggle between themes
  const toggleBtn = document.getElementById('theme-toggle');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = localStorage.getItem(THEME_KEY) || 'green';
      const next = current === 'green' ? 'blue' : 'green';

      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
  // Accounts UI wiring
  let showFavoritesOnly = false;
  const accountsList = document.getElementById('accountsList');
  const filterToggle = document.getElementById('accounts-filter-toggle');

  if (filterToggle) {
    filterToggle.addEventListener('click', () => {
      showFavoritesOnly = !showFavoritesOnly;
      filterToggle.setAttribute('aria-pressed', String(showFavoritesOnly));
      filterToggle.textContent = showFavoritesOnly ? 'Show All' : 'Show Favorites';
      renderAccounts(showFavoritesOnly);
    });
  }
  /*
   * Handles all button clicks inside the saved accounts list.
   *
   * - boot into an account
   * - favorite/unfavorite an account
   * - delete an account
   *
   * Event delegation is used here so one listener
   * can manage every dynamically created account item.
   */

  if (accountsList) {
    accountsList.addEventListener('click', (ev) => {
      const btn = ev.target;
      const li = btn.closest('li.account-item');
      if (!li) return;
      const sid = li.dataset.steamid;

      if (btn.classList.contains('account-select')) {
        // Check if account has saved profile data for booting
        const acct = loadSavedAccounts().find(a => a.steamid === sid);
        if (acct && acct.profile) {
          bootIntoAccount(sid);
        } else {
          selectAccountToInputs(sid);
        }
      } else if (btn.classList.contains('account-fav')) {
        toggleFavoriteAccount(sid);
      } else if (btn.classList.contains('account-delete')) {
        deleteSavedAccount(sid);
      }
    });
  }

  // Wire up import/export
  const exportBtn = document.getElementById('accounts-export-btn');
  const importBtn = document.getElementById('accounts-import-btn');
  const importFile = document.getElementById('accounts-import-file');
  const importPreview = document.getElementById('accounts-import-preview');
  const importPreviewSummary = document.getElementById('accounts-import-preview-summary');
  const importPreviewSample = document.getElementById('accounts-import-preview-sample');
  const importConfirmBtn = document.getElementById('accounts-import-confirm-btn');
  const importCancelBtn = document.getElementById('accounts-import-cancel-btn');
  let pendingImportFile = null;
  /*
 * Hides the account import preview panel.
 *
 * This clears the currently selected import file
 * and removes the preview window from the page.

 * - an import is canceled
 * - an import finishes successfully
 */

  const hideImportPreview = () => {
    pendingImportFile = null;
    if (importPreview) {
      importPreview.hidden = true;
    }
  };
  /* Displays a preview of an account import file
  * before actually importing it.
  *
  * This allows the user to verify
  * - how many accounts were detected
  * - sample account names
  * - whether the file format is valid
  *
  * This creates a safer import experience
  * by preventing accidental imports.
  */

  const showImportPreview = async (file) => {
    if (!importPreview || !importPreviewSummary || !importPreviewSample) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const accounts = normalizeImportedAccounts(parsed);
      if (!Array.isArray(accounts)) {
        throw new Error('Expected an export with an accounts array.');
      }

      pendingImportFile = file;
      importPreviewSummary.textContent = `${accounts.length} account${accounts.length === 1 ? '' : 's'} ready to import from ${file.name}.`;
      const sampleNames = accounts.slice(0, 3).map((account) => account.personaname || account.steamid || 'Unnamed account');
      importPreviewSample.textContent = sampleNames.length
        ? `Preview: ${sampleNames.join(', ')}${accounts.length > 3 ? '...' : ''}`
        : 'Preview: no account names found in the file.';
      importPreview.hidden = false;
    } catch (error) {
      pendingImportFile = null;
      importPreviewSummary.textContent = 'Could not preview that file.';
      importPreviewSample.textContent = error.message;
      importPreview.hidden = false;
    }
  };

  if (exportBtn) {
    exportBtn.addEventListener('click', exportAccounts);
  }

  if (importBtn) {
    importBtn.addEventListener('click', () => {
      importFile.click();
    });
  }
  /*
   * Handles the final confirmation step
   * for importing saved accounts.
   *
   * Once confirmed
   * - the selected file is imported
   * - accounts are saved to localStorage
   * - the preview window closes
   */

  if (importConfirmBtn) {
    importConfirmBtn.addEventListener('click', () => {
      if (!pendingImportFile) return;
      importAccounts(pendingImportFile);
      hideImportPreview();
    });
  }

  if (importCancelBtn) {
    importCancelBtn.addEventListener('click', () => {
      hideImportPreview();
    });
  }
  /*
   * Handles account file selection from
   * the user's computer.
   *
   * Once a file is selected, the app
   * displays a preview before importing it.
   */

  if (importFile) {
    importFile.addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (file) {
        showImportPreview(file);
      }
      ev.target.value = ''; // Reset file input
    });
    const accountsBox = document.querySelector('.accounts-box');
    if (accountsBox) {
      accountsBox.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; accountsBox.classList.add('drag-over'); });
      accountsBox.addEventListener('dragenter', (e) => { e.preventDefault(); accountsBox.classList.add('drag-over'); });
      accountsBox.addEventListener('dragleave', (e) => { e.preventDefault(); accountsBox.classList.remove('drag-over'); });
      accountsBox.addEventListener('drop', (e) => {
        e.preventDefault();
        accountsBox.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files && files[0]) {
          showImportPreview(files[0]);
        }
      });
    }
  }

  // Initial render
  renderAccounts();
});
/*
 * Repositions the login error message whenever
 * the browser window is resized.
 *
 * This keeps the error box visually centered
 * and properly aligned on different screen sizes.
 */

window.addEventListener('resize', () => {
  const errorDiv = document.getElementById('login-error');
  if (errorDiv && !errorDiv.hidden) {
    positionErrorContainer();
  }
});
/*
 * Runs whenever the page is shown again
 * through browser navigation.
 *
 * By using the browser back button
, this resets the loading screen and
 * restores proper UI positioning.
 */

window.addEventListener('pageshow', () => {
  resetLoading();
  positionErrorContainer();
});

