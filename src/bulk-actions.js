// ─────────────────────────────────────────────────────────────────────
// bulk-actions.js — multi-select + bulk operations on the Projects and Tasks
// lists.
//
// Permission model (per item): admins → anything; leads → items owned by their
// team (a task's team = its parent project's owning_team); members → items they
// own (project contact / task assignee). This is canEditProject / canEditTask,
// so a checkbox is only offered on rows the user may edit, and every operation
// re-checks before writing.
//
// Operations reuse the existing per-record DataStore methods (update*/delete*)
// in a sequential loop — preserving soft-delete + cascade + status-history +
// optimistic local-state rather than re-implementing batch writes.
//
// Forward references (resolve at call time): currentTab, PROJECTS, TASKS,
// canEditProject, canEditTask, DataStore, render, markDataDirty, showToast,
// esc, icon, FM_PROJ_STATUSES/PRIORITIES, FM_TASK_STATUSES/PRIORITIES/ASSIGNEES,
// FM_ACTIVE_MEMBERS.
// ─────────────────────────────────────────────────────────────────────

var bulkSelected = new Set();   // selected objectIds (meaning depends on the active tab)
var _bulkMenuOpts = [];         // options backing the open menu (index-addressed)

// Per-entity config for the active tab; null when bulk doesn't apply.
function bulkCtx() {
  var tab = (typeof currentTab !== 'undefined') ? currentTab : null;
  if (tab === 'projects') return {
    noun: 'project',
    items: (typeof PROJECTS !== 'undefined') ? PROJECTS : [],
    canEdit: (typeof canEditProject === 'function') ? canEditProject : function () { return false; },
    update: function (id, f) { return DataStore.updateProject(id, f); },
    del: function (id) { return DataStore.deleteProject(id); },
    statuses: (typeof FM_PROJ_STATUSES !== 'undefined' && FM_PROJ_STATUSES) ? FM_PROJ_STATUSES : [],
    priorities: (typeof FM_PROJ_PRIORITIES !== 'undefined' && FM_PROJ_PRIORITIES) ? FM_PROJ_PRIORITIES : [],
    members: (typeof FM_ACTIVE_MEMBERS !== 'undefined' && FM_ACTIVE_MEMBERS) ? FM_ACTIVE_MEMBERS : [],
    reassignField: 'contact', reassignLabel: 'owner'
  };
  if (tab === 'tasks') return {
    noun: 'task',
    items: (typeof TASKS !== 'undefined') ? TASKS : [],
    canEdit: (typeof canEditTask === 'function') ? canEditTask : function () { return false; },
    update: function (id, f) { return DataStore.updateTask(id, f); },
    del: function (id) { return DataStore.deleteTask(id); },
    statuses: (typeof FM_TASK_STATUSES !== 'undefined' && FM_TASK_STATUSES) ? FM_TASK_STATUSES : [],
    priorities: (typeof FM_TASK_PRIORITIES !== 'undefined' && FM_TASK_PRIORITIES) ? FM_TASK_PRIORITIES : [],
    members: (typeof FM_TASK_ASSIGNEES !== 'undefined' && FM_TASK_ASSIGNEES) ? FM_TASK_ASSIGNEES
           : ((typeof FM_ACTIVE_MEMBERS !== 'undefined' && FM_ACTIVE_MEMBERS) ? FM_ACTIVE_MEMBERS : []),
    reassignField: 'assignee', reassignLabel: 'assignee'
  };
  return null;
}

// True when ≥1 visible row in this dataset is editable by the current user.
function bulkEnabledFor(data) {
  var ctx = bulkCtx();
  return !!ctx && Array.isArray(data) && data.some(function (it) { return ctx.canEdit(it); });
}

// Leading checkbox cell — blank (keeps the grid aligned) when not editable.
function bulkCheckboxCell(it) {
  var ctx = bulkCtx();
  if (!ctx || !ctx.canEdit(it)) return '<div class="task-cell bulk-cell"></div>';
  var ck = bulkSelected.has(it.objectId) ? ' checked' : '';
  return '<div class="task-cell bulk-cell"><input type="checkbox" class="bulk-cb" data-id="' + it.objectId + '"' + ck +
    ' aria-label="Select ' + ctx.noun + ' ' + esc(it.title || '') + '" onclick="event.stopPropagation();bulkToggle(' + it.objectId + ',this.checked)"></div>';
}
function bulkHeaderCell() {
  return '<div class="bulk-cell"><input type="checkbox" class="bulk-cb-all" aria-label="Select all editable" title="Select all editable" onclick="bulkToggleAllVisible(this.checked)"></div>';
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

// Selected items that still exist and are still editable (defensive).
function bulkSelectedItems() {
  var ctx = bulkCtx();
  if (!ctx) return [];
  return ctx.items.filter(function (it) { return bulkSelected.has(it.objectId) && ctx.canEdit(it); });
}

// Render the floating action bar — only on Projects/Tasks with a selection.
function bulkRenderBar() {
  var bar = document.getElementById('bulk-bar');
  if (!bar) return;
  var ctx = bulkCtx();
  var sel = ctx ? bulkSelectedItems() : [];
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
  var ctx = bulkCtx();
  if (!ctx) return;
  var m = document.getElementById('bulk-menu-' + kind);
  if (!m) return;
  var opts = kind === 'status' ? ctx.statuses : kind === 'priority' ? ctx.priorities : ctx.members;
  _bulkMenuOpts = opts || [];
  m.innerHTML = _bulkMenuOpts.length
    ? _bulkMenuOpts.map(function (o, i) { return '<div class="bulk-menu-item" onclick="bulkApply(\'' + kind + '\',' + i + ')">' + esc(o) + '</div>'; }).join('')
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

// Apply a field update (status / priority / reassign) to the selection.
function bulkApply(kind, idx) {
  bulkCloseMenus();
  var ctx = bulkCtx();
  if (!ctx) return;
  var val = _bulkMenuOpts[idx];
  if (val == null) return;
  var sel = bulkSelectedItems();
  if (!sel.length) return;
  var field = kind === 'status' ? 'status' : kind === 'priority' ? 'priority' : ctx.reassignField;
  var label = kind === 'reassign' ? ('Reassign ' + ctx.reassignLabel + ' to "' + val + '"') : ('Set ' + kind + ' to "' + val + '"');
  if (!confirm(label + ' for ' + sel.length + ' ' + ctx.noun + (sel.length > 1 ? 's' : '') + '?')) return;
  bulkRun(ctx, sel, function (it) { var f = {}; f[field] = val; return ctx.update(it.objectId, f); }, 'updated');
}

function bulkDelete() {
  bulkCloseMenus();
  var ctx = bulkCtx();
  if (!ctx) return;
  var sel = bulkSelectedItems();
  if (!sel.length) return;
  var extra = ctx.noun === 'project' ? ' Their tasks will be canceled.' : '';
  if (!confirm('Delete ' + sel.length + ' ' + ctx.noun + (sel.length > 1 ? 's' : '') + '?' + extra + ' This is a soft-delete (recoverable in ArcGIS), but cannot be undone from here.')) return;
  bulkRun(ctx, sel, function (it) { return ctx.del(it.objectId); }, 'deleted');
}

// Run an async op over the selection sequentially, with progress + summary toast.
function bulkRun(ctx, sel, fn, verb) {
  var bar = document.getElementById('bulk-bar');
  var ok = 0, fail = 0, i = 0;
  function step() {
    if (i >= sel.length) {
      bulkSelected.clear();
      if (typeof showToast === 'function') showToast(ok + ' ' + ctx.noun + (ok !== 1 ? 's' : '') + ' ' + verb + (fail ? (' · ' + fail + ' failed') : ''), fail ? 'warn' : 'success');
      if (typeof markDataDirty === 'function') markDataDirty();
      if (typeof render === 'function') render();
      bulkRenderBar();
      return;
    }
    if (bar) { var c = bar.querySelector('.bulk-count'); if (c) c.textContent = 'Working… ' + (i + 1) + '/' + sel.length; }
    Promise.resolve(fn(sel[i])).then(function () { ok++; }, function (err) { console.error('bulk op failed', sel[i].objectId, err); fail++; })
      .then(function () { i++; step(); });
  }
  step();
}
