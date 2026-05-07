// ─────────────────────────────────────────────────────────────────────
// auth.js — OAuth, session, and auth-derived UI state
//
// Owns: the Auth state object, OAuth 2.0 implicit-grant flow against
// ArcGIS Online, token storage and validity checks, the session-guard
// modal, the auto-save-on-expiry safety net, login/logout DOM updates,
// and the user-info fetch that populates Auth from /community/self.
//
// Forward references (resolve at call time): showToast, Editor (state),
// openFormModal, switchTab, applyPrimaryTabVisibility, currentTab,
// IDEA_PROMOTE_GROUP_ID. Backward references: ARCGIS_CONFIG and
// STRATEGIC_ALIGNMENT_EDITORS (loaded earlier).
// ─────────────────────────────────────────────────────────────────────

// ── Auth State ──────────────────────────────────────────────────────
const Auth = {
  token: null,
  loggedIn: false,
  username: null,
  fullName: null,
  canPromote: false,
  isTeamLead: false,
  devMode: false,
  dataLoaded: false,
  previewMode: false, // When true, admin sees the app as a regular team member
};

// Check admin status respecting preview mode
function isAdmin() { return Auth.isTeamLead && !Auth.previewMode; }

// ══════════════════════════════════════════════════════════════════════
//  OAUTH 2.0 AUTHENTICATION (ArcGIS Online Implicit Grant)
// ══════════════════════════════════════════════════════════════════════

function getRedirectUri() {
  // Use origin + pathname (no hash or query) as the redirect target
  return window.location.origin + window.location.pathname;
}

function agolAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id:     ARCGIS_CONFIG.clientId,
    response_type: 'token',
    redirect_uri:  getRedirectUri(),
    expiration:    600,  // token lifetime in minutes (10 hours)
  });
  return ARCGIS_CONFIG.portalUrl + '/sharing/rest/oauth2/authorize?' + params.toString();
}

/**
 * After a successful login, ArcGIS Online redirects back with the token
 * in the URL hash fragment: #access_token=...&expires_in=...
 * This function extracts it, stores it, and cleans up the URL.
 */
function extractTokenFromHash() {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  const expiresIn = params.get('expires_in');
  if (token) {
    const expiresAt = Date.now() + (parseInt(expiresIn, 10) * 1000);
    sessionStorage.setItem('agol_token', token);
    sessionStorage.setItem('agol_token_expires', String(expiresAt));
    // Clean the hash from the URL so it doesn't interfere with the app
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return token;
  }
  // Check for error in hash (e.g., user denied access)
  const error = params.get('error');
  if (error) {
    console.error('OAuth error:', error, params.get('error_description'));
  }
  return null;
}

/**
 * Retrieve a previously stored token if it hasn't expired.
 */
function getStoredToken() {
  const token = sessionStorage.getItem('agol_token');
  const expires = sessionStorage.getItem('agol_token_expires');
  if (token && expires && Date.now() < parseInt(expires, 10)) {
    return token;
  }
  // Token missing or expired — clean up
  sessionStorage.removeItem('agol_token');
  sessionStorage.removeItem('agol_token_expires');
  return null;
}

/**
 * Clear the stored token (used when a request returns a token error).
 */
function clearAgolToken() {
  Auth.token = null;
  sessionStorage.removeItem('agol_token');
  sessionStorage.removeItem('agol_token_expires');
}

// ── SESSION GUARD: check token before any edit operation ─────────
function isTokenValid() {
  var expires = sessionStorage.getItem('agol_token_expires');
  if (!expires) return false;
  return Date.now() < parseInt(expires, 10);
}

function getTokenMinutesRemaining() {
  var expires = sessionStorage.getItem('agol_token_expires');
  if (!expires) return 0;
  return Math.max(0, Math.round((parseInt(expires, 10) - Date.now()) / 60000));
}

function ensureValidSession(callback) {
  if (!Auth.loggedIn) {
    showToast('You must be signed in to make changes.', 'warn');
    return false;
  }
  if (isTokenValid()) {
    return true; // Token is valid — caller continues normally
  }
  // Token expired — show re-auth modal (callback retries after re-auth)
  showSessionExpiredModal(callback);
  return false;
}

function showSessionExpiredModal(pendingCallback) {
  var backdrop = document.getElementById('session-expired-backdrop');
  if (!backdrop) return;
  window._sessionPendingCallback = pendingCallback || null;
  backdrop.style.display = 'flex';
}

function sessionReAuth() {
  // Save any pending form state before redirecting
  autoSaveFormState();
  var backdrop = document.getElementById('session-expired-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  window.location.replace(agolAuthorizeUrl());
}

function sessionDismiss() {
  var backdrop = document.getElementById('session-expired-backdrop');
  if (backdrop) backdrop.style.display = 'none';
  window._sessionPendingCallback = null;
}

// ── AUTO-SAVE: preserve form edits in localStorage ──────────────
function autoSaveFormState() {
  // Check if the form modal is currently open
  var formModal = document.getElementById('form-modal-backdrop');
  if (!formModal || !formModal.classList.contains('open')) return;

  var formData = {
    mode: Editor.mode,
    editId: Editor.editId,
    timestamp: Date.now(),
    fields: {}
  };

  // Collect all form field values
  var inputs = document.querySelectorAll('#fm-body input, #fm-body select, #fm-body textarea');
  inputs.forEach(function(el) {
    if (el.id) {
      if (el.type === 'checkbox') formData.fields[el.id] = el.checked;
      else formData.fields[el.id] = el.value;
    }
  });

  if (Object.keys(formData.fields).length > 0) {
    try { localStorage.setItem('tracker_form_autosave', JSON.stringify(formData)); } catch(e) {}
  }
}

function checkForAutoSavedForm() {
  try {
    var saved = localStorage.getItem('tracker_form_autosave');
    if (!saved) return;
    var formData = JSON.parse(saved);
    // Only restore if less than 30 minutes old
    if (Date.now() - formData.timestamp > 30 * 60 * 1000) {
      localStorage.removeItem('tracker_form_autosave');
      return;
    }
    // Show restore prompt
    showAutoSaveRestorePrompt(formData);
  } catch(e) {
    localStorage.removeItem('tracker_form_autosave');
  }
}

function showAutoSaveRestorePrompt(formData) {
  var isProject = formData.mode.indexOf('project') >= 0;
  var isEdit = formData.mode.indexOf('edit') >= 0;
  var type = isProject ? 'project' : 'task';
  var action = isEdit ? 'editing a ' + type : 'creating a new ' + type;
  var minutesAgo = Math.round((Date.now() - formData.timestamp) / 60000);
  var timeLabel = minutesAgo < 1 ? 'just now' : minutesAgo + ' minute' + (minutesAgo !== 1 ? 's' : '') + ' ago';

  showToast('You have unsaved ' + type + ' edits from ' + timeLabel + '. <a href="#" onclick="event.preventDefault();restoreAutoSavedForm();" style="color:#002669;font-weight:700;text-decoration:underline;">Restore</a> or <a href="#" onclick="event.preventDefault();dismissAutoSave();" style="color:#6B7280;text-decoration:underline;">discard</a>.', 'info', 15000);
}

function restoreAutoSavedForm() {
  try {
    var saved = localStorage.getItem('tracker_form_autosave');
    if (!saved) return;
    var formData = JSON.parse(saved);

    // Open the form in the same mode
    openFormModal(formData.mode, formData.editId);

    // Wait for form to render, then restore field values
    setTimeout(function() {
      Object.keys(formData.fields).forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = formData.fields[id];
        else el.value = formData.fields[id];
        // Trigger change event for dependent fields
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      showToast('Form edits restored.', 'success');
    }, 200);

    localStorage.removeItem('tracker_form_autosave');
  } catch(e) {
    showToast('Could not restore form data.', 'error');
    localStorage.removeItem('tracker_form_autosave');
  }
}

function dismissAutoSave() {
  localStorage.removeItem('tracker_form_autosave');
  showToast('Unsaved edits discarded.', 'info');
}

// Auto-save form state periodically while form is open
setInterval(function() {
  var formModal = document.getElementById('form-modal-backdrop');
  if (formModal && formModal.classList.contains('open')) {
    autoSaveFormState();
  }
}, 15000); // every 15 seconds

// Check for token expiry warning every 2 minutes
setInterval(function() {
  if (!Auth.loggedIn) return;
  var mins = getTokenMinutesRemaining();
  if (mins > 0 && mins <= 5) {
    showToast('Your session expires in ' + mins + ' minute' + (mins !== 1 ? 's' : '') + '. Save your work soon or <a href="#" onclick="event.preventDefault();sessionReAuth();" style="color:#002669;font-weight:700;text-decoration:underline;">refresh your session</a>.', 'warn', 10000);
  }
}, 120000);

// ── LOGIN / LOGOUT STATE MANAGEMENT ──────────────────────────────────

function toggleAuth() {
  if (Auth.loggedIn) {
    // Log out: clear token and switch to read-only
    clearAgolToken();
    Auth.loggedIn = false;
    Auth.username = null;
    Auth.fullName = null;
    Auth.canPromote = false;
    Auth.isTeamLead = false;
    Auth.devMode = false;
    sessionStorage.removeItem('dev_mode');
    const settingsTab = document.getElementById('tab-settings');
    if (settingsTab) settingsTab.style.display = 'none';
    const myWorkTab = document.getElementById('tab-mywork');
    if (myWorkTab) myWorkTab.style.display = 'none';
    ['tab-resources', 'tab-forecast', 'tab-insights', 'tab-projectreview', 'tab-slideshow'].forEach(function(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
    if (currentTab === 'settings' || currentTab === 'mywork' || currentTab === 'resources' || currentTab === 'forecast' || currentTab === 'insights' || currentTab === 'projectReview' || currentTab === 'slideshow') switchTab('overview');
    if (typeof applyPrimaryTabVisibility === 'function') applyPrimaryTabVisibility();
    applyAuthState();
  } else {
    // Log in: redirect to ArcGIS Online OAuth (replace to avoid back-button loop)
    window.location.replace(agolAuthorizeUrl());
  }
}

/**
 * Show or hide edit controls based on login state.
 */
function applyAuthState() {
  const btn = document.getElementById('auth-toggle-btn');
  const userDisplay = document.getElementById('user-display');
  const roleBadge = document.getElementById('user-role-badge');
  const banner = document.getElementById('read-only-banner');

  // Selectors for all editable controls
  const editSelectors = [
    '#btn-add-new',
    '#btn-submit-idea',
    '#btn-save-file',
    '#btn-review-ideas',
  ];

  var exportBtn = document.getElementById('btn-export');
  if (Auth.loggedIn) {
    // Signed in — show user info, enable editing
    btn.textContent = 'Sign Out';
    document.body.classList.remove('read-only-mode');
    if (banner) banner.style.display = 'none';
    if (exportBtn) exportBtn.style.display = '';
  } else {
    // Signed out — hide user info, disable editing, show banner
    btn.textContent = 'Sign In';
    if (userDisplay) userDisplay.style.display = 'none';
    if (roleBadge) roleBadge.style.display = 'none';
    document.body.classList.add('read-only-mode');
    if (banner) banner.style.display = 'flex';
    var chipWrap = document.getElementById('timer-chip-wrap');
    if (chipWrap) chipWrap.style.display = 'none';
    if (exportBtn) exportBtn.style.display = 'none';
  }
  if (typeof applyPrimaryTabVisibility === 'function') applyPrimaryTabVisibility();
}

/**
 * Ensure we have a valid ArcGIS Online access token.
 * If no token is available, redirects the user to the ArcGIS login page.
 * Returns the token string, or null if a redirect is in progress.
 */
async function ensureAgolToken() {
  // 1. Already cached in memory this session
  if (Auth.token) return Auth.token;
  // 2. Just returned from ArcGIS login — extract from URL hash
  Auth.token = extractTokenFromHash();
  if (Auth.token) return Auth.token;
  // 3. Previously stored in sessionStorage (survives page refreshes)
  Auth.token = getStoredToken();
  if (Auth.token) return Auth.token;
  // 4. No valid token — redirect to ArcGIS Online login
  window.location.replace(agolAuthorizeUrl());
  return null; // page will redirect; execution stops here
}

/**
 * Fetch the current user's profile from ArcGIS Online.
 * Populates the header with their name and initials.
 * Also checks group membership for access control.
 */
async function fetchAgolUserInfo(token) {
  try {
    const url = ARCGIS_CONFIG.portalUrl + '/sharing/rest/community/self?f=json&token=' + encodeURIComponent(token);
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) {
      console.warn('Could not fetch user info:', data.error);
      return;
    }
    const fullName = data.fullName || data.username || '';
    const username = data.username || '';
    Auth.username = username;  // Store for permission checks
    const displayName = fullName || username;
    Auth.fullName = displayName; // Store for My Work tab matching
    if (!displayName) return;

    // Build initials from full name
    const parts = displayName.trim().split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : displayName.slice(0, 2).toUpperCase();

    // Check for a thumbnail
    const avatarEl = document.getElementById('user-avatar');
    if (data.thumbnail) {
      const thumbUrl = ARCGIS_CONFIG.portalUrl + '/sharing/rest/community/users/' +
        encodeURIComponent(username) + '/info/' + data.thumbnail + '?token=' + encodeURIComponent(token);
      avatarEl.innerHTML = '<img src="' + thumbUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.textContent=\'' + initials + '\'">';
    } else {
      avatarEl.textContent = initials;
    }

    document.getElementById('user-name').textContent = displayName;
    document.getElementById('user-display').style.display = 'flex';
    // Show My Work tab for all logged-in users
    const myWorkTab = document.getElementById('tab-mywork');
    if (myWorkTab) myWorkTab.style.display = '';

    // Check group membership for Idea promotion access control
    if (IDEA_PROMOTE_GROUP_ID && username) {
      try {
        const groupUrl = ARCGIS_CONFIG.portalUrl + '/sharing/rest/community/users/' +
          encodeURIComponent(username) + '?f=json&token=' + encodeURIComponent(token);
        const gResp = await fetch(groupUrl);
        const gData = await gResp.json();
        if (gData.groups && Array.isArray(gData.groups)) {
          Auth.canPromote = gData.groups.some(g => g.id === IDEA_PROMOTE_GROUP_ID);
          Auth.isTeamLead = Auth.canPromote; // same group controls both
          if (Auth.canPromote) {
            const badge = document.getElementById('user-role-badge');
            if (badge) badge.style.display = 'inline-block';
            var previewBtn = document.getElementById('preview-mode-btn');
            if (previewBtn) previewBtn.style.display = '';
          }
          // Settings is visible to everyone (admins for full settings, members for Preferences only)
          const settingsTab = document.getElementById('tab-settings');
          if (settingsTab) settingsTab.style.display = '';
          if (!Auth.isTeamLead) {
            Auth.devMode = false;
            sessionStorage.removeItem('dev_mode');
          }
          // Capacity tabs (Resources, Forecast, Insights): admins always see them,
          // members opt in via Preferences. applyOptionalTabVisibility handles both.
          if (typeof applyOptionalTabVisibility === 'function') applyOptionalTabVisibility();
        }
      } catch (gErr) {
        console.warn('Could not check group membership:', gErr);
      }
    }
    if (typeof applyPrimaryTabVisibility === 'function') applyPrimaryTabVisibility();
  } catch (err) {
    console.warn('Failed to fetch user info:', err);
  }
}
