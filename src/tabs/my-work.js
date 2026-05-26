// ─────────────────────────────────────────────────────────────────────
// tabs/my-work.js — My Work tab (personal view)
//
// Owns: per-user filtering of projects/tasks (getMyProjects/Tasks),
// the My Work column toggles, the New Task quick-add helper, the
// gantt timeline (build, navigation, collapse state), the task
// dependency feature helpers (find by number, resolve refs, blocker
// queries, dependency picker), the attention-alert calculators
// (getProjectAlerts, getTaskAlerts, renderAttBadges, attBorderClass),
// effectiveDue / effectiveEnd, and the main renderMyWork dispatcher.
//
// Several of these helpers (effectiveDue, findTaskByNumber,
// findProjectByNumber, dependency helpers, alert calculators) are
// also called from project/task detail pages — they're forward refs
// from inline at runtime.
//
// Forward references: PROJECTS, TASKS, Auth, esc, render, showToast,
// switchTab, openTask, openProject, isFeatureOn, isAdmin,
// getTaskHours, getProjectHours, getMyTaskHours, getMyProjectHours,
// hoursLabel, STATUS_COLOR, STATUS_TEXT_COLOR, ARCGIS_CONFIG,
// agolApplyEdits, DataStore, RESOURCES_DATA, getActiveTimers,
// formatTimerChip, mwNewTask, openFormModal, openIdeaForm.
// ─────────────────────────────────────────────────────────────────────

let _ganttCollapsed = {};  // { projectTitle: true/false } — which projects have tasks hidden

function getMyProjects(viewName) {
  const name = viewName || Auth.fullName;
  if (!name) return [];
  return PROJECTS.filter(function(p) {
    if (p.contact === name) return true;
    if (p.other_members && p.other_members.split(',').map(function(s) { return s.trim(); }).includes(name)) return true;
    return false;
  });
}

function getMyTasks(viewName) {
  const name = viewName || Auth.fullName;
  if (!name) return [];
  return TASKS.filter(function(t) { return t.assignee === name; });
}

function switchMyWorkUser(selectEl) {
  const val = selectEl.value;
  _myWorkViewUser = (val === Auth.fullName) ? null : val;
  _ganttFilter = {}; // reset so new user's projects default to all visible
  _ganttCollapsed = {}; // reset collapse state
  renderMyWork(document.getElementById('content-area'));
}

function toggleMyWorkTasks() {
  const panel = document.getElementById('mywork-tasks-expand');
  const btn = document.getElementById('mywork-tasks-toggle');
  if (!panel || !btn) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? '' : 'none';
  if (isHidden) {
    btn.dataset.origLabel = btn.textContent;
    btn.textContent = 'Show fewer tasks';
  } else {
    btn.textContent = btn.dataset.origLabel || 'Show more';
  }
}

function toggleMyWorkProjects() {
  const panel = document.getElementById('mywork-proj-expand');
  const btn = document.getElementById('mywork-proj-toggle');
  if (!panel || !btn) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? '' : 'none';
  if (isHidden) {
    btn.dataset.origLabel = btn.textContent;
    btn.textContent = 'Show fewer projects';
  } else {
    btn.textContent = btn.dataset.origLabel || 'Show more';
  }
}

function mwNewTask() {
  openFormModal('add-task');
  // Pre-fill assignee with the logged-in user
  var sel = document.getElementById('fm-assignee');
  if (sel && Auth.fullName) {
    sel.value = Auth.fullName;
  }
}

async function mwQuickStatus(selectEl) {
  var type = selectEl.dataset.type;
  var id = parseInt(selectEl.dataset.id);
  var newStatus = selectEl.value;
  if (!Auth.loggedIn || !isTokenValid()) {
    showToast('Your session has expired. Please sign in again.', 'warn');
    var oldItem = type === 'task' ? TASKS.find(function(t) { return t.objectId == id; }) : PROJECTS.find(function(p) { return p.objectId == id; });
    if (oldItem) selectEl.value = oldItem.status;
    showSessionExpiredModal();
    return;
  }

  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

  if (type === 'task') {
    // Block setting Active without a due date
    if (newStatus === 'Active') {
      var task = TASKS.find(function(t) { return t.objectId == id; });
      if (task && !task.due && !task.working_due) {
        showToast('A due date is required before setting a task to Active. Please edit the task to add a due date first.', 'warn');
        selectEl.value = task.status;
        return;
      }
      if (task && !task.start) {
        showToast('A start date is required before setting a task to Active. Please edit the task to add a start date first.', 'warn');
        selectEl.value = task.status;
        return;
      }
    }
    var task = task || TASKS.find(function(t) { return t.objectId == id; });
    var oldStatus = task ? task.status : null;
    var reason = null;
    if (needsStatusReason(newStatus)) {
      var result = await promptStatusReason(oldStatus, newStatus);
      if (!result.confirmed) { selectEl.value = oldStatus; return; }
      reason = result.reason;
    }
    var fields = { status: newStatus };
    if (newStatus === 'Complete') fields.actual_end = todayStr;
    if (isFeatureOn('taskHistory') && task) {
      fields.task_status_history = appendTaskHistory(task, oldStatus, newStatus, reason);
    }
    try {
      await DataStore.updateTask(id, fields);
      showToast('Task status updated to ' + newStatus + '.', 'success');
    } catch (err) {
      showToast('Failed to update: ' + err.message, 'error');
      return;
    }
  } else if (type === 'project') {
    var pFields = { status: newStatus };
    if (newStatus === 'Complete') pFields.actual_end = todayStr;
    try {
      await DataStore.updateProject(id, pFields);
      showToast('Project status updated to ' + newStatus + '.', 'success');
    } catch (err) {
      showToast('Failed to update: ' + err.message, 'error');
      return;
    }
  }
  markDataDirty();
  render();
}

async function inlineTaskAssignee(selectEl) {
  if (!Auth.loggedIn) { showToast('You must be signed in.', 'warn'); return; }
  var taskId = parseInt(selectEl.dataset.taskId);
  var newAssignee = selectEl.value || null;
  try {
    await DataStore.updateTask(taskId, { assignee: newAssignee });
    // Auto-add assignee as project contributor
    if (newAssignee) {
      var task = TASKS.find(function(t) { return t.objectId == taskId; });
      if (task && task.project) await ensureProjectContributor(task.project, newAssignee);
    }
    showToast('Assignee updated.', 'success');
    markDataDirty();
    render();
  } catch (err) {
    showToast('Failed to update: ' + err.message, 'error');
  }
}

async function inlineTaskDueDate(inputEl) {
  if (!Auth.loggedIn) { showToast('You must be signed in.', 'warn'); return; }
  var taskId = parseInt(inputEl.dataset.taskId);
  var hasDue = inputEl.dataset.hasDue === '1';
  var newDate = inputEl.value || null;
  var fields = {};
  if (hasDue) {
    // Task already has an original due date — update the working due date
    fields.working_due = newDate;
  } else {
    // No original due date — set it as the initial due date
    fields.due = newDate;
  }
  try {
    await DataStore.updateTask(taskId, fields);
    showToast(hasDue ? 'Working due date updated.' : 'Due date set.', 'success');
    markDataDirty();
    render();
  } catch (err) {
    showToast('Failed to update: ' + err.message, 'error');
  }
}

function expandGantt() {
  var gp = document.getElementById('mywork-gantt');
  var ga = document.getElementById('gantt-arrow');
  if (gp && gp.style.display === 'none') {
    gp.style.display = '';
    if (ga) ga.textContent = '▼';
  }
}

function toggleTaskView(mode) {
  _taskViewMode = mode;
  // Re-render the detail page in place without scrolling to top
  var area = document.getElementById('content-area');
  if (currentDetail && currentDetail.type === 'project' && area) {
    area.innerHTML = (typeof _oeDetail === 'function' && _oeDetail())
      ? renderProjectDetailOE(currentDetail.id)
      : renderProjectDetail(currentDetail.id);
    initSearchableSelect('batch-project');
  }
}

function toggleGantt() {
  const panel = document.getElementById('mywork-gantt');
  const arrow = document.getElementById('gantt-arrow');
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? '' : 'none';
  if (arrow) arrow.textContent = isHidden ? '▼' : '▶';
}

function toggleGanttProject(title) {
  _ganttFilter[title] = !_ganttFilter[title];
  rebuildGanttChart();
}

function ganttSelectAll(show) {
  const checks = document.querySelectorAll('.gantt-proj-check');
  checks.forEach(function(cb) {
    _ganttFilter[cb.value] = show;
    cb.checked = show;
  });
  rebuildGanttChart();
}

function toggleGanttDropdown() {
  const dd = document.getElementById('gantt-filter-dropdown');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : '';
  // Close on outside click
  if (!isOpen) {
    setTimeout(function() {
      function closeHandler(e) {
        const wrap = document.getElementById('gantt-filter-wrap');
        if (wrap && !wrap.contains(e.target)) {
          dd.style.display = 'none';
          document.removeEventListener('click', closeHandler);
        }
      }
      document.addEventListener('click', closeHandler);
    }, 0);
  }
}

function toggleGanttCollapse(title) {
  _ganttCollapsed[title] = !_ganttCollapsed[title];
  rebuildGanttChart();
}

function rebuildGanttChart() {
  const container = document.getElementById('gantt-chart-body');
  if (!container) return;
  container.innerHTML = buildGanttBars();
  // Update header and dropdown button counts
  if (window._ganttItemsAll) {
    const vis = window._ganttItemsAll.filter(function(g) { return _ganttFilter[g.title]; }).length;
    const total = window._ganttItemsAll.length;
    const headerSpan = document.querySelector('#mywork-gantt') && document.querySelector('#mywork-gantt').closest('.mywork-section') ? document.querySelector('#mywork-gantt').closest('.mywork-section').querySelector('.mywork-section-header span:last-child') : null;
    if (headerSpan) headerSpan.textContent = '(' + vis + ' of ' + total + ' projects)';
    const ddBtn = document.querySelector('#gantt-filter-wrap > button');
    if (ddBtn) ddBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#ph-folder"></use></svg> Projects (' + vis + '/' + total + ') <span style="font-size:9px;">▼</span>';
  }
}

function buildGanttBars() {
  if (!window._ganttItemsAll) return '';
  const ganttItems = window._ganttItemsAll.filter(function(g) { return _ganttFilter[g.title]; });
  const todayStr = window._ganttTodayStr;
  const ganttStartMs = window._ganttStartMs;
  const ganttTotalDays = window._ganttTotalDays;
  const monthLabels = window._ganttMonthLabels || [];

  function ganttPct(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    const dayOffset = (d.getTime() - ganttStartMs) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.min(100, (dayOffset / ganttTotalDays) * 100));
  }
  const todayPct = ganttPct(todayStr);

  let html = '<div style="overflow-x:auto;"><div style="min-width:800px;position:relative;">';

  // Month header — offset to align with timeline track (past label column)
  html += '<div style="position:relative;height:32px;margin-bottom:4px;border-bottom:1px solid var(--border);margin-left:280px;">';
  monthLabels.forEach(function(m) {
    html += '<span style="position:absolute;left:' + m.pct + '%;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;transform:translateX(-50%);white-space:nowrap;">' + m.label + '</span>';
  });
  html += '</div>';

  if (ganttItems.length === 0) {
    html += '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:12px;">No projects selected. Use the checkboxes above to show projects.</div>';
  }

  // Group by role: Leading first, then Contributing, then Reviewing
  var roleOrder = ['Leading', 'Contributing', 'Reviewing'];
  var roleStyles = {
    'Leading': { color: 'var(--pill-blue-fg)', bg: 'var(--pill-blue-bg)', border: '#185FA5' },
    'Contributing': { color: 'var(--text-muted)', bg: 'var(--surface-2)', border: '#888780' },
    'Reviewing': { color: 'var(--pill-purple-fg)', bg: 'var(--pill-purple-bg)', border: '#534AB7' }
  };
  var hasMultipleRoles = roleOrder.filter(function(r) { return ganttItems.some(function(g) { return g.role === r; }); }).length > 1;

  // Rows
  // Project accent colors for visual distinction
  // Per-project accent (title text + left border). Dark theme uses lightened
  // variants so the dark navy/magenta/teal titles stay legible on the dark rows.
  var _ganttDark = (typeof document !== 'undefined' && document.body && document.body.dataset.theme === 'dark');
  var GANTT_ACCENT_COLORS = _ganttDark
    ? ['#6E9BD6', '#E66FA8', '#E8845C', '#4DA3FF', '#A8CC4A', '#A899D6', '#E5D086', '#4FB89A']
    : ['#002669', '#9E0059', '#C24200', '#0088FF', '#83AC16', '#140233', '#E5D086', '#0F6E56'];
  var ganttProjIdx = 0;

  roleOrder.forEach(function(role) {
    var roleItems = ganttItems.filter(function(g) { return g.role === role; });
    if (roleItems.length === 0) return;
    var rs = roleStyles[role];
    if (hasMultipleRoles) {
      html += '<div style="border-left:4px solid ' + rs.border + ';padding:4px 10px;margin:8px 0 4px;background:' + rs.bg + ';font-size:12px;font-weight:700;color:' + rs.color + ';">' + role + ' (' + roleItems.length + ')</div>';
    }
    roleItems.forEach(function(g) {
    const accentColor = GANTT_ACCENT_COLORS[ganttProjIdx % GANTT_ACCENT_COLORS.length];
    const bandBg = ganttProjIdx % 2 === 0 ? 'var(--white)' : 'var(--surface-2)';
    ganttProjIdx++;
    const sc = STATUS_COLOR(g.status) || '#3B82F6';
    const leftPct = ganttPct(g.start || todayStr);
    const rightPct = ganttPct(g.end || todayStr);
    const barWidth = Math.max(1, rightPct - leftPct);
    const isOverdue = g.end && g.end < todayStr;
    const isCollapsed = !_ganttCollapsed[g.title];
    const hasTasks = g.tasks && g.tasks.length > 0;
    const arrow = hasTasks ? (isCollapsed ? '▶' : '▼') : '•';
    const arrowClick = hasTasks ? ' onclick="event.stopPropagation();toggleGanttCollapse(\'' + esc(g.title).replace(/'/g, "\\'") + '\')" style="cursor:pointer;margin-right:4px;font-size:9px;opacity:0.6;user-select:none;"' : ' style="margin-right:4px;font-size:7px;opacity:0.4;"';

    // Open project band container
    html += '<div style="background:' + bandBg + ';border-left:3px solid ' + accentColor + ';border-radius:0;">';

    html += '<div style="display:flex;align-items:flex-start;margin-bottom:0;min-height:28px;border-bottom:0.5px solid #E8E6DF;">';
    html += '<div style="width:280px;flex-shrink:0;display:flex;align-items:flex-start;gap:2px;padding:4px 0;padding-left:8px;">';
    html += '<span' + arrowClick + ' style="flex-shrink:0;margin-top:1px;">' + arrow + '</span>';
    html += '<span style="font-size:13px;font-weight:700;color:' + accentColor + ';cursor:pointer;line-height:1.3;" onclick="openProject(' + g.id + ')" title="' + esc(g.title) + '">' + esc(g.title) + '</span>';
    if (hasTasks) html += '<span style="font-size:10px;color:var(--text-muted);margin-left:4px;flex-shrink:0;margin-top:2px;">(' + g.tasks.length + ')</span>';
    html += '</div>';
    html += '<div style="flex:1;position:relative;height:20px;">';
    html += '<div style="position:absolute;left:' + leftPct + '%;width:' + barWidth + '%;height:100%;background:' + sc + ';border-radius:4px;opacity:0.85;' + (isOverdue ? 'outline:2px solid #EF4444;outline-offset:1px;' : '') + '" title="' + (g.start || '?') + ' → ' + (g.end || '?') + '"></div>';
    html += '</div></div>';

    if (!isCollapsed) {
      var viewUser = g._viewUser || '';
      // Sort: user's tasks first, then others; within each group sort by due date
      var sortedTasks = g.tasks.slice().sort(function(a, b) {
        var aIsMine = a.assignee === viewUser ? 0 : 1;
        var bIsMine = b.assignee === viewUser ? 0 : 1;
        if (aIsMine !== bIsMine) return aIsMine - bIsMine;
        var aEnd = a.working_due || a.due || '9999';
        var bEnd = b.working_due || b.due || '9999';
        return aEnd.localeCompare(bEnd);
      });
      sortedTasks.forEach(function(t, tIdx) {
      const tStart = t.start || g.start || todayStr;
      const tEnd = t.working_due || t.due || g.end || todayStr;
      const tLeftPct = ganttPct(tStart);
      const tRightPct = ganttPct(tEnd);
      const tWidth = Math.max(0.5, tRightPct - tLeftPct);
      const tOverdue = tEnd < todayStr;
      const tsc = STATUS_COLOR(t.status) || '#93C5FD';
      const isMine = t.assignee === viewUser;
      const isBlocked = isFeatureOn('dependencies') && hasIncompleteBlockers(t);
      const barOpacity = isMine ? '0.85' : '0.3';
      const labelStyle = isMine ? 'color:var(--text-body);font-weight:600;' : 'color:var(--text-muted);font-weight:400;opacity:0.7;';
      const blockedIcon = isBlocked ? '<svg class="icon" aria-hidden="true"><use href="#ph-lock"></use></svg> ' : '› ';
      const blockedBarStyle = isBlocked ? 'background:repeating-linear-gradient(45deg,' + tsc + ',' + tsc + ' 3px,transparent 3px,transparent 6px);' : 'background:' + tsc + ';';
      const isLastTask = tIdx === sortedTasks.length - 1;
      const taskBorder = isLastTask ? 'border-bottom:0.5px solid #E8E6DF;' : 'border-bottom:0.5px solid #F3F1EB;';

      html += '<div style="display:flex;align-items:flex-start;min-height:22px;' + taskBorder + '">';
      html += '<div style="width:280px;flex-shrink:0;font-size:12px;padding-left:24px;padding-right:8px;padding-top:3px;padding-bottom:3px;cursor:pointer;line-height:1.3;' + labelStyle + '" onclick="openTask(' + t.objectId + ')" title="' + esc(t.title) + (t.assignee ? ' (' + esc(t.assignee) + ')' : '') + (isBlocked ? ' [DEPS PENDING]' : '') + '">' + blockedIcon + esc(t.title) + '</div>';
      html += '<div style="flex:1;position:relative;height:14px;">';
      html += '<div style="position:absolute;left:' + tLeftPct + '%;width:' + tWidth + '%;height:100%;' + blockedBarStyle + 'border-radius:3px;opacity:' + barOpacity + ';' + (tOverdue && isMine ? 'outline:2px solid #EF4444;outline-offset:1px;' : '') + '" title="' + esc(t.title) + (t.assignee ? ' (' + esc(t.assignee) + ')' : '') + ' ' + tStart + ' → ' + tEnd + (isBlocked ? ' [DEPS PENDING]' : '') + '"></div>';
      html += '</div></div>';
    });
    } // end if (!isCollapsed)

    html += '</div>'; // close project band container
    html += '<div style="height:6px;"></div>';
  });
  }); // end roleOrder.forEach

  // Today marker
  if (todayPct > 0 && todayPct < 100) {
    // Vertical line starts at the gray border (32px) and extends to bottom
    html += '<div style="position:absolute;top:32px;bottom:0;left:calc(280px + (100% - 280px) * ' + (todayPct / 100) + ');width:2px;background:#EF4444;opacity:0.6;pointer-events:none;z-index:5;"></div>';
    // Label sits between month text and the gray border line
    html += '<div style="position:absolute;top:15px;left:calc(280px + (100% - 280px) * ' + (todayPct / 100) + ');transform:translateX(-50%);font-size:9px;font-weight:800;color:#EF4444;pointer-events:none;z-index:6;">TODAY</div>';
  }

  html += '</div></div>'; // min-width + overflow wrappers
  // Legend
  html += '<div style="display:flex;gap:16px;margin-top:8px;padding-top:8px;border-top:1px solid #E8E6DF;font-size:11px;color:var(--text-muted);flex-wrap:wrap;">';
  html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:12px;height:8px;border-radius:2px;background:#83AC16;opacity:0.85;display:inline-block;"></span> Your tasks</span>';
  html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:12px;height:8px;border-radius:2px;background:#83AC16;opacity:0.3;display:inline-block;"></span> Other members\' tasks</span>';
  if (isFeatureOn('dependencies')) html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:12px;height:8px;border-radius:2px;background:repeating-linear-gradient(45deg,#83AC16,#83AC16 2px,transparent 2px,transparent 4px);display:inline-block;"></span> <svg class="icon" aria-hidden="true"><use href="#ph-lock"></use></svg> Deps pending</span>';
  html += '</div>';
  return html;
}

function effectiveDue(t) { return t.working_due || t.due || null; }
function effectiveEnd(p) { return p.working_due || p.end || null; }

// Render a single task line in the My Week section. Columns are
// padded/aligned so every row lines up — empty priority or due slots
// still reserve their width so the status pill never wobbles.
//   • status dot    (8px)
//   • title         (flex:1, ellipsis)
//   • priority      (52px, right-aligned)
//   • due date      (76px, right-aligned)
//   • status pill   (72px, right-aligned)
function _mwTaskLineHtml(t) {
  var sc = STATUS_COLOR(t.status);
  var dueStr = t.working_due || t.due || '';
  var todayStr = new Date().toISOString().slice(0, 10);
  var isOverdue = dueStr && dueStr < todayStr && t.status !== 'Complete';
  var isComplete = t.status === 'Complete';

  // Priority slot — reserve width even when empty.
  var priInner = '';
  if (t.priority) {
    var priBg = t.priority === 'High' ? '#FCEBEB' : t.priority === 'Medium' ? '#FAEEDA' : '#EAF3DE';
    var priColor = t.priority === 'High' ? '#791F1F' : t.priority === 'Medium' ? '#633806' : '#27500A';
    priInner = '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:' + priBg + ';color:' + priColor + ';">' + esc(t.priority) + '</span>';
  }
  var priHtml = '<span style="display:inline-flex;justify-content:flex-end;min-width:52px;flex-shrink:0;">' + priInner + '</span>';

  // Due slot — reserve width even when empty.
  var dueInner = '';
  if (dueStr) dueInner = (isOverdue ? '<svg class="icon" aria-hidden="true"><use href="#ph-warning"></use></svg> ' : '') + esc(dueStr);
  else dueInner = '<span style="color:#D1D5DB;">—</span>';
  var dueColor = isOverdue ? '#EF4444' : 'var(--text-muted)';
  var dueHtml = '<span class="pt-due" style="display:inline-flex;justify-content:flex-end;min-width:76px;flex-shrink:0;font-size:10px;color:' + dueColor + ';white-space:nowrap;">' + dueInner + '</span>';

  // Status pill — reuses Option B styling. Always shown.
  var pillBg = '#F3F4F6', pillColor = '#374151', pillLabel = t.status || '—';
  if (t.status === 'Active')               { pillBg = '#DCFCE7'; pillColor = '#166534'; pillLabel = 'Active'; }
  else if (t.status === 'On Hold')         { pillBg = '#FEF3C7'; pillColor = '#92400E'; pillLabel = 'On Hold'; }
  else if (t.status === 'Waiting for Response') { pillBg = '#DBEAFE'; pillColor = '#1E40AF'; pillLabel = 'Waiting'; }
  else if (t.status === 'Complete')        { pillBg = '#E0F2FE'; pillColor = '#0C4A6E'; pillLabel = '✓ Done'; }
  var pillHtml = '<span style="display:inline-flex;justify-content:flex-end;min-width:72px;flex-shrink:0;">' +
    '<span class="status-pill" data-status="' + esc(t.status || '') + '" style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:8px;background:' + pillBg + ';color:' + pillColor + ';text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;">' + esc(pillLabel) + '</span>' +
    '</span>';

  // Completed tasks render with reduced opacity (no strikethrough — that
  // reads as 'canceled'). The "Recently done" subheader above the group
  // is the primary signal that these are completed.
  var lineStyle = isComplete ? 'opacity:0.7;' : '';
  return '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px 4px 24px;cursor:pointer;font-size:11px;border-bottom:0.5px solid #F3F1EB;' + lineStyle + '" onclick="event.stopPropagation();openTask(' + t.objectId + ')">' +
    '<span style="width:6px;height:6px;border-radius:50%;background:' + sc + ';flex-shrink:0;"></span>' +
    '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-body);">' + esc(t.title) + '</span>' +
    priHtml + dueHtml + pillHtml +
  '</div>';
}

// ── Dependency helpers (behind isFeatureOn('dependencies') flag) ──────────
function parseBlockedBy(t) {
  if (!isFeatureOn('dependencies') || !t.blocked_by) return [];
  return t.blocked_by.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function findTaskByNumber(taskNum) {
  return TASKS.find(function(t) { return t.task_number === taskNum; });
}

function findProjectByNumber(projNum) {
  return PROJECTS.find(function(p) { return p.project_number === projNum; });
}

// Resolve a dependency reference to either a task or project object
function resolveDependency(ref) {
  if (isProjectRef(ref)) {
    var proj = findProjectByNumber(ref);
    return proj ? { type: 'project', obj: proj, num: ref } : null;
  } else {
    var task = findTaskByNumber(ref);
    return task ? { type: 'task', obj: task, num: ref } : null;
  }
}

function getBlockingTasks(taskNumber) {
  if (!isFeatureOn('dependencies') || !taskNumber) return [];
  return TASKS.filter(function(t) {
    var blockers = parseBlockedBy(t);
    return blockers.indexOf(taskNumber) >= 0;
  });
}

// Also find tasks that depend on a project number
function getBlockingByProject(projectNumber) {
  if (!isFeatureOn('dependencies') || !projectNumber) return [];
  return TASKS.filter(function(t) {
    var blockers = parseBlockedBy(t);
    return blockers.indexOf(projectNumber) >= 0;
  });
}

function hasIncompleteBlockers(t) {
  var blockers = parseBlockedBy(t);
  if (!blockers.length) return false;
  return blockers.some(function(ref) {
    var dep = resolveDependency(ref);
    if (!dep) return false;
    if (dep.type === 'project') return dep.obj.status !== 'Complete' && dep.obj.status !== 'Canceled';
    return dep.obj.status !== 'Complete' && dep.obj.status !== 'Canceled';
  });
}

function getDependencyIcon(t) {
  if (!isFeatureOn('dependencies')) return '';
  var blockedBy = parseBlockedBy(t);
  var blocking = getBlockingTasks(t.task_number);
  if (!blockedBy.length && !blocking.length) return '';
  var hasIncomplete = hasIncompleteBlockers(t);
  if (hasIncomplete) return '<span title="Has unresolved dependencies" style="cursor:help;font-size:12px;"><svg class="icon" aria-hidden="true"><use href="#ph-lock"></use></svg></span>';
  if (blockedBy.length && !hasIncomplete) return '<span title="All dependencies resolved" style="cursor:help;font-size:12px;"><svg class="icon" aria-hidden="true"><use href="#ph-lock-open"></use></svg></span>';
  if (blocking.length) return '<span title="Required by ' + blocking.length + ' task(s)" style="cursor:help;font-size:12px;"><svg class="icon" aria-hidden="true"><use href="#ph-link"></use></svg></span>';
  return '';
}

// ── Dependency search picker for the task form ──────────────────
function refreshBlockerList(projectTitle, currentTaskNumber, currentBlockedBy) {
  if (!isFeatureOn('dependencies')) return;
  var container = document.getElementById('fm-blocked-by-list');
  if (!container) return;
  var selectedRefs = currentBlockedBy ? currentBlockedBy.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];

  // Store selected refs in a data attribute for retrieval
  container.setAttribute('data-selected', selectedRefs.join(','));

  var html = '';

  // Search/filter input
  html += '<div style="position:relative;margin-bottom:8px;">';
  html += '<span style="position:absolute;left:8px;top:7px;font-size:13px;color:var(--text-muted);pointer-events:none;"><svg class="icon" aria-hidden="true"><use href="#ph-magnifying-glass"></use></svg></span>';
  html += '<input type="text" id="dep-search-input" placeholder="Filter by number or name..." oninput="depFilterList()" style="width:100%;box-sizing:border-box;font-size:12px;padding:6px 8px 6px 28px;border:1px solid #E8E6DF;border-radius:6px;font-family:Lato,sans-serif;">';
  html += '</div>';

  // Full list of available projects and tasks (excluding Complete/Canceled)
  html += '<div id="dep-choices-list" style="max-height:280px;overflow-y:auto;border:1px solid #E8E6DF;border-radius:6px;">';

  // Projects section
  var availProjects = PROJECTS.filter(function(p) {
    return p.project_number && ['Complete', 'Canceled'].indexOf(p.status) < 0;
  }).sort(function(a, b) { return (a.project_number || '').localeCompare(b.project_number || ''); });

  if (availProjects.length > 0) {
    html += '<div class="dep-group-hdr" style="font-size:10px;font-weight:700;color:var(--text-muted);padding:5px 8px;background:var(--bg-surface,#F3F1EB);border-bottom:0.5px solid #E8E6DF;letter-spacing:0.04em;position:sticky;top:0;z-index:1;">PROJECTS</div>';
    availProjects.forEach(function(p) {
      var checked = selectedRefs.indexOf(p.project_number) >= 0 ? ' checked' : '';
      var sc = STATUS_COLOR(p.status);
      html += '<label data-ref="' + esc(p.project_number) + '" data-search="' + esc((p.project_number + ' ' + p.title).toLowerCase()) + '" style="display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:pointer;font-size:12px;border-bottom:0.5px solid #F3F1EB;" onmouseenter="this.style.background=\'#F0F4FF\'" onmouseleave="this.style.background=\'transparent\'">';
      html += '<input type="checkbox" value="' + esc(p.project_number) + '"' + checked + ' onchange="depToggleChoice(this)" style="width:14px;height:14px;flex-shrink:0;">';
      html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#E6F1FB;color:#0C447C;flex-shrink:0;font-weight:700;">P</span>';
      html += '<span style="font-family:monospace;font-size:10px;color:var(--text-muted);min-width:45px;">' + esc(p.project_number) + '</span>';
      html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.title) + '</span>';
      html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + sc + '18;color:' + sc + ';flex-shrink:0;">' + esc(p.status) + '</span>';
      html += '</label>';
    });
  }

  // Tasks section — grouped by project
  var availTasks = TASKS.filter(function(t) {
    return t.task_number && t.task_number !== currentTaskNumber && ['Complete', 'Canceled'].indexOf(t.status) < 0;
  }).sort(function(a, b) { return (a.task_number || '').localeCompare(b.task_number || ''); });

  var tasksByProject = {};
  availTasks.forEach(function(t) {
    var proj = getTaskProjectTitle(t) || '(no project)';
    if (!tasksByProject[proj]) tasksByProject[proj] = [];
    tasksByProject[proj].push(t);
  });

  Object.keys(tasksByProject).sort().forEach(function(projName) {
    var projObj = _PROJECTS_BY_TITLE && _PROJECTS_BY_TITLE[projName.toLowerCase()];
    var projNum = projObj ? projObj.project_number : '';
    html += '<div class="dep-group-hdr" data-search-group="' + esc(projName.toLowerCase()) + '" style="font-size:10px;font-weight:700;color:var(--text-muted);padding:5px 8px;background:var(--bg-surface,#F3F1EB);border-bottom:0.5px solid #E8E6DF;letter-spacing:0.04em;position:sticky;top:0;z-index:1;">TASKS — ' + esc(projName) + (projNum ? ' (' + projNum + ')' : '') + '</div>';
    tasksByProject[projName].forEach(function(t) {
      var checked = selectedRefs.indexOf(t.task_number) >= 0 ? ' checked' : '';
      var sc = STATUS_COLOR(t.status);
      html += '<label data-ref="' + esc(t.task_number) + '" data-search="' + esc((t.task_number + ' ' + t.title + ' ' + projName).toLowerCase()) + '" style="display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:pointer;font-size:12px;border-bottom:0.5px solid #F3F1EB;" onmouseenter="this.style.background=\'#F0F4FF\'" onmouseleave="this.style.background=\'transparent\'">';
      html += '<input type="checkbox" value="' + esc(t.task_number) + '"' + checked + ' onchange="depToggleChoice(this)" style="width:14px;height:14px;flex-shrink:0;">';
      html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#FAEEDA;color:#633806;flex-shrink:0;font-weight:700;">T</span>';
      html += '<span style="font-family:monospace;font-size:10px;color:var(--text-muted);min-width:70px;">' + esc(t.task_number) + '</span>';
      html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.title) + '</span>';
      html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + sc + '18;color:' + sc + ';flex-shrink:0;">' + esc(t.status) + '</span>';
      html += '</label>';
    });
  });

  html += '</div>';
  container.innerHTML = html;
}

function depFilterList() {
  var input = document.getElementById('dep-search-input');
  var q = input ? input.value.toLowerCase() : '';
  var items = document.querySelectorAll('#dep-choices-list label[data-search]');
  var groupHeaders = document.querySelectorAll('#dep-choices-list .dep-group-hdr');

  // Track which groups have visible items
  var visibleGroups = {};

  items.forEach(function(el) {
    var match = !q || el.getAttribute('data-search').indexOf(q) >= 0;
    el.style.display = match ? 'flex' : 'none';
    // Find the preceding group header
    var prev = el.previousElementSibling;
    while (prev && !prev.classList.contains('dep-group-hdr')) prev = prev.previousElementSibling;
    if (prev && match) visibleGroups[prev.textContent] = true;
  });

  // Show/hide group headers based on whether they have visible items
  groupHeaders.forEach(function(hdr) {
    hdr.style.display = visibleGroups[hdr.textContent] ? 'block' : 'none';
  });
}

function depToggleChoice(checkbox) {
  // No need to rebuild — checkboxes manage their own state
  // Just update the data-selected attribute for retrieval
}

function depGetCurrentRefs() {
  var refs = [];
  document.querySelectorAll('#dep-choices-list input[type="checkbox"]:checked').forEach(function(cb) {
    refs.push(cb.value);
  });
  return refs;
}

// ── Inline attention badge helpers ─────────────────────────────────
function getProjectAlerts(p, todayStr, userName) {
  var alerts = [];
  var today = new Date();
  var d = effectiveEnd(p);
  if (d && d < todayStr && ['Active', 'Scheduled'].indexOf(p.status) >= 0) {
    var daysOver = Math.ceil((today - new Date(d + 'T00:00:00')) / 86400000);
    alerts.push({ text: daysOver + 'd overdue', cls: 'mw-att-red', severity: 0 });
  } else if (d && ['Active', 'Scheduled'].indexOf(p.status) >= 0) {
    var daysLeft = Math.ceil((new Date(d + 'T00:00:00') - today) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 7) {
      alerts.push({ text: daysLeft === 0 ? 'Due today' : 'Due in ' + daysLeft + 'd', cls: 'mw-att-yellow', severity: 1 });
    }
  }
  // Ready to activate — Future/Scheduled projects past their start date
  if ((p.status === 'Future' || p.status === 'Scheduled') && p.start) {
    var startDate = new Date(p.start + 'T00:00:00');
    if (startDate <= today) {
      var daysPast = Math.floor((today - startDate) / 86400000);
      alerts.push({ text: daysPast === 0 ? 'Ready to activate' : 'Start was ' + daysPast + 'd ago', cls: 'mw-att-yellow', severity: 1 });
    }
  }
  if (['Active', 'Scheduled', 'On Hold'].indexOf(p.status) >= 0) {
    var missing = [];
    if (!p.description) missing.push('description');
    if (!p.end) missing.push('end date');
    if (!p.category) missing.push('category');
    if (!p.problem_statement) missing.push('problem statement');
    if (missing.length > 0) alerts.push({ text: 'Missing: ' + missing.join(', '), cls: 'mw-att-gray', severity: 2 });
    // Strategic alignment alerts (only for editors viewing their own lead projects)
    if (isStrategicAlignmentEditor() && p.contact === userName) {
      var sMissing = [];
      if (!p.it_initiative) sMissing.push('IT Initiative');
      if (!p.city_initiative) sMissing.push('City Initiative');
      if (!p.wwc_practice) sMissing.push('WWC Practice');
      if (sMissing.length > 0) alerts.push({ text: 'Alignment: ' + sMissing.join(', '), cls: 'mw-att-gray', severity: 3 });
    }
  }
  return alerts;
}

function getTaskAlerts(t, todayStr) {
  var alerts = [];
  var d = effectiveDue(t);
  if (d && d < todayStr && ['Active', 'Waiting for Response'].indexOf(t.status) >= 0) {
    var daysOver = Math.ceil((new Date() - new Date(d + 'T00:00:00')) / 86400000);
    alerts.push({ text: daysOver + 'd overdue', cls: 'mw-att-red', severity: 0 });
  } else if (d && ['Active', 'Waiting for Response'].indexOf(t.status) >= 0) {
    var daysLeft = Math.ceil((new Date(d + 'T00:00:00') - new Date()) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 7) {
      alerts.push({ text: daysLeft === 0 ? 'Due today' : 'Due in ' + daysLeft + 'd', cls: 'mw-att-yellow', severity: 1 });
    }
  }
  // Active task with unresolved dependencies
  if (isFeatureOn('dependencies') && t.status === 'Active' && hasIncompleteBlockers(t)) {
    alerts.push({ text: 'Deps pending', cls: 'mw-att-red', severity: 0 });
  }
  if (['Active', 'Pending', 'Waiting for Response'].indexOf(t.status) >= 0) {
    var missing = [];
    if (!t.description) missing.push('description');
    if (!t.due && t.status === 'Active') missing.push('due date');
    if (!t.start && t.status === 'Active') missing.push('start date');
    if (!t.category) missing.push('category');
    if (missing.length > 0) alerts.push({ text: 'Missing: ' + missing.join(', '), cls: 'mw-att-gray', severity: 2 });
  }
  return alerts;
}

function renderAttBadges(alerts) {
  if (!alerts.length) return '';
  return '<div class="mw-att-row">' + alerts.map(function(a) { return '<span class="mw-att-badge ' + a.cls + '">' + esc(a.text) + '</span>'; }).join('') + '</div>';
}

function attBorderClass(alerts) {
  if (!alerts.length) return '';
  var minSev = alerts.reduce(function(m, a) { return Math.min(m, a.severity); }, 99);
  if (minSev === 0) return ' mw-att-border-red';
  if (minSev === 1) return ' mw-att-border-yellow';
  return ' mw-att-border-gray';
}

function buildMyWorkTaskRow(t, statusColor, status, todayStr, hrsLabelFn) {
  const eDue = effectiveDue(t);
  const isOverdue = eDue && eDue < todayStr;
  const tHrs = getTaskHours(t.idx);
  const mHrs = hrsLabelFn ? hrsLabelFn(t.idx) : getMyTaskHours(t.idx);
  const taskAlerts = getTaskAlerts(t, todayStr);
  let out = '<div class="mywork-compact-row' + attBorderClass(taskAlerts) + '">';
  out += '<select class="mw-status-select" data-type="task" data-id="' + t.objectId + '" onchange="mwQuickStatus(this)" onclick="event.stopPropagation()" style="background:' + statusColor + '18;color:' + statusColor + ';border-color:' + statusColor + '44;">';
  ['Active', 'Pending', 'On Hold', 'Waiting for Response', 'Complete', 'Canceled'].forEach(function(s) {
    out += '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + s + '</option>';
  });
  out += '</select>';
  out += '<span class="mywork-compact-title" onclick="openTask(' + t.objectId + ')" style="cursor:pointer;">' + projectNumChip(t.task_number) + esc(t.title);
  var _projTitle = getTaskProjectTitle(t);
  if (_projTitle) out += '<span style="display:block;font-size:11px;font-weight:400;color:var(--text-muted);margin-top:1px;">' + esc(_projTitle) + '</span>';
  out += renderAttBadges(taskAlerts);
  out += '</span>';
  if (tHrs > 0) {
    out += '<span class="mywork-hrs-badge">\u23f1 ' + hoursLabel(tHrs, mHrs) + '</span>';
  }
  if (eDue) {
    out += '<span style="font-size:11px;font-weight:600;white-space:nowrap;color:' + (isOverdue ? '#EF4444' : 'var(--text-muted)') + ';">' + (isOverdue ? '\u26a0 ' : '') + eDue + '</span>';
  }
  out += '</div>';
  return out;
}

function buildMyWorkTasksSection(myTasks, todayStr, viewUserTaskHrsFn) {
  let html = '<div>';
  html += '<div class="mywork-section" id="mw-tasks">';

  const tasksByStatus = {};
  myTasks.forEach(function(t) {
    const s = t.status || 'Unknown';
    if (!tasksByStatus[s]) tasksByStatus[s] = [];
    tasksByStatus[s].push(t);
  });
  const pendingCount = (tasksByStatus['Pending'] || []).length;
  const onHoldCount = (tasksByStatus['On Hold'] || []).length;
  const completeCount = (tasksByStatus['Complete'] || []).length;
  const canceledCount = (tasksByStatus['Canceled'] || []).length;
  const hiddenCount = pendingCount + onHoldCount + completeCount + canceledCount;

  html += '<div class="mywork-section-header" style="justify-content:space-between;flex-wrap:wrap;">'+
    '<div style="display:flex;align-items:center;gap:6px;"><svg class="icon" aria-hidden="true"><use href="#ph-check-circle"></use></svg> My Tasks <span class="badge-count">' + myTasks.length + '</span>' +
    '<button onclick="mwNewTask()" style="padding:3px 8px;border-radius:4px;border:1px solid #C24200;background:transparent;cursor:pointer;font-family:Lato,sans-serif;font-size:10px;font-weight:700;color:#C24200;line-height:1;">＋ New</button>' +
    '</div>';

  // Task-specific alert counts
  var taskOverdue = myTasks.filter(function(t) {
    var d = t.working_due || t.due;
    return d && d < todayStr && ['Active', 'Waiting for Response', 'On Hold'].indexOf(t.status) >= 0;
  }).length;
  var taskDueSoon = myTasks.filter(function(t) {
    var d = t.working_due || t.due;
    if (!d || d < todayStr) return false;
    var daysLeft = Math.ceil((new Date(d + 'T00:00:00') - new Date()) / 86400000);
    return daysLeft >= 0 && daysLeft <= 7 && ['Active', 'Waiting for Response'].indexOf(t.status) >= 0;
  }).length;
  var taskMissing = myTasks.filter(function(t) {
    return ['Active', 'Pending', 'Waiting for Response'].indexOf(t.status) >= 0 && getTaskAlerts(t, todayStr).some(function(a) { return a.cls === 'mw-att-gray'; });
  }).length;
  if (taskOverdue + taskDueSoon + taskMissing > 0) {
    var _mwDark1 = (typeof document !== 'undefined' && document.body && document.body.dataset.theme === 'dark');
    var attTxt1 = _mwDark1 ? { over:'#FCA5A5', due:'#EBCF77', miss:'#9AA2AC' } : { over:'#791F1F', due:'#92400E', miss:'#5F5E5A' };
    html += '<div style="display:flex;gap:10px;font-size:10px;font-weight:700;">';
    if (taskOverdue > 0) html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#E24B4A;display:inline-block;"></span><span style="color:' + attTxt1.over + ';">' + taskOverdue + ' overdue</span></span>';
    if (taskDueSoon > 0) html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#EF9F27;display:inline-block;"></span><span style="color:' + attTxt1.due + ';">' + taskDueSoon + ' due soon</span></span>';
    if (taskMissing > 0) html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#B4B2A9;display:inline-block;"></span><span style="color:' + attTxt1.miss + ';">' + taskMissing + ' missing</span></span>';
    html += '</div>';
  }
  html += '</div>';

  const defaultStatuses = ['Active', 'Waiting for Response'];
  let hasTasks = false;
  defaultStatuses.forEach(function(status) {
    const list = tasksByStatus[status];
    if (!list || !list.length) return;
    hasTasks = true;
    list.sort(function(a, b) {
      var aAlerts = getTaskAlerts(a, todayStr);
      var bAlerts = getTaskAlerts(b, todayStr);
      var aMin = aAlerts.length ? aAlerts.reduce(function(m, x) { return Math.min(m, x.severity); }, 99) : 99;
      var bMin = bAlerts.length ? bAlerts.reduce(function(m, x) { return Math.min(m, x.severity); }, 99) : 99;
      if (aMin !== bMin) return aMin - bMin;
      return (a.due || '9999').localeCompare(b.due || '9999');
    });
    const statusColor = STATUS_COLOR(status);
    html += '<div class="mywork-status-header" style="color:' + statusColor + ';">' + esc(status) + ' (' + list.length + ')</div>';
    list.forEach(function(t) { html += buildMyWorkTaskRow(t, statusColor, status, todayStr, viewUserTaskHrsFn); });
  });

  if (!hasTasks && hiddenCount === 0) {
    html += '<div class="mywork-empty">No tasks assigned to you.</div>';
  }

  const expandStatuses = ['Pending', 'On Hold'];
  const expandItems = expandStatuses.filter(function(s) { return tasksByStatus[s] && tasksByStatus[s].length > 0; });
  if (expandItems.length > 0) {
    const expandLabel = expandItems.map(function(s) { return s + ' (' + tasksByStatus[s].length + ')'; }).join(', ');
    html += '<div id="mywork-tasks-expand" style="display:none;">';
    expandItems.forEach(function(status) {
      const list = tasksByStatus[status];
      if (!list || !list.length) return;
      list.sort(function(a, b) {
        var aAlerts = getTaskAlerts(a, todayStr);
        var bAlerts = getTaskAlerts(b, todayStr);
        var aMin = aAlerts.length ? aAlerts.reduce(function(m, x) { return Math.min(m, x.severity); }, 99) : 99;
        var bMin = bAlerts.length ? bAlerts.reduce(function(m, x) { return Math.min(m, x.severity); }, 99) : 99;
        if (aMin !== bMin) return aMin - bMin;
        return (a.due || '9999').localeCompare(b.due || '9999');
      });
      const statusColor = STATUS_COLOR(status);
      html += '<div class="mywork-status-header" style="color:' + statusColor + ';">' + esc(status) + ' (' + list.length + ')</div>';
      list.forEach(function(t) { html += buildMyWorkTaskRow(t, statusColor, status, todayStr, null); });
    });
    html += '</div>';
    html += '<button class="mywork-expand-btn" id="mywork-tasks-toggle" onclick="toggleMyWorkTasks()">' +
      'Show more (' + expandLabel + ')' +
    '</button>';
  }

  html += '</div>';
  html += '</div>';
  return html;
}

function renderMyWork(area) {
  if (!Auth.fullName) {
    area.innerHTML = '<div class="empty-state">Sign in to see your personalized work view.</div>';
    return;
  }

  const viewUser = _myWorkViewUser || Auth.fullName;
  const isViewingSelf = viewUser === Auth.fullName;
  const name = viewUser;
  const firstName = name.split(' ')[0];
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // ── Gather data ─────────────────────────────────────────────
  const myProjects = getMyProjects(name);
  const myTasks = getMyTasks(name);
  // Helper: effective due date uses working_due when available, falls back to original due
  // (effectiveDue and effectiveEnd are now top-level functions)
  // Hours helpers scoped to viewed user
  const hrsLabel = isViewingSelf ? 'me' : firstName;
  function viewUserTaskHrs(idx) { return getMyTaskHours(idx, name); }
  function viewUserProjHrs(title) { return getMyProjectHours(title, name); }

  const activeProjects = myProjects.filter(function(p) { return p.status === 'Active' || p.status === 'Scheduled'; });
  const openTasks = myTasks.filter(function(t) { return ['Active', 'On Hold', 'Waiting for Response'].includes(t.status); });
  const attentionTasks = myTasks.filter(function(t) { return ['Active', 'Scheduled'].includes(t.status); });
  const overdueTasks = attentionTasks.filter(function(t) { var d = effectiveDue(t); return d && d < todayStr; });
  const overdueProjects = myProjects.filter(function(p) {
    if (['Active', 'Scheduled'].indexOf(p.status) < 0) return false;
    const d = effectiveEnd(p);
    return d && d < todayStr;
  });
  const dueThisWeek = attentionTasks.filter(function(t) {
    const d = effectiveDue(t);
    if (!d || d < todayStr) return false;
    const dueDate = new Date(d + 'T00:00:00');
    const daysOut = (dueDate - today) / (1000 * 60 * 60 * 24);
    return daysOut <= 7;
  });

  // ── Resources data for utilization ──────────────────────────
  let weekUtil = 0;
  let weekAllocHours = 0;
  let weekCapHours = 0;
  let weekAllocations = [];
  let myScheduleType = '5/8';
  let myRdoDay = null;
  let myPayWeek = '';
  let myScheduledHours = 40;
  let _weekDaily = null;   // function-scoped copy of per-day hours for the OE hero (myDailyHours below is block-scoped)
  if (RESOURCES_DATA && RESOURCES_DATA.people[name]) {
    const p = RESOURCES_DATA.people[name];
    const cwIdx = typeof currentWeekIdx !== 'undefined' ? currentWeekIdx : 0;
    weekCapHours = p.proj_cap[cwIdx] || 0;
    weekAllocHours = p.weekly_allocated[cwIdx] || 0;
    weekUtil = weekCapHours > 0 ? Math.round(weekAllocHours / weekCapHours * 100) : 0;
    myScheduleType = p.schedule_type || '5/8';
    myRdoDay = p.rdo_day || null;
    // Determine pay period week for current week
    if (RESOURCES_DATA.weeks && RESOURCES_DATA.weeks[cwIdx]) {
      const PAY_PERIOD_REF_MW = new Date('2025-12-28T00:00:00');
      const cwDate = new Date(RESOURCES_DATA.weeks[cwIdx] + 'T00:00:00');
      const diffDays = Math.round((cwDate - PAY_PERIOD_REF_MW) / (1000 * 60 * 60 * 24));
      myPayWeek = (Math.floor(diffDays / 7) % 2 === 0) ? 'A' : 'B';
    }
    myScheduledHours = (myPayWeek === 'A') ? (p.week1_hours || 40) : (p.week2_hours || 40);
    // Daily schedule for current week
    const prefix = (myPayWeek === 'A') ? 'wk1_' : 'wk2_';
    const myDailyHours = {
      Mon: p[prefix + 'mon'] || 0,
      Tue: p[prefix + 'tue'] || 0,
      Wed: p[prefix + 'wed'] || 0,
      Thu: p[prefix + 'thu'] || 0,
      Fri: p[prefix + 'fri'] || 0,
    };
    _weekDaily = myDailyHours;
    const myDailyTimes = {};
    ['Mon','Tue','Wed','Thu','Fri'].forEach(function(day) {
      const d = day.toLowerCase().slice(0, 3);
      const s = p.schedule ? p.schedule[prefix + d + '_start'] : null;
      const e = p.schedule ? p.schedule[prefix + d + '_end'] : null;
      myDailyTimes[day] = { start: s, end: e };
    });
    weekAllocations = (p.allocations || []).filter(function(a) {
      return a.fracs && a.fracs[cwIdx] > 0;
    }).map(function(a) {
      const hours = (a.fracs[cwIdx] || 0) * (p.proj_cap[cwIdx] || 0);
      return { project: a.project, hours: Math.round(hours * 10) / 10, frac: a.fracs[cwIdx] };
    }).sort(function(a, b) { return b.hours - a.hours; });
  }

  // ── Build HTML ──────────────────────────────────────────────
  // Sticky header sits outside mywork-page so it spans full content-area width
  let html = '';

  // ── Sticky header: greeting + date/picker + jump links ──────
  html += '<div class="mywork-sticky-header">';
  html += '<div class="mywork-sticky-inner">';

  // Greeting
  if (isViewingSelf) {
    html += '<div class="mywork-greeting">Good ' + (today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening') + ', ' + esc(firstName) + '</div>';
  } else {
    html += '<div class="mywork-greeting">Viewing ' + esc(name) + '\'s Work</div>';
  }

  // Admin user selector
  if (isAdmin() && RESOURCES_DATA && RESOURCES_DATA.people) {
    const memberNames = Object.keys(RESOURCES_DATA.people).filter(function(n) { return isFullMember(n) && (typeof inCurrentTeamPerson !== 'function' || inCurrentTeamPerson(n)); }).sort();
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:0;">';
    html += '<div class="mywork-subtitle" style="margin-bottom:0;">' + today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '</div>';
    html += '<select onchange="switchMyWorkUser(this)" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--white);color:var(--navy);font-weight:600;cursor:pointer;">';
    memberNames.forEach(function(n) {
      const selected = (n === name) ? ' selected' : '';
      const label = (n === Auth.fullName) ? n + ' (me)' : n;
      html += '<option value="' + esc(n) + '"' + selected + '>' + esc(label) + '</option>';
    });
    html += '</select>';
    if (!isViewingSelf) {
      html += '<button onclick="switchMyWorkUser({value:\'' + esc(Auth.fullName).replace(/'/g, "\\'") + '\'})" style="font-size:11px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);cursor:pointer;font-weight:600;">← Back to My Work</button>';
    }
    html += '</div>';
  } else {
    html += '<div class="mywork-subtitle" style="margin-bottom:0;">' + today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + '</div>';
  }

  // Quick preview: count gantt-eligible projects for nav link visibility
  const ganttItems_preview = myProjects.filter(function(p) {
    if (['Active', 'On Hold', 'Scheduled'].indexOf(p.status) < 0) return false;
    return p.start || p.actual_end || p.working_due || p.end;
  });

  // ── Jump links nav bar ───────────────────────────────────────
  const jumpLinks = [];
  if (isViewingSelf && isTimeTrackingEnabled()) jumpLinks.push({ id: 'mw-time-tracking', label: '<svg class="icon" aria-hidden="true"><use href="#ph-clock"></use></svg> Time' });
  jumpLinks.push({ id: 'mw-my-week', label: '<svg class="icon" aria-hidden="true"><use href="#ph-calendar-blank"></use></svg> Week' });
  if (ganttItems_preview.length > 0) jumpLinks.push({ id: 'mw-timeline', label: '<svg class="icon" aria-hidden="true"><use href="#ph-chart-bar"></use></svg> Timeline' });
  jumpLinks.push({ id: 'mw-projects', label: '<svg class="icon" aria-hidden="true"><use href="#ph-folder"></use></svg> Projects & Tasks' });
  html += '<div class="mywork-jump-nav">';
  html += '<a href="#" class="mywork-jump-link" onclick="event.preventDefault();window.scrollTo({top:0,behavior:\'smooth\'});">↑ Top</a>';
  jumpLinks.forEach(function(link) {
    var extraAction = link.id === 'mw-timeline' ? 'expandGantt();' : '';
    html += '<a href="#' + link.id + '" class="mywork-jump-link" onclick="event.preventDefault();' + extraAction + 'var el=document.getElementById(\'' + link.id + '\');if(el){var sh=document.querySelector(\'.mywork-sticky-header\');var offset=64+49+(sh?sh.offsetHeight:0)+10;var y=el.getBoundingClientRect().top+window.pageYOffset-offset;window.scrollTo({top:y,behavior:\'smooth\'});}">' + link.label + '</a>';
  });
  html += '</div>';

  html += '</div>'; // close mywork-sticky-inner
  html += '</div>'; // close mywork-sticky-header

  // ── All sections in constrained page ────────────────────────
  html += '<div class="mywork-page">';
  html += '<div class="mywork-columns">';

  // ── OE Redesign — "This week" hero + achievements at the top (above the
  //    time-tracking section). Replaces the full-width achievements panel and
  //    the in-place My Week strip under OE. Self-contained week-date math so it
  //    doesn't depend on vars computed lower in the function. ──
  var _oe = /^oe/.test((typeof document !== 'undefined' && document.body && document.body.dataset.theme) || '');
  if (_oe && _weekDaily) {   // shows for the viewed user too (admin view-as), like the rest of My Work
    var _hToday = new Date(), _hDow = _hToday.getDay() || 7;
    var _hMon = new Date(_hToday); _hMon.setDate(_hToday.getDate() - (_hDow - 1)); _hMon.setHours(0,0,0,0);
    var _hSun = new Date(_hMon); _hSun.setDate(_hMon.getDate() + 6);
    var _hM = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var _hLabel = (_hMon.getMonth() === _hSun.getMonth())
      ? _hM[_hMon.getMonth()] + ' ' + _hMon.getDate() + ' – ' + _hSun.getDate()
      : _hM[_hMon.getMonth()] + ' ' + _hMon.getDate() + ' – ' + _hM[_hSun.getMonth()] + ' ' + _hSun.getDate();
    var _hAvail = Math.max(0, weekCapHours - weekAllocHours);
    var _hAlloc = Math.round(weekAllocHours * 10) / 10, _hCap = Math.round(weekCapHours * 10) / 10;
    var _hKeys = ['Mon','Tue','Wed','Thu','Fri'], _hLbls = ['MON','TUE','WED','THU','FRI'], _hStrip = '';

    // ── Aggregate logged time for this week, per day, per project. Used to
    //    fill the empty .oe-week-bar tracks with stacked colored segments —
    //    one segment per project the user logged time on that day. ──
    function _hYmd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    var _hDateByKey = {};
    for (var _hzi = 0; _hzi < 5; _hzi++) {
      var _hzd = new Date(_hMon); _hzd.setDate(_hMon.getDate() + _hzi);
      _hDateByKey[_hYmd(_hzd)] = _hKeys[_hzi];
    }
    var _hTracked = { Mon: {}, Tue: {}, Wed: {}, Thu: {}, Fri: {} };
    var _hProjOrder = [];
    if (typeof TIME_ENTRIES !== 'undefined' && Array.isArray(TIME_ENTRIES)) {
      TIME_ENTRIES.forEach(function(e) {
        if (!e || !e.work_date || !e.hours) return;
        if (e.name && e.name !== name) return; // viewed user's entries only
        var k = _hDateByKey[e.work_date];
        if (!k) return;
        var pk = e.project_id != null ? String(e.project_id) : 'unknown';
        if (_hProjOrder.indexOf(pk) < 0) _hProjOrder.push(pk);
        _hTracked[k][pk] = (_hTracked[k][pk] || 0) + Number(e.hours || 0);
      });
    }
    function _hProjTitle(pk) {
      if (pk === 'unknown') return 'Untracked project';
      var p = (typeof PROJECTS !== 'undefined' && PROJECTS) ? PROJECTS.find(function(pr) { return String(pr.project_number) === pk; }) : null;
      return p && p.title ? p.title : 'Project ' + pk;
    }

    // Compute the bar's denominator as "average daily project hours" —
    // weekAllocHours spread evenly across this week's working days. Using the
    // scheduled workday (8h) would make the bar permanently empty for anyone
    // whose role is mostly meetings/admin (e.g. a manager with 10% project
    // time). This makes the fill reflect plan-vs-actual on project work.
    var _hWorkDays = 0;
    for (var _hwi = 0; _hwi < 5; _hwi++) {
      if ((_weekDaily && _weekDaily[_hKeys[_hwi]] || 0) > 0) _hWorkDays++;
    }
    var _hDailyTarget = _hWorkDays > 0 ? weekAllocHours / _hWorkDays : 0;

    for (var _hi = 0; _hi < 5; _hi++) {
      var _hd = new Date(_hMon); _hd.setDate(_hMon.getDate() + _hi);
      var _hh = (_weekDaily && _weekDaily[_hKeys[_hi]]) || 0, _hoff = _hh === 0;

      // Build the bar fill: track is full-width, fill is dayLogged / dailyTarget,
      // segments inside the fill are sized by each project's share of the day.
      var _dayMap = _hTracked[_hKeys[_hi]] || {};
      var _dayLogged = Object.values(_dayMap).reduce(function(s, v) { return s + v; }, 0);
      var _barTarget = _hoff ? 0 : _hDailyTarget;
      var _barFillPct = _barTarget > 0
        ? Math.min(100, (_dayLogged / _barTarget) * 100)
        : (_dayLogged > 0 ? 100 : 0); // saturate when there's logged time but no plan
      var _segs = '';
      if (_dayLogged > 0) {
        Object.keys(_dayMap).forEach(function(pk) {
          var hrs = _dayMap[pk];
          var pIdx = _hProjOrder.indexOf(pk);
          var color = pk === 'unknown' ? 'var(--data-other)' : 'var(--data-' + ((pIdx % 8) + 1) + ')';
          var segShare = (hrs / _dayLogged) * 100;
          _segs += '<div class="oe-week-bar-seg" style="width:' + segShare.toFixed(2) + '%;background:' + color + ';" title="' + esc(_hProjTitle(pk)) + ': ' + hrs.toFixed(1) + 'h"></div>';
        });
      }
      var _barTip = _dayLogged > 0
        ? _dayLogged.toFixed(1) + 'h logged · ' + (_barTarget > 0 ? '~' + _barTarget.toFixed(1) + 'h/day project target' : 'no project allocation this week')
        : (_barTarget > 0 ? '~' + _barTarget.toFixed(1) + 'h/day project target' : '');
      var _trackHtml = '<div class="oe-week-bar"' + (_barTip ? ' title="' + _barTip + '"' : '') + '><div class="oe-week-bar-fill" style="width:' + _barFillPct.toFixed(1) + '%;">' + _segs + '</div></div>';
      var _hrsLabel;
      if (_hoff) {
        _hrsLabel = 'OFF';
      } else if (_dayLogged > 0) {
        _hrsLabel = _dayLogged.toFixed(_dayLogged >= 10 ? 0 : 1) + 'h' + (_barTarget > 0 ? ' / ' + _barTarget.toFixed(1) + 'h' : '');
      } else {
        _hrsLabel = _barTarget > 0 ? _barTarget.toFixed(1) + 'h' : _hh + 'h';
      }

      _hStrip += '<div class="oe-week-day' + (_hoff ? ' off' : '') + '"><div class="oe-week-dayname">' + _hLbls[_hi] + ' ' + _hd.getDate() + '</div>' + _trackHtml + '<div class="oe-week-dayhrs">' + _hrsLabel + '</div></div>';
    }

    // Build a small project legend so users can see which color = which project.
    // Only shows when there's logged time to explain; skipped for empty weeks.
    var _hLegend = '';
    if (_hProjOrder.length > 0) {
      _hLegend = '<div class="oe-week-legend">' +
        _hProjOrder.slice(0, 6).map(function(pk, i) {
          var color = pk === 'unknown' ? 'var(--data-other)' : 'var(--data-' + ((i % 8) + 1) + ')';
          var title = _hProjTitle(pk);
          var label = title.length > 28 ? title.slice(0, 26) + '…' : title;
          return '<span class="oe-week-legend-item"><span class="oe-week-legend-dot" style="background:' + color + ';"></span>' + esc(label) + '</span>';
        }).join('') +
        (_hProjOrder.length > 6 ? '<span class="oe-week-legend-item" style="opacity:0.7;">+ ' + (_hProjOrder.length - 6) + ' more</span>' : '') +
      '</div>';
    }
    var _hHero = '<div class="oe-week-hero"><div class="oe-week-hero-row"><div>'
      + '<div class="oe-week-eyebrow">This week · ' + esc(_hLabel) + '</div>'
      + '<div class="oe-week-head">' + (weekAllocations.length === 0 ? 'No allocations <em>yet</em>.' : esc(_hAlloc) + 'h <span>allocated · ' + esc(Math.round(_hAvail * 10) / 10) + 'h available</span>') + '</div>'
      + '</div><div class="oe-week-hoursbox"><div class="oe-week-hoursnum">' + esc(_hAlloc) + '<span>/' + esc(_hCap) + 'h</span></div>'
      + '<div class="oe-week-eyebrow">' + esc(myScheduleType) + ' schedule' + (myPayWeek ? ' · Week ' + esc(myPayWeek) : '') + '</div></div></div>'
      + '<div class="oe-week-strip">' + _hStrip + '</div>' + _hLegend + '</div>';
    var _hAch = (typeof renderMyWeekAchievementsOE === 'function') ? renderMyWeekAchievementsOE(name) : '';
    html += '<div class="mywork-full-width oe-hero-grid">' + _hHero + _hAch + '</div>';
  }

  // ── Achievements panel — celebratory layer above operational KPIs (Classic) ──
  if (!_oe && typeof renderAchievementsPanel === 'function') {
    var ach = renderAchievementsPanel(name);
    if (ach) html += '<div class="mywork-full-width">' + ach + '</div>';
  }

  // ── KPIs — spans both columns ──────────────────────────────
  const utilClass = weekUtil > 100 ? 'alert' : weekUtil > 85 ? 'warn' : 'good';
  html += '<div class="mywork-kpis mywork-full-width">';
  html += '<div class="mywork-kpi"><div class="mywork-kpi-value">' + activeProjects.length + '</div><div class="mywork-kpi-label">Active Projects</div></div>';
  html += '<div class="mywork-kpi"><div class="mywork-kpi-value">' + openTasks.length + '</div><div class="mywork-kpi-label">Open Tasks</div></div>';
  const totalOverdue = overdueTasks.length + overdueProjects.length;
  html += '<div class="mywork-kpi"><div class="mywork-kpi-value' + (totalOverdue > 0 ? ' alert' : '') + '">' + totalOverdue + '</div><div class="mywork-kpi-label">Overdue' + calcInfoIcon('overdue') + '</div></div>';
  html += '<div class="mywork-kpi"><div class="mywork-kpi-value' + (dueThisWeek.length > 0 ? ' warn' : '') + '">' + dueThisWeek.length + '</div><div class="mywork-kpi-label">Due This Week</div></div>';
  html += '<div class="mywork-kpi"><div class="mywork-kpi-value ' + utilClass + '">' + weekUtil + '%</div><div class="mywork-kpi-label">Utilization' + calcInfoIcon('utilization') + '</div></div>';
  html += '</div>';

  // ── Time tracking reminder (gentle nudge if no time logged today) ──
  if (isViewingSelf && isTimeTrackingEnabled()) {
    var todayEntries = getTodayEntries();
    var activeTimers = getActiveTimers();
    if (todayEntries.length === 0 && activeTimers.length === 0) {
      html += '<div class="mywork-full-width" style="background:var(--pill-amber-bg);border:1px solid var(--pill-amber-bg);border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">';
      html += '<span style="font-size:16px;flex-shrink:0;">&#9201;</span>';
      html += '<div style="flex:1;"><span style="font-size:12px;font-weight:700;color:var(--pill-amber-fg);">No time logged today</span>';
      html += '<span style="font-size:12px;color:var(--pill-amber-fg);opacity:0.8;"> — Start a timer on one of your tasks to keep your records current.</span></div>';
      html += '</div>';
    }
  }

  // ── Time Tracking panel (only shown when viewing own work) ─────────
  if (isViewingSelf && isTimeTrackingEnabled()) {
    html += buildTimeTrackingPanel();
    startTimerTick();
  }

  // ── My Week — spans both columns ───────────────────────────
  // Current week bounds (Mon..Sun) — computed once and reused for both
  // the header date label and the "Recently done" filter below.
  var _today = new Date();
  var _dow = _today.getDay() || 7; // treat Sunday (0) as 7
  var _mon = new Date(_today); _mon.setDate(_today.getDate() - (_dow - 1));
  var _sun = new Date(_mon); _sun.setDate(_mon.getDate() + 6);
  function _ymd(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  var weekStartYmd = _ymd(_mon);
  var weekEndYmd = _ymd(_sun);
  var _months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var _weekLabel;
  if (_mon.getFullYear() === _sun.getFullYear() && _mon.getMonth() === _sun.getMonth()) {
    _weekLabel = _months[_mon.getMonth()] + ' ' + _mon.getDate() + '–' + _sun.getDate() + ', ' + _mon.getFullYear();
  } else if (_mon.getFullYear() === _sun.getFullYear()) {
    _weekLabel = _months[_mon.getMonth()] + ' ' + _mon.getDate() + ' – ' + _months[_sun.getMonth()] + ' ' + _sun.getDate() + ', ' + _mon.getFullYear();
  } else {
    _weekLabel = _months[_mon.getMonth()] + ' ' + _mon.getDate() + ', ' + _mon.getFullYear() + ' – ' + _months[_sun.getMonth()] + ' ' + _sun.getDate() + ', ' + _sun.getFullYear();
  }

  html += '<div class="mywork-section mywork-full-width" id="mw-my-week">';
  html += '<div class="mywork-section-header"><svg class="icon" aria-hidden="true"><use href="#ph-calendar-blank"></use></svg> My Week';
  html +=   '<span style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:none;letter-spacing:0.02em;margin-left:8px;">' + esc(_weekLabel) + '</span>';
  html += '</div>';
  if (!RESOURCES_DATA || !RESOURCES_DATA.people[name]) {
    html += '<div class="mywork-empty">Resource data not available. Sign in and ensure your name matches the team roster.</div>';
  } else {
    // Schedule summary line
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">';
    html += '<strong>' + esc(myScheduleType) + '</strong> schedule';
    if (myPayWeek) html += ' · Week ' + myPayWeek + ' (' + myScheduledHours + 'h)';
    if (myRdoDay) {
      const rdoThisWeek = myScheduleType === '9/80' ? (myPayWeek === 'B') : true;
      html += ' · RDO: ' + esc(myRdoDay) + (rdoThisWeek ? ' (this week)' : ' (next week)');
    }
    html += '</div>';

    // Daily hours bar (Tucson Classic — under OE the "This week" hero at the top
    // of the page shows the strip instead; _oe is set near the top of render).
    if (!_oe && typeof myDailyHours !== 'undefined') {
      function formatTimeCompact(t) {
        if (!t) return '';
        const parts = t.split(':');
        let h = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const ampm = h >= 12 ? 'p' : 'a';
        h = h % 12 || 12;
        return m > 0 ? h + ':' + (m < 10 ? '0' : '') + m + ampm : h + ampm;
      }
      html += '<div style="display:flex;gap:6px;margin-bottom:12px;">';
      ['Mon','Tue','Wed','Thu','Fri'].forEach(function(day) {
        const hrs = myDailyHours[day] || 0;
        const times = myDailyTimes ? myDailyTimes[day] : null;
        const isOff = hrs === 0;
        const bg = isOff ? '#F3F1EB' : 'var(--navy)';
        const color = isOff ? 'var(--text-muted)' : '#fff';
        let timeLabel = '';
        if (!isOff && times && times.start && times.end) {
          timeLabel = formatTimeCompact(times.start) + '–' + formatTimeCompact(times.end);
        }
        const hrsLabel = isOff ? 'OFF' : hrs + 'h';
        html += '<div style="flex:1;text-align:center;padding:6px 4px;background:' + bg + ';color:' + color + ';border-radius:6px;font-size:11px;font-weight:700;">';
        html += '<div style="font-size:10px;font-weight:600;opacity:0.7;margin-bottom:2px;">' + day + '</div>';
        html += hrsLabel;
        if (timeLabel) html += '<div style="font-size:9px;font-weight:500;opacity:0.7;margin-top:1px;">' + timeLabel + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (weekAllocations.length === 0) {
      html += '<div class="mywork-empty">No allocations recorded for this week.</div>';
    } else {
      const availableHours = Math.max(0, weekCapHours - weekAllocHours);
      if (!_oe) {  // OE shows allocated/capacity/available in the hero card above
        html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">';
        html += '<strong>' + Math.round(weekAllocHours * 10) / 10 + 'h</strong> allocated of <strong>' + Math.round(weekCapHours * 10) / 10 + 'h</strong> capacity' + calcInfoIcon('projCapacity');
        html += ' · <strong style="color:' + (availableHours > 0 ? '#22C55E' : '#EF4444') + ';">' + Math.round(availableHours * 10) / 10 + 'h</strong> available' + calcInfoIcon('availableHours');
        html += '</div>';
      }

      // weekStartYmd / weekEndYmd are computed once at the top of the
      // section (header label needs them too) and used here to narrow
      // the "Recently done" filter to tasks completed in this week only.

    weekAllocations.forEach(function(a) {
      const pct = weekCapHours > 0 ? (a.hours / weekCapHours * 100) : 0;
      const barColor = pct > 40 ? 'var(--navy)' : pct > 20 ? '#3B82F6' : '#93C5FD';
      const proj = PROJECTS.find(function(p) { return p.title === a.project; });
      const onclick = proj ? ' onclick="openProject(' + proj.objectId + ')"' : '';
      const cursor = proj ? 'pointer' : 'default';

      // Filter the user's recent tasks for this project. Split into
      // pending (Active / On Hold / Waiting) and completed-this-week.
      // The "missing tasks" warning fires only when BOTH lists are
      // empty — a project where everything is done this week isn't
      // missing work, it's a win, and we surface the done list instead.
      var weekTaskStatuses = ['Active', 'On Hold', 'Waiting for Response', 'Complete'];
      // Match tasks to the allocation by project_number (the canonical FK).
      // a.analytics_id was populated from project_number when the allocation
      // was loaded; proj.project_number is the source of truth if it disagrees.
      var allocProjNum = (proj && proj.project_number != null)
        ? String(proj.project_number)
        : (a.analytics_id != null ? String(a.analytics_id) : null);
      var weekTasks = (!allocProjNum) ? [] : TASKS.filter(function(t) {
        if (t.assignee !== name) return false;
        if (weekTaskStatuses.indexOf(t.status) < 0) return false;
        return t.project_number != null && String(t.project_number) === allocProjNum;
      }).sort(function(ta, tb) {
        var sa = ta.status === 'Complete' ? 1 : 0;
        var sb = tb.status === 'Complete' ? 1 : 0;
        if (sa !== sb) return sa - sb;
        var pa = { High: 0, Medium: 1, Low: 2 };
        return (pa[ta.priority] || 3) - (pa[tb.priority] || 3);
      });
      var pendingTasks = weekTasks.filter(function(t) { return t.status !== 'Complete'; });
      // "Recently done" = tasks completed during THIS WEEK (Mon..Sun),
      // not all-time. Tasks finished in earlier weeks shouldn't crowd
      // the row — they're celebrated in the Achievements tab.
      var doneTasks = weekTasks.filter(function(t) {
        if (t.status !== 'Complete') return false;
        if (!t.actual_end) return false;
        return t.actual_end >= weekStartYmd && t.actual_end <= weekEndYmd;
      });
      var allDoneThisWeek = pendingTasks.length === 0 && doneTasks.length > 0;
      var isMissingTasks = pendingTasks.length === 0 && doneTasks.length === 0;
      var rowCls = 'mywork-compact-row' + (isMissingTasks ? ' mw-missing-tasks' : '');
      // Wrap the allocation row + helpline + task lines in a single
      // .mw-project-group card so adjacent projects read as clearly
      // separated units rather than a flat list of rows.
      html += '<div class="mw-project-group">';
      html += '<div class="' + rowCls + '" style="cursor:' + cursor + ';"' + onclick + '>';
      html += '<span class="mywork-compact-title"><span style="font-size:10px;font-weight:700;color:var(--text-muted);margin-right:4px;">Project:</span>' + esc(a.project) + '</span>';
      html += '<span style="font-size:12px;font-weight:700;color:var(--navy);white-space:nowrap;min-width:50px;text-align:right;">' + a.hours + 'h</span>';
      html += '<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;min-width:35px;text-align:right;">' + Math.round(a.frac * 100) + '%</span>';
      html += '<div class="mywork-alloc-bar"><div class="mywork-alloc-fill" style="width:' + Math.min(100, pct) + '%;background:' + barColor + ';"></div></div>';
      html += '</div>';

      // Missing-tasks helpline — appears immediately below the flagged row.
      // Includes a one-click '＋ Add a task' affordance when the project
      // is resolvable from PROJECTS (it almost always is for allocations).
      if (isMissingTasks) {
        if (proj) {
          var safeTitle = esc(proj.title).replace(/'/g, "\\'");
          html += '<div class="mw-missing-tasks-helpline"><svg class="icon" aria-hidden="true"><use href="#ph-warning"></use></svg> No active tasks assigned to you on this project.';
          html += '<a href="javascript:void(0)" onclick="event.stopPropagation();addTaskToProject(' + proj.objectId + ', \'' + safeTitle + '\')">＋ Add a task</a>';
          html += '</div>';
        } else {
          html += '<div class="mw-missing-tasks-helpline"><svg class="icon" aria-hidden="true"><use href="#ph-warning"></use></svg> No active tasks assigned to you on this project.</div>';
        }
      }

      if (pendingTasks.length > 0 || doneTasks.length > 0) {
        pendingTasks.forEach(function(t) { html += _mwTaskLineHtml(t); });
        if (doneTasks.length > 0) {
          // When every task is done for the week, the header tints
          // green so the row reads as a win instead of a neutral
          // "here's some history" subhead.
          var doneHdrCls = allDoneThisWeek ? 'mw-done-header all-done' : 'mw-done-header';
          var doneHdrLabel = allDoneThisWeek ? '<svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg> All tasks completed this week' : '<svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg> Completed this Week';
          html += '<div class="' + doneHdrCls + '"><span>' + doneHdrLabel + '</span></div>';
          doneTasks.forEach(function(t) { html += _mwTaskLineHtml(t); });
        }
      }
      html += '</div>'; // close .mw-project-group
    });
    } // close else (has allocations)
  } // close else (has RESOURCES_DATA)
  html += '</div>';

  // ── LEFT COLUMN: My Projects ────────────────────────────────
  html += '<div>';
  html += '<div class="mywork-section" id="mw-projects">';

  // Project-specific alert counts
  var projOverdue = overdueProjects.length;
  var projDueSoon = myProjects.filter(function(p) {
    var d = p.working_due || p.end;
    if (!d || d < todayStr) return false;
    var daysLeft = Math.ceil((new Date(d + 'T00:00:00') - new Date()) / 86400000);
    return daysLeft >= 0 && daysLeft <= 7 && ['Active', 'On Hold', 'Waiting for Response'].indexOf(p.status) >= 0;
  }).length;
  var projMissing = myProjects.filter(function(p) {
    return ['Active', 'Scheduled', 'On Hold'].indexOf(p.status) >= 0 && getProjectAlerts(p, todayStr, name).some(function(a) { return a.cls === 'mw-att-gray'; });
  }).length;

  html += '<div class="mywork-section-header" style="justify-content:space-between;flex-wrap:wrap;">';
  html += '<div><svg class="icon" aria-hidden="true"><use href="#ph-folder"></use></svg> My Projects <span class="badge-count">' + myProjects.length + '</span></div>';
  if (projOverdue + projDueSoon + projMissing > 0) {
    var _mwDark2 = (typeof document !== 'undefined' && document.body && document.body.dataset.theme === 'dark');
    var attTxt2 = _mwDark2 ? { over:'#FCA5A5', due:'#EBCF77', miss:'#9AA2AC' } : { over:'#791F1F', due:'#92400E', miss:'#5F5E5A' };
    html += '<div style="display:flex;gap:10px;font-size:10px;font-weight:700;">';
    if (projOverdue > 0) html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#E24B4A;display:inline-block;"></span><span style="color:' + attTxt2.over + ';">' + projOverdue + ' overdue</span></span>';
    if (projDueSoon > 0) html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#EF9F27;display:inline-block;"></span><span style="color:' + attTxt2.due + ';">' + projDueSoon + ' due soon</span></span>';
    if (projMissing > 0) html += '<span style="display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:#B4B2A9;display:inline-block;"></span><span style="color:' + attTxt2.miss + ';">' + projMissing + ' missing</span></span>';
    html += '</div>';
  }
  html += '</div>';

  // Split projects by role
  var leadProjects = [];
  var contribProjects = [];
  var reviewerProjects = [];
  myProjects.forEach(function(p) {
    if (p.contact === name) {
      leadProjects.push(p);
    } else {
      // Check allocation records for role
      var role = 'Contributor';
      if (RESOURCES_DATA && RESOURCES_DATA.people[name] && RESOURCES_DATA.people[name].allocations) {
        var alloc = RESOURCES_DATA.people[name].allocations.find(function(a) { return a.project === p.title; });
        if (alloc && alloc.role === 'Reviewer') role = 'Reviewer';
      }
      if (role === 'Reviewer') reviewerProjects.push(p);
      else contribProjects.push(p);
    }
  });

  // Helper to render a group of projects by status
  function renderProjGroup(status, list) {
    var filtered = list.filter(function(p) { return p.status === status; });
    if (!filtered.length) return '';
    // Sort: items with alerts first (by severity), then alphabetically
    filtered.sort(function(a, b) {
      var aAlerts = getProjectAlerts(a, todayStr, name);
      var bAlerts = getProjectAlerts(b, todayStr, name);
      var aMin = aAlerts.length ? aAlerts.reduce(function(m, x) { return Math.min(m, x.severity); }, 99) : 99;
      var bMin = bAlerts.length ? bAlerts.reduce(function(m, x) { return Math.min(m, x.severity); }, 99) : 99;
      if (aMin !== bMin) return aMin - bMin;
      return (a.title || '').localeCompare(b.title || '');
    });
    const statusColor = STATUS_COLOR(status);
    let out = '<div class="mywork-status-header" style="color:' + statusColor + ';">' + esc(status) + ' (' + filtered.length + ')</div>';
    filtered.forEach(function(p) {
      const pNum = p.project_number != null ? String(p.project_number) : null;
      const taskCount = pNum ? TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === pNum; }) : [];
      const doneCount = taskCount.filter(function(t) { return t.status === 'Complete'; }).length;
      const totalCount = taskCount.length;
      const taskLabel = totalCount > 0 ? doneCount + '/' + totalCount + ' tasks done' : 'No tasks';
      const projAlerts = getProjectAlerts(p, todayStr, name);
      out += '<div class="mywork-compact-row' + attBorderClass(projAlerts) + '">';
      out += '<select class="mw-status-select" data-type="project" data-id="' + p.objectId + '" onchange="mwQuickStatus(this)" onclick="event.stopPropagation()" style="background:' + statusColor + '18;color:' + statusColor + ';border-color:' + statusColor + '44;">';
      ['Active', 'Scheduled', 'On Hold', 'Future', 'Complete', 'Canceled'].forEach(function(s) {
        out += '<option value="' + s + '"' + (p.status === s ? ' selected' : '') + '>' + s + '</option>';
      });
      out += '</select>';
      out += '<span class="mywork-compact-title" onclick="openProject(' + p.objectId + ')" style="cursor:pointer;">' + projectNumChip(p.project_number) + esc(p.title);
      out += renderAttBadges(projAlerts);
      out += '</span>';
      out += '<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">' + taskLabel + '</span>';
      out += '</div>';
    });
    return out;
  }

  // Render a role section with status sub-groups
  function renderRoleSection(roleLabel, roleClass, projects, defaultStatuses, expandStatuses) {
    if (!projects.length) return '';
    var out = '<div class="mw-role-group ' + roleClass + '">';
    out += '<div class="mw-role-hdr">' + roleLabel + ' <span class="mw-role-count">(' + projects.length + ')</span></div>';
    out += '<div class="mw-role-body">';
    var hasDefault = false;
    defaultStatuses.forEach(function(status) {
      var chunk = renderProjGroup(status, projects);
      if (chunk) { hasDefault = true; out += chunk; }
    });
    if (!hasDefault) {
      out += '<div class="mywork-empty" style="padding:8px 0;">No ' + roleLabel.toLowerCase() + ' projects in active statuses.</div>';
    }
    // Expandable statuses
    var expandItems = expandStatuses.filter(function(s) { return projects.some(function(p) { return p.status === s; }); });
    if (expandItems.length > 0) {
      var expandId = 'mw-proj-expand-' + roleLabel.toLowerCase().replace(/\s/g, '-');
      var expandLabel = expandItems.map(function(s) { return s + ' (' + projects.filter(function(p) { return p.status === s; }).length + ')'; }).join(', ');
      out += '<div id="' + expandId + '" style="display:none;">';
      expandItems.forEach(function(status) { out += renderProjGroup(status, projects); });
      out += '</div>';
      out += '<button class="mywork-expand-btn" onclick="var el=document.getElementById(\'' + expandId + '\');var v=el.style.display===\'none\';el.style.display=v?\'\':\'none\';this.textContent=v?\'Show fewer\':\'Show more (' + expandLabel + ')\';">' +
        'Show more (' + expandLabel + ')' +
      '</button>';
    }
    out += '</div></div>';
    return out;
  }

  var defaultProjStatuses = ['Active', 'Scheduled', 'Idea'];
  var expandProjStatuses = ['On Hold', 'Future'];

  if (myProjects.length === 0) {
    html += '<div class="mywork-empty">No projects assigned to you.</div>';
  } else {
    html += renderRoleSection('Leading', 'mw-role-lead', leadProjects, defaultProjStatuses, expandProjStatuses);
    html += renderRoleSection('Contributing', 'mw-role-contrib', contribProjects, defaultProjStatuses, expandProjStatuses);
    if (reviewerProjects.length > 0) {
      html += renderRoleSection('Reviewing', 'mw-role-review', reviewerProjects, defaultProjStatuses, expandProjStatuses);
    }
  }

  html += '</div>';
  html += '</div>'; // close left column

  // ── RIGHT COLUMN: My Tasks ──────────────────────────────────
  html += buildMyWorkTasksSection(myTasks, todayStr, viewUserTaskHrs);

  // ── GANTT CHART — spans both columns ──────────────────────────
  const ganttItems = [];
  myProjects.filter(function(p) {
    return ['Active', 'On Hold', 'Scheduled'].indexOf(p.status) >= 0;
  }).forEach(function(p) {
    const pStart = p.start || null;
    const pEnd = p.actual_end || p.working_due || p.end || null;
    if (!pStart && !pEnd) return;
    // Include tasks based on preference: all project tasks or just the signed-in user's
    const pNum = p.project_number != null ? String(p.project_number) : null;
    const projTasks = !pNum ? [] : TASKS.filter(function(t) {
      if (!(t.project_number != null && String(t.project_number) === pNum)) return false;
      if (t.status === 'Complete' || t.status === 'Canceled') return false;
      if (!UserPrefs.timelineShowAll) return t.assignee === name;
      return true;
    });
    // Determine role
    var role = 'Contributing';
    if (p.contact === name) {
      role = 'Leading';
    } else if (RESOURCES_DATA && RESOURCES_DATA.people[name] && RESOURCES_DATA.people[name].allocations) {
      var alloc = RESOURCES_DATA.people[name].allocations.find(function(a) { return a.project === p.title; });
      if (alloc && alloc.role === 'Reviewer') role = 'Reviewing';
    }
    ganttItems.push({
      type: 'project', id: p.objectId, title: p.title, status: p.status,
      start: pStart, end: pEnd, tasks: projTasks, role: role, _viewUser: name
    });
  });

  if (ganttItems.length > 0) {
    const hasAnyFilter = Object.keys(_ganttFilter).length > 0;
    ganttItems.forEach(function(g) {
      if (!hasAnyFilter || _ganttFilter[g.title] === undefined) _ganttFilter[g.title] = true;
    });

    window._ganttItemsAll = ganttItems;
    window._ganttTodayStr = todayStr;

    const allDates = [];
    ganttItems.forEach(function(g) {
      if (g.start) allDates.push(g.start);
      if (g.end) allDates.push(g.end);
      g.tasks.forEach(function(t) {
        if (t.start) allDates.push(t.start);
        const tEnd = t.working_due || t.due;
        if (tEnd) allDates.push(tEnd);
      });
    });
    allDates.push(todayStr);
    allDates.sort();
    const ganttStart = new Date(allDates[0] + 'T00:00:00');
    const ganttEnd = new Date(allDates[allDates.length - 1] + 'T00:00:00');
    ganttStart.setDate(ganttStart.getDate() - 7);
    ganttEnd.setDate(ganttEnd.getDate() + 14);
    // Apply timeline range preference: ensure end extends at least N months from today
    var prefRangeEnd = new Date();
    prefRangeEnd.setMonth(prefRangeEnd.getMonth() + (UserPrefs.timelineRange || 6));
    if (prefRangeEnd > ganttEnd) ganttEnd.setTime(prefRangeEnd.getTime());
    window._ganttStartMs = ganttStart.getTime();
    window._ganttTotalDays = Math.max(1, Math.ceil((ganttEnd - ganttStart) / (1000 * 60 * 60 * 24)));

    const monthLabels = [];
    const cursor = new Date(ganttStart);
    cursor.setDate(1);
    if (cursor < ganttStart) cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= ganttEnd) {
      const dayOff = (cursor - ganttStart) / (1000 * 60 * 60 * 24);
      const mPct = Math.max(0, Math.min(100, (dayOff / window._ganttTotalDays) * 100));
      if (mPct >= 0 && mPct <= 98) {
        monthLabels.push({ label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), pct: mPct });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    window._ganttMonthLabels = monthLabels;

    const visibleCount = ganttItems.filter(function(g) { return _ganttFilter[g.title]; }).length;

    html += '<div class="mywork-section mywork-full-width" id="mw-timeline">';
    html += '<div class="mywork-section-header" style="cursor:pointer;user-select:none;" onclick="toggleGantt()"><span id="gantt-arrow">▼</span> <svg class="icon" aria-hidden="true"><use href="#ph-chart-bar"></use></svg> Timeline <span style="font-size:11px;font-weight:400;color:var(--text-muted);">(' + visibleCount + ' of ' + ganttItems.length + ' projects)</span></div>';
    html += '<div id="mywork-gantt">';

    html += '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:10px;padding:8px 0;border-bottom:1px solid var(--border);">';

    html += '<div style="position:relative;display:inline-block;" id="gantt-filter-wrap">';
    html += '<button onclick="toggleGanttDropdown()" style="font-size:11px;padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--white);cursor:pointer;font-weight:600;color:var(--navy);display:flex;align-items:center;gap:6px;">';
    html += '<svg class="icon" aria-hidden="true"><use href="#ph-folder"></use></svg> Projects (' + visibleCount + '/' + ganttItems.length + ') <span style="font-size:9px;">▼</span></button>';
    html += '<div id="gantt-filter-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:100;background:var(--white);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.12);padding:8px 0;min-width:260px;max-height:300px;overflow-y:auto;margin-top:4px;">';
    html += '<div style="display:flex;gap:6px;padding:4px 12px 8px;border-bottom:1px solid var(--border);">';
    html += '<button onclick="ganttSelectAll(true)" style="font-size:10px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface-2);cursor:pointer;font-weight:700;">All</button>';
    html += '<button onclick="ganttSelectAll(false)" style="font-size:10px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface-2);cursor:pointer;font-weight:700;">None</button>';
    html += '</div>';
    ganttItems.forEach(function(g) {
      const sc = STATUS_COLOR(g.status) || '#3B82F6';
      const checked = _ganttFilter[g.title] ? ' checked' : '';
      html += '<label style="display:flex;align-items:center;gap:8px;padding:5px 12px;font-size:11px;cursor:pointer;white-space:nowrap;" onmouseenter="this.style.background=\'#F3F1EB\'" onmouseleave="this.style.background=\'#fff\'">';
      html += '<input type="checkbox" class="gantt-proj-check" value="' + esc(g.title) + '"' + checked + ' onchange="toggleGanttProject(\'' + esc(g.title).replace(/'/g, "\\'") + '\')">';
      html += '<span style="width:10px;height:10px;border-radius:2px;background:' + sc + ';flex-shrink:0;"></span>';
      html += '<span style="overflow:hidden;text-overflow:ellipsis;">' + esc(g.title) + '</span>';
      html += '<span style="font-size:9px;color:var(--text-muted);margin-left:auto;">' + esc(g.status) + '</span>';
      html += '</label>';
    });
    html += '</div></div>';

    html += '<span style="width:1px;height:16px;background:var(--border);"></span>';
    const legendStatuses = ['Active', 'On Hold', 'Scheduled', 'Waiting for Response'];
    legendStatuses.forEach(function(s) {
      const c = STATUS_COLOR(s);
      if (!c) return;
      html += '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--text-muted);white-space:nowrap;">';
      html += '<span style="width:10px;height:6px;border-radius:2px;background:' + c + ';opacity:0.85;"></span>' + s + '</span>';
    });
    html += '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--text-muted);white-space:nowrap;">';
    html += '<span style="width:10px;height:6px;border-radius:2px;background:#ccc;outline:2px solid #EF4444;outline-offset:1px;"></span>Overdue</span>';

    html += '</div>';

    html += '<div id="gantt-chart-body">';
    html += buildGanttBars();
    html += '</div>';

    html += '</div>'; // #mywork-gantt
    html += '</div>'; // section
  }

  html += '</div>'; // close mywork-columns

  html += '</div>'; // close mywork-page
  area.innerHTML = html;
}
