// ─────────────────────────────────────────────────────────────────────
// bulk-actions.js — multi-select + bulk operations on the Projects list.
//
// Permission model (per item): admins → any project; leads → projects owned by
// their team; members → projects they own. This is exactly canEditProject(p),
// so a checkbox is only offered on rows the user may edit, and every operation
// re-checks canEditProject defensively before writing.
//
// Operations reuse the existing per-record DataStore methods (updateProject /
// deleteProject) in a sequential loop — that preserves the soft-delete +
// task-cascade + status-history + optimistic local-state logic rather than
// re-implementing batch writes. Slower for huge selections, but correct.
//
// Forward references (resolve at call time): canEditProject, PROJECTS,
// DataStore, currentTab, render, markDataDirty, showToast, esc, icon,
// FM_PROJ_STATUSES, FM_PROJ_PRIORITIES, FM_ACTIVE_MEMBERS.
// ─────────────────────────────────────────────────────────────────────

var bulkSelected = new Set();   // selected project objectIds
var _bulkMenuOpts = [];         // options backing the currently-open menu (index-addressed)

// True when at least one visible project in this dataset is editable by the user.
function bulkEnabledFor(data) {
  return Array.isArray(data) && typeof canEditProject === 'function' && data.some(function (p) { return canEditProject(p); });
}

// Leading checkbox cell for a row — blank (keeps the grid aligned) when the row
// isn't editable by the current user.
function bulkCheckboxCell(p) {
  if (!(typeof canEditProject === 'function' && canEditProject(p))) return '<div class="task-cell bulk-cell"></div>';
  var ck = bulkSelected.has(p.objectId) ? ' checked' : '';
  return '<div class="task-cell bulk-cell"><input type="checkbox" class="bulk-cb" data-id="' + p.objectId + '"' + ck +
    ' aria-label="Select project ' + esc(p.title) + '" onclick="event.stopPropagation();bulkToggle(' + p.objectId + ',this.checked)"></div>';
}
function bulkHeaderCell() {
  return '<div class="bulk-cell"><input type="checkbox" class="bulk-cb-all" aria-label="Select all editable projects" title="Select all editable" onclick="bulkToggleAllVisible(this.checked)"></div>';
}

function bulkToggle(id, checked) {
  id = Number(id);
  if (checked) bulkSelected.add(id); else bulkSelected.delete(id);
  bulkRenderBar();
}
function bulkToggleAllVisible(checked) {
  document.querySelectorAll('.bulk-cb[data-id]').forEach(function (cb) {
    cb.checked = checked;
    var id = Number(cb.getAttribute('data-id'));
    if (checked) bulkSelected.add(id); else bulkSelected.delete(id);
  });
  bulkRenderBar();
}
function bulkClear() {
  bulkSelected.clear();
  document.querySelectorAll('.bulk-cb, .bulk-cb-all').forEach(function (cb) { cb.checked = false; });
  bulkRenderBar();
}

// Selected projects that still exist and are still editable (defensive).
function bulkSelectedProjects() {
  if (typeof PROJECTS === 'undefined') return [];
  return PROJECTS.filter(function (p) {
    return bulkSelected.has(p.objectId) && (typeof canEditProject !== 'function' || canEditProject(p));
  });
}

// Render the floating action bar — only on the Projects tab with a selection.
function bulkRenderBar() {
  var bar = document.getElementById('bulk-bar');
  if (!bar) return;
  var onTab = (typeof currentTab !== 'undefined' && currentTab === 'projects');
  var sel = onTab ? bulkSelectedProjects() : [];
  if (!sel.length) { bar.classList.remove('open'); bar.innerHTML = ''; return; }
  var ic = (typeof icon === 'function') ? icon('trash') : '';
  bar.innerHTML =
    '<span class="bulk-count">' + sel.length + ' selected</span>' +
    '<div class="bulk-actions">' +
      '<div class="bulk-menu-wrap"><button class="btn btn-sm" onclick="bulkOpenMenu(\'status\',event)">Set status ▾</button><div class="bulk-menu" id="bulk-menu-status"></div></div>' +
      '<div class="bulk-menu-wrap"><button class="btn btn-sm" onclick="bulkOpenMenu(\'priority\',event)">Set priority ▾</button><div class="bulk-menu" id="bulk-menu-priority"></div></div>' +
      '<div class="bulk-menu-wrap"><button class="btn btn-sm" onclick="bulkOpenMenu(\'reassign\',event)">Reassign ▾</button><div class="bulk-menu" id="bulk-menu-reassign"></div></div>' +
      '<button class="btn btn-sm bulk-delete" onclick="bulkDelete()">' + ic + ' Delete</button>' +
    '</div>' +
    '<button class="btn btn-sm" onclick="bulkClear()">Clear</button>';
  bar.classList.add('open');
}

function bulkOpenMenu(kind, e) {
  if (e) e.stopPropagation();
  bulkCloseMenus();
  var m = document.getElementById('bulk-menu-' + kind);
  if (!m) return;
  var opts = [];
  if (kind === 'status')   opts = (typeof FM_PROJ_STATUSES   !== 'undefined' && FM_PROJ_STATUSES)   ? FM_PROJ_STATUSES   : [];
  if (kind === 'priority') opts = (typeof FM_PROJ_PRIORITIES !== 'undefined' && FM_PROJ_PRIORITIES) ? FM_PROJ_PRIORITIES : [];
  if (kind === 'reassign') opts = (typeof FM_ACTIVE_MEMBERS  !== 'undefined' && FM_ACTIVE_MEMBERS)  ? FM_ACTIVE_MEMBERS  : [];
  _bulkMenuOpts = opts;
  m.innerHTML = opts.length
    ? opts.map(function (o, i) { return '<div class="bulk-menu-item" onclick="bulkApply(\'' + kind + '\',' + i + ')">' + esc(o) + '</div>'; }).join('')
    : '<div class="bulk-menu-item" style="color:var(--text-muted);cursor:default;">No options</div>';
  m.classList.add('open');
}
function bulkCloseMenus() {
  document.querySelectorAll('.bulk-menu.open').forEach(function (m) { m.classList.remove('open'); });
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.bulk-menu-wrap')) bulkCloseMenus();
  });
}

// Apply a field update (status / priority / reassign-owner) to the selection.
function bulkApply(kind, idx) {
  bulkCloseMenus();
  var val = _bulkMenuOpts[idx];
  if (val == null) return;
  var sel = bulkSelectedProjects();
  if (!sel.length) return;
  var field = kind === 'status' ? 'status' : kind === 'priority' ? 'priority' : 'contact';
  var label = kind === 'reassign' ? ('Reassign owner to "' + val + '"') : ('Set ' + kind + ' to "' + val + '"');
  if (!confirm(label + ' for ' + sel.length + ' project' + (sel.length > 1 ? 's' : '') + '?')) return;
  bulkRun(sel, function (p) { var f = {}; f[field] = val; return DataStore.updateProject(p.objectId, f); }, 'updated');
}

function bulkDelete() {
  bulkCloseMenus();
  var sel = bulkSelectedProjects();
  if (!sel.length) return;
  if (!confirm('Delete ' + sel.length + ' project' + (sel.length > 1 ? 's' : '') + '? Their tasks will be canceled. This is a soft-delete (recoverable in ArcGIS), but cannot be undone from here.')) return;
  bulkRun(sel, function (p) { return DataStore.deleteProject(p.objectId); }, 'deleted');
}

// Run an async op over the selection sequentially, with progress + a summary toast.
function bulkRun(sel, fn, verb) {
  var bar = document.getElementById('bulk-bar');
  var ok = 0, fail = 0, i = 0;
  function step() {
    if (i >= sel.length) {
      bulkSelected.clear();
      if (typeof showToast === 'function') showToast(ok + ' project' + (ok !== 1 ? 's' : '') + ' ' + verb + (fail ? (' · ' + fail + ' failed') : ''), fail ? 'warn' : 'success');
      if (typeof markDataDirty === 'function') markDataDirty();
      if (typeof render === 'function') render();
      bulkRenderBar();
      return;
    }
    if (bar) { var c = bar.querySelector('.bulk-count'); if (c) c.textContent = 'Working… ' + (i + 1) + '/' + sel.length; }
    Promise.resolve(fn(sel[i])).then(function () { ok++; }, function (err) { console.error('bulk op failed for project', sel[i].objectId, err); fail++; })
      .then(function () { i++; step(); });
  }
  step();
}
