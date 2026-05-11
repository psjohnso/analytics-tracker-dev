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
