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
  if (activeFilters.search) f.search = activeFilters.search;
  return f;
}

function svHasAnyFilters(f) {
  if (!f) return false;
  for (var i = 0; i < SV_ARRAY_FILTERS.length; i++) {
    if (Array.isArray(f[SV_ARRAY_FILTERS[i]]) && f[SV_ARRAY_FILTERS[i]].length) return true;
  }
  if (f.dataProgram) return true;
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
  if ((a.search || '') !== (b.search || '')) return false;
  return true;
}

function applySavedView(id) {
  var views = (UserPrefs && UserPrefs.savedViews) || [];
  var view = null;
  for (var i = 0; i < views.length; i++) if (views[i].id === id) { view = views[i]; break; }
  if (!view) return;

  // Reset every filter, then apply the saved snapshot. Missing keys =
  // empty/false, so applying a sparse view cleanly clears unrelated
  // filters that were stuck on from a previous selection.
  SV_ARRAY_FILTERS.forEach(function(k) {
    activeFilters[k] = (view.filters && view.filters[k]) ? view.filters[k].slice() : [];
  });
  activeFilters.dataProgram = view.filters && view.filters.dataProgram === true;
  activeFilters.search = (view.filters && view.filters.search) || '';

  var si = document.getElementById('search-input');
  if (si) si.value = activeFilters.search;

  markDataDirty();
  render();
  if (typeof showToast === 'function') showToast('Applied view: ' + view.name, 'success');
}

function saveCurrentView() {
  if (!svHasAnyFilters(svCaptureCurrent())) {
    showToast('Add some filters first, then save them as a view.', 'warn');
    return;
  }
  var name = prompt('Name this view:');
  if (!name) return;
  name = name.trim().slice(0, 40);
  if (!name) return;

  UserPrefs.savedViews = UserPrefs.savedViews || [];
  // Replace existing view of the same name (with confirmation).
  var existingIdx = -1;
  for (var i = 0; i < UserPrefs.savedViews.length; i++) {
    if (UserPrefs.savedViews[i].name === name) { existingIdx = i; break; }
  }
  if (existingIdx >= 0) {
    if (!confirm('A view named "' + name + '" already exists. Replace it?')) return;
    UserPrefs.savedViews.splice(existingIdx, 1);
  }

  UserPrefs.savedViews.push({
    id: String(Date.now()) + '-' + Math.floor(Math.random() * 1000),
    name: name,
    filters: svCaptureCurrent()
  });
  saveUserPrefs();
  if (typeof showToast === 'function') showToast('Saved view: ' + name, 'success');
  render();
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
  render();
}

// Fill the #saved-views-section container with chips + an Add button.
// Called from buildSidebarFilters so views re-render when filters change
// and we can highlight the chip whose snapshot matches the live state.
function renderSavedViews() {
  var container = document.getElementById('saved-views-section');
  if (!container) return;
  var views = (UserPrefs && UserPrefs.savedViews) || [];

  // Hide the section entirely when no views are saved AND no filters are
  // currently set — keeps the sidebar tidy for fresh users.
  var current = svCaptureCurrent();
  var hasActiveFilters = svHasAnyFilters(current);
  if (!views.length && !hasActiveFilters) { container.innerHTML = ''; return; }

  var activeId = null;
  for (var i = 0; i < views.length; i++) {
    if (svFiltersEqual(current, views[i].filters || {})) { activeId = views[i].id; break; }
  }

  var html = '<div class="sidebar-label">My views</div>';
  if (views.length) {
    html += '<div class="saved-views-list">';
    views.forEach(function(v) {
      var active = v.id === activeId;
      html += '<div class="saved-view-chip' + (active ? ' active' : '') + '" onclick="applySavedView(\'' + v.id + '\')" title="Apply this view">' +
        '<span class="sv-name">' + esc(v.name) + '</span>' +
        '<button class="sv-delete" onclick="deleteSavedView(\'' + v.id + '\', event)" title="Delete view">×</button>' +
      '</div>';
    });
    html += '</div>';
  }
  if (hasActiveFilters && !activeId) {
    html += '<button class="saved-view-add" onclick="saveCurrentView()">＋ Save current filters as view</button>';
  } else if (!views.length) {
    html += '<div class="saved-view-hint">Apply some filters, then save them here.</div>';
  }
  container.innerHTML = html;
}
