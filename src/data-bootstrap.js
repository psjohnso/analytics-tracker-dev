// Data bootstrap — extracted from index.html on 2026-05-22.
// Classic script: the load* functions and loading-overlay helpers below are
// globals shared with the rest of the app, called by the appInit boot IIFE that
// remains in index.html. loadArcGISData = authenticated master load (projects,
// tasks, issues, config, resources); loadPublicData = read-only no-auth fallback.
// Relies on globals defined elsewhere (ARCGIS_CONFIG, agolQuery/agolQueryPublic,
// agolProjectToLocal/agolTaskToLocal, applyAppConfig, loadResourcesData, PROJECTS,
// TASKS, ISSUES, refreshEnums, rebuildProjectIndexes, esc…).

// Load just projects and tasks without authentication (read-only mode)
// Resolves Item IDs to REST URLs, then queries without a token.
async function loadPublicData() {
  var projUrl = ARCGIS_CONFIG.publicProjectsUrl;
  var taskUrl = ARCGIS_CONFIG.publicTasksUrl;
  var configUrl = ARCGIS_CONFIG.publicConfigUrl;

  // If no public view URLs are configured, don't attempt public load
  if (!projUrl && !taskUrl) {
    console.log('No public view URLs configured. Skipping public data load.');
    return false;
  }

  showLoadingOverlay('Loading public data sources...');
  try {
    if (projUrl) {
      updateLoadingOverlay('Loading projects...');
      // Don't filter deleted_at in the WHERE clause — public view layers may
      // not have the field yet (it was added only to source layers in the
      // soft-delete commit). Filter client-side instead so this works
      // regardless of view-layer schema.
      var projectFeatures = await agolQueryPublic(projUrl);
      PROJECTS.length = 0;
      projectFeatures.forEach(function(f) {
        var p = agolProjectToLocal(f);
        if (!p.deleted_at) PROJECTS.push(p);
      });
    }

    if (taskUrl) {
      updateLoadingOverlay('Loaded ' + PROJECTS.length + ' projects. Loading tasks...');
      var taskFeatures = await agolQueryPublic(taskUrl);
      TASKS.length = 0;
      taskFeatures.forEach(function(f) {
        var t = agolTaskToLocal(f);
        if (!t.deleted_at) TASKS.push(t);
      });
    }

    // Try to load app config publicly too
    if (configUrl) {
      try {
        var configFeatures = await agolQueryPublic(configUrl);
        applyAppConfig(configFeatures);
      } catch(e) { console.warn('Public config load failed, using defaults:', e); }
    }

    updateLoadingOverlay('All data loaded (read-only).');
    Auth.dataLoaded = true;
    hideLoadingOverlay();
    return true;
  } catch (err) {
    console.warn('Public data load failed:', err);
    hideLoadingOverlay();
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  LOAD DATA FROM ARCGIS ONLINE
// ══════════════════════════════════════════════════════════════════════

async function loadArcGISData() {
  showLoadingOverlay('Connecting to ArcGIS Online...');
  try {
    updateLoadingOverlay('Loading projects and configuration...');
    // Load projects and app config in parallel — filter out soft-deleted records
    const [projectFeatures, configFeatures] = await Promise.all([
      agolQuery(ARCGIS_CONFIG.projectsUrl, 'deleted_at IS NULL'),
      agolQuery(ARCGIS_CONFIG.appConfigUrl).catch(function(e) {
        console.warn('app_config load failed, using defaults:', e);
        return [];
      }),
    ]);
    PROJECTS.length = 0;
    projectFeatures.forEach(function(f) { PROJECTS.push(agolProjectToLocal(f)); });

    // Apply config from ArcGIS Online
    applyAppConfig(configFeatures);

    updateLoadingOverlay('Loaded ' + PROJECTS.length + ' projects. Loading tasks...');
    const taskFeatures = await agolQuery(ARCGIS_CONFIG.tasksUrl, 'deleted_at IS NULL');
    TASKS.length = 0;
    taskFeatures.forEach(function(f) { TASKS.push(agolTaskToLocal(f)); });

    updateLoadingOverlay('Loaded ' + PROJECTS.length + ' projects and ' + TASKS.length + ' tasks. Loading resources...');
    await loadResourcesData();
    initResourcesWeekIndices();
    loadUserPrefs();
    attachMemberAvatarEmojis();
    applyUiScale();
    applyTheme();
    applyColorBlindMode();
    applyAccentColor();
    applyAvatarEmoji();
    if (typeof applyDefaultSavedViewOnLoad === 'function') applyDefaultSavedViewOnLoad();
    applyBetaTabVisibility();
    applyOptionalTabVisibility();
    // Apply default view preference
    currentView = UserPrefs.projectView || 'list';

    // Seed default review_types config if missing, then load review log entries.
    await ensureReviewTypesSeeded();
    await loadProjectReviews();
    await loadProjectNotes();
    await loadNotifications();

    updateLoadingOverlay('All data loaded.');
    await loadStatusHistory();
    Auth.dataLoaded = true;
    if (typeof renderInbox === 'function') renderInbox(); // ensure the bell reflects state post-load
    hideLoadingOverlay();

    // Apply default tab preference after everything is loaded
    if (Auth.loggedIn && UserPrefs.defaultTab && UserPrefs.defaultTab !== 'overview') {
      switchTab(UserPrefs.defaultTab);
    }

    // Check for auto-saved form state from a previous session
    if (Auth.loggedIn) {
      setTimeout(function() { checkForAutoSavedForm(); }, 1000);
    }

    return true;
  } catch (err) {
    console.error('ArcGIS Online load failed:', err);
    hideLoadingOverlay();
    showAgolError(err);
    return false;
  }
}

// ── Loading overlay UI ──────────────────────────────────────────
function showLoadingOverlay(msg) {
  let el = document.getElementById('sp-loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sp-loading-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,38,105,0.92);color:#fff;font-family:Lato,sans-serif;';
    el.innerHTML = '<div style="font-size:2.4rem;font-weight:700;margin-bottom:0.5rem;">Analytics Project Tracker</div>' +
      '<div id="sp-loading-msg" style="font-size:1.1rem;opacity:0.85;margin-bottom:1.5rem;"></div>' +
      '<div style="width:220px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;">' +
        '<div style="width:40%;height:100%;background:#FFDB22;border-radius:2px;animation:spBar 1.2s ease-in-out infinite alternate;"></div>' +
      '</div>' +
      '<style>@keyframes spBar{from{margin-left:0;width:40%}to{margin-left:60%;width:40%}}</style>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  document.getElementById('sp-loading-msg').textContent = msg || '';
}

function updateLoadingOverlay(msg) {
  const el = document.getElementById('sp-loading-msg');
  if (el) el.textContent = msg;
}

function hideLoadingOverlay() {
  const el = document.getElementById('sp-loading-overlay');
  if (el) el.style.display = 'none';
}

function showAgolError(err) {
  const msg = err.message || String(err);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,38,105,0.95);color:#fff;font-family:Lato,sans-serif;padding:2rem;';
  overlay.innerHTML = '<div style="font-size:1.8rem;font-weight:700;margin-bottom:1rem;color:#FFDB22;"><svg class="icon" aria-hidden="true"><use href="#ph-warning"></use></svg> ArcGIS Online Connection Error</div>' +
    '<div style="max-width:600px;text-align:center;line-height:1.5;margin-bottom:1.5rem;font-size:0.95rem;">' + esc(msg) + '</div>' +
    '<button onclick="location.reload()" style="padding:0.6rem 2rem;background:#C24200;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem;">Retry</button>';
  document.body.appendChild(overlay);
}
