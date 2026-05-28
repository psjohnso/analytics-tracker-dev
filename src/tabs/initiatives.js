// ─────────────────────────────────────────────────────────────────────
// tabs/initiatives.js — Initiatives sub-tab (under Portfolio)
//
// Three views dispatched by _initState.view:
//   - 'list'   : card grid of all initiatives
//   - 'detail' : hero + KPIs + timeline + project list + watch + activity
//   - 'edit'   : create/edit form with inline project picker
//
// Forward references: INITIATIVES, INITIATIVES_BY_ID, getInitiative,
// getProjectsForInitiative, initiativeProgress, makeInitiativeSlug,
// PROJECTS, RESOURCES_DATA, ARCGIS_CONFIG, agolQuery, agolApplyEdits,
// loadInitiatives, render, esc, showToast, isAdmin, isLead,
// openProject (project-detail open).
// ─────────────────────────────────────────────────────────────────────

var _initState = { view: 'list', activeId: null, editId: null };
// In-edit form draft — replaces _initState fields when the user is mid-form.
// Persists across re-renders triggered by the project-attach picker.
var _initEditDraft = null;
// Toggled by the detail view's "+ Add project" button.
var _initDetailPickerOpen = false;

// ── Entry point ─────────────────────────────────────────────────────
function renderInitiatives(area) {
  if (!ARCGIS_CONFIG.initiativesUrl) {
    area.innerHTML = '<div class="init-page"><div class="init-empty-state">' +
      '<div class="init-empty-title">Initiatives feature not yet configured</div>' +
      '<div class="init-empty-desc">Run <code>notebooks/setup_initiatives_table.ipynb</code> to create the AGOL table, then paste the URL into <code>ARCGIS_CONFIG.initiativesUrl</code>. The Initiatives tab will activate after a refresh.</div>' +
    '</div></div>';
    return;
  }
  if (_initState.view === 'edit') return renderInitiativeEditPage(area);
  if (_initState.view === 'detail') return renderInitiativeDetailPage(area);
  return renderInitiativesListPage(area);
}

function _initCanManage() {
  return (typeof isAdmin === 'function' && isAdmin()) || (typeof isLead === 'function' && isLead());
}

// ── LIST VIEW ───────────────────────────────────────────────────────
function renderInitiativesListPage(area) {
  var canManage = _initCanManage();
  var cards = INITIATIVES.map(_initListCard).join('');
  if (!cards) {
    cards = '<div class="init-empty-state" style="grid-column:1/-1;">' +
      '<div class="init-empty-title">No initiatives yet</div>' +
      '<div class="init-empty-desc">' +
        (canManage
          ? 'Create your first initiative to group related projects under a shared strategic objective.'
          : 'Initiatives let admins group related projects under a strategic objective. None have been created yet.') +
      '</div>' +
      (canManage ? '<button class="oe-btn oe-btn--primary" onclick="initNew()" style="margin-top:14px;"><svg class="icon" aria-hidden="true"><use href="#ph-plus"></use></svg> Create initiative</button>' : '') +
    '</div>';
  }
  area.innerHTML = '<div class="init-page">' +
    '<div class="init-page-head">' +
      '<div>' +
        '<div class="init-page-eyebrow">All teams · Strategic objectives</div>' +
        '<h1 class="init-page-title"><span class="init-display">Initiatives</span></h1>' +
      '</div>' +
      (canManage ? '<button class="oe-btn oe-btn--primary" onclick="initNew()"><svg class="icon" aria-hidden="true"><use href="#ph-plus"></use></svg> New initiative</button>' : '') +
    '</div>' +
    '<div class="init-grid">' + cards + '</div>' +
  '</div>';
}

function _initListCard(initiative) {
  var projects = getProjectsForInitiative(initiative.initiative_id);
  var progress = Math.round(initiativeProgress(initiative) * 100);
  var statusCounts = {};
  projects.forEach(function(p) { var s = p.status || '—'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
  var completeCt = statusCounts['Complete'] || 0;
  var activeCt = statusCounts['Active'] || 0;
  var schedCt = statusCounts['Scheduled'] || 0;
  var derived = (typeof deriveInitiativeStatus === 'function') ? deriveInitiativeStatus(initiative) : (initiative.status || 'Planning');
  var targetDateLabel = '';
  if (initiative.target_completion) {
    targetDateLabel = 'Targets <strong>' + _initFmtDate(initiative.target_completion) + '</strong>';
  } else if (initiative.target_start) {
    targetDateLabel = 'Starts <strong>' + _initFmtDate(initiative.target_start) + '</strong>';
  } else {
    targetDateLabel = '<em style="color:var(--ink-5);">No target date</em>';
  }
  var progFill = (derived === 'Scheduled') ? '#4a7fae' : (derived === 'Complete' ? '#4a6b48' : (derived === 'On Hold' ? '#c89500' : '#4a6b48'));
  return '<div class="init-card" onclick="initOpen(\'' + esc(initiative.initiative_id) + '\')">' +
    '<div class="init-card-title">' + esc(initiative.name) + '</div>' +
    '<div class="init-card-meta">' + projects.length + ' project' + (projects.length === 1 ? '' : 's') + (initiative.owner ? ' · ' + esc(initiative.owner) : '') + '</div>' +
    '<div class="init-card-desc">' + esc(initiative.description || '') + '</div>' +
    '<div class="init-card-stats">' +
      '<div class="stat"><div class="v">' + completeCt + '/' + projects.length + '</div><div class="l">Complete</div></div>' +
      '<div class="stat"><div class="v">' + activeCt + '</div><div class="l">Active</div></div>' +
      '<div class="stat"><div class="v">' + schedCt + '</div><div class="l">Scheduled</div></div>' +
    '</div>' +
    '<div class="init-progress-bar"><div class="init-progress-fill" style="width:' + progress + '%; background:' + progFill + ';"></div></div>' +
    '<div class="init-card-foot">' +
      '<span>' + targetDateLabel + '</span>' +
      '<span class="oe-pill" data-status="' + esc(derived) + '">' + esc(derived) + '</span>' +
    '</div>' +
  '</div>';
}

// ── DETAIL VIEW ─────────────────────────────────────────────────────
function renderInitiativeDetailPage(area) {
  var initiative = getInitiative(_initState.activeId);
  if (!initiative) {
    _initState.view = 'list';
    return renderInitiativesListPage(area);
  }
  var canManage = _initCanManage();
  var projects = getProjectsForInitiative(initiative.initiative_id);
  var derived = (typeof deriveInitiativeStatus === 'function') ? deriveInitiativeStatus(initiative) : (initiative.status || 'Planning');
  var progress = Math.round(initiativeProgress(initiative) * 100);
  var completeCt = projects.filter(function(p) { return p.status === 'Complete'; }).length;
  var atRisk = _initAtRiskProjects(projects);
  var hoursYtd = _initAllocatedHoursYtd(projects);
  var weeksToTarget = _initWeeksToTarget(initiative.target_completion);

  // Compose the page
  var html = '<div class="init-page">';
  html += '<a class="init-back-link" onclick="initBackToList()"><svg class="icon" aria-hidden="true"><use href="#ph-arrow-left"></use></svg> All initiatives</a>';

  // HERO
  html += '<div class="init-hero">' +
    '<div class="eyebrow">Initiative · Strategic objective' + (initiative.strategic_alignment ? ' · ' + esc(initiative.strategic_alignment) : '') + '</div>' +
    '<h1 class="title">' + esc(initiative.name) + '</h1>' +
    (initiative.description ? '<div class="summary">' + esc(initiative.description) + '</div>' : '') +
    '<div class="meta-row">' +
      '<div class="meta-item"><span class="meta-label">Status</span><span class="meta-value"><span class="oe-pill" data-status="' + esc(derived) + '" style="background:rgba(255,255,255,0.15); color:rgba(255,255,255,0.95);">' + esc(derived) + '</span></span></div>' +
      (initiative.owner ? '<div class="meta-item"><span class="meta-label">Owner</span><span class="meta-value">' + esc(initiative.owner) + '</span></div>' : '') +
      (initiative.target_start ? '<div class="meta-item"><span class="meta-label">Started</span><span class="meta-value mono">' + _initFmtDate(initiative.target_start) + '</span></div>' : '') +
      (initiative.target_completion ? '<div class="meta-item"><span class="meta-label">Target</span><span class="meta-value mono">' + _initFmtDate(initiative.target_completion) + '</span></div>' : '') +
      '<div class="meta-item"><span class="meta-label">Progress</span><span class="meta-value mono">' + progress + '% · ' + completeCt + ' of ' + projects.length + '</span></div>' +
    '</div>' +
    (canManage ? '<div class="init-hero-actions"><button class="oe-btn oe-btn--secondary oe-btn--sm" onclick="initEdit(\'' + esc(initiative.initiative_id) + '\')" style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.3);"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg> Edit initiative</button></div>' : '') +
  '</div>';

  // KPI STRIP
  var onTrack = projects.length - atRisk.length;
  var weeksLabel = weeksToTarget == null ? '—' : (weeksToTarget < 0 ? Math.abs(weeksToTarget) + ' past' : weeksToTarget + '');
  var weeksClass = weeksToTarget != null && weeksToTarget < 0 ? 'warn' : '';
  html += '<div class="init-kpi-strip">' +
    '<div class="init-kpi"><div class="kpi-label">Projects on track</div><div class="kpi-value ' + (atRisk.length ? 'warn' : 'good') + '">' + onTrack + ' <span style="font-size:14px;color:var(--ink-5);">/ ' + projects.length + '</span></div><div class="kpi-sub">' + (atRisk.length ? atRisk.length + ' at-risk' : 'All on schedule') + '</div></div>' +
    '<div class="init-kpi"><div class="kpi-label">Hours allocated YTD</div><div class="kpi-value">' + hoursYtd.toFixed(0) + 'h</div><div class="kpi-sub">Across child projects</div></div>' +
    '<div class="init-kpi"><div class="kpi-label">Weeks to target</div><div class="kpi-value ' + weeksClass + '">' + weeksLabel + '</div><div class="kpi-sub">' + (initiative.target_completion ? _initFmtDate(initiative.target_completion) : 'No target set') + '</div></div>' +
    '<div class="init-kpi"><div class="kpi-label">Open risks</div><div class="kpi-value ' + (atRisk.length ? 'warn' : '') + '">' + atRisk.length + '</div><div class="kpi-sub">' + (atRisk.length ? 'See watch list' : 'Nothing flagged') + '</div></div>' +
  '</div>';

  // TIMELINE
  html += _initTimelineHtml(initiative, projects);

  // TWO-COLUMN: project list + side panel
  html += '<div class="init-two-col">';
  html += _initProjectListHtml(initiative, projects, canManage);
  html += '<div>';
  html += _initWatchListHtml(atRisk);
  html += _initActivityHtml(initiative, projects);
  html += '</div>';
  html += '</div>';

  html += '</div>'; // init-page
  area.innerHTML = html;
}

// ── DETAIL view: helpers ────────────────────────────────────────────
function _initAtRiskProjects(projects) {
  var today = new Date().toISOString().slice(0, 10);
  return projects.filter(function(p) {
    if (p.status === 'Complete' || p.status === 'Canceled') return false;
    var eff = p.working_due || p.end;
    return eff && eff < today;
  });
}

function _initAllocatedHoursYtd(projects) {
  // Sum of every team member's weekly_allocated through current week, for the
  // weeks where their allocations attribute to one of these projects. Cheap
  // approximation: sum allocation.hours[0..cwIdx] across all allocations
  // whose project matches one in this initiative's project set.
  if (typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return 0;
  var cwi = (typeof window.currentWeekIdx === 'number') ? window.currentWeekIdx : 0;
  var titleSet = {};
  projects.forEach(function(p) { if (p.title) titleSet[p.title] = true; });
  var total = 0;
  Object.values(RESOURCES_DATA.people).forEach(function(person) {
    (person.allocations || []).forEach(function(alloc) {
      if (!titleSet[alloc.project]) return;
      for (var i = 0; i <= cwi && i < (alloc.hours || []).length; i++) {
        total += alloc.hours[i] || 0;
      }
    });
  });
  return total;
}

function _initWeeksToTarget(targetCompletion) {
  if (!targetCompletion) return null;
  var t = new Date(targetCompletion + 'T00:00:00');
  var now = new Date();
  return Math.round((t - now) / (1000 * 60 * 60 * 24 * 7));
}

function _initTimelineHtml(initiative, projects) {
  if (!projects.length) {
    return '<div class="init-card" style="padding:24px 28px;margin-bottom:24px;color:var(--ink-5);">' +
      '<div class="init-section-eyebrow">Project phasing</div>' +
      '<div style="margin-top:8px;font-size:13px;">No projects attached yet. Use "+ Add project" below to attach existing projects to this initiative.</div>' +
    '</div>';
  }
  // Window: min of all starts, max of all ends. Pad +/- 10% so bars don't kiss edges.
  var allStarts = projects.map(function(p) { return p.start; }).filter(Boolean);
  var allEnds = projects.map(function(p) { return p.working_due || p.end; }).filter(Boolean);
  if (initiative.target_start) allStarts.push(initiative.target_start);
  if (initiative.target_completion) allEnds.push(initiative.target_completion);
  if (!allStarts.length || !allEnds.length) {
    return '<div class="init-card" style="padding:24px 28px;margin-bottom:24px;color:var(--ink-5);">' +
      '<div class="init-section-eyebrow">Project phasing</div>' +
      '<div style="margin-top:8px;font-size:13px;">Add start + end dates to the projects to see them on the timeline.</div>' +
    '</div>';
  }
  var minDate = allStarts.sort()[0];
  var maxDate = allEnds.sort()[allEnds.length - 1];
  var winStart = new Date(minDate + 'T00:00:00');
  var winEnd = new Date(maxDate + 'T00:00:00');
  var totalMs = Math.max(1, winEnd - winStart);
  var todayMs = Math.min(Math.max(0, new Date() - winStart), totalMs);
  var todayPct = (todayMs / totalMs) * 100;

  function _pct(dateStr) {
    if (!dateStr) return 0;
    var d = new Date(dateStr + 'T00:00:00');
    return Math.max(0, Math.min(100, ((d - winStart) / totalMs) * 100));
  }
  var rows = projects.map(function(p, idx) {
    var start = p.start || minDate;
    var end = p.working_due || p.end || maxDate;
    var leftPct = _pct(start);
    var widthPct = Math.max(2, _pct(end) - leftPct);
    var today = new Date().toISOString().slice(0, 10);
    var cls = 'init-bar-' + ((p.status || '').toLowerCase().replace(/[^a-z]/g, ''));
    var isAtRisk = (p.status !== 'Complete' && p.status !== 'Canceled') && (p.working_due || p.end) && (p.working_due || p.end) < today;
    if (isAtRisk) cls = 'init-bar-overdue';
    return '<div class="init-tl-row">' +
      '<div class="row-label"><strong>' + (idx + 1) + '. ' + esc(p.title || '') + '</strong>' +
        '<span class="meta">' + _initFmtMonth(start) + ' – ' + _initFmtMonth(end) + ' · ' + esc(p.status || '') + '</span>' +
      '</div>' +
      '<div class="track"><div class="bar ' + cls + '" style="left:' + leftPct.toFixed(1) + '%;width:' + widthPct.toFixed(1) + '%;">' + esc(p.title || '').slice(0, 32) + '</div></div>' +
    '</div>';
  }).join('');

  // X-axis ticks (months)
  var ticks = [];
  var cursor = new Date(winStart);
  cursor.setDate(1);
  while (cursor < winEnd) {
    var pct = ((cursor - winStart) / totalMs) * 100;
    if (pct >= 0 && pct <= 100) {
      ticks.push('<div class="tick" style="left:' + pct.toFixed(1) + '%;">' + cursor.toLocaleDateString('en-US', { month: 'short' }) + '</div>');
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return '<div class="init-timeline-card">' +
    '<div class="init-tl-head">' +
      '<div class="title-block">' +
        '<div class="init-section-eyebrow">Project phasing</div>' +
        '<div class="h">How these ' + projects.length + ' projects sequence toward the objective</div>' +
      '</div>' +
      '<div class="legend">' +
        '<span class="ch"><span class="dot" style="background:#8a4c70;"></span> Complete</span>' +
        '<span class="ch"><span class="dot" style="background:#4a6b48;"></span> Active</span>' +
        '<span class="ch"><span class="dot" style="background:#4a7fae;opacity:0.85;"></span> Scheduled</span>' +
        '<span class="ch"><span class="dot" style="background:#b85630;"></span> At-risk</span>' +
      '</div>' +
    '</div>' +
    '<div class="init-timeline">' +
      (todayPct >= 0 && todayPct <= 100 ? '<div class="init-today" style="left:calc(200px + 14px + ' + todayPct.toFixed(1) + '%);"></div>' : '') +
      rows +
      '<div class="init-tl-axis">' + ticks.join('') + '</div>' +
    '</div>' +
  '</div>';
}

function _initProjectListHtml(initiative, projects, canManage) {
  var rows = projects.map(function(p, idx) {
    var today = new Date().toISOString().slice(0, 10);
    var isAtRisk = (p.status !== 'Complete' && p.status !== 'Canceled') && (p.working_due || p.end) && (p.working_due || p.end) < today;
    var rowStyle = isAtRisk ? ' style="background:#fff5ef;"' : '';
    var lead = p.contact || '—';
    var avInit = lead.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    var statusLabel = isAtRisk ? 'At-risk' : (p.status || '—');
    var statusKey = isAtRisk ? 'Overdue' : (p.status || '');
    var window_ = _initFmtMonth(p.start) + (p.start && (p.working_due || p.end) ? ' – ' + _initFmtMonth(p.working_due || p.end) : '');
    var openHandler = p.objectId ? 'onclick="openProject(' + p.objectId + ')"' : '';
    return '<tr' + rowStyle + '>' +
      '<td><span class="init-seq-handle">' + (idx + 1) + '</span></td>' +
      '<td' + (p.objectId ? ' style="cursor:pointer;" ' + openHandler : '') + '>' +
        '<div class="init-proj-num">' + esc(p.project_number || ('#' + (p.id || ''))) + '</div>' +
        '<div class="init-proj-title">' + esc(p.title || '(no title)') + '</div>' +
      '</td>' +
      '<td><span class="init-person-chip"><span class="av">' + esc(avInit) + '</span> ' + esc(lead) + '</span></td>' +
      '<td><span class="oe-pill" data-status="' + esc(statusKey) + '">' + esc(statusLabel) + '</span></td>' +
      '<td class="num">' + esc(window_ || '—') + '</td>' +
      (canManage ? '<td style="text-align:right;"><button class="oe-btn oe-btn--ghost oe-btn--sm" onclick="event.stopPropagation();initDetachProject(' + (p.objectId || 0) + ')" title="Remove from this initiative"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg></button></td>' : '') +
    '</tr>';
  }).join('');

  var html = '<div class="init-proj-list-card">' +
    '<div class="head">' +
      '<div class="title-block">' +
        '<div class="init-section-eyebrow">Projects</div>' +
        '<div class="h">' + projects.length + ' project' + (projects.length === 1 ? '' : 's') + ' in sequence</div>' +
      '</div>' +
      (canManage ? '<button class="oe-btn oe-btn--secondary oe-btn--sm" onclick="initTogglePicker()"><svg class="icon" aria-hidden="true"><use href="#ph-plus"></use></svg> Add project</button>' : '') +
    '</div>';

  if (_initDetailPickerOpen && canManage) {
    html += '<div class="init-detail-picker-wrap">' + _initBuildPickerHtml('detail') + '</div>';
  }

  if (projects.length) {
    html += '<table>' +
      '<thead><tr><th style="width:30px;"></th><th>Project</th><th>Lead</th><th>Status</th><th class="num">Window</th>' + (canManage ? '<th></th>' : '') + '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  } else {
    html += '<div style="padding:24px;text-align:center;color:var(--ink-5);font-size:13px;">No projects attached. ' + (canManage ? 'Use "+ Add project" above to attach them.' : '') + '</div>';
  }

  html += '</div>';
  return html;
}

function _initWatchListHtml(atRiskProjects) {
  if (!atRiskProjects.length) {
    return '<div class="init-side-card init-watch-card">' +
      '<div class="init-section-eyebrow"><svg class="icon" aria-hidden="true"><use href="#ph-check-circle"></use></svg> Watch list</div>' +
      '<div style="font-size:12px;color:var(--ink-5);margin-top:8px;">Nothing flagged. All projects are within their working due dates.</div>' +
    '</div>';
  }
  var items = atRiskProjects.map(function(p) {
    var eff = p.working_due || p.end;
    var origNote = (p.working_due && p.end && p.working_due !== p.end) ? ' (orig: ' + _initFmtDate(p.end) + ')' : '';
    return '<div class="init-risk-item">' +
      '<div class="ic"><svg class="icon" aria-hidden="true"><use href="#ph-warning-circle"></use></svg></div>' +
      '<div class="body">' +
        '<div class="proj">' + esc(p.project_number || ('#' + (p.id || ''))) + ' · ' + esc(p.title || '') + '</div>' +
        '<div><strong>Past due.</strong> Working due ' + _initFmtDate(eff) + origNote + '. Status: ' + esc(p.status || '—') + '.</div>' +
      '</div>' +
    '</div>';
  }).join('');
  return '<div class="init-side-card init-watch-card">' +
    '<div class="init-section-eyebrow"><svg class="icon" aria-hidden="true"><use href="#ph-warning-octagon"></use></svg> Watch list</div>' +
    items +
  '</div>';
}

function _initActivityHtml(initiative, projects) {
  // V1 activity: pulls recent status changes / review notes from existing
  // data sources. If status_history is loaded, surface the last 5 entries
  // across these projects.
  var entries = [];
  if (typeof STATUS_HISTORY !== 'undefined' && Array.isArray(STATUS_HISTORY)) {
    var titleSet = {};
    projects.forEach(function(p) { if (p.project_number) titleSet[String(p.project_number)] = true; });
    STATUS_HISTORY.forEach(function(h) {
      if (titleSet[String(h.project_number)]) entries.push({ kind: 'status', h: h });
    });
  }
  entries.sort(function(a, b) { return (b.h.changed_at || 0) - (a.h.changed_at || 0); });
  entries = entries.slice(0, 6);

  if (!entries.length) {
    return '<div class="init-side-card">' +
      '<div class="init-section-eyebrow">Recent activity</div>' +
      '<div style="font-size:12px;color:var(--ink-5);margin-top:8px;">No tracked activity on the attached projects yet.</div>' +
    '</div>';
  }
  var items = entries.map(function(e) {
    var h = e.h;
    var when = h.changed_at ? new Date(h.changed_at) : null;
    var whenLabel = when ? _initRelTime(when) : '';
    var projTitle = '';
    var p = projects.find(function(pp) { return String(pp.project_number) === String(h.project_number); });
    if (p) projTitle = p.title || '';
    return '<div class="init-act-item">' +
      '<span class="icon">📈</span>' +
      '<div class="body">' +
        '<span class="who">' + esc(h.changed_by || '—') + '</span> <span class="when">' + esc(whenLabel) + '</span>' +
        '<div class="what">Status on <strong>' + esc(projTitle) + '</strong>: ' + esc(h.old_status || '—') + ' → <strong>' + esc(h.new_status || '—') + '</strong></div>' +
      '</div>' +
    '</div>';
  }).join('');
  return '<div class="init-side-card">' +
    '<div class="init-section-eyebrow">Recent activity</div>' +
    items +
  '</div>';
}

// ── EDIT VIEW (create + edit share one form) ────────────────────────
function renderInitiativeEditPage(area) {
  var isNew = !_initState.editId;
  var initiative = isNew ? null : getInitiative(_initState.editId);
  if (!isNew && !initiative) {
    _initState.view = 'list';
    return renderInitiativesListPage(area);
  }
  // Build draft on first render of this edit session; preserve across re-renders
  // (e.g. picker open/close).
  if (!_initEditDraft || _initEditDraft._for !== _initState.editId) {
    _initEditDraft = isNew
      ? { _for: null, _new: true, _attached: [], name: '', description: '', owner: '', status: 'Planning', target_start: '', target_completion: '', strategic_alignment: '' }
      : Object.assign({ _for: initiative.initiative_id, _new: false, _attached: getProjectsForInitiative(initiative.initiative_id).map(function(p) { return p.objectId; }) }, initiative);
  }

  var attachedRows = _initEditDraft._attached.map(function(oid) {
    var p = PROJECTS.find(function(x) { return x.objectId === oid; });
    if (!p) return '';
    return '<span class="attach-chip"><span class="proj-num">' + esc(p.project_number || '') + '</span> ' + esc(p.title || '') + ' <i class="ph ph-x" onclick="initDetachInForm(' + oid + ')" title="Remove from attached list"></i></span>';
  }).join('');

  var html = '<div class="init-page init-page--form">';
  html += '<a class="init-back-link" onclick="initBackToList()"><svg class="icon" aria-hidden="true"><use href="#ph-arrow-left"></use></svg> All initiatives</a>';
  html += '<div class="init-page-eyebrow">' + (isNew ? 'New initiative' : 'Edit · ' + esc(initiative.name)) + '</div>';
  html += '<h1 class="init-page-title"><span class="init-display">' + (isNew ? 'Set up an objective' : 'Edit initiative') + '</span></h1>';

  html += '<div class="init-form-grid">';

  html += '<div class="init-form-row"><label class="lbl">Name *</label>' +
    '<input type="text" id="init-f-name" value="' + esc(_initEditDraft.name) + '" placeholder="e.g. Tucson Data Modernization Phase 1"></div>';

  html += '<div class="init-form-row"><label class="lbl">Description</label>' +
    '<textarea id="init-f-description" placeholder="What this initiative delivers and why it matters. 1–3 sentences.">' + esc(_initEditDraft.description) + '</textarea></div>';

  // Owner dropdown — populate from team_members
  var ownerOptions = '<option value="">— None —</option>';
  if (typeof RESOURCES_DATA !== 'undefined' && RESOURCES_DATA && RESOURCES_DATA.people) {
    Object.keys(RESOURCES_DATA.people).sort().forEach(function(nm) {
      var sel = nm === _initEditDraft.owner ? ' selected' : '';
      ownerOptions += '<option value="' + esc(nm) + '"' + sel + '>' + esc(nm) + '</option>';
    });
  }
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
    '<div class="init-form-row"><label class="lbl">Owner *</label><select id="init-f-owner">' + ownerOptions + '</select></div>' +
    '<div class="init-form-row"><label class="lbl">Status</label><select id="init-f-status">' +
      ['Planning', 'Active', 'On Hold', 'Complete', 'Canceled'].map(function(s) { return '<option value="' + s + '"' + (s === _initEditDraft.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
    '</select></div>' +
  '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
    '<div class="init-form-row"><label class="lbl">Target start</label><input type="date" id="init-f-target-start" value="' + esc(_initEditDraft.target_start || '') + '"></div>' +
    '<div class="init-form-row"><label class="lbl">Target completion</label><input type="date" id="init-f-target-completion" value="' + esc(_initEditDraft.target_completion || '') + '"></div>' +
  '</div>';

  html += '<div class="init-form-row"><label class="lbl">Strategic alignment</label>' +
    '<input type="text" id="init-f-strategic-alignment" value="' + esc(_initEditDraft.strategic_alignment || '') + '" placeholder="e.g. Data Program, Safe City">' +
    '<div class="hint">Optional. Free-text tag for grouping into higher-level strategic programs.</div>' +
  '</div>';

  // Attached projects block
  html += '<div class="init-attach-block">' +
    '<div class="init-attach-head">' +
      '<div><div class="init-attach-title">Attached projects</div><div class="init-attach-sub">Pick the projects that contribute to this initiative. Attaching here, or via a project\'s own edit form, both work.</div></div>' +
      '<button class="oe-btn oe-btn--secondary oe-btn--sm" onclick="initToggleFormPicker()"><svg class="icon" aria-hidden="true"><use href="#ph-plus"></use></svg> Add project</button>' +
    '</div>' +
    '<div class="init-attach-chip-list">' + (attachedRows || '<span style="font-size:12px;color:var(--ink-5);">No projects attached yet. Use "+ Add project" above.</span>') + '</div>' +
    (_initEditDraft._pickerOpen ? '<div class="init-attach-picker">' + _initBuildPickerHtml('form') + '</div>' : '') +
  '</div>';

  // Form actions
  html += '<div class="init-form-actions">' +
    '<button class="oe-btn oe-btn--primary" onclick="initSave()"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg> ' + (isNew ? 'Create initiative' : 'Save changes') + '</button>' +
    '<button class="oe-btn oe-btn--secondary" onclick="initCancelEdit()">Cancel</button>' +
    (!isNew ? '<button class="oe-btn oe-btn--ghost" onclick="btnPending(this, () => initDelete(\'' + esc(initiative.initiative_id) + '\'), \'Delete?\')" style="margin-left:auto;color:var(--status-overdue-fg);"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg> Delete initiative</button>' : '') +
  '</div>';

  html += '</div>'; // init-form-grid
  html += '</div>'; // init-page
  area.innerHTML = html;
}

// Shared picker (used both on detail-view +Add and on edit-form Attached Projects)
function _initBuildPickerHtml(context) {
  // Filter: unattached projects (default) vs all projects
  var filterAll = false;
  var alreadyAttached = {};
  if (context === 'form' && _initEditDraft) {
    _initEditDraft._attached.forEach(function(oid) { alreadyAttached[oid] = true; });
  } else if (context === 'detail') {
    var initiative = getInitiative(_initState.activeId);
    if (initiative) {
      getProjectsForInitiative(initiative.initiative_id).forEach(function(p) { alreadyAttached[p.objectId] = true; });
    }
  }
  var candidates = PROJECTS.filter(function(p) {
    if (alreadyAttached[p.objectId]) return false;
    if (p.status === 'Idea') return false;
    return true;
  }).sort(function(a, b) {
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
  var rows = candidates.slice(0, 200).map(function(p) {
    var otherInit = p.initiative_id ? getInitiative(p.initiative_id) : null;
    var warnClass = otherInit ? ' picker-row--warn' : '';
    var meta = esc((p.contact || '—') + ' · ' + (p.status || '—'));
    if (otherInit) meta += ' · already in <strong>' + esc(otherInit.name) + '</strong> — attaching will move it';
    return '<label class="picker-row' + warnClass + '">' +
      '<input type="checkbox" data-oid="' + p.objectId + '" data-context="' + context + '">' +
      '<span class="proj-num">' + esc(p.project_number || ('#' + (p.id || ''))) + '</span>' +
      '<span class="picker-title">' + esc(p.title || '') + '</span>' +
      '<span class="picker-meta">' + meta + '</span>' +
    '</label>';
  }).join('');

  var cancelHandler = context === 'form' ? 'initToggleFormPicker()' : 'initTogglePicker()';
  var confirmHandler = context === 'form' ? 'initConfirmFormPicker()' : 'initConfirmDetailPicker()';
  return '<div class="picker-head">' +
    '<input type="text" id="init-picker-search-' + context + '" placeholder="Search projects by number, title, or contact…" class="picker-search" oninput="initPickerFilter(\'' + context + '\')">' +
  '</div>' +
  '<div class="picker-results" id="init-picker-results-' + context + '">' + rows + '</div>' +
  '<div class="picker-foot">' +
    '<span style="font-size:11px;color:var(--ink-5);">Selected projects append to the end of the sequence — drag to reorder.</span>' +
    '<div style="display:flex;gap:8px;">' +
      '<button class="oe-btn oe-btn--ghost oe-btn--sm" onclick="' + cancelHandler + '">Cancel</button>' +
      '<button class="oe-btn oe-btn--primary oe-btn--sm" onclick="' + confirmHandler + '">Attach selected</button>' +
    '</div>' +
  '</div>';
}

function initPickerFilter(context) {
  var q = (document.getElementById('init-picker-search-' + context) || {}).value || '';
  var results = document.getElementById('init-picker-results-' + context);
  if (!results) return;
  var qLower = q.toLowerCase();
  Array.prototype.forEach.call(results.querySelectorAll('.picker-row'), function(row) {
    var txt = row.textContent.toLowerCase();
    row.style.display = (!qLower || txt.indexOf(qLower) >= 0) ? '' : 'none';
  });
}

// ── Action handlers ─────────────────────────────────────────────────
function initOpen(initiativeId) {
  _initState = { view: 'detail', activeId: initiativeId, editId: null };
  _initDetailPickerOpen = false;
  render();
}

function initBackToList() {
  _initState = { view: 'list', activeId: null, editId: null };
  _initEditDraft = null;
  _initDetailPickerOpen = false;
  render();
}

function initNew() {
  if (!_initCanManage()) { showToast('You must be an admin or lead to create initiatives.', 'error'); return; }
  _initState = { view: 'edit', activeId: null, editId: null };
  _initEditDraft = null;
  render();
}

function initEdit(initiativeId) {
  if (!_initCanManage()) { showToast('You must be an admin or lead to edit initiatives.', 'error'); return; }
  _initState = { view: 'edit', activeId: initiativeId, editId: initiativeId };
  _initEditDraft = null;
  render();
}

function initCancelEdit() {
  if (_initState.editId) {
    _initState = { view: 'detail', activeId: _initState.editId, editId: null };
  } else {
    _initState = { view: 'list', activeId: null, editId: null };
  }
  _initEditDraft = null;
  render();
}

function initToggleFormPicker() {
  if (!_initEditDraft) return;
  // Capture current field values into draft before re-rendering
  _initCaptureFormValues();
  _initEditDraft._pickerOpen = !_initEditDraft._pickerOpen;
  render();
}

function initTogglePicker() {
  _initDetailPickerOpen = !_initDetailPickerOpen;
  render();
}

function initDetachInForm(oid) {
  if (!_initEditDraft) return;
  _initCaptureFormValues();
  _initEditDraft._attached = _initEditDraft._attached.filter(function(x) { return x !== oid; });
  render();
}

function initConfirmFormPicker() {
  if (!_initEditDraft) return;
  _initCaptureFormValues();
  var picked = Array.prototype.map.call(document.querySelectorAll('#init-picker-results-form input[type="checkbox"]:checked'), function(cb) { return parseInt(cb.dataset.oid, 10); });
  picked.forEach(function(oid) { if (_initEditDraft._attached.indexOf(oid) < 0) _initEditDraft._attached.push(oid); });
  _initEditDraft._pickerOpen = false;
  render();
}

async function initConfirmDetailPicker() {
  var initiative = getInitiative(_initState.activeId);
  if (!initiative) return;
  var picked = Array.prototype.map.call(document.querySelectorAll('#init-picker-results-detail input[type="checkbox"]:checked'), function(cb) { return parseInt(cb.dataset.oid, 10); });
  if (!picked.length) { showToast('No projects selected.', 'warn'); return; }
  showToast('Attaching ' + picked.length + ' project(s)…', 'info');
  try {
    var existing = getProjectsForInitiative(initiative.initiative_id);
    var nextSeq = existing.length;
    var updates = picked.map(function(oid) {
      return { attributes: { ObjectId: oid, initiative_id: initiative.initiative_id, initiative_sequence: nextSeq++ } };
    });
    await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, { updates: updates });
    // Update in-memory PROJECTS
    picked.forEach(function(oid, i) {
      var p = PROJECTS.find(function(x) { return x.objectId === oid; });
      if (p) { p.initiative_id = initiative.initiative_id; p.initiative_sequence = existing.length + i; }
    });
    _initDetailPickerOpen = false;
    showToast('Attached ' + picked.length + ' project(s).', 'success');
    render();
  } catch (err) {
    console.error('[Initiatives] Attach failed:', err);
    showToast('Attach failed: ' + err.message, 'error');
  }
}

async function initDetachProject(oid) {
  if (!oid) return;
  if (!_initCanManage()) { showToast('Permission denied.', 'error'); return; }
  try {
    await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, {
      updates: [{ attributes: { ObjectId: oid, initiative_id: null, initiative_sequence: null } }]
    });
    var p = PROJECTS.find(function(x) { return x.objectId === oid; });
    if (p) { p.initiative_id = null; p.initiative_sequence = null; }
    showToast('Project detached.', 'success');
    render();
  } catch (err) {
    console.error('[Initiatives] Detach failed:', err);
    showToast('Detach failed: ' + err.message, 'error');
  }
}

function _initCaptureFormValues() {
  if (!_initEditDraft) return;
  function v(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  _initEditDraft.name = v('init-f-name');
  _initEditDraft.description = v('init-f-description');
  _initEditDraft.owner = v('init-f-owner');
  _initEditDraft.status = v('init-f-status') || 'Planning';
  _initEditDraft.target_start = v('init-f-target-start');
  _initEditDraft.target_completion = v('init-f-target-completion');
  _initEditDraft.strategic_alignment = v('init-f-strategic-alignment');
}

async function initSave() {
  if (!_initCanManage()) { showToast('Permission denied.', 'error'); return; }
  if (!_initEditDraft) return;
  _initCaptureFormValues();
  if (!_initEditDraft.name.trim()) { showToast('Name is required.', 'error'); return; }
  if (!_initEditDraft.owner) { showToast('Owner is required.', 'error'); return; }

  var attrs = {
    name: _initEditDraft.name.trim(),
    description: _initEditDraft.description || null,
    owner: _initEditDraft.owner || null,
    status: _initEditDraft.status || 'Planning',
    target_start: _initEditDraft.target_start || null,
    target_completion: _initEditDraft.target_completion || null,
    strategic_alignment: _initEditDraft.strategic_alignment || null,
  };

  try {
    var initiativeId;
    if (_initEditDraft._new) {
      attrs.initiative_id = makeInitiativeSlug(_initEditDraft.name);
      var addResult = await agolApplyEdits(ARCGIS_CONFIG.initiativesUrl, { adds: [{ attributes: attrs }] });
      var ok = addResult && addResult.addResults && addResult.addResults[0] && addResult.addResults[0].success;
      if (!ok) throw new Error('AGOL rejected the add');
      var newOid = addResult.addResults[0].objectId;
      initiativeId = attrs.initiative_id;
      var entry = Object.assign({ objectId: newOid }, attrs);
      INITIATIVES.push(entry);
      INITIATIVES.sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
      INITIATIVES_BY_ID[initiativeId] = entry;
    } else {
      var current = getInitiative(_initEditDraft._for);
      if (!current) throw new Error('Initiative no longer exists');
      attrs.ObjectId = current.objectId;
      attrs.initiative_id = current.initiative_id;
      await agolApplyEdits(ARCGIS_CONFIG.initiativesUrl, { updates: [{ attributes: attrs }] });
      Object.assign(current, attrs);
      initiativeId = current.initiative_id;
    }

    // Reconcile attached projects: compare draft._attached vs current attachments
    await _initReconcileAttachments(initiativeId, _initEditDraft._attached);

    _initEditDraft = null;
    _initState = { view: 'detail', activeId: initiativeId, editId: null };
    showToast('Initiative saved.', 'success');
    render();
  } catch (err) {
    console.error('[Initiatives] Save failed:', err);
    showToast('Save failed: ' + err.message, 'error');
  }
}

async function _initReconcileAttachments(initiativeId, desiredOidList) {
  var current = getProjectsForInitiative(initiativeId);
  var currentOids = {};
  current.forEach(function(p) { currentOids[p.objectId] = true; });
  var desiredOidSet = {};
  desiredOidList.forEach(function(oid) { desiredOidSet[oid] = true; });

  var attaches = []; // projects to attach (set initiative_id + sequence)
  var detaches = []; // projects to detach (clear initiative_id)
  desiredOidList.forEach(function(oid, idx) {
    if (!currentOids[oid]) attaches.push({ oid: oid, seq: idx });
  });
  current.forEach(function(p, idx) {
    if (!desiredOidSet[p.objectId]) detaches.push(p.objectId);
  });
  // Always re-sequence to match the draft order
  var resequence = desiredOidList.map(function(oid, idx) { return { oid: oid, seq: idx }; });

  if (!attaches.length && !detaches.length && !resequence.length) return;

  var updates = [];
  resequence.forEach(function(it) {
    updates.push({ attributes: { ObjectId: it.oid, initiative_id: initiativeId, initiative_sequence: it.seq } });
  });
  detaches.forEach(function(oid) {
    updates.push({ attributes: { ObjectId: oid, initiative_id: null, initiative_sequence: null } });
  });
  if (updates.length) {
    await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, { updates: updates });
    // Update in-memory PROJECTS
    resequence.forEach(function(it) {
      var p = PROJECTS.find(function(x) { return x.objectId === it.oid; });
      if (p) { p.initiative_id = initiativeId; p.initiative_sequence = it.seq; }
    });
    detaches.forEach(function(oid) {
      var p = PROJECTS.find(function(x) { return x.objectId === oid; });
      if (p) { p.initiative_id = null; p.initiative_sequence = null; }
    });
  }
}

async function initDelete(initiativeId) {
  if (!_initCanManage()) { showToast('Permission denied.', 'error'); return; }
  var initiative = getInitiative(initiativeId);
  if (!initiative) return;
  try {
    // Detach all child projects first
    var children = getProjectsForInitiative(initiativeId);
    if (children.length) {
      var updates = children.map(function(p) {
        return { attributes: { ObjectId: p.objectId, initiative_id: null, initiative_sequence: null } };
      });
      await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, { updates: updates });
      children.forEach(function(p) { p.initiative_id = null; p.initiative_sequence = null; });
    }
    // Delete the initiative record
    await agolApplyEdits(ARCGIS_CONFIG.initiativesUrl, { deletes: [initiative.objectId] });
    // Remove from in-memory list
    var idx = INITIATIVES.findIndex(function(i) { return i.objectId === initiative.objectId; });
    if (idx >= 0) INITIATIVES.splice(idx, 1);
    delete INITIATIVES_BY_ID[initiativeId];
    _initState = { view: 'list', activeId: null, editId: null };
    showToast('Initiative deleted. ' + children.length + ' project(s) detached.', 'success');
    render();
  } catch (err) {
    console.error('[Initiatives] Delete failed:', err);
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// Click-through from a project detail breadcrumb — switch to the Initiatives
// sub-tab and land on the right initiative's detail page in one hop.
function initOpenFromProject(initiativeId) {
  _initState = { view: 'detail', activeId: initiativeId, editId: null };
  _initDetailPickerOpen = false;
  if (typeof switchTab === 'function') {
    switchTab('initiatives');
  } else if (typeof render === 'function') {
    render();
  }
}

// ── Tab count update hook (called from updateTabCounts) ─────────────
function updateInitiativeTabCount() {
  var el = document.getElementById('init-tab-count');
  if (el) el.textContent = (typeof INITIATIVES !== 'undefined' && INITIATIVES) ? INITIATIVES.length : 0;
}

// ── Date formatting helpers ─────────────────────────────────────────
function _initFmtDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function _initFmtMonth(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function _initRelTime(d) {
  var ms = Date.now() - d.getTime();
  var days = Math.floor(ms / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return days + 'd ago';
  if (days < 30) return Math.floor(days / 7) + 'w ago';
  if (days < 365) return Math.floor(days / 30) + 'mo ago';
  return Math.floor(days / 365) + 'y ago';
}
