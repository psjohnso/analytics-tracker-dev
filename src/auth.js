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
// TRACKER_ADMIN/LEAD/MEMBER_GROUP_ID, CAPABILITY_DEFS. Backward references:
// ARCGIS_CONFIG and STRATEGIC_ALIGNMENT_EDITORS (loaded earlier).
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
  previewMode: false, // When true, admin sees the app as a regular team member (kept in sync with actAsRole)
  actAsRole: 'admin', // Admin "act as" lens: 'admin' | 'lead' | 'member'. Lead/member impersonate that role for CURRENT_TEAM.
  // Three-tier access resolved from AGO groups at login (see fetchAgolUserInfo).
  tier: 'member',     // 'admin' | 'lead' | 'member'
  inAdminGroup: false,
  inLeadGroup: false,
  inMemberGroup: false,
};

// Check admin status. A real admin (Tracker Admin group) is only treated as
// admin while acting as themselves ('admin'); impersonating a lead/member de-admins.
function isAdmin() { return Auth.isTeamLead && Auth.actAsRole === 'admin' && !Auth.previewMode; }

// The effective tier for the CURRENT user right now, honoring an admin's
// "act as" lens. For a genuine non-admin, lead = in the Tracker Leads group OR
// has a lead-team assigned (field), so existing per-team/data-program leads keep
// working; everyone else is a member.
function effectiveTier() {
  if (isAdmin()) return 'admin';
  if (Auth.isTeamLead) { // a real admin impersonating a lower role
    return Auth.actAsRole === 'lead' ? 'lead' : 'member';
  }
  if (Auth.tier === 'lead' || isTeamLeadRole()) return 'lead';
  return 'member';
}
// True for leads (and admins, who are a superset).
function isLead() { return isAdmin() || effectiveTier() === 'lead'; }

// Which tiers a capability is granted to — runtime config (Phase 2) overrides
// the seed defaults in CAPABILITY_DEFS.
function capabilityTiers(cap) {
  if (typeof PERMISSIONS_CONFIG !== 'undefined' && PERMISSIONS_CONFIG && PERMISSIONS_CONFIG[cap]) return PERMISSIONS_CONFIG[cap];
  var def = (typeof CAPABILITY_DEFS !== 'undefined') ? CAPABILITY_DEFS[cap] : null;
  return def ? (def.tiers || []) : null;
}
// Central permission check. Admin can do everything; meta capabilities are
// admin-only; otherwise the user's effective tier must be in the allowed list.
function can(cap) {
  if (isAdmin()) return true;
  var def = (typeof CAPABILITY_DEFS !== 'undefined') ? CAPABILITY_DEFS[cap] : null;
  if (!def) return false;       // unknown capability → admin-only (safe default)
  if (def.meta) return false;   // meta capabilities are never granted to non-admins
  var allowed = capabilityTiers(cap) || [];
  return allowed.indexOf(effectiveTier()) >= 0;
}

// ── Team Lead helpers ────────────────────────────────────────────────
// A "Team Lead" leads a specific team — their member record's
// data_program_lead_team field names that team. They can create and edit ALL of
// their own team's projects (not just data-program ones). The home team (Data
// Intelligence) uses the admin group instead of this field. The legacy field
// name is kept to avoid an AGOL schema migration; dataprogram.html's lead
// console reads the same field.
function getLeadTeam() {
  if (!Auth.fullName) return null;
  // Admin "act as" impersonation: lead → lead of the current team; member → none.
  if (Auth.actAsRole === 'member') return null;
  if (Auth.actAsRole === 'lead') {
    return (typeof CURRENT_TEAM !== 'undefined' && CURRENT_TEAM) ? CURRENT_TEAM : null;
  }
  // Acting as self ('admin'): read the real lead-team from the member record.
  if (typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return null;
  var p = RESOURCES_DATA.people[Auth.fullName];
  if (!p) return null;
  var t = p.data_program_lead_team;
  return (t && typeof t === 'string' && t.trim()) ? t.trim() : null;
}
function isTeamLeadRole() { return getLeadTeam() !== null; }
function canCreateProject() {
  // Admins always can. Leads can when the create_project capability allows their
  // tier. Members of a team that opted out of the Submit Idea flow (Settings →
  // Project intake) also create projects directly.
  return isAdmin() || (isTeamLeadRole() && can('create_project')) || (typeof teamCreatesDirectly === 'function' && teamCreatesDirectly());
}
function canEditProject(p) {
  if (isAdmin()) return true;
  // Baseline: you can always edit a project you own (you're its contact).
  if (Auth.fullName && p && p.contact === Auth.fullName) return true;
  // Leads can edit any project owned by their team, when the capability allows.
  var leadTeam = getLeadTeam();
  if (leadTeam && p && p.owning_team && can('edit_any_project') &&
      ((typeof sameTeam === 'function') ? sameTeam(p.owning_team, leadTeam) : p.owning_team === leadTeam)) return true;
  return false;
}
// Task edit permission mirrors canEditProject: admins → any; the assignee →
// their own task; leads → tasks whose parent project is owned by their team
// (task ↔ project join is project_number).
function canEditTask(t) {
  if (isAdmin()) return true;
  if (Auth.fullName && t && t.assignee === Auth.fullName) return true;
  var leadTeam = getLeadTeam();
  if (leadTeam && t && can('edit_any_project')) {
    var proj = (typeof getProjectByNumber === 'function') ? getProjectByNumber(t.project_number) : null;
    if (proj && proj.owning_team &&
        ((typeof sameTeam === 'function') ? sameTeam(proj.owning_team, leadTeam) : proj.owning_team === leadTeam)) return true;
  }
  return false;
}
// Back-compat aliases (older "Data Program Lead" names).
function getDataProgramLeadTeam() { return getLeadTeam(); }
function isDataProgramLead() { return isTeamLeadRole(); }

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
    Auth.tier = 'member';
    Auth.inAdminGroup = false;
    Auth.inLeadGroup = false;
    Auth.inMemberGroup = false;
    Auth.devMode = false;
    sessionStorage.removeItem('dev_mode');
    const settingsTab = document.getElementById('tab-settings');
    if (settingsTab) settingsTab.style.display = 'none';
    const myWorkTab = document.getElementById('tab-mywork');
    if (myWorkTab) myWorkTab.style.display = 'none';
    const achievementsTab = document.getElementById('tab-achievements');
    if (achievementsTab) achievementsTab.style.display = 'none';
    ['tab-resources', 'tab-forecast', 'tab-insights', 'tab-projectreview', 'tab-slideshow', 'tab-teamload', 'tab-effortshape'].forEach(function(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
    if (currentTab === 'settings' || currentTab === 'mywork' || currentTab === 'achievements' || currentTab === 'resources' || currentTab === 'forecast' || currentTab === 'insights' || currentTab === 'projectReview' || currentTab === 'slideshow' || currentTab === 'teamload' || currentTab === 'effortshape') switchTab('overview');
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
    // Signed in — Sign out + About/Help now live in the account menu (header avatar).
    btn.style.display = 'none';
    var helpInLink = document.getElementById('btn-help');
    if (helpInLink) helpInLink.style.display = 'none';
    if (typeof renderAccountMenuMeta === 'function') renderAccountMenuMeta();
    document.body.classList.remove('read-only-mode');
    if (banner) banner.style.display = 'none';
    if (exportBtn) exportBtn.style.display = '';
  } else {
    // Signed out — no account menu; keep the Sign In + About/Help affordances.
    btn.style.display = '';
    btn.textContent = 'Sign In';
    var helpOutLink = document.getElementById('btn-help');
    if (helpOutLink) helpOutLink.style.display = '';
    if (typeof closeAccountMenu === 'function') closeAccountMenu();
    if (userDisplay) userDisplay.style.display = 'none';
    if (roleBadge) roleBadge.style.display = 'none';
    document.body.classList.add('read-only-mode');
    if (banner) banner.style.display = 'flex';
    var chipWrap = document.getElementById('timer-chip-wrap');
    if (chipWrap) chipWrap.style.display = 'none';
    if (exportBtn) exportBtn.style.display = 'none';
    // Slideshow is the one optional tab anonymous users can use — it's
    // designed for unattended lobby displays. Show it when signed out so
    // a TV bookmarked to ?slideshow=1 stays functional with no session.
    var slideEl = document.getElementById('tab-slideshow');
    if (slideEl) slideEl.style.display = '';
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
    Auth.email = data.email || ''; // Shown in the account-menu header
    if (!displayName) return;

    // Build initials from full name
    const parts = displayName.trim().split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : displayName.slice(0, 2).toUpperCase();

    // Update the header user-info elements if present (they don't
    // exist in the lite app — guard each access so missing DOM doesn't
    // throw and skip the group-membership check below).
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
      if (data.thumbnail) {
        const thumbUrl = ARCGIS_CONFIG.portalUrl + '/sharing/rest/community/users/' +
          encodeURIComponent(username) + '/info/' + data.thumbnail + '?token=' + encodeURIComponent(token);
        avatarEl.innerHTML = '<img src="' + thumbUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.textContent=\'' + initials + '\'">';
      } else {
        avatarEl.textContent = initials;
      }
    }
    const userNameEl = document.getElementById('user-name');
    if (userNameEl) userNameEl.textContent = displayName;
    const userDisplayEl = document.getElementById('user-display');
    if (userDisplayEl) userDisplayEl.style.display = 'flex';
    if (typeof renderAccountMenuMeta === 'function') renderAccountMenuMeta();
    // Show My Work tab for all logged-in users
    const myWorkTab = document.getElementById('tab-mywork');
    if (myWorkTab) myWorkTab.style.display = '';

    // Resolve the three-tier access level (admin / lead / member) from the
    // user's ArcGIS group memberships. Highest tier wins.
    if (username) {
      try {
        const groupUrl = ARCGIS_CONFIG.portalUrl + '/sharing/rest/community/users/' +
          encodeURIComponent(username) + '?f=json&token=' + encodeURIComponent(token);
        const gResp = await fetch(groupUrl);
        const gData = await gResp.json();
        if (gData.groups && Array.isArray(gData.groups)) {
          const ids = gData.groups.map(function(g) { return g.id; });
          Auth.inAdminGroup  = !!TRACKER_ADMIN_GROUP_ID  && ids.indexOf(TRACKER_ADMIN_GROUP_ID)  >= 0;
          Auth.inLeadGroup   = !!TRACKER_LEAD_GROUP_ID    && ids.indexOf(TRACKER_LEAD_GROUP_ID)   >= 0;
          Auth.inMemberGroup = !!TRACKER_MEMBER_GROUP_ID  && ids.indexOf(TRACKER_MEMBER_GROUP_ID) >= 0;
          Auth.tier = Auth.inAdminGroup ? 'admin' : (Auth.inLeadGroup ? 'lead' : 'member');
          // Back-compat: existing checks read Auth.isTeamLead as "is admin".
          // Idea promotion is now a capability — keep the flag for display only.
          Auth.isTeamLead = Auth.inAdminGroup;
          Auth.canPromote = Auth.inAdminGroup;
          if (Auth.inAdminGroup) {
            const badge = document.getElementById('user-role-badge');
            if (badge) badge.style.display = 'inline-block';
          }
          // Settings is visible to everyone (admins for full settings, members for Preferences only)
          const settingsTab = document.getElementById('tab-settings');
          if (settingsTab) settingsTab.style.display = '';
          // Achievements visible to all signed-in users.
          const achievementsTab = document.getElementById('tab-achievements');
          if (achievementsTab) achievementsTab.style.display = '';
          if (!isAdmin()) {
            Auth.devMode = false;
            sessionStorage.removeItem('dev_mode');
          }
          // Capacity tabs (Resources, Forecast, Insights): admins always see them,
          // members opt in via Preferences. applyOptionalTabVisibility handles both.
          if (typeof applyOptionalTabVisibility === 'function') applyOptionalTabVisibility();
        }
      } catch (gErr) {
        console.warn('Could not resolve access tier from groups:', gErr);
      }
    }
    if (typeof applyPrimaryTabVisibility === 'function') applyPrimaryTabVisibility();
  } catch (err) {
    console.warn('Failed to fetch user info:', err);
  }
}
