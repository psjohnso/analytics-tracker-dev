// ─────────────────────────────────────────────────────────────────────
// modals/resolve-tasks.js — Resolve Open Tasks modal
//
// Two callers:
//   1. Close-time interception (Approach A) — when a project is being
//      Completed or Canceled and it still has open child tasks, this
//      modal blocks the status change until every task has a resolution
//      (Complete / Cancel / Transfer-to-different-project).
//   2. Settings → Project hygiene (Approach B) — historical orphans:
//      open tasks whose parent project is already closed.
//
// Forward refs: PROJECTS, TASKS, agolApplyEdits, ARCGIS_CONFIG,
// showToast, render, DataStore, esc, markDataDirty, fireConfetti.
// ─────────────────────────────────────────────────────────────────────

// Statuses that count as "open" for a task (means it still needs resolution).
// Aligned with the 2026 task-status rework — Planned and Scheduled are the
// two pre-Active open states; Pending lingers only as a legacy value that
// agolTaskToLocal normalizes to Planned at load.
var RT_OPEN_TASK_STATUSES = ['Planned', 'Scheduled', 'Active', 'Waiting for Response', 'On Hold'];

// Statuses that count as "closed" for a project (its open tasks become orphans).
var RT_CLOSED_PROJECT_STATUSES = ['Complete', 'Canceled'];

// Per-modal state — the modal is single-instance so we keep state in module scope.
var _rtState = null;

// ── Utilities ───────────────────────────────────────────────────────

// Returns the list of open child tasks for a given project_number.
function getOpenChildTasks(projectNumber) {
  if (projectNumber == null || typeof TASKS === 'undefined') return [];
  var pn = String(projectNumber);
  return TASKS.filter(function(t) {
    return t.project_number != null
      && String(t.project_number) === pn
      && RT_OPEN_TASK_STATUSES.indexOf(t.status) >= 0;
  });
}

// Returns all open tasks whose parent project is closed. Grouped by parent
// project_number on the returned object so the Settings widget can render
// "Resolve these N" per group. Format:
//   { 'P-001': { project: <projObj>, tasks: [...] }, ... }
function findOrphanTaskGroups() {
  if (typeof PROJECTS === 'undefined' || typeof TASKS === 'undefined') return {};
  var statusByPn = {};
  var projByPn = {};
  PROJECTS.forEach(function(p) {
    if (p.project_number != null) {
      statusByPn[String(p.project_number)] = p.status;
      projByPn[String(p.project_number)] = p;
    }
  });
  var groups = {};
  TASKS.forEach(function(t) {
    if (RT_OPEN_TASK_STATUSES.indexOf(t.status) < 0) return;
    if (t.project_number == null) return; // orphan-no-parent; the other diagnostic finds these
    var pn = String(t.project_number);
    var parentStatus = statusByPn[pn];
    if (RT_CLOSED_PROJECT_STATUSES.indexOf(parentStatus) < 0) return;
    if (!groups[pn]) groups[pn] = { project: projByPn[pn], tasks: [] };
    groups[pn].tasks.push(t);
  });
  return groups;
}

// ── Modal lifecycle ─────────────────────────────────────────────────

// Open the modal.
// opts = {
//   tasks: array of task objects (required, at least 1)
//   parentProject: project obj (optional; sets context line)
//   targetStatus: 'Complete' | 'Canceled' (sets defaults + title)
//   onApply: async function(resolutions) called after AGOL writes succeed
//                 resolutions is the same array passed in, with each entry's
//                 .resolution field set to 'Complete' | 'Cancel' | 'Transfer'
//                 (and .transferTo set when 'Transfer').
//   onCancel: optional function called if user dismisses the modal
// }
function openResolveTasksModal(opts) {
  if (!opts || !opts.tasks || !opts.tasks.length) {
    // No tasks to resolve — caller should have checked but be tolerant.
    if (opts && opts.onApply) opts.onApply([]);
    return;
  }
  _rtState = {
    rows: opts.tasks.map(function(t) {
      return {
        task: t,
        // Pre-set defaults: when parent is being Canceled, every row defaults
        // to Cancel (fast confirm). When parent is being Completed, no default
        // — every row must be deliberately chosen.
        resolution: opts.targetStatus === 'Canceled' ? 'Cancel' : null,
        transferTo: null, // project_number FK when resolution === 'Transfer'
        pickerOpen: false,
        pickerQuery: '',
      };
    }),
    parentProject: opts.parentProject || null,
    targetStatus: opts.targetStatus || 'Canceled',
    onApply: opts.onApply || function() {},
    onCancel: opts.onCancel || function() {},
    applying: false,
  };
  _rtRender();
  document.getElementById('rt-modal-backdrop').classList.add('open');
}

function _rtCloseModal(viaCancel) {
  document.getElementById('rt-modal-backdrop').classList.remove('open');
  if (viaCancel && _rtState && _rtState.onCancel) _rtState.onCancel();
  _rtState = null;
}

// ── Render ──────────────────────────────────────────────────────────

function _rtRender() {
  var el = document.getElementById('rt-modal');
  if (!el || !_rtState) return;

  var s = _rtState;
  var totalRows = s.rows.length;
  var resolvedRows = s.rows.filter(function(r) {
    if (!r.resolution) return false;
    if (r.resolution === 'Transfer' && !r.transferTo) return false;
    return true;
  }).length;
  var allResolved = resolvedRows === totalRows;

  // Counts for the footer summary
  var counts = { Complete: 0, Cancel: 0, Transfer: 0 };
  s.rows.forEach(function(r) {
    if (r.resolution && (r.resolution !== 'Transfer' || r.transferTo)) counts[r.resolution]++;
  });

  var verb = s.targetStatus === 'Complete' ? 'completing' : 'canceling';
  var headTitle = s.targetStatus === 'Complete'
    ? 'Resolve child tasks before completing'
    : 'Resolve child tasks before canceling';

  var pName = s.parentProject
    ? (s.parentProject.project_number || '') + ' · ' + (s.parentProject.title || '')
    : '';

  var html = '';
  html += '<div class="rt-modal-head">';
  html += '<h2>' + esc(headTitle) + '</h2>';
  html += '<button class="rt-close" onclick="_rtCloseModal(true)" title="Cancel — leave the project status as-is"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg></button>';
  html += '</div>';

  html += '<div class="rt-modal-summary">';
  html += '<span><strong class="rt-num">' + totalRows + '</strong> open task' + (totalRows === 1 ? '' : 's') + (s.parentProject ? ' belong' + (totalRows === 1 ? 's' : '') + ' to' : '') + '</span>';
  if (pName) html += '<span class="rt-proj-name">' + esc(pName) + '</span>';
  if (s.parentProject) {
    var oldP = '<span class="rt-pill rt-pill-' + esc(s.parentProject.status || '') + '">' + esc(s.parentProject.status || '—') + '</span>';
    var newP = '<span class="rt-pill rt-pill-' + esc(s.targetStatus) + '">' + esc(s.targetStatus) + '</span>';
    html += '<span style="margin-left:auto;">' + oldP + ' → ' + newP + '</span>';
  }
  html += '</div>';

  html += '<div class="rt-batch-bar">';
  html += '<span class="rt-batch-label">Apply to all:</span>';
  if (s.targetStatus === 'Canceled') {
    html += '<button class="rt-btn rt-btn-secondary rt-btn-sm" onclick="_rtBatchSet(\'Cancel\')">Cancel all</button>';
    html += '<button class="rt-btn rt-btn-ghost rt-btn-sm" onclick="_rtBatchSet(\'Complete\')">Complete all</button>';
    html += '<span class="rt-batch-hint">defaults set to Cancel — change any row to override</span>';
  } else {
    html += '<button class="rt-btn rt-btn-secondary rt-btn-sm" onclick="_rtBatchSet(\'Complete\')">Complete all</button>';
    html += '<button class="rt-btn rt-btn-ghost rt-btn-sm" onclick="_rtBatchSet(\'Cancel\')">Cancel all</button>';
    html += '<span class="rt-batch-hint">no default — each task needs a deliberate decision</span>';
  }
  html += '</div>';

  html += '<div class="rt-task-list">';
  s.rows.forEach(function(r, idx) {
    var t = r.task;
    var unresolved = !r.resolution || (r.resolution === 'Transfer' && !r.transferTo);
    var rowCls = 'rt-task-row' + (unresolved ? ' rt-unresolved' : '');
    html += '<div class="' + rowCls + '">';
    html += '<div class="rt-row-icon">' + (unresolved ? '<svg class="icon" aria-hidden="true" style="color:var(--text-muted);"><use href="#ph-circle"></use></svg>' : '<svg class="icon" aria-hidden="true" style="color:#8aa050;"><use href="#ph-check-circle"></use></svg>') + '</div>';
    html += '<div class="rt-row-task">';
    html += '<div class="rt-row-title">' + esc(t.title || '(no title)') + '</div>';
    html += '<div class="rt-row-meta">' + esc(t.task_number || '') + ' · ' + esc(t.status || '—') + '</div>';
    html += '</div>';
    html += '<div class="rt-row-assignee">' + esc(t.assignee || '—') + '</div>';
    html += '<div class="rt-row-resolution">';
    html += '<button class="rt-res-btn ' + (r.resolution === 'Complete' ? 'active complete' : '') + '" onclick="_rtSetResolution(' + idx + ', \'Complete\')">Complete</button>';
    html += '<button class="rt-res-btn ' + (r.resolution === 'Cancel' ? 'active cancel' : '') + '" onclick="_rtSetResolution(' + idx + ', \'Cancel\')">Cancel</button>';
    html += '<button class="rt-res-btn ' + (r.resolution === 'Transfer' ? 'active transfer' : '') + '" onclick="_rtSetResolution(' + idx + ', \'Transfer\')">Transfer to →</button>';
    if (r.resolution === 'Transfer') {
      if (r.transferTo) {
        var dest = PROJECTS.find(function(p) { return String(p.project_number) === String(r.transferTo); });
        var destLabel = dest ? (dest.project_number + ' · ' + (dest.title || '')) : ('#' + r.transferTo);
        html += '<span class="rt-transfer-tag" onclick="_rtTogglePicker(' + idx + ')" title="Click to change">' +
          '<svg class="icon" aria-hidden="true" style="width:11px;height:11px;"><use href="#ph-arrow-right"></use></svg> ' +
          esc(destLabel) +
        '</span>';
      } else if (!r.pickerOpen) {
        // No destination yet — auto-open picker
        r.pickerOpen = true;
      }
      if (r.pickerOpen) {
        html += '<div class="rt-picker">' + _rtBuildPickerHtml(idx, r) + '</div>';
      }
    }
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="rt-modal-foot">';
  var progressCls = allResolved ? 'rt-progress rt-progress-complete' : 'rt-progress';
  if (allResolved) {
    html += '<div class="' + progressCls + '">All <strong>' + totalRows + '</strong> tasks resolved · ' +
      counts.Cancel + ' Cancel · ' + counts.Complete + ' Complete · ' + counts.Transfer + ' Transfer</div>';
  } else {
    html += '<div class="' + progressCls + '"><strong>' + resolvedRows + '</strong> of ' + totalRows + ' resolved</div>';
  }
  html += '<div class="rt-foot-actions">';
  html += '<button class="rt-btn rt-btn-ghost" onclick="_rtCloseModal(true)">Cancel</button>';
  var applyDisabled = !allResolved || s.applying;
  var applyLabel = s.applying ? 'Applying…' : ('Apply &amp; ' + (s.targetStatus === 'Complete' ? 'complete' : 'cancel') + ' project');
  html += '<button class="rt-btn rt-btn-primary" onclick="_rtApply()"' + (applyDisabled ? ' disabled' : '') + '>' +
    '<svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg> ' + applyLabel + '</button>';
  html += '</div>';
  html += '</div>';

  el.innerHTML = html;
}

function _rtBuildPickerHtml(rowIdx, row) {
  var q = (row.pickerQuery || '').toLowerCase();
  // Candidate projects: Active, On Hold, Scheduled (open work the task could move to)
  var candidates = PROJECTS.filter(function(p) {
    if (['Active', 'On Hold', 'Scheduled', 'Waiting for Response'].indexOf(p.status) < 0) return false;
    if (_rtState.parentProject && p.objectId === _rtState.parentProject.objectId) return false;
    if (!q) return true;
    var hay = ((p.project_number || '') + ' ' + (p.title || '')).toLowerCase();
    return hay.indexOf(q) >= 0;
  }).slice(0, 60);

  var options = candidates.map(function(p) {
    return '<div class="rt-picker-opt" onclick="_rtPickProject(' + rowIdx + ',\'' + esc(String(p.project_number || '')).replace(/'/g, "\\'") + '\')">' +
      '<span class="rt-picker-pn">' + esc(p.project_number || '') + '</span>' +
      '<span class="rt-picker-ttl">' + esc(p.title || '') + '</span>' +
      '<span class="rt-pill rt-pill-' + esc(p.status || '') + ' rt-picker-st">' + esc(p.status || '') + '</span>' +
    '</div>';
  }).join('');

  return '<input type="text" class="rt-picker-search" placeholder="Search by number or title…" value="' + esc(row.pickerQuery || '') + '" oninput="_rtPickerSearch(' + rowIdx + ', this.value)" autofocus>' +
    '<div class="rt-picker-opts">' + (options || '<div class="rt-picker-empty">No matching open projects.</div>') + '</div>';
}

// ── Action handlers ───────────────────────────────────────────────────

function _rtSetResolution(rowIdx, resolution) {
  if (!_rtState) return;
  var r = _rtState.rows[rowIdx];
  r.resolution = resolution;
  if (resolution !== 'Transfer') {
    r.transferTo = null;
    r.pickerOpen = false;
    r.pickerQuery = '';
  } else {
    // Auto-open picker if no destination
    if (!r.transferTo) r.pickerOpen = true;
  }
  _rtRender();
}

function _rtTogglePicker(rowIdx) {
  if (!_rtState) return;
  var r = _rtState.rows[rowIdx];
  r.pickerOpen = !r.pickerOpen;
  _rtRender();
}

function _rtPickerSearch(rowIdx, q) {
  if (!_rtState) return;
  _rtState.rows[rowIdx].pickerQuery = q;
  _rtRender();
  // Restore focus after re-render
  setTimeout(function() {
    var input = document.querySelector('.rt-task-row:nth-of-type(' + (rowIdx + 1) + ') .rt-picker-search');
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }, 0);
}

function _rtPickProject(rowIdx, projectNumber) {
  if (!_rtState) return;
  var r = _rtState.rows[rowIdx];
  r.transferTo = projectNumber;
  r.pickerOpen = false;
  r.pickerQuery = '';
  _rtRender();
}

function _rtBatchSet(resolution) {
  if (!_rtState) return;
  _rtState.rows.forEach(function(r) {
    r.resolution = resolution;
    if (resolution !== 'Transfer') { r.transferTo = null; r.pickerOpen = false; }
  });
  _rtRender();
}

async function _rtApply() {
  if (!_rtState) return;
  var s = _rtState;
  s.applying = true;
  _rtRender();
  try {
    // Build the task-update batch
    var nowEpoch = Date.now();
    var todayStr = (function() {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    })();
    var updates = s.rows.map(function(r) {
      var attrs = { ObjectId: r.task.objectId };
      if (r.resolution === 'Complete') {
        attrs.status = 'Complete';
        attrs.actual_end = todayStr;
      } else if (r.resolution === 'Cancel') {
        attrs.status = 'Canceled';
      } else if (r.resolution === 'Transfer') {
        // Re-parent: change project_number FK. Status / dates stay as-is.
        attrs.project_number = r.transferTo;
      }
      return { attributes: attrs };
    });

    // Send in batches of 100 to stay safe
    for (var i = 0; i < updates.length; i += 100) {
      var batch = updates.slice(i, i + 100);
      await agolApplyEdits(ARCGIS_CONFIG.tasksUrl, { updates: batch });
    }

    // Update local TASKS array
    s.rows.forEach(function(r) {
      var t = TASKS.find(function(x) { return x.objectId === r.task.objectId; });
      if (!t) return;
      if (r.resolution === 'Complete') { t.status = 'Complete'; t.actual_end = todayStr; }
      else if (r.resolution === 'Cancel') { t.status = 'Canceled'; }
      else if (r.resolution === 'Transfer') { t.project_number = r.transferTo; }
    });

    // Fire the caller's onApply (does the project status change)
    await s.onApply(s.rows);

    // Build a friendly summary toast
    var counts = { Complete: 0, Cancel: 0, Transfer: 0 };
    s.rows.forEach(function(r) { counts[r.resolution]++; });
    var bits = [];
    if (counts.Cancel) bits.push(counts.Cancel + ' canceled');
    if (counts.Complete) bits.push(counts.Complete + ' completed');
    if (counts.Transfer) bits.push(counts.Transfer + ' transferred');
    showToast('Tasks resolved: ' + bits.join(', '), 'success');

    if (typeof markDataDirty === 'function') markDataDirty();
    _rtCloseModal(false);
    if (typeof render === 'function') render();
  } catch (err) {
    console.error('[ResolveTasks] Apply failed:', err);
    showToast('Failed to resolve tasks: ' + (err.message || err), 'error');
    s.applying = false;
    _rtRender();
  }
}

// ── Public helper: gate a project status change behind the modal ────
//
// Usage at every project-close call site:
//   await closeProjectWithCascade(project, 'Complete', async function() {
//     await DataStore.updateProject(project.objectId, { status: 'Complete', ... });
//   });
//
// The callback fires only after task resolutions succeed. If the user
// dismisses the modal, the callback is NOT fired and the project stays
// in its original status.
function closeProjectWithCascade(project, newStatus, onProceed) {
  if (!project || !onProceed) return Promise.resolve(false);
  if (RT_CLOSED_PROJECT_STATUSES.indexOf(newStatus) < 0) {
    // Not a close — just run the callback
    return Promise.resolve(onProceed()).then(function() { return true; });
  }
  var openChildren = getOpenChildTasks(project.project_number);
  if (openChildren.length === 0) {
    // No cascade needed
    return Promise.resolve(onProceed()).then(function() { return true; });
  }
  return new Promise(function(resolve) {
    openResolveTasksModal({
      tasks: openChildren,
      parentProject: project,
      targetStatus: newStatus,
      onApply: async function() {
        try {
          await onProceed();
          resolve(true);
        } catch (e) {
          console.error('[closeProjectWithCascade] onProceed failed:', e);
          resolve(false);
          throw e;
        }
      },
      onCancel: function() { resolve(false); },
    });
  });
}
