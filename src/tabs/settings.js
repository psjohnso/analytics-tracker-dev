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
  // Re-resolve team scope: previewMode flips isAdmin(), which changes whether the
  // admin lens or the non-admin (own-team) rule applies.
  if (typeof initTeamScope === 'function') initTeamScope();
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
  // Cancel any in-progress inline org edit when navigating away.
  if (typeof _orgEdit !== 'undefined') _orgEdit = null;
  if (typeof _orgAdd !== 'undefined') _orgAdd = null;
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

  function prefTheme(currentTheme) {
    var current = currentTheme || '';
    // Each theme: id, label, primary, secondary, surface
    var themes = [
      { id: '',          label: 'Tucson Classic', p: '#002669', s: '#C24200', bg: '#F7F5EF' },
      { id: 'sonoran',   label: 'Sonoran Sunset', p: '#8B3A1A', s: '#F77F00', bg: '#FFF4DC' },
      { id: 'twilight',  label: 'Desert Twilight',p: '#3D2660', s: '#C2185B', bg: '#F5EFFA' },
      { id: 'pueblo',    label: 'Pueblo',         p: '#7A3520', s: '#D77845', bg: '#FAEED9' },
      { id: 'saguaro',   label: 'Saguaro',        p: '#2D4F1E', s: '#C04020', bg: '#EDF1E2' },
      { id: 'dark',      label: 'Dark (beta)',    p: '#0D1117', s: '#6E9BD6', bg: '#20242C' },
      { id: 'oe',        label: 'OE Redesign (preview)',      p: '#1F3B6B', s: '#B85630', bg: '#FAF8F3' },
      { id: 'oe-dark',   label: 'OE Redesign · Dark (preview)', p: '#060F1E', s: '#7D9BCC', bg: '#0E1C33' }
    ];
    var cards = themes.map(function(t) {
      var sel = t.id === current;
      var ring = sel ? '2px solid var(--navy)' : '1px solid var(--border)';
      // Mini preview: 4 stacked stripes for surface/primary/secondary/text
      var preview =
        '<div style="display:flex;flex-direction:column;border-radius:6px;overflow:hidden;width:80px;height:50px;">' +
          '<div style="flex:1.5;background:' + t.p + ';"></div>' +
          '<div style="flex:1;background:' + t.s + ';"></div>' +
          '<div style="flex:2;background:' + t.bg + ';"></div>' +
        '</div>';
      return '<button type="button" onclick="setTheme(\'' + t.id + '\')" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;border:' + ring + ';background:var(--white);border-radius:10px;cursor:pointer;font-family:Lato,sans-serif;">' +
        preview +
        '<span style="font-size:11px;font-weight:700;color:var(--text-body);white-space:nowrap;">' + esc(t.label) + (sel ? ' <svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg>' : '') + '</span>' +
      '</button>';
    }).join('');
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 0;border-bottom:1px solid #F3F1EB;gap:20px;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-body);">Theme</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Switch the app\'s color palette. All themes are tuned for Tucson — sunsets, twilight, pueblo, saguaro.</div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;flex-shrink:0;max-width:480px;">' + cards + '</div>' +
    '</div>';
  }

  function prefAvatarEmoji(currentEmoji) {
    var current = currentEmoji || '';
    var presets = ['🎯','🐢','🦊','🐙','🦉','🦄','🌵','🌮','🍕','☕','🎨','🎮','🎸','🚀','💻','📊','✨','🔥','⚡','🌟'];
    var presetBtns = presets.map(function(e) {
      var sel = e === current;
      return '<button type="button" onclick="setAvatarEmoji(\'' + e + '\')" title="' + e + '" style="font-size:18px;width:32px;height:32px;border:1px solid ' + (sel ? 'var(--navy)' : 'var(--border)') + ';' + (sel ? 'background:#EEF2FF;' : 'background:var(--white);') + 'border-radius:6px;cursor:pointer;padding:0;line-height:1;">' + e + '</button>';
    }).join('');
    return '<div style="padding:14px 0;border-bottom:1px solid #F3F1EB;">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:700;color:var(--text-body);">Avatar emoji</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Replace your initials with an emoji everywhere your avatar appears. Leave blank to use initials.</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
          '<input type="text" id="pref-avatarEmoji" value="' + esc(current) + '" maxlength="8" placeholder="—" onkeydown="if(event.key===\'Enter\')commitAvatarEmoji();" style="width:60px;text-align:center;font-size:22px;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:Lato,sans-serif;">' +
          '<button type="button" onclick="commitAvatarEmoji()" style="font-size:12px;font-weight:700;padding:6px 12px;border:1px solid var(--navy);background:var(--navy);color:#fff;border-radius:6px;cursor:pointer;font-family:Lato,sans-serif;">Set</button>' +
          (current ? '<button type="button" onclick="setAvatarEmoji(\'\')" style="font-size:11px;font-weight:700;padding:6px 10px;border:1px solid var(--border);background:var(--white);color:var(--text-muted);border-radius:6px;cursor:pointer;font-family:Lato,sans-serif;">Clear</button>' : '') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;justify-content:flex-end;">' + presetBtns + '</div>' +
    '</div>';
  }

  function prefAccentColor(currentHex) {
    var presets = [
      '#0C447C', // Navy
      '#C24200', // Cardinal
      '#0088FF', // Sky
      '#83AC16', // Green
      '#FFDB22', // Gold
      '#EF4444', // Red
      '#7C3AED', // Purple
      '#EC4899', // Pink
      '#14B8A6', // Teal
      '#475569'  // Slate
    ];
    var currentNorm = currentHex ? String(currentHex).toLowerCase() : '';
    var swatches = presets.map(function(hex) {
      var sel = hex.toLowerCase() === currentNorm;
      var ring = sel ? '3px solid var(--text-body)' : '2px solid #fff';
      return '<button type="button" onclick="updatePref(\'accentColor\',\'' + hex + '\')" title="' + hex + '" style="width:24px;height:24px;border-radius:50%;border:' + ring + ';outline:1px solid var(--border);background:' + hex + ';cursor:pointer;padding:0;"></button>';
    }).join('');
    var customVal = currentHex || '#0C447C';
    var resetBtn = currentHex ? '<button type="button" onclick="updatePref(\'accentColor\',\'\')" style="font-size:11px;font-weight:700;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--white);color:var(--text-muted);cursor:pointer;font-family:Lato,sans-serif;">Reset</button>' : '';
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 0;border-bottom:1px solid #F3F1EB;gap:20px;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-body);">Accent color</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Personalize your avatar across the app. Only you see this color — others see their own.</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;max-width:340px;">' +
        swatches +
        '<input type="color" id="pref-accentColor-custom" value="' + customVal + '" onchange="updatePref(\'accentColor\',this.value)" title="Custom color" style="width:28px;height:28px;border:1px solid var(--border);border-radius:6px;cursor:pointer;padding:0;background:transparent;">' +
        resetBtn +
      '</div>' +
    '</div>';
  }

  function prefPercentInput(id, label, desc, minPct, maxPct, currentScale) {
    var pct = Math.round((parseFloat(currentScale) || 1) * 100);
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 0;border-bottom:1px solid #F3F1EB;gap:20px;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-body);">' + label + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + desc + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
        '<input type="number" id="pref-' + id + '" min="' + minPct + '" max="' + maxPct + '" step="1" value="' + pct + '" ' +
          'onchange="commitUiScalePref(this)" ' +
          'onkeydown="if(event.key===\'Enter\'){this.blur();}" ' +
          'style="width:70px;font-size:13px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;text-align:right;font-family:Lato,sans-serif;">' +
        '<span style="font-size:13px;font-weight:700;color:var(--text-muted);">%</span>' +
      '</div>' +
    '</div>';
  }

  function prefButtonGroup(id, label, desc, options, currentVal) {
    var btns = options.map(function(o, i) {
      var active = String(o.value) === String(currentVal);
      var bg = active ? 'var(--navy)' : 'var(--white)';
      var color = active ? '#fff' : 'var(--text-body)';
      var border = active ? 'var(--navy)' : 'var(--border)';
      var radius = '';
      if (i === 0) radius += 'border-top-left-radius:6px;border-bottom-left-radius:6px;';
      if (i === options.length - 1) radius += 'border-top-right-radius:6px;border-bottom-right-radius:6px;';
      var rightBorder = i === options.length - 1 ? '' : 'border-right-width:0;';
      return '<button type="button" onclick="updatePref(\'' + id + '\',\'' + o.value + '\')" style="font-size:12px;font-weight:700;padding:6px 12px;border:1px solid ' + border + ';background:' + bg + ';color:' + color + ';cursor:pointer;font-family:Lato,sans-serif;' + radius + rightBorder + '">' + esc(o.label) + '</button>';
    }).join('');
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:14px 0;border-bottom:1px solid #F3F1EB;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-body);">' + label + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + desc + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-shrink:0;">' + btns + '</div>' +
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
          '<span style="position:absolute;width:16px;height:16px;background:var(--white);border-radius:50%;top:3px;left:' + (currentVal ? '21px' : '3px') + ';transition:left 0.2s;"></span>' +
        '</span>' +
      '</label>' +
    '</div>';
  }

  // ── Section helper: heading + boxed group, mirrors the existing
  // Optional tabs / Beta features pattern lower in the panel.
  function sectionOpen(title, desc) {
    return '<div style="margin-top:8px;margin-bottom:20px;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<span style="font-size:15px;font-weight:700;color:var(--navy);">' + esc(title) + '</span>' +
      '</div>' +
      (desc ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">' + esc(desc) + '</div>' : '') +
      '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:4px 20px;">';
  }
  var sectionClose = '</div></div>';

  var html = '<div class="settings-panel-title">Preferences</div>';
  html += '<div class="settings-panel-desc">Customize how the application looks and works for you. These preferences are saved to your profile and persist across sessions.</div>';

  // ── Appearance ──────────────────────────────────────────────
  html += sectionOpen('Appearance', 'Look-and-feel of the interface.');
  html += prefTheme(UserPrefs.theme);
  html += prefPercentInput('uiScale', 'UI size', 'Scale the entire interface — fonts and spacing — relative to the default. Enter a value between 80 and 160.',
    80, 160, (UserPrefs.uiScale || 1.0));
  html += prefAccentColor(UserPrefs.accentColor);
  html += prefAvatarEmoji(UserPrefs.avatarEmoji);
  html += prefToggle('colorBlindMode', 'Color-blind safe palette', 'Swap status / priority / alert colors for an Okabe-Ito-derived palette that stays distinguishable for the common red-green color-blindness types.', UserPrefs.colorBlindMode);
  html += sectionClose;

  // ── Personal ────────────────────────────────────────────────
  html += sectionOpen('Personal', 'Things that make the app feel like yours.');
  html += prefToggle('showAchievements', '✨ Show achievements panel', 'Display your streak, tasks done, projects shipped, and weekly hours at the top of the My Work tab.', UserPrefs.showAchievements);
  html += prefToggle('confetti', '🎉 Celebrate completions', 'Briefly show a confetti burst when you mark a task or project Complete. Always disabled if your system has reduced-motion enabled.', UserPrefs.confetti);
  html += sectionClose;

  // ── Layout & navigation ─────────────────────────────────────
  html += sectionOpen('Layout & navigation', 'How the app opens and lays out its panels.');
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
  html += sectionClose;

  // Optional tabs — opt-in extras in the top nav.
  // - Capacity: admins always see; members opt in. Hidden from the toggle list
  //   for plain admins (they have no choice to make) unless previewing as member.
  // - Slideshow: opt-in for everyone, including admins.
  // The Slideshow toggle is always shown; the Capacity toggle is only
  // useful for non-admin users (admins always see those tabs anyway).
  var showCapToggle = !Auth.isTeamLead || Auth.previewMode;
  html += '<div style="margin-top:8px;margin-bottom:20px;">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
  html += '<span style="font-size:15px;font-weight:700;color:var(--navy);">Optional tabs</span>';
  html += '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Add extra tabs to your top navigation. Off by default.</div>';
  html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:4px 20px;">';
  if (showCapToggle) {
    html += prefToggle('showCapacity', 'Show Capacity tabs', 'Reveals Resources (capacity chart + allocation table), Forecast (utilization grid + capacity planner), and Insights (retrospective charts on completed projects).', UserPrefs.showCapacity);
    html += prefToggle('showAnalytics', 'Show Analytics tab', 'Reveals retrospective Team Load analytics — partner-department hours, lead vs contributor split by category, and per-person workload concentration over the last 12 months.', UserPrefs.showAnalytics);
  }
  html += prefToggle('showSlideshow', 'Show Slideshow tab', 'Cycle through the Overview dashboard panels on a timer — designed for unattended display on a TV or large monitor in a shared space. Includes a fullscreen toggle.', UserPrefs.showSlideshow);
  html += '</div></div>';

  // Beta Features section — only show features with flag === 'beta'
  var betaKeys = Object.keys(BETA_FEATURES).filter(function(key) {
    var flags = { dependencies: FEATURE_DEPENDENCIES, taskHistory: FEATURE_TASK_HISTORY, aiIntake: FEATURE_AI_INTAKE, projectReview: FEATURE_PROJECT_REVIEW, durationEstimate: FEATURE_DURATION_ESTIMATE, notifications: FEATURE_NOTIFICATIONS };
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
      html += '<span style="position:absolute;width:16px;height:16px;background:var(--white);border-radius:50%;top:3px;left:' + (isEnabled ? '21px' : '3px') + ';transition:left 0.2s;"></span>';
      html += '</span>';
      html += '</label>';
      html += '</div>';
    });

    html += '</div>';
    html += '</div>';
  }

  return html;
}

function setAvatarEmoji(emoji) {
  UserPrefs.avatarEmoji = emoji || '';
  saveUserPrefs();
  if (RESOURCES_DATA && RESOURCES_DATA.people && Auth.fullName && RESOURCES_DATA.people[Auth.fullName]) {
    RESOURCES_DATA.people[Auth.fullName].avatarEmoji = emoji || '';
  }
  if (typeof applyAvatarEmoji === 'function') applyAvatarEmoji();
  showToast(emoji ? 'Avatar emoji set.' : 'Avatar emoji cleared.', 'success');
  render();
}

function setTheme(themeId) {
  UserPrefs.theme = themeId || '';
  saveUserPrefs();
  if (typeof applyTheme === 'function') applyTheme();
  showToast(themeId ? 'Theme applied.' : 'Default theme restored.', 'success');
  render();
}

function commitAvatarEmoji() {
  var el = document.getElementById('pref-avatarEmoji');
  var v = el ? (el.value || '').trim() : '';
  setAvatarEmoji(v);
}

// Read the percent value from the UI Size input, clamp it to the allowed
// range, write it back to the input so the user sees the corrected value,
// and persist as a decimal scale via updatePref.
function commitUiScalePref(inputEl) {
  var pct = parseFloat(inputEl.value);
  if (!isFinite(pct)) pct = 100;
  if (pct < 80) pct = 80;
  if (pct > 160) pct = 160;
  pct = Math.round(pct);
  inputEl.value = pct;
  updatePref('uiScale', pct / 100);
}

function updatePref(key, value) {
  // Type conversion
  if (key === 'timelineRange') value = parseInt(value) || 6;
  if (key === 'uiScale') value = parseFloat(value) || 1.0;
  if (key === 'accentColor') {
    // Empty string from the Reset button → null (clear). Otherwise must be a #RRGGBB hex.
    if (!value) value = null;
    else if (!/^#[0-9a-fA-F]{6}$/.test(String(value))) return;
  }
  if (key === 'sidebarCollapsed' || key === 'completedCollapsed' || key === 'timelineShowAll' || key === 'compactRows' ||
      key === 'showCapacity' || key === 'showAnalytics' || key === 'showSlideshow' || key === 'confetti' || key === 'showAchievements' ||
      key === 'colorBlindMode') {
    value = value === true || value === 'true';
  }
  UserPrefs[key] = value;
  saveUserPrefs();
  // Apply immediately where possible
  if (key === 'projectView') currentView = value;
  if (key === 'uiScale' && typeof applyUiScale === 'function') applyUiScale();
  if (key === 'accentColor' && typeof applyAccentColor === 'function') applyAccentColor();
  if (key === 'colorBlindMode' && typeof applyColorBlindMode === 'function') applyColorBlindMode();
  if (key === 'sidebarCollapsed') {
    var sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed', value);
  }
  if (key === 'showCapacity' || key === 'showAnalytics' || key === 'showSlideshow') {
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
  // The header bell lives outside the gated header refresh — sync it directly,
  // and load notifications the first time the feature is switched on.
  if (typeof renderInbox === 'function') renderInbox();
  if (enabled && featureKey === 'notifications' && typeof loadNotifications === 'function') loadNotifications();
  showToast(BETA_FEATURES[featureKey].label + (enabled ? ' enabled.' : ' disabled.'), 'success');
}

// ── City Holidays panel ─────────────────────────────────────────────
// Admin-only Settings section that lists and manages observed-date holidays.
// HOLIDAYS is loaded by loadResourcesData() — this panel handles adds/deletes
// directly against ARCGIS_CONFIG.holidaysUrl and refreshes the in-memory
// list so capacity recomputes immediately.
function buildHolidaysPanel() {
  if (!ARCGIS_CONFIG.holidaysUrl) {
    return '<div class="settings-panel-title">Holidays</div>' +
      '<div class="settings-panel-desc">The holidays layer isn\'t configured yet. See notebooks/setup_holidays_table.ipynb to create it, then paste the layer URL into ARCGIS_CONFIG.holidaysUrl.</div>';
  }
  var list = (typeof HOLIDAYS !== 'undefined' && HOLIDAYS) ? HOLIDAYS : [];
  // Group by calendar year (extracted from date string for cheap sort).
  var byYear = {};
  list.forEach(function(h) {
    var yr = (h.date || '').slice(0, 4);
    if (!yr) return;
    if (!byYear[yr]) byYear[yr] = [];
    byYear[yr].push(h);
  });
  var years = Object.keys(byYear).sort();
  var thisYear = String(new Date().getFullYear());

  var sections = years.map(function(yr) {
    var rows = byYear[yr].map(function(h) {
      var d = new Date(h.date + 'T12:00:00');
      var dow = d.toLocaleDateString('en-US', { weekday: 'short' });
      var fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return '<tr>' +
        '<td style="font-weight:700;color:var(--navy);white-space:nowrap;">' + esc(fmt) + '</td>' +
        '<td style="color:var(--text-muted);font-size:11px;">' + esc(dow) + '</td>' +
        '<td>' + esc(h.name) + '</td>' +
        '<td style="text-align:right;">' +
          '<button class="settings-btn settings-btn-danger" onclick="btnPending(this, () => deleteHoliday(' + h.objectId + '), \'Delete?\')"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></button>' +
        '</td>' +
      '</tr>';
    }).join('');
    var isThisYear = yr === thisYear;
    var copyBtn = '<button class="settings-btn settings-btn-secondary" onclick="copyHolidaysToNextYear(\'' + yr + '\')" title="Duplicate this year\'s holidays to next year, preserving day-of-week"><svg class="icon" aria-hidden="true"><use href="#ph-copy"></use></svg> Copy to ' + (parseInt(yr, 10) + 1) + '</button>';
    return '<div style="margin-bottom:18px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
        '<div style="font-size:14px;font-weight:700;color:var(--navy);">' + yr + (isThisYear ? ' <span style="font-size:10px;color:var(--text-muted);font-weight:600;margin-left:4px;">this year</span>' : '') + ' <span style="font-size:11px;color:var(--text-muted);font-weight:500;margin-left:6px;">' + byYear[yr].length + '</span></div>' +
        copyBtn +
      '</div>' +
      '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:8px;background:var(--white);">' +
        '<table class="member-table" style="margin:0;"><thead><tr><th style="text-align:left;">Date</th><th style="text-align:left;">Day</th><th style="text-align:left;">Name</th><th style="text-align:right;">Actions</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>' +
    '</div>';
  }).join('');

  if (!years.length) sections = '<div class="settings-panel-desc" style="padding:16px;background:var(--white);border:1px dashed #E8E6DF;border-radius:8px;">No holidays yet. Add the city\'s observed dates below.</div>';

  return '<div class="settings-panel-title">Holidays</div>' +
    '<div class="settings-panel-desc">Observed-date city holidays. Each holiday reduces every team member\'s project capacity by their scheduled hours for that day-of-week (full day off; RDOs absorb without penalty).</div>' +
    '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:16px 20px;margin-bottom:18px;">' +
      '<div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px;">Add holiday</div>' +
      '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">' +
        '<div><label style="display:block;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Date</label><input type="date" id="settings-holiday-date" style="padding:6px 8px;border:1px solid #E8E6DF;border-radius:6px;font-size:13px;font-family:Lato,sans-serif;"></div>' +
        '<div style="flex:1;min-width:200px;"><label style="display:block;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Name</label><input type="text" id="settings-holiday-name" placeholder="e.g. Memorial Day" style="width:100%;padding:6px 8px;border:1px solid #E8E6DF;border-radius:6px;font-size:13px;font-family:Lato,sans-serif;"></div>' +
        '<button class="settings-btn settings-btn-primary" onclick="btnPending(this, () => addHoliday(), \'\')">＋ Add</button>' +
      '</div>' +
    '</div>' +
    sections;
}

async function addHoliday() {
  var dateEl = document.getElementById('settings-holiday-date');
  var nameEl = document.getElementById('settings-holiday-name');
  var date = (dateEl || {}).value || '';
  var name = ((nameEl || {}).value || '').trim();
  if (!date) { showToast('Pick a date.', 'error'); return; }
  if (!name) { showToast('Enter a holiday name.', 'error'); return; }
  if (HOLIDAYS_BY_DATE[date]) { showToast('A holiday is already set for that date.', 'error'); return; }
  try {
    var result = await agolApplyEdits(ARCGIS_CONFIG.holidaysUrl, {
      adds: [{ attributes: { holiday_date: date, name: name } }]
    });
    var ok = result && result.addResults && result.addResults[0] && result.addResults[0].success;
    if (!ok) throw new Error('AGOL rejected the add');
    var newOid = result.addResults[0].objectId;
    HOLIDAYS.push({ objectId: newOid, date: date, name: name });
    HOLIDAYS.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    HOLIDAYS_BY_DATE[date] = HOLIDAYS[HOLIDAYS.length - 1];
    // Capacity needs to recompute now that holidays changed.
    if (typeof recomputeCapacityAfterHolidayChange === 'function') recomputeCapacityAfterHolidayChange();
    showToast('Holiday added.', 'success');
    render();
  } catch (err) {
    console.error('[Settings] Add holiday failed:', err);
    showToast('Add failed: ' + err.message, 'error');
  }
}

async function deleteHoliday(objectId) {
  if (!objectId) return;
  try {
    await agolApplyEdits(ARCGIS_CONFIG.holidaysUrl, { deletes: [objectId] });
    var idx = HOLIDAYS.findIndex(function(h) { return h.objectId === objectId; });
    if (idx >= 0) {
      var removed = HOLIDAYS.splice(idx, 1)[0];
      if (removed && HOLIDAYS_BY_DATE[removed.date]) delete HOLIDAYS_BY_DATE[removed.date];
    }
    if (typeof recomputeCapacityAfterHolidayChange === 'function') recomputeCapacityAfterHolidayChange();
    showToast('Holiday removed.', 'success');
    render();
  } catch (err) {
    console.error('[Settings] Delete holiday failed:', err);
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// Duplicate a year's holidays into the following year, preserving day-of-week.
// "Memorial Day was last Monday of May 2026" → "last Monday of May 2027". The
// admin scans the resulting rows and adjusts the few that observe differently.
async function copyHolidaysToNextYear(srcYear) {
  var src = HOLIDAYS.filter(function(h) { return (h.date || '').slice(0, 4) === srcYear; });
  if (!src.length) { showToast('Nothing to copy.', 'error'); return; }
  var nextYr = parseInt(srcYear, 10) + 1;
  var adds = [];
  src.forEach(function(h) {
    var srcDate = new Date(h.date + 'T12:00:00');
    // Find the nth-weekday-of-month in the source date, then map to the same
    // nth-weekday in next year.
    var srcMonth = srcDate.getMonth();
    var srcDay = srcDate.getDate();
    var srcDow = srcDate.getDay();
    var nthInMonth = Math.ceil(srcDay / 7);
    // Build next year's nth-weekday of that month.
    var firstOfMonth = new Date(nextYr, srcMonth, 1);
    var offset = (srcDow - firstOfMonth.getDay() + 7) % 7;
    var target = new Date(nextYr, srcMonth, 1 + offset + (nthInMonth - 1) * 7);
    var targetStr = target.getFullYear() + '-' + String(target.getMonth() + 1).padStart(2, '0') + '-' + String(target.getDate()).padStart(2, '0');
    if (HOLIDAYS_BY_DATE[targetStr]) return; // skip dates already populated
    adds.push({ attributes: { holiday_date: targetStr, name: h.name } });
  });
  if (!adds.length) { showToast('All target dates already have holidays.', 'success'); return; }
  try {
    var result = await agolApplyEdits(ARCGIS_CONFIG.holidaysUrl, { adds: adds });
    var ok = (result.addResults || []).filter(function(r) { return r.success; });
    ok.forEach(function(r, i) {
      var attrs = adds[i].attributes;
      var entry = { objectId: r.objectId, date: attrs.holiday_date, name: attrs.name };
      HOLIDAYS.push(entry);
      HOLIDAYS_BY_DATE[entry.date] = entry;
    });
    HOLIDAYS.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (typeof recomputeCapacityAfterHolidayChange === 'function') recomputeCapacityAfterHolidayChange();
    showToast('Copied ' + ok.length + ' holiday(s) to ' + nextYr + '. Review for federal-style observed-date shifts.', 'success');
    render();
  } catch (err) {
    console.error('[Settings] Copy holidays failed:', err);
    showToast('Copy failed: ' + err.message, 'error');
  }
}

// Recompute proj_cap / utilization for every person after a holiday change so
// the chart / KPIs / My Work hero reflect the new capacity without a page
// reload. Mirrors what loadResourcesData does at the end of its load.
function recomputeCapacityAfterHolidayChange() {
  if (!RESOURCES_DATA || !RESOURCES_DATA.people) return;
  var weeks = RESOURCES_DATA.weeks;
  var N = weeks.length;
  Object.values(RESOURCES_DATA.people).forEach(function(p) {
    for (var i = 0; i < N; i++) {
      var ppWeek = (typeof getPayPeriodWeek === 'function') ? getPayPeriodWeek(weeks[i]) : 'A';
      var scheduledHours = (ppWeek === 'A') ? (p.week1_hours || 40) : (p.week2_hours || 40);
      var holidayHrs = (typeof holidayHoursForPersonWeek === 'function') ? holidayHoursForPersonWeek(p, weeks[i], i) : 0;
      p.proj_cap[i] = Math.max(0, (scheduledHours - (p.absences[i] || 0) - holidayHrs) * (_productivityRatio || 0.75) * p.proj_pct);
      // Reflow allocation hours from fractions and the new cap.
      (p.allocations || []).forEach(function(a) { a.hours[i] = (a.fracs[i] || 0) * p.proj_cap[i]; });
      var totalAlloc = (p.allocations || []).reduce(function(s, a) { return s + (a.hours[i] || 0); }, 0);
      p.weekly_allocated[i] = totalAlloc;
      p.utilization[i] = p.proj_cap[i] > 0 ? totalAlloc / p.proj_cap[i] : 0;
    }
  });
  if (typeof markDataDirty === 'function') markDataDirty();
}

function renderSettingsPage(area) {
  var isAdminUser = isAdmin();
  var leadTeam = (typeof getLeadTeam === 'function') ? getLeadTeam() : null;
  var isLeadUser = !isAdminUser && !!leadTeam;
  var canManagePeople = isAdminUser || isLeadUser;
  if (!Auth.loggedIn) {
    area.innerHTML = '<div class="empty-state">Sign in to access Settings.</div>';
    return;
  }
  // Access: admins see all sections; team leads see Preferences + their own
  // team's members; everyone else sees Preferences only.
  if (!isAdminUser) {
    var leadOk = isLeadUser && (_settingsSection === 'team' || _settingsSection === 'teamintro' || _settingsSection === 'reviewtypes' || _settingsSection === 'intake');
    if (_settingsSection !== 'preferences' && !leadOk) _settingsSection = 'preferences';
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

  // People data — admins see everyone; team leads see only their own team.
  var people = null, allNames = [], activeCount = 0;
  if (canManagePeople) {
    if (!RESOURCES_DATA) {
      area.innerHTML = '<div class="empty-state">Resources data is loading…</div>';
      return;
    }
    people = RESOURCES_DATA.people;
    allNames = Object.keys(people).sort();
    if (!isAdminUser && leadTeam) {
      allNames = allNames.filter(function(n) {
        var t = (people[n] && people[n].team) || '';
        return (typeof sameTeam === 'function') ? sameTeam(t, leadTeam) : t === leadTeam;
      });
    }
    activeCount = allNames.filter(function(n) { return people[n].active !== false; }).length;
  }

  if (isAdminUser) {
    navHtml += '<div class="settings-nav-group">' +
      '<div class="settings-nav-label">People</div>' +
      navItem('team', 'Team members', activeCount) +
      navItem('timetracking', 'Time tracking') +
      navItem('permissions', 'Access & Permissions') +
    '</div>' +
    '<div class="settings-nav-group">' +
      '<div class="settings-nav-label">Team setup</div>' +
      navItem('teamintro', 'Team Introduction') +
      navItem('reviewtypes', 'Review types') +
      navItem('intake', 'Project intake') +
    '</div>' +
    '<div class="settings-nav-group">' +
      '<div class="settings-nav-label">Project config</div>' +
      navItem('organization', 'Organization') +
      navItem('categories', 'Categories and tools') +
      navItem('risk', 'Project Risk') +
      navItem('allocations', 'Allocations') +
      navItem('holidays', 'Holidays', HOLIDAYS ? HOLIDAYS.length : 0) +
    '</div>' +
    '<div class="settings-nav-group">' +
      '<div class="settings-nav-label">System</div>' +
      navItem('dataprogram', 'Data Program teams') +
      navItem('partnerdepts', 'Partner departments') +
      navItem('slideshow', 'Slideshow') +
      navItem('ai', 'AI features') +
      navItem('trash', 'Trash') +
      navItem('developer', 'Developer') +
    '</div>';
  } else if (isLeadUser) {
    navHtml += '<div class="settings-nav-group">' +
      '<div class="settings-nav-label">' + esc(leadTeam) + '</div>' +
      navItem('team', 'Team members', activeCount) +
      navItem('teamintro', 'Team Introduction') +
      navItem('reviewtypes', 'Review types') +
      navItem('intake', 'Project intake') +
    '</div>';
  }
  navHtml += '</div>';

  // ── Panel content (only active section) ──────────────────
  var panelHtml = '';

  if (_settingsSection === 'preferences') {
    panelHtml = buildPreferencesPanel();
  } else if (!isAdminUser && !(isLeadUser && (_settingsSection === 'team' || _settingsSection === 'teamintro' || _settingsSection === 'reviewtypes' || _settingsSection === 'intake'))) {
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
      // Team Lead chip — appended after the tracking-level badge when the member
      // leads a (non-home) team.
      if (p.data_program_lead_team) {
        var dpltShort = (function() {
          var teams = (typeof getDataProgramTeams === 'function') ? getDataProgramTeams() : [];
          var t = teams.find(function(x) { return x.name === p.data_program_lead_team; });
          return (t && t.id ? t.id : p.data_program_lead_team) + ' Lead';
        })();
        trackingLabel += ' <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#FEF3C7;color:#92400E;margin-left:4px;" title="Team Lead — can create and edit all of ' + esc(p.data_program_lead_team) + '’s projects">' + esc(dpltShort) + '</span>';
      }
      return '<tr' + rowStyle + '>' +
        '<td style="font-weight:700;color:var(--navy);">' + esc(name) + '</td>' +
        '<td>' + esc(p.position_title || '') + '</td>' +
        '<td>' + esc(p.role) + '</td>' +
        '<td>' + esc(p.team) + '</td>' +
        '<td style="text-align:center;">' + trackingLabel + '</td>' +
        '<td>' + (isLight ? '—' : Math.round(p.proj_pct * 100) + '%') + '</td>' +
        '<td>' + esc(schedLabel) + '</td>' +
        '<td style="text-align:center;">' + (isLight ? '—' : '<input type="checkbox"' + ttChecked + ' onchange="toggleTimeTracking(\'' + name.replace(/'/g, "\\'") + '\', this.checked)" style="width:16px;height:16px;cursor:pointer;">') + '</td>' +
        '<td style="text-align:center;cursor:pointer;" onclick="toggleMemberActive(\'' + name.replace(/'/g, "\\'") + '\')" title="Click to toggle">' + activeLabel + '</td>' +
        '<td style="text-align:right;white-space:nowrap;">' +
          '<button class="settings-btn settings-btn-secondary" style="margin-right:4px;" onclick="openAbsenceEditor(\'' + name.replace(/'/g, "\\'") + '\')"><svg class="icon" aria-hidden="true"><use href="#ph-calendar-blank"></use></svg> Absences</button>' +
          '<button class="settings-btn settings-btn-secondary" style="margin-right:4px;" onclick="openMemberForm(\'edit\',\'' + name.replace(/'/g, "\\'") + '\')"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg> Edit</button>' +
          '<button class="settings-btn settings-btn-danger" onclick="btnPending(this, () => deleteMember(\'' + name.replace(/'/g, "\\'") + '\'), \'\')"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></button>' +
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
        '<thead><tr><th>Name</th><th>Position</th><th>Role/Unit</th><th>Team</th><th>Tracking</th><th>Project %</th><th>Schedule</th><th style="text-align:center;"><svg class="icon" aria-hidden="true"><use href="#ph-clock"></use></svg></th><th style="text-align:center;">Status</th><th style="text-align:right;">Actions</th></tr></thead>' +
        '<tbody>' + memberRows + '</tbody>' +
      '</table>' +
      '<div id="settings-absence-section"></div>';
  }

  else if (_settingsSection === 'allocations') {
    var prPct = Math.round((_productivityRatio || 0.75) * 100);
    panelHtml = '<div class="settings-panel-title">Allocations</div>' +
      '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:18px 20px;margin-bottom:24px;">' +
        '<div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px;">Capacity formula</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">Each person\'s weekly project capacity = (scheduled hours − absences) × <strong>productivity ratio</strong> × their project-available %.</div>' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<label for="settings-productivity-ratio" style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">Productivity ratio</label>' +
          '<input type="number" id="settings-productivity-ratio" min="1" max="100" step="1" value="' + prPct + '" style="width:80px;padding:6px 8px;text-align:center;border:1px solid #E8E6DF;border-radius:6px;font-size:14px;font-family:Lato,sans-serif;font-weight:700;color:var(--navy);">' +
          '<span style="font-size:13px;color:var(--text-muted);">%</span>' +
          '<button class="settings-btn settings-btn-primary" onclick="btnPending(this, () => saveProductivityRatio())" style="margin-left:auto;">Save Ratio</button>' +
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

  else if (_settingsSection === 'holidays') {
    panelHtml = buildHolidaysPanel();
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
      if (!enabled) statusBadge = '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--surface-2);color:#9CA3AF;">Disabled</span>';
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
        '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;color:var(--navy);">' + ttEnabled.length + '<span style="font-size:13px;font-weight:600;color:var(--text-muted);">/' + activeNamesArr.length + '</span></div>' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Enabled</div>' +
        '</div>' +
        '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;color:var(--navy);">' + ttWithEntries.length + '</div>' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Have logged time</div>' +
        '</div>' +
        '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:12px 16px;flex:1;min-width:120px;text-align:center;">' +
          '<div style="font-size:22px;font-weight:800;color:var(--navy);">' + Math.round(activeNamesArr.reduce(function(s, n) { return s + ((TEAM_TIME_STATS[n] || {}).weekHours || 0); }, 0) * 10) / 10 + 'h</div>' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Team hours this week</div>' +
        '</div>' +
      '</div>' +
      '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:var(--white);">' +
        '<table class="member-table" style="margin:0;">' +
          '<thead><tr><th style="text-align:left;">Team Member</th><th style="text-align:center;">Status</th><th style="text-align:right;">This Week</th><th style="text-align:right;">All Time</th><th style="text-align:right;">Last Entry</th><th style="text-align:right;">Entries</th></tr></thead>' +
          '<tbody>' + ttRows + '</tbody>' +
        '</table>' +
      '</div>';
  }

  else if (_settingsSection === 'organization') {
    panelHtml = buildOrgEditorPanel();
  }

  else if (_settingsSection === 'partnerdepts') {
    panelHtml = '<div class="settings-panel-title">Partner departments</div>' +
      '<div class="settings-panel-desc">City departments your team does work for (e.g. Police, Fire, Tucson Water). These appear as the “Partner Department” option on projects — separate from your own org structure under Project config → Organization.</div>' +
      '<div class="list-editor-grid">' +
        '<div id="list-editor-dept"></div>' +
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

  else if (_settingsSection === 'intake') {
    panelHtml = buildProjectIntakePanel();
  }

  else if (_settingsSection === 'risk') {
    panelHtml = '<div class="settings-panel-title">Project Risk</div>' +
      '<div class="settings-panel-desc">Tune the in-flight risk score: factor weights, severity thresholds, band cutoffs, and the calibration set of reference projects (one per way a project goes sideways). Adjust weights until each calibration project lands in its expected band — the preview updates live. Surfaces on Insights → At-Risk Projects.</div>' +
      '<div id="risk-config-panel"></div>';
  }

  else if (_settingsSection === 'ai') {
    var aiPhaseChecked = _aiPhaseAssignment ? ' checked' : '';
    panelHtml = '<div class="settings-panel-title">AI features</div>' +
      '<div class="settings-panel-desc">Configure AI-assisted features across the application.</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;">' +
        '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-body);">' +
          '<input type="checkbox" id="ai-phase-toggle"' + aiPhaseChecked + ' onchange="toggleAiPhaseAssignment(this.checked)" style="width:18px;height:18px;cursor:pointer;accent-color:var(--navy);">' +
          'AI Phase Assignment' +
        '</label>' +
        '<span class="text-muted-sm" style="margin-left:28px;">When enabled, the system will suggest lifecycle phase requirements for newly created tasks using AI. Suggestions appear on the task detail page after creation with Accept/Dismiss options.</span>' +
      '</div>';
  }

  else if (_settingsSection === 'permissions') {
    panelHtml = buildPermissionsPanel();
  }

  else if (_settingsSection === 'slideshow') {
    panelHtml = buildSlideshowConfigPanel();
  }

  else if (_settingsSection === 'dataprogram') {
    panelHtml = buildDataProgramConfigPanel();
  }

  else if (_settingsSection === 'teamintro') {
    panelHtml = buildTeamIntroConfigPanel();
  }

  else if (_settingsSection === 'trash') {
    panelHtml = buildTrashPanel();
  }

  else if (_settingsSection === 'developer') {
    var devChecked = Auth.devMode ? ' checked' : '';
    panelHtml = '<div class="settings-panel-title">Developer</div>' +
      '<div class="settings-panel-desc">Advanced tools and diagnostic features.</div>' +
      '<div style="display:flex;align-items:center;gap:12px;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;">' +
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
  if (_settingsSection === 'partnerdepts') {
    renderListEditor('list-editor-dept', 'Partner Departments', _customPartnerDepts, 'dept');
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
  if (_settingsSection === 'risk' && typeof renderRiskConfigPanel === 'function') {
    renderRiskConfigPanel();
  }
  if (_settingsSection === 'team' && Editor.selectedMember && people[Editor.selectedMember]) {
    renderAbsenceEditor(Editor.selectedMember);
  }
  if (_settingsSection === 'trash') {
    loadAndRenderTrash();
  }
}
