// ─────────────────────────────────────────────────────────────────────
// tabs/settings.js — Settings tab
//
// Owns: preview-mode and dev-mode toggles, the section switcher,
// the Preferences panel (user prefs + beta features), and the main
// renderSettingsPage entry that assembles all sub-sections.
//
// Sub-sections themselves (member form, absence editor, status
// history editor, list editor, alloc defaults editor) still live in
// index.html and will move with the modal extraction. They're called
// here as forward references.
//
// Forward references: Auth, Editor, UserPrefs, BETA_FEATURES,
// isFeatureOn, isAdmin, render, applyPrimaryTabVisibility,
// renderAbsenceEditor, renderListEditor, renderDescListEditor,
// renderAllocDefaultsEditor, renderStatusHistoryEditor, isTimeTrackingEnabled,
// agolApplyEdits, ARCGIS_CONFIG, showToast, esc, RESOURCES_DATA,
// PROJECTS, TASKS, ISSUES.
// ─────────────────────────────────────────────────────────────────────

function togglePreviewMode() {
  Auth.previewMode = !Auth.previewMode;
  var btn = document.getElementById('preview-mode-btn');
  if (btn) {
    if (Auth.previewMode) {
      btn.textContent = '👁 Exit preview';
      btn.style.background = 'rgba(239,68,68,0.3)';
      btn.style.borderColor = 'rgba(239,68,68,0.6)';
      btn.style.color = '#fff';
    } else {
      btn.textContent = '👁 Preview as member';
      btn.style.background = 'transparent';
      btn.style.borderColor = 'rgba(255,255,255,0.4)';
      btn.style.color = 'rgba(255,255,255,0.7)';
    }
  }
  // Capacity tabs: when entering preview mode, treat the admin as a non-admin
  // so their tab visibility follows their UserPrefs (just like a regular member).
  if (typeof applyOptionalTabVisibility === 'function') applyOptionalTabVisibility();
  // If currently on a now-hidden tab, applyOptionalTabVisibility already
  // switched to overview — bail out so we don't double-render.
  var hiddenTabs = ['resources', 'forecast', 'insights'];
  if (Auth.previewMode && hiddenTabs.indexOf(currentTab) !== -1) {
    return;
  }
  // If on settings in preview mode, switch to preferences section
  if (Auth.previewMode && currentTab === 'settings') {
    _settingsSection = 'preferences';
  }
  markDataDirty();
  render();
}

function toggleDevMode(enabled) {
  Auth.devMode = enabled;
  if (enabled) {
    sessionStorage.setItem('dev_mode', '1');
  } else {
    sessionStorage.removeItem('dev_mode');
  }
}

async function toggleAiPhaseAssignment(enabled) {
  _aiPhaseAssignment = enabled;
  var ok = await saveConfigKey('ai_phase_assignment', enabled);
  if (ok) showToast('AI Phase Assignment ' + (enabled ? 'enabled' : 'disabled') + '.', 'success');
}

var _settingsSection = 'preferences';
function switchSettingsSection(section) {
  _settingsSection = section;
  renderSettingsPage(document.getElementById('content-area'));
}

// Restore dev mode from session on load
if (sessionStorage.getItem('dev_mode') === '1') Auth.devMode = true;

function buildPreferencesPanel() {
  function prefSelect(id, label, desc, options, currentVal) {
    var opts = options.map(function(o) {
      var selected = o.value === currentVal ? ' selected' : '';
      return '<option value="' + o.value + '"' + selected + '>' + esc(o.label) + '</option>';
    }).join('');
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 0;border-bottom:1px solid #F3F1EB;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-body);">' + label + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + desc + '</div>' +
      '</div>' +
      '<select id="pref-' + id + '" onchange="updatePref(\'' + id + '\',this.value)" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--white);color:var(--text-body);min-width:140px;font-family:Lato,sans-serif;">' + opts + '</select>' +
    '</div>';
  }

  function prefToggle(id, label, desc, currentVal) {
    var checked = currentVal ? ' checked' : '';
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 0;border-bottom:1px solid #F3F1EB;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-body);">' + label + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + desc + '</div>' +
      '</div>' +
      '<label style="position:relative;width:40px;height:22px;flex-shrink:0;">' +
        '<input type="checkbox" id="pref-' + id + '"' + checked + ' onchange="updatePref(\'' + id + '\',this.checked)" style="opacity:0;width:0;height:0;position:absolute;">' +
        '<span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:' + (currentVal ? 'var(--navy)' : '#D3D1C7') + ';border-radius:11px;transition:background 0.2s;">' +
          '<span style="position:absolute;width:16px;height:16px;background:#fff;border-radius:50%;top:3px;left:' + (currentVal ? '21px' : '3px') + ';transition:left 0.2s;"></span>' +
        '</span>' +
      '</label>' +
    '</div>';
  }

  var html = '<div class="settings-panel-title">Preferences</div>';
  html += '<div class="settings-panel-desc">Customize how the application looks and works for you. These preferences are saved to your profile and persist across sessions.</div>';

  html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:4px 20px;margin-bottom:20px;">';

  html += prefSelect('defaultTab', 'Default tab', 'Which tab to show when you first open the application.', [
    { value: 'overview', label: 'Overview' },
    { value: 'mywork', label: 'My Work' },
    { value: 'projects', label: 'Projects' },
    { value: 'tasks', label: 'Tasks' }
  ], UserPrefs.defaultTab);

  html += prefSelect('projectView', 'Projects tab layout', 'Default layout for the Projects tab.', [
    { value: 'list', label: 'List view' },
    { value: 'grid', label: 'Grid view' }
  ], UserPrefs.projectView);

  html += prefSelect('timelineRange', 'Timeline range', 'How many months the My Work timeline shows ahead from today.', [
    { value: '3', label: '3 months' },
    { value: '6', label: '6 months' },
    { value: '9', label: '9 months' },
    { value: '12', label: '12 months' }
  ], String(UserPrefs.timelineRange));

  html += prefToggle('sidebarCollapsed', 'Start with sidebar collapsed', 'Hide the filter sidebar by default. You can always toggle it with the Filters button.', UserPrefs.sidebarCollapsed);

  html += prefToggle('completedCollapsed', 'Collapse completed sections', 'Start with the Complete and Canceled sections collapsed on project detail pages.', UserPrefs.completedCollapsed);

  html += prefToggle('timelineShowAll', 'Show all tasks on timeline', 'Show all project tasks on the My Work timeline. When off, only your assigned tasks are shown.', UserPrefs.timelineShowAll);

  html += prefToggle('compactRows', 'Compact rows', 'Use tighter row spacing in project and task tables for a denser view.', UserPrefs.compactRows);

  html += '</div>';

  // Optional tabs — opt-in extras in the top nav.
  // - Capacity: admins always see; members opt in. Hidden from the toggle list
  //   for plain admins (they have no choice to make) unless previewing as member.
  // - Slideshow: opt-in for everyone, including admins.
  var showCapToggle = !Auth.isTeamLead || Auth.previewMode;
  if (showCapToggle || true /* slideshow row always shown */) {
    html += '<div style="margin-top:8px;margin-bottom:20px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
    html += '<span style="font-size:15px;font-weight:700;color:var(--navy);">Optional tabs</span>';
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Add extra tabs to your top navigation. Off by default.</div>';
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:4px 20px;">';
    if (showCapToggle) {
      html += prefToggle('showCapacity', 'Show Capacity tabs', 'Reveals Resources (capacity chart + allocation table), Forecast (utilization grid + capacity planner), and Insights (retrospective charts on completed projects).', UserPrefs.showCapacity);
    }
    html += prefToggle('showSlideshow', 'Show Slideshow tab', 'Cycle through the Overview dashboard panels on a timer — designed for unattended display on a TV or large monitor in a shared space. Includes a fullscreen toggle.', UserPrefs.showSlideshow);
    html += '</div></div>';
  }

  // Beta Features section — only show features with flag === 'beta'
  var betaKeys = Object.keys(BETA_FEATURES).filter(function(key) {
    var flags = { dependencies: FEATURE_DEPENDENCIES, taskHistory: FEATURE_TASK_HISTORY, aiIntake: FEATURE_AI_INTAKE, projectReview: FEATURE_PROJECT_REVIEW };
    return flags[key] === 'beta';
  });

  if (betaKeys.length > 0) {
    html += '<div style="margin-top:8px;margin-bottom:20px;">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
    html += '<span style="font-size:15px;font-weight:700;color:var(--navy);">Beta features</span>';
    html += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:#FFF7ED;color:#9A3412;border:1px solid #FED7AA;">BETA</span>';
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">These features are in testing. You can try them out and share feedback with the team. They may change or be removed.</div>';
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:4px 20px;">';

    betaKeys.forEach(function(key) {
      var bf = BETA_FEATURES[key];
      var isEnabled = UserPrefs.betaFeatures && UserPrefs.betaFeatures[key];
      html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 0;border-bottom:1px solid #F3F1EB;">';
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="font-size:13px;font-weight:700;color:var(--text-body);">' + bf.label + '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + bf.desc + '</div>';
      html += '</div>';
      html += '<label style="position:relative;width:40px;height:22px;flex-shrink:0;">';
      html += '<input type="checkbox" id="pref-beta-' + key + '"' + (isEnabled ? ' checked' : '') + ' onchange="updateBetaPref(\'' + key + '\',this.checked)" style="opacity:0;width:0;height:0;position:absolute;">';
      html += '<span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:' + (isEnabled ? '#C24200' : '#D3D1C7') + ';border-radius:11px;transition:background 0.2s;">';
      html += '<span style="position:absolute;width:16px;height:16px;background:#fff;border-radius:50%;top:3px;left:' + (isEnabled ? '21px' : '3px') + ';transition:left 0.2s;"></span>';
      html += '</span>';
      html += '</label>';
      html += '</div>';
    });

    html += '</div>';
    html += '</div>';
  }

  return html;
}

function updatePref(key, value) {
  // Type conversion
  if (key === 'timelineRange') value = parseInt(value) || 6;
  if (key === 'sidebarCollapsed' || key === 'completedCollapsed' || key === 'timelineShowAll' || key === 'compactRows' ||
      key === 'showCapacity' || key === 'showSlideshow') {
    value = value === true || value === 'true';
  }
  UserPrefs[key] = value;
  saveUserPrefs();
  // Apply immediately where possible
  if (key === 'projectView') currentView = value;
  if (key === 'sidebarCollapsed') {
    var sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed', value);
  }
  if (key === 'showCapacity' || key === 'showSlideshow') {
    if (typeof applyOptionalTabVisibility === 'function') applyOptionalTabVisibility();
  }
  // Re-render the preferences panel to update toggle visuals
  render();
  showToast('Preference saved.', 'success');
}

function updateBetaPref(featureKey, enabled) {
  if (!UserPrefs.betaFeatures) UserPrefs.betaFeatures = {};
  UserPrefs.betaFeatures[featureKey] = !!enabled;
  saveUserPrefs();
  applyBetaTabVisibility();
  // If a tab-gated feature is being turned off while the user is on its tab, fall back.
  if (!enabled && featureKey === 'projectReview' && currentTab === 'projectReview') {
    switchTab('overview');
    return;
  }
  render();
  showToast(BETA_FEATURES[featureKey].label + (enabled ? ' enabled.' : ' disabled.'), 'success');
}

function renderSettingsPage(area) {
  var isAdminUser = isAdmin();
  if (!Auth.loggedIn) {
    area.innerHTML = '<div class="empty-state">Sign in to access Settings.</div>';
    return;
  }
  // Non-admins only see preferences — force section
  if (!isAdminUser && _settingsSection !== 'preferences') {
    _settingsSection = 'preferences';
  }

  // ── Sidebar navigation ──────────────────────────────────
  function navItem(id, label, count) {
    var cls = 'settings-nav-item' + (_settingsSection === id ? ' active' : '');
    var badge = count != null ? '<span class="settings-nav-count">' + count + '</span>' : '';
    return '<div class="' + cls + '" onclick="switchSettingsSection(\'' + id + '\')">' + label + badge + '</div>';
  }

  var navHtml = '<div class="settings-nav">';
  // Preferences — visible to everyone
  navHtml += '<div class="settings-nav-group">';
  navHtml += '<div class="settings-nav-label">Personal</div>';
  navHtml += navItem('preferences', 'Preferences');
  navHtml += '</div>';

  // Admin-only sections
  if (isAdminUser) {
    if (!RESOURCES_DATA) {
      area.innerHTML = '<div class="empty-state">Resources data is loading…</div>';
      return;
    }
    var people = RESOURCES_DATA.people;
    var allNames = Object.keys(people).sort();
    var activeCount = allNames.filter(function(n) { return people[n].active !== false; }).length;

    navHtml += '<div class="settings-nav-group">' +
      '<div class="settings-nav-label">People</div>' +
      navItem('team', 'Team members', activeCount) +
      navItem('allocations', 'Allocations') +
      navItem('timetracking', 'Time tracking') +
    '</div>' +
    '<div class="settings-nav-group">' +
      '<div class="settings-nav-label">Project config</div>' +
      navItem('lists', 'Dropdown lists') +
      navItem('categories', 'Categories and tools') +
      navItem('reviewtypes', 'Review types') +
    '</div>' +
    '<div class="settings-nav-group">' +
      '<div class="settings-nav-label">System</div>' +
      navItem('ai', 'AI features') +
      navItem('slideshow', 'Slideshow') +
      navItem('trash', 'Trash') +
      navItem('developer', 'Developer') +
    '</div>';
  }
  navHtml += '</div>';

  // ── Panel content (only active section) ──────────────────
  var panelHtml = '';

  if (_settingsSection === 'preferences') {
    panelHtml = buildPreferencesPanel();
  } else if (!isAdminUser) {
    panelHtml = '<div class="empty-state">You do not have access to this section.</div>';
  } else {
  if (_settingsSection === 'team') {
    var showFormerSettings = document.getElementById('settings-show-former');
    var includeInactiveSettings = showFormerSettings && showFormerSettings.checked;
    var names = includeInactiveSettings ? allNames : allNames.filter(function(n) { return people[n].active !== false; });
    var inactiveCount = allNames.length - activeCount;

    var memberRows = names.map(function(name) {
      var p = people[name];
      var isLight = p.tracking_level === 'light';
      var schedLabel = isLight ? '—' : (p.schedule_type || '5/8');
      if (!isLight && p.rdo_day) schedLabel += ' · ' + p.rdo_day + ' off';
      var ttChecked = p.time_tracking ? ' checked' : '';
      var isInactive = p.active === false;
      var rowStyle = isInactive ? ' style="opacity:0.5;"' : '';
      var activeLabel = isInactive ? '<span style="color:#EF4444;font-weight:700;font-size:10px;">Inactive</span>' : '<span style="color:#83AC16;font-weight:700;font-size:10px;">Active</span>';
      var trackingLabel = isLight
        ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#FFF7ED;color:#9A3412;">Light</span>'
        : '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#EEF2FF;color:#002669;">Full</span>';
      // Data Program Lead chip — appended after the tracking-level badge
      // when the member is flagged as a non-DI team's lead.
      if (p.data_program_lead_team) {
        var dpltShort = (function() {
          var teams = (typeof getDataProgramTeams === 'function') ? getDataProgramTeams() : [];
          var t = teams.find(function(x) { return x.name === p.data_program_lead_team; });
          return t && t.id ? t.id + ' Lead' : p.data_program_lead_team + ' Lead';
        })();
        trackingLabel += ' <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#FEF3C7;color:#92400E;margin-left:4px;" title="Can create projects directly for ' + esc(p.data_program_lead_team) + '">' + esc(dpltShort) + '</span>';
      }
      return '<tr' + rowStyle + '>' +
        '<td style="font-weight:700;color:var(--navy);">' + esc(name) + '</td>' +
        '<td>' + esc(p.role) + '</td>' +
        '<td>' + esc(p.team) + '</td>' +
        '<td style="text-align:center;">' + trackingLabel + '</td>' +
        '<td>' + (isLight ? '—' : Math.round(p.proj_pct * 100) + '%') + '</td>' +
        '<td>' + esc(schedLabel) + '</td>' +
        '<td style="text-align:center;">' + (isLight ? '—' : '<input type="checkbox"' + ttChecked + ' onchange="toggleTimeTracking(\'' + name.replace(/'/g, "\\'") + '\', this.checked)" style="width:16px;height:16px;cursor:pointer;">') + '</td>' +
        '<td style="text-align:center;cursor:pointer;" onclick="toggleMemberActive(\'' + name.replace(/'/g, "\\'") + '\')" title="Click to toggle">' + activeLabel + '</td>' +
        '<td style="text-align:right;white-space:nowrap;">' +
          '<button class="settings-btn settings-btn-secondary" style="margin-right:4px;" onclick="openAbsenceEditor(\'' + name.replace(/'/g, "\\'") + '\')">📅 Absences</button>' +
          '<button class="settings-btn settings-btn-secondary" style="margin-right:4px;" onclick="openMemberForm(\'edit\',\'' + name.replace(/'/g, "\\'") + '\')">✏️ Edit</button>' +
          '<button class="settings-btn settings-btn-danger" onclick="deleteMember(\'' + name.replace(/'/g, "\\'") + '\')">🗑</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    panelHtml = '<div class="settings-panel-title">Team members</div>' +
      '<div class="settings-panel-desc">Manage your team roster, roles, schedules, and tracking settings.</div>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">' +
        (inactiveCount > 0 ? '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);cursor:pointer;font-weight:600;">' +
          '<input type="checkbox" id="settings-show-former"' + (includeInactiveSettings ? ' checked' : '') + ' onchange="renderSettingsPage(document.getElementById(\'content-area\'))" style="width:14px;height:14px;cursor:pointer;">' +
          'Show former (' + inactiveCount + ')' +
        '</label>' : '') +
        '<button class="settings-btn settings-btn-primary" onclick="openMemberForm(\'add\')">＋ Add Member</button>' +
      '</div>' +
      '<table class="member-table">' +
        '<thead><tr><th>Name</th><th>Role</th><th>Team</th><th>Tracking</th><th>Project %</th><th>Schedule</th><th style="text-align:center;">⏱️</th><th style="text-align:center;">Status</th><th style="text-align:right;">Actions</th></tr></thead>' +
        '<tbody>' + memberRows + '</tbody>' +
      '</table>' +
      '<div id="settings-absence-section"></div>';
  }

  else if (_settingsSection === 'allocations') {
    var prPct = Math.round((_productivityRatio || 0.75) * 100);
    panelHtml = '<div class="settings-panel-title">Allocations</div>' +
      '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:10px;padding:18px 20px;margin-bottom:24px;">' +
        '<div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px;">Capacity formula</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">Each person\'s weekly project capacity = (scheduled hours − absences) × <strong>productivity ratio</strong> × their project-available %.</div>' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<label for="settings-productivity-ratio" style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">Productivity ratio</label>' +
          '<input type="number" id="settings-productivity-ratio" min="1" max="100" step="1" value="' + prPct + '" style="width:80px;padding:6px 8px;text-align:center;border:1px solid #E8E6DF;border-radius:6px;font-size:14px;font-family:Lato,sans-serif;font-weight:700;color:var(--navy);">' +
          '<span style="font-size:13px;color:var(--text-muted);">%</span>' +
          '<button class="settings-btn settings-btn-primary" onclick="saveProductivityRatio()" style="margin-left:auto;">Save Ratio</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:10px;">Default 75%. Lower = more conservative — accounts for meetings, email, context-switching, breaks. Saved value is shared across all users.</div>' +
        '<div style="margin-top:14px;padding-top:12px;border-top:1px dashed #E8E6DF;">' +
          '<div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:4px;">Update stored allocation hours</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">In-app calculations always use the current ratio. Run this if external tools (Power BI, exports, dashboards) read allocation hours directly from ArcGIS — it rewrites stored hours on every allocation record using the saved ratio. Only records whose stored value differs are touched.</div>' +
          '<button id="btn-migrate-alloc-hours" class="settings-btn settings-btn-secondary" onclick="migrateAllocationHours()">Update stored allocation hours</button>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px;">Allocation defaults</div>' +
      '<div class="settings-panel-desc">Default weekly allocation percentages applied when auto-filling allocations. Values represent the percentage of a person\'s project-available time dedicated to a single project per week.</div>' +
      '<div id="alloc-defaults-editor"></div>';
  }

  else if (_settingsSection === 'timetracking') {
    var activeNamesArr = allNames.filter(function(n) { return isFullMember(n); });
    var ttEnabled = activeNamesArr.filter(function(n) { return people[n].time_tracking === true; });
    var ttWithEntries = ttEnabled.filter(function(n) { return TEAM_TIME_STATS[n] && TEAM_TIME_STATS[n].entryCount > 0; });
    var todayStr = (function() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
    function ttDaysAgo(dateStr) {
      if (!dateStr) return 'Never';
      var d = new Date(dateStr + 'T12:00:00');
      var now = new Date(); now.setHours(12,0,0,0);
      var diff = Math.floor((now - d) / 86400000);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Yesterday';
      if (diff < 7) return diff + ' days ago';
      return dateStr;
    }
    var ttRows = activeNamesArr.map(function(name) {
      var p2 = people[name];
      var enabled = p2.time_tracking === true;
      var stats = TEAM_TIME_STATS[name] || { totalHours: 0, weekHours: 0, lastDate: '', entryCount: 0 };
      var initials = name.split(' ').map(function(w) { return w[0]; }).join('').slice(0,2).toUpperCase();
      var statusBadge = '';
      if (!enabled) statusBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#F3F1EB;color:#9CA3AF;">Disabled</span>';
      else if (stats.lastDate === todayStr) statusBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#D1FAE5;color:#065F46;">Logging today</span>';
      else if (stats.weekHours > 0) statusBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#DBEAFE;color:#1E40AF;">Active this week</span>';
      else if (stats.entryCount > 0) statusBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#FEF3C7;color:#92400E;">Inactive</span>';
      else statusBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#FEE2E2;color:#991B1B;">No entries</span>';
      return '<tr>' +
        '<td style="font-weight:700;color:var(--navy);"><div style="display:flex;align-items:center;gap:8px;"><div style="width:26px;height:26px;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;">' + initials + '</div>' + esc(name) + '</div></td>' +
        '<td style="text-align:center;">' + statusBadge + '</td>' +
        '<td style="text-align:right;font-weight:700;">' + (enabled ? Math.round(stats.weekHours * 10) / 10 + 'h' : '—') + '</td>' +
        '<td style="text-align:right;">' + (enabled ? Math.round(stats.totalHours * 10) / 10 + 'h' : '—') + '</td>' +
        '<td style="text-align:right;color:var(--text-muted);font-size:12px;">' + (enabled ? ttDaysAgo(stats.lastDate) : '—') + '</td>' +
        '<td style="text-align:right;color:var(--text-muted);">' + (enabled ? stats.entryCount : '—') + '</td>' +
      '</tr>';
    }).join('');

    panelHtml = '<div class="settings-panel-title">Time tracking</div>' +
      '<div class="settings-panel-desc">Monitor team time tracking adoption and activity.</div>' +
      '<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;">' +
        '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;color:var(--navy);">' + ttEnabled.length + '<span style="font-size:13px;font-weight:600;color:var(--text-muted);">/' + activeNamesArr.length + '</span></div>' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Enabled</div>' +
        '</div>' +
        '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;color:var(--navy);">' + ttWithEntries.length + '</div>' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Have logged time</div>' +
        '</div>' +
        '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;color:var(--navy);">' + Math.round(activeNamesArr.reduce(function(s, n) { return s + ((TEAM_TIME_STATS[n] || {}).weekHours || 0); }, 0) * 10) / 10 + 'h</div>' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Team hours this week</div>' +
        '</div>' +
      '</div>' +
      '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:#fff;">' +
        '<table class="member-table" style="margin:0;">' +
          '<thead><tr><th style="text-align:left;">Team Member</th><th style="text-align:center;">Status</th><th style="text-align:right;">This Week</th><th style="text-align:right;">All Time</th><th style="text-align:right;">Last Entry</th><th style="text-align:right;">Entries</th></tr></thead>' +
          '<tbody>' + ttRows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  else if (_settingsSection === 'lists') {
    panelHtml = '<div class="settings-panel-title">Dropdown lists</div>' +
      '<div class="settings-panel-desc">Manage Partner Departments and ITD Teams that appear in project forms.</div>' +
      '<div class="list-editor-grid">' +
        '<div id="list-editor-dept"></div>' +
        '<div id="list-editor-team"></div>' +
      '</div>' +
      '<div class="list-editor-note">Changes are saved to ArcGIS Online and shared across all users. Values used in existing projects will always appear in the dropdown even if removed here.</div>';
  }

  else if (_settingsSection === 'categories') {
    panelHtml = '<div class="settings-panel-title">Categories and tools</div>' +
      '<div class="settings-panel-desc">Add, edit, or remove categories and tools. Each item has a name and description that appears in the searchable dropdown.</div>' +
      '<div id="desc-editor-proj-cat" style="margin-bottom:20px;"></div>' +
      '<div class="list-editor-grid">' +
        '<div id="desc-editor-task-cat"></div>' +
        '<div id="desc-editor-task-tool"></div>' +
      '</div>' +
      '<div class="list-editor-note">Changes are saved to ArcGIS Online and shared across all users. The "Help me choose" wizard uses a fixed decision tree — adding items here will make them available in the dropdown but not automatically in the wizard.</div>';
  }

  else if (_settingsSection === 'reviewtypes') {
    panelHtml = '<div class="settings-panel-title">Review types</div>' +
      '<div class="settings-panel-desc">Define the recurring portfolio reviews that appear on the Project Review tab. Each review type has a filter (which itd_teams are in scope), a cadence in days, and a default attendees list.</div>' +
      '<div style="margin-bottom:14px;"><button class="settings-btn settings-btn-primary" onclick="prRtOpenForm()">＋ Add review type</button></div>' +
      '<div id="review-types-table"></div>' +
      '<div class="list-editor-note" style="margin-top:14px;">Changes are saved to ArcGIS Online and shared across all users. To make a review type visible to your team, ensure they have opted into the Project Review beta in their Preferences.</div>' +
      '<div class="pr-modal-backdrop" id="pr-rt-modal-backdrop" onclick="if(event.target===this)prRtCloseForm()"><div class="pr-modal" id="pr-rt-modal"></div></div>';
  }

  else if (_settingsSection === 'ai') {
    var aiPhaseChecked = _aiPhaseAssignment ? ' checked' : '';
    panelHtml = '<div class="settings-panel-title">AI features</div>' +
      '<div class="settings-panel-desc">Configure AI-assisted features across the application.</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px;">' +
        '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-body);">' +
          '<input type="checkbox" id="ai-phase-toggle"' + aiPhaseChecked + ' onchange="toggleAiPhaseAssignment(this.checked)" style="width:18px;height:18px;cursor:pointer;accent-color:var(--navy);">' +
          'AI Phase Assignment' +
        '</label>' +
        '<span class="text-muted-sm" style="margin-left:28px;">When enabled, the system will suggest lifecycle phase requirements for newly created tasks using AI. Suggestions appear on the task detail page after creation with Accept/Dismiss options.</span>' +
      '</div>';
  }

  else if (_settingsSection === 'slideshow') {
    panelHtml = buildSlideshowConfigPanel();
  }

  else if (_settingsSection === 'trash') {
    panelHtml = buildTrashPanel();
  }

  else if (_settingsSection === 'developer') {
    var devChecked = Auth.devMode ? ' checked' : '';
    panelHtml = '<div class="settings-panel-title">Developer</div>' +
      '<div class="settings-panel-desc">Advanced tools and diagnostic features.</div>' +
      '<div style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:16px;">' +
        '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-body);">' +
          '<input type="checkbox" id="dev-mode-toggle"' + devChecked + ' onchange="toggleDevMode(this.checked)" style="width:18px;height:18px;cursor:pointer;accent-color:var(--navy);">' +
          'Enable Developer Mode' +
        '</label>' +
        '<span class="text-muted-sm">Activates advanced tools across the application. Currently enables: Edit History on project timelines.</span>' +
      '</div>';
  }

  } // end admin sections else block

  area.innerHTML = '<div class="settings-page">' + navHtml + '<div class="settings-panel">' + panelHtml + '</div></div>';

  // Post-render initializations for active section
  if (_settingsSection === 'lists') {
    renderListEditor('list-editor-dept', 'Partner Departments', _customPartnerDepts, 'dept');
    renderListEditor('list-editor-team', 'ITD Teams', _customItdTeams, 'team');
  }
  if (_settingsSection === 'categories') {
    renderDescListEditor('proj_cat');
    renderDescListEditor('task_cat');
    renderDescListEditor('task_tool');
  }
  if (_settingsSection === 'allocations') {
    renderAllocDefaultsEditor();
  }
  if (_settingsSection === 'reviewtypes') {
    renderReviewTypesTable();
  }
  if (_settingsSection === 'team' && Editor.selectedMember && people[Editor.selectedMember]) {
    renderAbsenceEditor(Editor.selectedMember);
  }
  if (_settingsSection === 'trash') {
    loadAndRenderTrash();
  }
}
