// ─────────────────────────────────────────────────────────────────────
// tabs/projects-tasks.js — Projects & Tasks tab views + shared helpers
//
// First half of the projects/tasks extraction. Owns the grid/list
// renderers, list-sort handlers, pagination, openProject/openTask
// navigation, and a handful of UI helpers used widely (project
// numbering, projectNumChip, renderMd, calc-info popups,
// resolveProjectTitle).
//
// Detail-page builders, lifecycle phase helpers, batch bar, delete
// confirmations, and the inline status/assignee/due-date editors
// move in the next commit.
// ─────────────────────────────────────────────────────────────────────

// ── Project / task list views ──────────────────────────
// ─── PROJECT GRID ─────────────────────────────────────────────────────
function renderProjectGrid(data) {
  if (!data.length) return '<div class="empty-state">No projects match your filters.</div>';
  return `<div class="projects-grid">${data.map(p => projectCard(p)).join('')}</div>`;
}

function projectCard(p) {
  const statusColor = STATUS_COLOR(p.status) || '#9CA3AF';
  const initials = (p.contact || '?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const endDate = p.status === 'Complete' && p.actual_end ? p.actual_end : (p.working_due || p.end || '—');
  const counts = getTaskCountsForProject(p);
  const totalTasks = counts.total;
  const doneTasks = counts.done;
  const taskChip = totalTasks > 0 ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#EEF2FF;color:#002669;white-space:nowrap;">${doneTasks}/${totalTasks} tasks</span>` : '';
  return `
  <div class="project-card" onclick="openProject(${p.objectId})">
    <div class="project-card-accent" style="background:var(--navy)"></div>
    <div class="project-card-body">
      <div class="project-card-header">
        <div class="project-title">${projectNumChip(p.project_number)}${esc(p.title)}</div>
        <span class="priority-badge priority-${p.priority || 'null'}">${p.priority || '—'}</span>
      </div>
      <div class="project-meta">
        <span class="meta-tag" style="background:#EFF6FF;border-color:#BFDBFE;color:#1E40AF;">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${statusColor};margin-right:4px;vertical-align:middle;"></span>${p.status || '—'}
        </span>
        ${p.category ? `<span class="meta-tag">${esc(p.category)}</span>` : ''}
        ${p.project_size ? `<span class="meta-tag" style="background:#F3E8FF;border-color:#D8B4FE;color:#6B21A8;">${esc(p.project_size)}</span>` : ''}
        ${p.is_data_program ? '<span class="meta-tag" style="background:#FFF7ED;border-color:#FED7AA;color:#9A3412;">Data Program</span>' : ''}
        ${p.city_initiative ? p.city_initiative.split(',').map(function(s) { return '<span class="meta-tag" style="background:#FFF7ED;border-color:#FED7AA;color:#9A3412;">' + esc(s.trim()) + '</span>'; }).join('') : ''}
        ${p.partner_dept ? `<span class="meta-tag">${esc(p.partner_dept.length > 22 ? p.partner_dept.slice(0,22)+'…' : p.partner_dept)}</span>` : ''}
      </div>
      ${p.description ? `<div class="project-desc">${esc(p.description)}</div>` : '<div class="project-desc" style="color:#E1E2DD;font-style:italic;">No description available</div>'}
    </div>
    <div class="project-footer">
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;flex:1;min-width:0;">
        <div class="assignee-chip">
          ${(function(){
            var emj = getMemberAvatarEmoji(p.contact);
            var selfCls = p.contact && Auth.fullName && p.contact === Auth.fullName ? ' user-self-avatar' : '';
            return `<div class="assignee-avatar${selfCls}${emj?' user-emoji-av':''}">${emj || initials}</div>`;
          })()}
          ${esc(p.contact || 'Unassigned')}
        </div>
        ${(p.other_members || '').split(',').map(s=>s.trim()).filter(Boolean).map(name => {
          const av = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
          const selfCls = Auth.fullName && name === Auth.fullName ? ' user-self-avatar' : '';
          const emj = getMemberAvatarEmoji(name);
          return `<div class="assignee-avatar${selfCls}${emj?' user-emoji-av':''}" title="${esc(name)}" style="background:var(--orange);flex-shrink:0;">${emj || av}</div>`;
        }).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${taskChip}
        <div class="date-info">${endDate}</div>
      </div>
    </div>
  </div>`;
}

// ─── PROJECT BOARD (Kanban) ───────────────────────────────────────────
// Status columns; drag a card to another column to change its status (same
// rules as the form: edit permission required, Idea→other needs promote rights,
// a size is required to leave Idea, completion date auto-set on Complete via
// DataStore). The "＋ Add" control is in the Idea column for everyone (Submit
// Idea) and in every other column for admins only (full New Project editor).
var _boardDragId = null;
var BOARD_STATUS_ORDER = ['Idea', 'Future', 'Scheduled', 'Active', 'On Hold', 'Complete', 'Canceled'];

function boardColumns() {
  var cols = BOARD_STATUS_ORDER.slice();
  var enums = (typeof FM_PROJ_STATUSES !== 'undefined' && FM_PROJ_STATUSES) ? FM_PROJ_STATUSES : [];
  enums.forEach(function(s) { if (s && cols.indexOf(s) < 0) cols.push(s); });
  return cols;
}

function _boardToday() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function renderProjectBoard(data) {
  var cols = boardColumns();
  var byStatus = {};
  cols.forEach(function(s) { byStatus[s] = []; });
  (data || []).forEach(function(p) {
    var s = p.status || 'Idea';
    if (!byStatus[s]) { byStatus[s] = []; cols.push(s); }
    byStatus[s].push(p);
  });
  // Sort each column: High→Low priority, then soonest due date.
  var prRank = { High: 0, Medium: 1, Low: 2 };
  cols.forEach(function(s) {
    (byStatus[s] || []).sort(function(a, b) {
      var pa = prRank[a.priority] == null ? 3 : prRank[a.priority];
      var pb = prRank[b.priority] == null ? 3 : prRank[b.priority];
      if (pa !== pb) return pa - pb;
      var da = a.working_due || a.end || '9999-99-99';
      var db = b.working_due || b.end || '9999-99-99';
      return da < db ? -1 : da > db ? 1 : 0;
    });
  });
  var admin = (typeof isAdmin === 'function') && isAdmin();
  // Admins can add a project at any status. A team lead can too — but only when
  // their team has opted out of the Submit Idea phase (Settings → Project intake),
  // since those teams create projects directly. Everyone gets the Idea column.
  var leadDirect = (typeof isTeamLeadRole === 'function' && isTeamLeadRole()) &&
    (typeof teamCreatesDirectly === 'function' && teamCreatesDirectly(typeof getLeadTeam === 'function' ? getLeadTeam() : null));
  var canAddAnyStatus = admin || leadDirect;
  var html = '<div class="kanban-board">';
  cols.forEach(function(s) {
    var list = byStatus[s] || [];
    var color = STATUS_COLOR(s);
    var cards = list.map(boardCard).join('') || '<div class="kanban-empty">No projects</div>';
    var addBtn = '';
    if (s === 'Idea') {
      addBtn = '<div class="kanban-add" onclick="boardAddIdea()">＋ Add</div>';
    } else if (canAddAnyStatus) {
      addBtn = '<div class="kanban-add" onclick="boardAddProject(\'' + String(s).replace(/'/g, "\\'") + '\')">＋ Add</div>';
    }
    html += '<div class="kanban-col" ondragover="boardOver(event)" ondragleave="boardLeave(event)" ondrop="boardDrop(event,\'' + String(s).replace(/'/g, "\\'") + '\')">' +
      '<div class="kanban-col-head">' +
        '<span class="kanban-dot" style="background:' + color + ';"></span>' +
        '<span class="kanban-col-name">' + esc(s) + '</span>' +
        '<span class="kanban-col-count">' + list.length + '</span>' +
      '</div>' +
      '<div class="kanban-col-body">' + cards + addBtn + '</div>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

function boardCard(p) {
  var canEdit = (typeof canEditProject === 'function') ? canEditProject(p) : false;
  var statusColor = STATUS_COLOR(p.status) || '#9CA3AF';
  var counts = getTaskCountsForProject(p);
  var due = (p.status === 'Complete' && p.actual_end) ? p.actual_end : (p.working_due || p.end || '');
  var overdue = due && p.status !== 'Complete' && p.status !== 'Canceled' && due < _boardToday();
  var initials = (p.contact || '?').split(' ').map(function(n) { return n[0]; }).join('').slice(0, 2).toUpperCase();
  var emj = (typeof getMemberAvatarEmoji === 'function') ? getMemberAvatarEmoji(p.contact) : '';
  var taskChip = counts.total > 0 ? '<span title="Tasks">✓ ' + counts.done + '/' + counts.total + '</span>' : '';
  var deptStr = p.partner_dept ? (p.partner_dept.length > 24 ? p.partner_dept.slice(0, 24) + '…' : p.partner_dept) : '';
  return '<div class="kanban-card"' + (canEdit ? ' draggable="true"' : '') +
      ' onclick="openProject(' + p.objectId + ')"' +
      (canEdit ? ' ondragstart="boardDragStart(event,' + p.objectId + ')" ondragend="boardDragEnd(event)"' : '') +
      ' style="border-left-color:' + statusColor + ';"' +
      (canEdit ? '' : ' title="You don\'t have permission to move this project"') + '>' +
    '<div class="kanban-card-title">' + (typeof projectNumChip === 'function' ? projectNumChip(p.project_number) : '') + esc(p.title) + '</div>' +
    '<div class="kanban-meta">' +
      '<span class="priority-badge priority-' + (p.priority || 'null') + '">' + (p.priority || '—') + '</span>' +
      (p.project_size ? '<span class="kanban-size">' + esc(p.project_size) + '</span>' : '') +
      (p.is_data_program ? '<span class="meta-tag" style="background:#FFF7ED;border-color:#FED7AA;color:#9A3412;">DP</span>' : '') +
    '</div>' +
    (deptStr ? '<div class="kanban-meta">' + esc(deptStr) + '</div>' : '') +
    '<div class="kanban-foot">' +
      '<span class="kanban-ava"' + (emj ? ' style="background:transparent;"' : '') + '>' + (emj || initials) + '</span>' +
      '<span>' + esc((p.contact || 'Unassigned').split(' ')[0]) + '</span>' +
      taskChip +
      (due ? '<span class="' + (overdue ? 'kanban-due--over' : '') + '" style="margin-left:auto;">📅 ' + esc(due) + '</span>' : '<span style="margin-left:auto;"></span>') +
    '</div>' +
  '</div>';
}

// ── Add controls ──
function boardAddIdea() {
  if (typeof openIdeaForm === 'function') openIdeaForm();
}
function boardAddProject(status) {
  if (typeof openFormModal !== 'function') return;
  openFormModal('new-project');
  var sel = document.getElementById('fm-status');
  if (sel && status) sel.value = status;
}

// ── Drag & drop ──
function boardDragStart(e, oid) {
  _boardDragId = oid;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(oid)); } catch (_) {}
  var el = e.currentTarget;
  setTimeout(function() { el.classList.add('kanban-card--dragging'); }, 0);
}
function boardDragEnd(e) { e.currentTarget.classList.remove('kanban-card--dragging'); }
function boardOver(e) { e.preventDefault(); e.currentTarget.classList.add('kanban-col--drop'); }
function boardLeave(e) { e.currentTarget.classList.remove('kanban-col--drop'); }

async function boardDrop(e, newStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('kanban-col--drop');
  var oid = _boardDragId;
  _boardDragId = null;
  if (oid == null) return;
  var p = (typeof PROJECTS !== 'undefined' && PROJECTS) ? PROJECTS.find(function(x) { return x.objectId == oid; }) : null;
  if (!p || p.status === newStatus) return;
  if (typeof canEditProject === 'function' && !canEditProject(p)) {
    showToast('Only the project lead, the team lead, or an admin can change this project.', 'warn');
    return;
  }
  if (p.status === 'Idea' && newStatus !== 'Idea' && !(typeof Auth !== 'undefined' && Auth && Auth.canPromote)) {
    showToast('Only authorized users can promote an Idea. Contact your administrator.', 'warn');
    return;
  }
  // Business rule (mirrors the form): a size is required before leaving Idea into
  // an active state. Open the editor so they can set size + status together.
  if (newStatus !== 'Idea' && newStatus !== 'Canceled' && !p.project_size) {
    showToast('Set a project size to move “' + p.title + '” to ' + newStatus + '.', 'warn');
    if (typeof openProject === 'function') openProject(p.objectId);
    return;
  }
  try {
    await DataStore.updateProject(p.objectId, { status: newStatus });
    if (typeof markDataDirty === 'function') markDataDirty();
    render();
  } catch (err) {
    console.error('[Board] status change failed:', err);
    showToast('Could not update status: ' + (err && err.message ? err.message : err), 'error');
  }
}

// ─── CALENDAR VIEW (Projects + Tasks) ─────────────────────────────────
// Month grid of items on their due date (working_due → end for projects,
// working_due → due for tasks). Used on both Portfolio sub-tabs; renders into
// the content area with a day-detail panel and a "My items only" quick filter.
// Respects the same filters/team-scoping (data comes pre-filtered).
var _calMonth = null;     // Date = first of the displayed month
var _calSelected = null;  // 'YYYY-MM-DD' of the selected day
var _calMineOnly = false;
var _CAL_MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var _CAL_DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function _calISO(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function _calParse(s) { return s ? new Date(s + 'T00:00:00') : null; }
function _calTodayDate() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function _calItemDate(it, kind) { return kind === 'project' ? (it.working_due || it.end || '') : (it.working_due || it.due || ''); }
function _calOwner(it, kind) { return kind === 'project' ? (it.contact || '') : (it.assignee || ''); }
function _calIsMine(it, kind) {
  var me = (typeof Auth !== 'undefined' && Auth) ? Auth.fullName : '';
  if (!me) return true;
  if (kind === 'project') return it.contact === me || (it.other_members && it.other_members.indexOf(me) >= 0);
  return (it.assignee || '').indexOf(me) >= 0;
}
function _calIsOverdue(it, kind, todayD) {
  var ds = _calItemDate(it, kind);
  if (!ds || it.status === 'Complete' || it.status === 'Canceled') return false;
  return _calParse(ds) < todayD;
}

function calMoveMonth(n) { var m = _calMonth || _calTodayDate(); _calMonth = new Date(m.getFullYear(), m.getMonth()+n, 1); render(); }
function calToday() { var t = _calTodayDate(); _calMonth = new Date(t.getFullYear(), t.getMonth(), 1); _calSelected = _calISO(t); render(); }
function calSelectDay(isoStr) { _calSelected = isoStr; render(); }
function calToggleMine(on) { _calMineOnly = !!on; render(); }

function renderCalendar(items, kind) {
  var todayD = _calTodayDate();
  if (!_calMonth) _calMonth = new Date(todayD.getFullYear(), todayD.getMonth(), 1);
  if (!_calSelected) _calSelected = _calISO(todayD);

  var data = (items || []).slice();
  if (_calMineOnly) data = data.filter(function(it) { return _calIsMine(it, kind); });

  var byDate = {}, noDate = [];
  data.forEach(function(it) {
    var ds = _calItemDate(it, kind);
    if (!ds) { noDate.push(it); return; }
    (byDate[ds] = byDate[ds] || []).push(it);
  });

  var y = _calMonth.getFullYear(), mo = _calMonth.getMonth();
  var first = new Date(y, mo, 1);
  var gridStart = new Date(y, mo, 1 - first.getDay());
  var todayISO = _calISO(todayD);
  var meName = (typeof Auth !== 'undefined' && Auth && Auth.fullName) ? Auth.fullName : '';

  var html = '<div class="cal-wrap"><div class="cal-head">' +
    '<div class="cal-nav">' +
      '<button class="cal-navbtn" onclick="calMoveMonth(-1)" title="Previous month">‹</button>' +
      '<button class="cal-todaybtn" onclick="calToday()">Today</button>' +
      '<button class="cal-navbtn" onclick="calMoveMonth(1)" title="Next month">›</button>' +
    '</div>' +
    '<div class="cal-month">' + _CAL_MON[mo] + ' ' + y + '</div>' +
    '<div style="flex:1;"></div>' +
    (meName ? '<label class="cal-mine"><input type="checkbox" ' + (_calMineOnly ? 'checked' : '') + ' onchange="calToggleMine(this.checked)"> My items only</label>' : '') +
  '</div>';

  html += '<div class="cal-body"><div class="cal-grid-wrap"><div class="cal-dow">' +
    _CAL_DOW.map(function(d) { return '<div>' + d + '</div>'; }).join('') +
    '</div><div class="cal-weeks">';

  for (var i = 0; i < 42; i++) {
    var d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    var key = _calISO(d);
    var inMonth = d.getMonth() === mo;
    var wknd = (d.getDay() === 0 || d.getDay() === 6);
    var list = byDate[key] || [];
    var cls = 'cal-cell' + (inMonth ? '' : ' cal-other') + (wknd && inMonth ? ' cal-weekend' : '') + (key === todayISO ? ' cal-today' : '') + (key === _calSelected ? ' cal-sel' : '');
    html += '<div class="' + cls + '" onclick="calSelectDay(\'' + key + '\')">' +
      '<span class="cal-daynum">' + d.getDate() + '</span>';
    list.slice(0, 3).forEach(function(it) {
      var over = _calIsOverdue(it, kind, todayD);
      html += '<div class="cal-chip' + (over ? ' cal-chip-over' : '') + '" style="border-left-color:' + (STATUS_COLOR(it.status) || '#9CA3AF') + ';" data-tip="' + esc(_calTipText(it, kind, todayD)) + '" onmouseenter="calTipShow(event)" onmousemove="calTipShow(event)" onmouseleave="calTipHide()" onclick="' + (kind === 'project' ? 'openProject(' + it.objectId + ')' : 'openTask(' + it.objectId + ')') + ';event.stopPropagation();">' + esc(it.title) + '</div>';
    });
    if (list.length > 3) html += '<div class="cal-more">+' + (list.length - 3) + ' more</div>';
    html += '</div>';
  }
  html += '</div></div>';

  var selD = _calParse(_calSelected) || todayD;
  var sl = byDate[_calISO(selD)] || [];
  html += '<div class="cal-side"><div class="cal-side-head">' + _CAL_DOW[selD.getDay()] + ' · ' + _CAL_MON[selD.getMonth()] + ' ' + selD.getDate() + '</div>' +
    '<div class="cal-side-sub">' + (sl.length ? (sl.length + ' due') : 'Nothing due') + (_calISO(selD) === todayISO ? ' · Today' : '') + '</div>';
  if (sl.length) {
    sl.forEach(function(it) {
      var over = _calIsOverdue(it, kind, todayD);
      var color = STATUS_COLOR(it.status) || '#9CA3AF';
      var openFn = kind === 'project' ? ('openProject(' + it.objectId + ')') : ('openTask(' + it.objectId + ')');
      html += '<div class="cal-item" onclick="' + openFn + '">' +
        '<div class="cal-item-bar" style="background:' + color + ';"></div>' +
        '<div style="min-width:0;"><div class="cal-item-title">' + esc(it.title) + '</div>' +
        '<div class="cal-item-meta"><span class="cal-pill" style="background:' + color + '22;color:' + color + ';">' + esc(it.status || '—') + '</span> ' + esc(_calOwner(it, kind) || 'Unassigned') + (kind === 'task' && it.project ? ' · ' + esc(it.project) : '') + (over ? ' · <span class="cal-over">overdue</span>' : '') + '</div></div>' +
      '</div>';
    });
  } else {
    html += '<div class="cal-empty">Nothing due this day.</div>';
  }
  html += '</div></div>';

  if (noDate.length) {
    html += '<div class="cal-nodate">' + noDate.length + ' ' + (kind === 'project' ? 'project' : 'task') + (noDate.length !== 1 ? 's' : '') + ' have no due date and aren’t shown on the calendar.</div>';
  }
  html += '</div>';
  return html;
}

// The tooltip lives on <body> (not inside the calendar) so position:fixed
// resolves against the viewport — a transformed ancestor would otherwise become
// its containing block and throw the cursor math off.
function _calTipEl() {
  var tip = document.getElementById('cal-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'cal-tip';
    tip.className = 'cal-tip';
    document.body.appendChild(tip);
  }
  return tip;
}

// Rich hover text for a calendar chip (rendered in #cal-tip via white-space:pre-line).
function _calTipText(it, kind, todayD) {
  var date = _calItemDate(it, kind);
  var owner = _calOwner(it, kind) || 'Unassigned';
  var lines = [
    it.title || '(untitled)',
    (it.status || '—') + ' · ' + owner
  ];
  var line3 = 'Due ' + (date || '—');
  if (it.priority) line3 += '  ·  ' + it.priority + ' priority';
  if (_calIsOverdue(it, kind, todayD)) line3 += '  ·  OVERDUE';
  lines.push(line3);
  if (kind === 'task' && it.project) lines.push('Project: ' + it.project);
  if (kind === 'project' && it.partner_dept) lines.push('Partner: ' + it.partner_dept);
  return lines.join('\n');
}

function calTipShow(e) {
  var tip = _calTipEl();
  if (e.currentTarget && e.currentTarget.getAttribute) {
    var t = e.currentTarget.getAttribute('data-tip');
    if (t != null) tip.textContent = t;
  }
  tip.style.display = 'block';
  var tw = tip.offsetWidth, th = tip.offsetHeight;
  var vw = window.innerWidth, vh = window.innerHeight, pad = 6, gap = 12;
  // Desired on-screen (viewport) position near the cursor, flipped/clamped so it
  // stays fully visible.
  var sx = e.clientX + gap;
  if (sx + tw > vw - pad) sx = e.clientX - gap - tw;
  if (sx < pad) sx = pad;
  if (sx + tw > vw - pad) sx = vw - tw - pad;
  var sy = e.clientY + gap;
  if (sy + th > vh - pad) sy = e.clientY - gap - th;
  if (sy < pad) sy = pad;
  if (sy + th > vh - pad) sy = vh - th - pad;
  // Place, then self-correct: a transformed ancestor makes a fixed element's
  // coordinates relative to it (not the viewport), so measure the actual rect and
  // add back the delta. This pins the tooltip to (sx, sy) on screen regardless.
  tip.style.left = sx + 'px';
  tip.style.top = sy + 'px';
  var rect = tip.getBoundingClientRect();
  var dx = sx - rect.left, dy = sy - rect.top;
  if (dx || dy) {
    tip.style.left = (sx + dx) + 'px';
    tip.style.top = (sy + dy) + 'px';
  }
}
function calTipHide() {
  var tip = document.getElementById('cal-tip');
  if (tip) tip.style.display = 'none';
}

// ─── PROJECT LIST ─────────────────────────────────────────────────────
function setProjListSort(key) {
  if (projListSortKey === key) projListSortDir = projListSortDir === 'asc' ? 'desc' : 'asc';
  else { projListSortKey = key; projListSortDir = 'asc'; }
  currentPage = 1;
  render();
}

function renderProjectList(data, showLead) {
  if (!data.length) return '<div class="empty-state">No projects match your filters.</div>';
  const arrow = (key) => projListSortKey === key ? (projListSortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
  const th = (label, key) => `<div class="th-sortable" onclick="setProjListSort('${key}')" style="cursor:pointer;user-select:none;">${label}<span style="opacity:${projListSortKey===key?'1':'0.35'};font-size:10px;">${arrow(key)}</span></div>`;
  const tableClass = showLead ? 'task-table task-table--projects-contrib' : 'task-table task-table--projects';

  function buildRow(p) {
    const statusColor = STATUS_COLOR(p.status) || '#9CA3AF';
    var taskCount = getTaskCountsForProject(p).total;
    var row = `<div class="task-row" onclick="openProject(${p.objectId})">
      <div class="task-cell" style="font-family:monospace;">${esc(p.project_number || '—')}</div>
      <div class="task-title-cell">${esc(p.title)}</div>
      <div class="task-cell"><span class="status-pill" style="background:${statusColor}22;color:${statusColor};"><span style="width:6px;height:6px;border-radius:50%;background:${statusColor};display:inline-block;"></span>${p.status||'—'}</span></div>
      <div class="task-cell"><span class="priority-badge priority-${p.priority||'null'}">${p.priority||'—'}</span></div>
      <div class="task-cell">${esc(p.category || '—')}</div>`;
    if (showLead) row += `<div class="task-cell">${esc(p.contact || '—')}</div>`;
    row += `<div class="task-cell">${p.working_due||p.end||'—'}</div>
      <div class="task-cell" style="text-align:center;">${taskCount}</div>
    </div>`;
    return row;
  }

  // Split by status groups
  var activeStatuses = ['Active', 'On Hold', 'Waiting for Response'];
  var pipelineStatuses = ['Future', 'Scheduled'];
  var doneStatuses = ['Complete', 'Canceled'];

  var activeProjs = data.filter(function(p) { return activeStatuses.indexOf(p.status) >= 0; });
  var pipelineProjs = data.filter(function(p) { return pipelineStatuses.indexOf(p.status) >= 0; });
  var doneProjs = data.filter(function(p) { return doneStatuses.indexOf(p.status) >= 0; });

  var headerCols = th('ID','project_number') + th('Project','title') + th('Status','status') + th('Priority','priority') + th('Category','category');
  if (showLead) headerCols += th('Lead','contact');
  headerCols += th('Due','end') + th('Tasks','tasks');

  var html = '<div class="' + tableClass + '">';
  html += '<div class="task-table-header">' + headerCols + '</div>';

  function groupHeader(label, count, colspan) {
    return '<div class="task-row" style="cursor:default;background:var(--bg-surface,#F3F1EB);border-bottom:0.5px solid var(--border);padding:6px 16px;"><div style="grid-column:1/-1;font-size:13px;font-weight:700;letter-spacing:0.03em;color:var(--text-muted);">' + label + ' (' + count + ')</div></div>';
  }

  if (activeProjs.length > 0) {
    html += groupHeader('Active / On hold / Waiting for response', activeProjs.length);
    html += activeProjs.map(buildRow).join('');
  }
  if (pipelineProjs.length > 0) {
    html += groupHeader('Future / Scheduled', pipelineProjs.length);
    html += pipelineProjs.map(buildRow).join('');
  }
  if (doneProjs.length > 0) {
    html += groupHeader('Complete / Canceled', doneProjs.length);
    html += doneProjs.map(function(p) { return buildRow(p).replace('class="task-row"', 'class="task-row" style="opacity:0.6;"'); }).join('');
  }

  html += '</div>';
  return html;
}

// ─── TASK GRID ────────────────────────────────────────────────────────
function renderTaskGrid(data) {
  if (!data.length) return '<div class="empty-state">No tasks match your filters.</div>';
  const todayStr = (function() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
  return `<div class="projects-grid">${data.map(t => {
    const statusColor = STATUS_COLOR(t.status) || '#9CA3AF';
    const initials = (t.assignee || '?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const dueStr = t.working_due || t.due || '';
    const isOverdue = dueStr && dueStr < todayStr && (t.status === 'Active' || t.status === 'Waiting for Response');
    const dueStyle = isOverdue ? 'color:#EF4444;font-weight:700;' : '';
    return `
    <div class="project-card" onclick="openTask(${t.objectId})">
      <div class="project-card-accent" style="background:var(--orange)"></div>
      <div class="project-card-body">
        <div class="project-card-header">
          <div class="project-title">${esc(t.title)}</div>
          <span class="priority-badge priority-${t.priority||'null'}">${t.priority||'—'}</span>
        </div>
        <div class="project-meta">
          <span class="meta-tag" style="background:${statusColor}18;border-color:${statusColor}44;color:${statusColor};">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${statusColor};margin-right:4px;vertical-align:middle;"></span>${t.status||'—'}
          </span>
          ${t.category ? `<span class="meta-tag">${esc(t.category)}</span>` : ''}
          ${t.tool ? `<span class="meta-tag">${esc(t.tool)}</span>` : ''}
        </div>
        ${resolveProjectTitle(t) ? `<div class="project-desc" style="font-weight:700;color:var(--navy);font-style:normal;">${esc(resolveProjectTitle(t))}</div>` : ''}
        ${t.description ? `<div class="project-desc">${esc(t.description)}</div>` : ''}
      </div>
      <div class="project-footer">
        <div class="assignee-chip">
          ${(function(){
            var emj = getMemberAvatarEmoji(t.assignee);
            var selfCls = t.assignee && Auth.fullName && t.assignee === Auth.fullName ? ' user-self-avatar' : '';
            return `<div class="assignee-avatar${selfCls}${emj?' user-emoji-av':''}">${emj || initials}</div>`;
          })()}
          ${esc(t.assignee || 'Unassigned')}
        </div>
        <div class="date-info">${getTaskHours(t.idx) > 0 ? '<span style="font-weight:700;color:var(--navy);margin-right:8px;">⏱ ' + hoursLabel(getTaskHours(t.idx), getMyTaskHours(t.idx)) + '</span>' : ''}<span style="${dueStyle}">${dueStr || '—'}</span></div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ─── TASK LIST ────────────────────────────────────────────────────────
function setTaskSort(key) {
  if (taskSortKey === key) taskSortDir = taskSortDir === 'asc' ? 'desc' : 'asc';
  else { taskSortKey = key; taskSortDir = 'asc'; }
  currentPage = 1;
  render();
}

function renderTaskList(data) {
  if (!data.length) return '<div class="empty-state">No tasks match your filters.</div>';
  const arrow = (key) => taskSortKey === key ? (taskSortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
  const th = (label, key) => `<div class="th-sortable" onclick="setTaskSort('${key}')" style="cursor:pointer;user-select:none;">${label}<span style="opacity:${taskSortKey===key?'1':'0.35'};font-size:10px;">${arrow(key)}</span></div>`;
  const todayStr = (function() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
  const rows = data.map(t => {
    const statusColor = STATUS_COLOR(t.status) || '#9CA3AF';
    const tHrs = getTaskHours(t.idx);
    const mHrs = getMyTaskHours(t.idx);
    const dueStr = t.working_due || t.due || '';
    const isOverdue = dueStr && dueStr < todayStr && (t.status === 'Active' || t.status === 'Waiting for Response');
    const dueCellStyle = isOverdue ? 'color:#EF4444;font-weight:700;' : '';
    return `<div class="task-row" onclick="openTask(${t.objectId})">
      <div class="task-cell" title="${esc(resolveProjectTitle(t))}"><strong style="color:var(--text-dark);">${esc(resolveProjectTitle(t)||'—')}</strong></div>
      <div class="task-title-cell">${esc(t.title)}</div>
      <div class="task-cell"><span class="status-pill" style="background:${statusColor}22;color:${statusColor};"><span style="width:5px;height:5px;border-radius:50%;background:${statusColor};display:inline-block;"></span>${t.status||'—'}</span></div>
      <div class="task-cell"><span class="priority-badge priority-${t.priority||'null'}">${t.priority||'—'}</span></div>
      <div class="task-cell">${esc(t.assignee||'—')}</div>
      <div class="task-cell" style="${dueCellStyle}">${dueStr||'—'}</div>
      <div class="task-cell" style="font-weight:700;color:var(--navy);">${tHrs > 0 ? hoursLabel(tHrs, mHrs) : '—'}</div>
    </div>`;
  }).join('');
  return `<div class="task-table task-table--tasks">
    <div class="task-table-header">
      ${th('Project','project')}${th('Task','title')}${th('Status','status')}${th('Priority','priority')}${th('Assignee','assignee')}${th('Due','end')}<div style="font-weight:700;">Hours</div>
    </div>
    ${rows}
  </div>`;
}

function renderPagination(total, prefix) {
  const existing = document.getElementById('pagination');
  if (existing) existing.remove();

  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return;

  const el = document.createElement('div');
  el.id = 'pagination';
  el.className = 'pagination';

  // Always show: first, last, current page, and 2 neighbours; ellipses elsewhere
  const show = new Set([1, pages, currentPage, currentPage-1, currentPage+1, currentPage-2, currentPage+2]);
  const pageNums = [...show].filter(n => n >= 1 && n <= pages).sort((a,b) => a-b);

  let out = `<button class="page-btn" ${currentPage===1?'disabled':''} onclick="goPage(${currentPage-1})">&#8249;</button>`;
  let prev = null;
  for (const n of pageNums) {
    if (prev !== null && n - prev > 1) {
      out += `<span style="color:var(--text-muted);font-size:13px;padding:0 2px;">…</span>`;
    }
    out += `<button class="page-btn ${n===currentPage?'active':''}" onclick="goPage(${n})">${n}</button>`;
    prev = n;
  }
  out += `<button class="page-btn" ${currentPage===pages?'disabled':''} onclick="goPage(${currentPage+1})">&#8250;</button>`;

  el.innerHTML = out;
  document.getElementById('content-area').appendChild(el);
}
function goPage(p) {
  currentPage = p;
  render();
  const ca = document.getElementById('content-area');
  if (ca) ca.scrollTop = 0;
}

// ─── MODALS ───────────────────────────────────────────────────────────
function openProject(id) {
  currentDetail = { type: 'project', id, _returnTab: currentTab };
  render();
}


function openTask(id) {
  currentDetail = { type: 'task', id, _returnTab: currentTab };
  render();
}

// ── Numbering & UI helpers ─────────────────────────────
// ─── UTILS ────────────────────────────────────────────────────────────
// ── Project & Task Numbering ─────────────────────────────────────────
function getNextProjectNumber() {
  var maxNum = 0;
  PROJECTS.forEach(function(p) {
    if (p.project_number) {
      var match = p.project_number.match(/^P-(\d+)$/);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  });
  var next = maxNum + 1;
  return 'P-' + String(next).padStart(3, '0');
}

function getNextTaskNumber(projectNumber) {
  if (!projectNumber) return null;
  var maxNum = 0;
  TASKS.forEach(function(t) {
    if (t.task_number) {
      var prefix = projectNumber + '-';
      if (t.task_number.indexOf(prefix) === 0) {
        var suffix = t.task_number.substring(prefix.length);
        var n = parseInt(suffix, 10);
        if (n > maxNum) maxNum = n;
      }
    }
  });
  var next = maxNum + 1;
  return projectNumber + '-' + String(next).padStart(3, '0');
}

function projectNumChip(num) {
  if (!num) return '';
  return '<span style="font-family:monospace;font-size:10px;font-weight:700;color:var(--pill-blue-fg);background:var(--pill-blue-bg);padding:1px 6px;border-radius:4px;margin-right:4px;">' + esc(num) + '</span>';
}

async function backfillProjectTaskNumbers() {
  if (!Auth.loggedIn) { showToast('You must be signed in.', 'warn'); return; }

  var projCount = 0;
  var taskCount = 0;

  // Sort projects by id (creation order) to assign numbers sequentially
  var unnumbered = PROJECTS.filter(function(p) { return !p.project_number; });
  unnumbered.sort(function(a, b) { return (a.id || 0) - (b.id || 0); });

  for (var i = 0; i < unnumbered.length; i++) {
    var p = unnumbered[i];
    var num = getNextProjectNumber();
    p.project_number = num;
    if (p.objectId) {
      try {
        await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, {
          updates: [{ attributes: { ObjectId: p.objectId, project_number: num } }]
        });
        projCount++;
      } catch (err) {
        console.error('[Backfill] Failed to number project:', p.title, err);
      }
    }
  }

  // Now number tasks — group by project, sort by id within each project
  var unnumberedTasks = TASKS.filter(function(t) { return !t.task_number; });
  unnumberedTasks.sort(function(a, b) { return (a.id || 0) - (b.id || 0); });

  for (var j = 0; j < unnumberedTasks.length; j++) {
    var t = unnumberedTasks[j];
    var parentProj = t.project_number != null
      ? (typeof getProjectByNumber === 'function' ? getProjectByNumber(t.project_number) : null)
      : null;
    if (!parentProj || !parentProj.project_number) continue;

    var tNum = getNextTaskNumber(parentProj.project_number);
    t.task_number = tNum;
    if (t.objectId) {
      try {
        await agolApplyEdits(ARCGIS_CONFIG.tasksUrl, {
          updates: [{ attributes: { ObjectId: t.objectId, task_number: tNum } }]
        });
        taskCount++;
      } catch (err) {
        console.error('[Backfill] Failed to number task:', t.title, err);
      }
    }
  }

  showToast('Backfill complete: ' + projCount + ' projects and ' + taskCount + ' tasks numbered.', 'success');
  console.log('[Backfill] Numbered', projCount, 'projects and', taskCount, 'tasks.');
  markDataDirty();
  render();
}

function renderMd(s) {
  if (!s) return '';
  if (typeof marked === 'undefined' || !marked.parse) return esc(s).replace(/\n/g, '<br>');
  try { return '<div class="md-content">' + marked.parse(String(s)) + '</div>'; }
  catch(e) { return esc(s).replace(/\n/g, '<br>'); }
}

// ══════════════════════════════════════════════════════════════════════
//  CALC INFO POPUPS — explains how calculated values are derived
// ══════════════════════════════════════════════════════════════════════
const CALC_EXPLANATIONS = {
  utilization: {
    title: 'Utilization',
    body: 'The percentage of your available project time that is currently allocated to projects.',
    formula: 'Utilization = Allocated Hours \u00f7 Project Capacity',
    guide: 'capacity-math'
  },
  projCapacity: {
    title: 'Project capacity',
    body: 'The maximum hours available for project work this week, after accounting for your schedule, absences, the {PRODUCTIVITY}% productivity factor, and your project time percentage.',
    formula: '(Scheduled Hours \u2212 Absences) \u00d7 {PRODUCTIVITY_FRAC} \u00d7 Project Time %',
    guide: 'capacity-math'
  },
  availableHours: {
    title: 'Available hours',
    body: 'Hours remaining for new project work this week. This is the gap between your project capacity and what is already allocated.',
    formula: 'Available = Project Capacity \u2212 Allocated Hours',
    guide: 'capacity-math'
  },
  allocatedHours: {
    title: 'Allocated hours',
    body: 'Total hours committed to projects this week, calculated from your allocation percentages and project capacity.',
    formula: 'Allocated = Sum of (Fraction \u00d7 Project Capacity) for each project',
    guide: 'resources-tab'
  },
  ytdHours: {
    title: 'Hours logged YTD',
    body: 'The sum of all allocated project hours from the start of the year through the current week. Based on allocation records, not time tracking entries.',
    formula: 'Sum of weekly allocated hours from Week 1 to current week',
    guide: 'resources-tab'
  },
  allocTotal: {
    title: 'Total allocated',
    body: 'The combined allocation percentage across all projects for this week. Over 100% means the person is overcommitted.',
    formula: 'Sum of all project allocation percentages for this week',
    guide: 'resources-tab'
  },
  avgFree: {
    title: 'Average free hours per week',
    body: 'The average unallocated project hours per week across the forecast window. Higher means more room for new work.',
    formula: 'Avg of (Project Capacity \u2212 Allocated Hours) per week over the window',
    guide: 'forecast-tab'
  },
  teamUtil: {
    title: 'Team utilization',
    body: 'The average utilization across all team members for the forecast window. Shows how loaded the team is overall.',
    formula: 'Avg of individual utilization percentages across the window',
    guide: 'forecast-tab'
  },
  heatmapCell: {
    title: 'Utilization heatmap',
    body: 'Each cell shows one person\u2019s utilization for one week. Green means available capacity, yellow is getting tight, red means at or over capacity.',
    guide: 'forecast-tab'
  },
  earliestStart: {
    title: 'Earliest start date',
    body: 'The first week where this person can sustain the required allocation percentage for the full project duration without exceeding 100% utilization. Based on the project size and role selected.',
    formula: 'For each future week: check if (Current Alloc + New Project %) \u2264 100% for every week in the duration',
    guide: 'forecast-tab'
  },
  autoFillPct: {
    title: 'Default allocation percentage',
    body: 'The default weekly allocation set when a project is created or auto-filled. Based on the project size (S/M/L/XL) and the person\u2019s role (Lead/Contributor/Reviewer). Configurable by admins in Settings.',
    guide: 'resources-tab'
  },
  productivityFactor: {
    title: 'Productivity factor ({PRODUCTIVITY}%)',
    body: 'Only {PRODUCTIVITY}% of available work hours are counted as productive project time. The remaining {PRODUCTIVITY_REM}% accounts for meetings, email, admin tasks, and context-switching.',
    guide: 'capacity-math'
  },
  overdue: {
    title: 'Overdue tasks',
    body: 'Tasks where the Working Due Date has passed and the status is not Complete or Canceled.',
    formula: 'Working Due Date < Today AND Status is not Complete/Canceled',
    guide: null
  },
  calibMultiplier: {
    title: 'Schedule multiplier',
    body: 'Typical overrun for projects in this row. Computed as a per-project ratio first, then median-aggregated, so one runaway project does not skew the row. Note: this will NOT equal Median Actual ÷ Median Planned from the adjacent columns — those are independent medians of the underlying values, not inputs to this calculation.',
    formula: 'For each project: ratio = actual_weeks ÷ planned_weeks. Multiplier = median(ratios) across projects in this row.',
    guide: null
  }
};

function calcInfoIcon(key) {
  return ' <span class="calc-info" onclick="showCalcPopup(event,\'' + key + '\')">i</span>';
}

function showCalcPopup(evt, key) {
  evt.stopPropagation();
  var info = CALC_EXPLANATIONS[key];
  if (!info) return;
  var popup = document.getElementById('calc-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'calc-popup';
    document.body.appendChild(popup);
    document.addEventListener('click', function(e) {
      if (!popup.contains(e.target) && !e.target.classList.contains('calc-info')) {
        popup.style.display = 'none';
      }
    });
  }
  // Substitute current productivity ratio so popups stay in sync with the admin-tunable value.
  var prPct = Math.round((_productivityRatio || 0.75) * 100);
  var prRem = 100 - prPct;
  var prFrac = (_productivityRatio || 0.75).toFixed(2);
  function fillPlaceholders(s) {
    return String(s || '').replace(/\{PRODUCTIVITY\}/g, prPct).replace(/\{PRODUCTIVITY_REM\}/g, prRem).replace(/\{PRODUCTIVITY_FRAC\}/g, prFrac);
  }
  var html = '<button class="calc-popup-close" onclick="document.getElementById(\'calc-popup\').style.display=\'none\'">\u2715</button>';
  html += '<div class="calc-popup-title">' + esc(fillPlaceholders(info.title)) + '</div>';
  html += '<div class="calc-popup-body">' + esc(fillPlaceholders(info.body)) + '</div>';
  if (info.formula) {
    html += '<div class="calc-popup-formula">' + esc(fillPlaceholders(info.formula)) + '</div>';
  }
  if (info.guide) {
    html += '<a class="calc-popup-link" href="guide.html#' + info.guide + '" target="_blank">Learn more in the guide \u2192</a>';
  }
  popup.innerHTML = html;
  popup.style.display = 'block';

  // Position near the clicked icon
  var rect = evt.target.getBoundingClientRect();
  var popW = 340;
  var left = rect.left + window.scrollX - popW / 2 + 7;
  if (left < 8) left = 8;
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
  var top = rect.bottom + window.scrollY + 8;
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
}

// Resolve the correct project title for a task via the project_number
// FK (the canonical link in the new schema). Uses _PROJECTS_BY_NUMBER
// built by rebuildProjectIndexes() to avoid a PROJECTS.find scan per
// call — this runs once per task in filterTasks, sortData, and every
// row render.
function resolveProjectTitle(t) {
  if (!t || t.project_number == null) return '';
  var p = _PROJECTS_BY_NUMBER && _PROJECTS_BY_NUMBER[String(t.project_number)];
  return p ? (p.title || '') : '';
}
