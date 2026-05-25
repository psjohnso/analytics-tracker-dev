// ─────────────────────────────────────────────────────────────────────
// saved-views.js — named filter combos the user can pin to the sidebar.
//
// Each view is { id, name, filters: <sparse activeFilters snapshot> }.
// Storage piggybacks on UserPrefs.savedViews — same persistence path as
// every other user pref (team_members.user_preferences JSON).
// ─────────────────────────────────────────────────────────────────────

// Keys we treat as multi-value array filters. Other activeFilters
// values (dataProgram, search) are scalars handled separately.
var SV_ARRAY_FILTERS = ['status','priority','category','member','partnerDept','itdTeam','taskStatus','taskCategory','taskTool'];

function svCaptureCurrent() {
  var f = {};
  SV_ARRAY_FILTERS.forEach(function(k) {
    if (Array.isArray(activeFilters[k]) && activeFilters[k].length) f[k] = activeFilters[k].slice();
  });
  if (activeFilters.dataProgram) f.dataProgram = true;
  if (activeFilters.overdue) f.overdue = true;
  if (activeFilters.search) f.search = activeFilters.search;
  return f;
}

function svHasAnyFilters(f) {
  if (!f) return false;
  for (var i = 0; i < SV_ARRAY_FILTERS.length; i++) {
    if (Array.isArray(f[SV_ARRAY_FILTERS[i]]) && f[SV_ARRAY_FILTERS[i]].length) return true;
  }
  if (f.dataProgram) return true;
  if (f.overdue) return true;
  if (f.search) return true;
  return false;
}

function svFiltersEqual(a, b) {
  for (var i = 0; i < SV_ARRAY_FILTERS.length; i++) {
    var k = SV_ARRAY_FILTERS[i];
    var ak = (a[k] || []).slice().sort();
    var bk = (b[k] || []).slice().sort();
    if (ak.length !== bk.length) return false;
    for (var j = 0; j < ak.length; j++) if (ak[j] !== bk[j]) return false;
  }
  if (!!a.dataProgram !== !!b.dataProgram) return false;
  if (!!a.overdue !== !!b.overdue) return false;
  if ((a.search || '') !== (b.search || '')) return false;
  return true;
}

// Apply a sparse filter snapshot (used by both saved views and built-in
// presets). Missing keys reset to empty/false, so applying a snapshot cleanly
// clears unrelated filters left on from a previous selection.
function applyFilterSnapshot(snap) {
  snap = snap || {};
  SV_ARRAY_FILTERS.forEach(function(k) {
    activeFilters[k] = snap[k] ? snap[k].slice() : [];
  });
  activeFilters.dataProgram = snap.dataProgram === true;
  activeFilters.overdue = snap.overdue === true;
  activeFilters.search = snap.search || '';
  var si = document.getElementById('search-input');
  if (si) si.value = activeFilters.search;
  // Keep the toolbar quick-filter toggles visually in sync.
  if (typeof resetQuickFilterBtn === 'function') {
    resetQuickFilterBtn('open-projects-btn', '#83AC16');
    resetQuickFilterBtn('open-tasks-btn', '#C24200');
  }
}

// ── Built-in presets (always present, computed; not stored) ──────────────
// "My work" follows the signed-in user. Status presets set BOTH project and
// task status so they behave the same on either sub-tab.
var svLastAppliedId = null;
function builtinPresets() {
  var me = (typeof Auth !== 'undefined' && Auth && Auth.fullName) ? Auth.fullName : null;
  var openP = (typeof OPEN_PROJECT_STATUSES !== 'undefined') ? OPEN_PROJECT_STATUSES.slice() : [];
  var openT = (typeof OPEN_TASK_STATUSES !== 'undefined') ? OPEN_TASK_STATUSES.slice() : [];
  var list = [{ id: '__all', name: 'All', builtin: true, filters: {} }];
  if (me) list.push({ id: '__mine', name: 'My work', builtin: true, filters: { member: [me], status: openP, taskStatus: openT } });
  list.push({ id: '__open', name: 'Open', builtin: true, filters: { status: openP, taskStatus: openT } });
  list.push({ id: '__overdue', name: 'Overdue', builtin: true, filters: { overdue: true } });
  list.push({ id: '__high', name: 'High priority', builtin: true, filters: { priority: ['High'], status: openP, taskStatus: openT } });
  return list;
}

function applyPreset(id) {
  var bp = builtinPresets();
  var p = null;
  for (var i = 0; i < bp.length; i++) if (bp[i].id === id) { p = bp[i]; break; }
  if (!p) return;
  applyFilterSnapshot(p.filters);
  svLastAppliedId = null; // built-ins aren't a saved view, so no "unsaved" tracking
  if (typeof currentPage !== 'undefined') currentPage = 1;
  closePresetMenus();
  markDataDirty();
  render();
}

function applySavedView(id) {
  var views = (UserPrefs && UserPrefs.savedViews) || [];
  var view = null;
  for (var i = 0; i < views.length; i++) if (views[i].id === id) { view = views[i]; break; }
  if (!view) return;

  applyFilterSnapshot(view.filters);
  svLastAppliedId = view.id;
  if (typeof currentPage !== 'undefined') currentPage = 1;
  closePresetMenus();
  markDataDirty();
  render();
  if (typeof showToast === 'function') showToast('Applied view: ' + view.name, 'success');
}

// Human-readable labels for activeFilters keys (for the modal summary).
var SV_FILTER_LABELS = {
  status: 'Project status',
  priority: 'Priority',
  category: 'Project category',
  member: 'Team member',
  partnerDept: 'Partner dept',
  itdTeam: 'ITD team',
  taskStatus: 'Task status',
  taskCategory: 'Task category',
  taskTool: 'Task tool'
};

function svRenderFilterSummary(filters) {
  var rows = [];
  Object.keys(SV_FILTER_LABELS).forEach(function(k) {
    if (Array.isArray(filters[k]) && filters[k].length) {
      rows.push('<div class="save-view-summary-row"><strong>' + SV_FILTER_LABELS[k] + '</strong><span>' + esc(filters[k].join(', ')) + '</span></div>');
    }
  });
  if (filters.dataProgram) rows.push('<div class="save-view-summary-row"><strong>Data Program</strong><span>Yes</span></div>');
  if (filters.search) rows.push('<div class="save-view-summary-row"><strong>Search</strong><span>"' + esc(filters.search) + '"</span></div>');
  return rows.length ? rows.join('') : '<div class="save-view-summary-empty">No filters set.</div>';
}

function saveCurrentView() {
  if (!svHasAnyFilters(svCaptureCurrent())) {
    showToast('Add some filters first, then save them as a view.', 'warn');
    return;
  }
  openSaveViewModal();
}

function openSaveViewModal() {
  var bd = document.getElementById('save-view-backdrop');
  if (!bd) return;
  var input = document.getElementById('save-view-name');
  var summary = document.getElementById('save-view-summary');
  var warning = document.getElementById('save-view-warning');
  if (input) {
    input.value = '';
    input.oninput = updateSaveViewWarning;
    input.onkeydown = function(e) {
      if (e.key === 'Enter') { e.preventDefault(); commitSaveViewModal(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeSaveViewModal(); }
    };
  }
  if (summary) summary.innerHTML = svRenderFilterSummary(svCaptureCurrent());
  if (warning) warning.style.display = 'none';
  bd.classList.add('open');
  // Focus after the animation kicks in so screen readers announce correctly.
  setTimeout(function() { if (input) input.focus(); }, 60);
}

function closeSaveViewModal() {
  var bd = document.getElementById('save-view-backdrop');
  if (bd) bd.classList.remove('open');
}

function updateSaveViewWarning() {
  var input = document.getElementById('save-view-name');
  var warning = document.getElementById('save-view-warning');
  if (!input || !warning) return;
  var name = (input.value || '').trim();
  var views = (UserPrefs && UserPrefs.savedViews) || [];
  var dup = null;
  for (var i = 0; i < views.length; i++) if (views[i].name === name) { dup = views[i]; break; }
  if (dup && name) {
    warning.style.display = '';
    warning.innerHTML = '⚠ A view named <strong>"' + esc(name) + '"</strong> already exists. Saving will replace it.';
  } else {
    warning.style.display = 'none';
  }
}

function commitSaveViewModal() {
  var input = document.getElementById('save-view-name');
  if (!input) return;
  var name = (input.value || '').trim().slice(0, 40);
  if (!name) {
    input.focus();
    input.style.borderColor = '#EF4444';
    setTimeout(function() { input.style.borderColor = ''; }, 800);
    return;
  }
  UserPrefs.savedViews = UserPrefs.savedViews || [];
  // Replace existing view of the same name (the warning already disclosed this).
  for (var i = 0; i < UserPrefs.savedViews.length; i++) {
    if (UserPrefs.savedViews[i].name === name) {
      UserPrefs.savedViews.splice(i, 1);
      break;
    }
  }
  UserPrefs.savedViews.push({
    id: String(Date.now()) + '-' + Math.floor(Math.random() * 1000),
    name: name,
    filters: svCaptureCurrent()
  });
  saveUserPrefs();
  closeSaveViewModal();
  if (typeof showToast === 'function') showToast('Saved view: ' + name, 'success');
  // Refresh the sidebar's saved-views section directly — render() alone
  // wouldn't rebuild it, since buildSidebarFilters only runs when the
  // dataDirty flag is set.
  renderPresetBar();
}

// Default view (auto-applied on every app load). Stored as a single id in
// UserPrefs.defaultView — works for BOTH built-in presets (id starts with "__")
// and the user's saved views. Clicking the star on the current default clears it.
function getDefaultViewId() {
  if (UserPrefs && UserPrefs.defaultView) return UserPrefs.defaultView;
  // Legacy migration: a saved view previously flagged isDefault.
  var views = (UserPrefs && UserPrefs.savedViews) || [];
  for (var i = 0; i < views.length; i++) if (views[i].isDefault) return views[i].id;
  return '';
}

function setDefaultView(id, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  if (!UserPrefs) return;
  var cur = getDefaultViewId();
  UserPrefs.defaultView = (cur === id) ? '' : id;
  // Single source of truth: clear any legacy per-view flags.
  (UserPrefs.savedViews || []).forEach(function(v) { v.isDefault = false; });
  saveUserPrefs();
  if (typeof showToast === 'function') {
    showToast(UserPrefs.defaultView ? ('Default: ' + presetName(UserPrefs.defaultView) + ' (applies on load)') : 'Default cleared.', 'success');
  }
  closePresetMenus();
  renderPresetBar();
}

// Resolve an id (built-in or saved) to its display name / filter snapshot.
function presetName(id) {
  if (!id) return '';
  var bp = builtinPresets();
  for (var i = 0; i < bp.length; i++) if (bp[i].id === id) return bp[i].name;
  var views = (UserPrefs && UserPrefs.savedViews) || [];
  for (var j = 0; j < views.length; j++) if (views[j].id === id) return views[j].name;
  return '';
}
function resolveViewSnapshot(id) {
  var bp = builtinPresets();
  for (var i = 0; i < bp.length; i++) if (bp[i].id === id) return bp[i].filters;
  var views = (UserPrefs && UserPrefs.savedViews) || [];
  for (var j = 0; j < views.length; j++) if (views[j].id === id) return views[j].filters || {};
  return null;
}

// Apply the user's default view (built-in or saved) directly to activeFilters.
// Called once at bootstrap, after loadUserPrefs and before the first render.
function applyDefaultSavedViewOnLoad() {
  var id = getDefaultViewId();
  if (!id) return;
  var snap = resolveViewSnapshot(id);
  if (!snap) return;
  applyFilterSnapshot(snap);
  svLastAppliedId = (id.indexOf('__') === 0) ? null : id;
}

function deleteSavedView(id, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  if (!UserPrefs || !UserPrefs.savedViews) return;
  var view = null;
  for (var i = 0; i < UserPrefs.savedViews.length; i++) {
    if (UserPrefs.savedViews[i].id === id) { view = UserPrefs.savedViews[i]; break; }
  }
  if (!view) return;
  if (!confirm('Delete view "' + view.name + '"?')) return;
  UserPrefs.savedViews = UserPrefs.savedViews.filter(function(v) { return v.id !== id; });
  saveUserPrefs();
  renderPresetBar();
}

// Overwrite a saved view's stored filters with the current selection.
function updateSavedView(id, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  if (!UserPrefs || !UserPrefs.savedViews) return;
  var v = null;
  for (var i = 0; i < UserPrefs.savedViews.length; i++) if (UserPrefs.savedViews[i].id === id) { v = UserPrefs.savedViews[i]; break; }
  if (!v) return;
  v.filters = svCaptureCurrent();
  saveUserPrefs();
  svLastAppliedId = id;
  closePresetMenus();
  if (typeof showToast === 'function') showToast('Updated view: ' + v.name, 'success');
  renderPresetBar();
}

function renameSavedView(id, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  if (!UserPrefs || !UserPrefs.savedViews) return;
  var v = null;
  for (var i = 0; i < UserPrefs.savedViews.length; i++) if (UserPrefs.savedViews[i].id === id) { v = UserPrefs.savedViews[i]; break; }
  if (!v) return;
  var name = prompt('Rename view:', v.name);
  if (name === null) return;
  name = name.trim().slice(0, 40);
  if (!name) return;
  v.name = name;
  saveUserPrefs();
  closePresetMenus();
  renderPresetBar();
}

// ── Per-view "⋯" dropdown menu ───────────────────────────────────────────
var svOpenMenuId = null;
function togglePresetMenu(id, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  var was = svOpenMenuId === id;
  closePresetMenus();
  if (!was) {
    var m = document.getElementById('pmenu-' + id);
    if (m) { m.classList.add('open'); svOpenMenuId = id; }
  }
}
function closePresetMenus() {
  var open = document.querySelectorAll('.preset-menu.open');
  for (var i = 0; i < open.length; i++) open[i].classList.remove('open');
  svOpenMenuId = null;
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', function(e) {
    if (!e.target.closest || !e.target.closest('.preset-chip')) closePresetMenus();
  });
  // Keyboard activation for the role="button"/menuitem chips, kebabs, and menu
  // items (a11y: keyboard-nav). Enter/Space triggers their click handler. Esc
  // closes an open preset menu.
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && svOpenMenuId) { closePresetMenus(); return; }
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var t = e.target;
    if (t && t.matches && t.matches('.preset-chip[role="button"], .pc-kebab, .pm-item')) {
      e.preventDefault();
      t.click();
    }
  });
}
function builtinMenuItems(p) {
  var isDef = getDefaultViewId() === p.id;
  return '<div class="pm-item" tabindex="0" role="menuitem" onclick="setDefaultView(\'' + p.id + '\', event)"><span class="pm-ic" aria-hidden="true">★</span>' + (isDef ? 'Default view ✓' : 'Set as default') + '</div>';
}
function presetMenuItems(v) {
  var isDef = getDefaultViewId() === v.id;
  return '' +
    '<div class="pm-item" tabindex="0" role="menuitem" onclick="setDefaultView(\'' + v.id + '\', event)"><span class="pm-ic" aria-hidden="true">★</span>' + (isDef ? 'Default view ✓' : 'Set as default') + '</div>' +
    '<div class="pm-item" tabindex="0" role="menuitem" onclick="updateSavedView(\'' + v.id + '\', event)"><span class="pm-ic" aria-hidden="true">⤓</span>Update to current filters</div>' +
    '<div class="pm-item" tabindex="0" role="menuitem" onclick="renameSavedView(\'' + v.id + '\', event)"><span class="pm-ic" aria-hidden="true">✎</span>Rename…</div>' +
    '<div class="pm-item danger" tabindex="0" role="menuitem" onclick="deleteSavedView(\'' + v.id + '\', event)"><span class="pm-ic" aria-hidden="true">🗑</span>Delete</div>';
}

// Render the preset bar above the results: built-in presets + the user's saved
// views as chips (each with a live count + a ⋯ menu) + a Save-view button.
// Shown only on the filterable sub-tabs. Called from updateFilterIndicator.
function renderPresetBar() {
  var bar = document.getElementById('preset-bar');
  if (!bar) return;
  var onFilterTab = (typeof currentTab !== 'undefined') && (currentTab === 'projects' || currentTab === 'tasks');
  if (!onFilterTab) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = '';

  var cur = svCaptureCurrent();
  var builtins = builtinPresets();
  var saved = (UserPrefs && UserPrefs.savedViews) || [];
  var defId = getDefaultViewId();

  var activeId = null;
  for (var i = 0; i < builtins.length; i++) if (svFiltersEqual(cur, builtins[i].filters)) { activeId = builtins[i].id; break; }
  if (!activeId) for (var j = 0; j < saved.length; j++) if (svFiltersEqual(cur, saved[j].filters || {})) { activeId = saved[j].id; break; }

  var html = '<span class="preset-group-label">Views</span>';
  builtins.forEach(function(p) {
    var on = p.id === activeId;
    html += '<span class="preset-chip builtin' + (on ? ' on' : '') + '" tabindex="0" role="button" onclick="applyPreset(\'' + p.id + '\')" title="Apply this preset" aria-label="Apply view: ' + esc(p.name) + '">' +
      (defId === p.id ? '<span class="pc-star" title="Default view" aria-hidden="true">★</span>' : '') +
      '<span class="pc-name">' + esc(p.name) + '</span>' +
      '<span class="pc-kebab" tabindex="0" role="button" aria-label="Preset options" onclick="togglePresetMenu(\'' + p.id + '\', event)" title="Preset options">⋯</span>' +
      '<div class="preset-menu" id="pmenu-' + p.id + '">' + builtinMenuItems(p) + '</div>' +
    '</span>';
  });
  if (saved.length) html += '<span class="preset-div"></span>';
  saved.forEach(function(v) {
    var on = v.id === activeId;
    html += '<span class="preset-chip saved' + (on ? ' on' : '') + '" tabindex="0" role="button" onclick="applySavedView(\'' + v.id + '\')" title="Apply this view" aria-label="Apply view: ' + esc(v.name) + '">' +
      (defId === v.id ? '<span class="pc-star" title="Default view" aria-hidden="true">★</span>' : '') +
      '<span class="pc-name">' + esc(v.name) + '</span>' +
      '<span class="pc-kebab" tabindex="0" role="button" aria-label="Options for view ' + esc(v.name) + '" onclick="togglePresetMenu(\'' + v.id + '\', event)" title="View options">⋯</span>' +
      '<div class="preset-menu" id="pmenu-' + v.id + '">' + presetMenuItems(v) + '</div>' +
    '</span>';
  });
  html += '<button class="preset-chip save" onclick="saveCurrentView()" title="Save the current filters as a reusable view">💾 Save view</button>';

  // "Unsaved changes" affordance: if a saved view was applied then edited.
  if (svLastAppliedId) {
    var lv = null;
    for (var k = 0; k < saved.length; k++) if (saved[k].id === svLastAppliedId) { lv = saved[k]; break; }
    if (lv && !svFiltersEqual(cur, lv.filters || {})) {
      html += '<span class="preset-mod">● unsaved — <span class="pm-link" onclick="updateSavedView(\'' + lv.id + '\')">update “' + esc(lv.name) + '”</span></span>';
    }
  }

  bar.innerHTML = html;
}
