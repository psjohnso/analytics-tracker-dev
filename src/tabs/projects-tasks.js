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
  const projTasks = TASKS.filter(function(t) { return t.project === p.title || (!t.project && t.project_id == p.id); });
  const totalTasks = projTasks.length;
  const doneTasks = projTasks.filter(function(t) { return t.status === 'Complete'; }).length;
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
          <div class="assignee-avatar${p.contact && Auth.fullName && p.contact === Auth.fullName ? ' user-self-avatar' : ''}">${initials}</div>
          ${esc(p.contact || 'Unassigned')}
        </div>
        ${(p.other_members || '').split(',').map(s=>s.trim()).filter(Boolean).map(name => {
          const av = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
          const selfCls = Auth.fullName && name === Auth.fullName ? ' user-self-avatar' : '';
          return `<div class="assignee-avatar${selfCls}" title="${esc(name)}" style="background:var(--orange);flex-shrink:0;">${av}</div>`;
        }).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${taskChip}
        <div class="date-info">${endDate}</div>
      </div>
    </div>
  </div>`;
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
    var taskCount = TASKS.filter(function(t) { return t.project === p.title || (!t.project && t.project_id == p.id); }).length;
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
          <div class="assignee-avatar${t.assignee && Auth.fullName && t.assignee === Auth.fullName ? ' user-self-avatar' : ''}">${initials}</div>
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
  return '<span style="font-family:monospace;font-size:10px;font-weight:700;color:var(--navy);background:#EEF2FF;padding:1px 6px;border-radius:4px;margin-right:4px;">' + esc(num) + '</span>';
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
    var parentProj = t.project ? PROJECTS.find(function(p) { return p.title === t.project; }) : null;
    if (!parentProj) parentProj = t.project_id ? PROJECTS.find(function(p) { return p.id == t.project_id; }) : null;
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

// Resolve the correct project title for a task by looking up project title first
// (since project names are unique), then falling back to project_id.
function resolveProjectTitle(t) {
  if (t.project) {
    const p = PROJECTS.find(x => x.title === t.project);
    if (p) return p.title;
  }
  if (t.project_id != null) {
    const p = PROJECTS.find(x => x.id == t.project_id);
    if (p) return p.title;
  }
  return t.project || '';
}
