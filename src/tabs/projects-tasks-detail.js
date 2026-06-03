// ─────────────────────────────────────────────────────────────────────
// tabs/projects-tasks-detail.js — Project & Task detail pages
//
// Second half of the projects/tasks extraction. Owns:
//   - Lifecycle phase helpers (parsePhaseReqs, REQUIREMENT_LOOKUP
//     navigation, phase stepper, phase-grouped task lists)
//   - Detail page navigation (openTaskFromProject, addTaskToProject)
//   - Delete confirmations, ensureProjectContributor, mark-complete
//     handlers, copyProjectSummary, batch bar
//   - Detail page builders (buildStrategicAlignmentSection,
//     buildProjectTimeline, renderProjectDetail, renderTaskDetail)
//   - Project Timeline hover popover (tlHover, tlLeave)
//   - Detail task sort state and helpers
//
// AI suggestion features stay inline — they move with task #9.
// ─────────────────────────────────────────────────────────────────────

// ── Lifecycle phase helpers ────────────────────────────────

function parsePhaseReqs(task) {
  if (!task || !task.phase_requirements) return [];
  return task.phase_requirements.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function resolveReqInfo(rId) {
  var info = REQUIREMENT_LOOKUP[rId];
  if (info) return info;
  var match = rId.match(/^P(\d+)_TASK$/);
  if (match) {
    var phaseNum = parseInt(match[1], 10);
    var phase = LIFECYCLE_PHASES[phaseNum];
    if (phase) return { phaseId: phaseNum, phaseName: phase.name, label: 'Project work', isOptional: true };
  }
  return null;
}

function getProjectLifecycleStatus(projectTitle) {
  var p = _PROJECTS_BY_TITLE && _PROJECTS_BY_TITLE[String(projectTitle || '').toLowerCase()];
  var pNum = p && p.project_number != null ? String(p.project_number) : null;
  var relTasks = pNum ? TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === pNum; }) : [];
  var metReqs = {};
  relTasks.forEach(function(t) {
    if (t.status !== 'Complete') return;
    parsePhaseReqs(t).forEach(function(rId) { metReqs[rId] = true; });
  });
  var phases = LIFECYCLE_PHASES.map(function(phase) {
    var total = phase.requirements.length;
    var met = phase.requirements.filter(function(r) { return metReqs[r.id]; }).length;
    return { id: phase.id, name: phase.name, shortName: phase.shortName, total: total, met: met, complete: met === total, isGateCheck: phase.isGateCheck || false };
  });
  var currentPhase = 0;
  for (var i = 0; i < phases.length; i++) {
    if (!phases[i].complete) { currentPhase = i; break; }
    if (i === phases.length - 1) currentPhase = i;
  }
  return { phases: phases, currentPhase: currentPhase, metReqs: metReqs };
}

function getTasksByPhase(projectTitle) {
  var p = _PROJECTS_BY_TITLE && _PROJECTS_BY_TITLE[String(projectTitle || '').toLowerCase()];
  var pNum = p && p.project_number != null ? String(p.project_number) : null;
  var relTasks = pNum ? TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === pNum; }) : [];
  var groups = {};
  var ungrouped = [];
  LIFECYCLE_PHASES.forEach(function(ph) { groups[ph.id] = []; });
  relTasks.forEach(function(t) {
    var reqs = parsePhaseReqs(t);
    if (reqs.length === 0) { ungrouped.push(t); return; }
    var minPhase = 99;
    reqs.forEach(function(rId) {
      var info = REQUIREMENT_LOOKUP[rId];
      if (info && info.phaseId < minPhase) minPhase = info.phaseId;
      if (!info) {
        var match = rId.match(/^P(\d+)_TASK$/);
        if (match) {
          var phaseNum = parseInt(match[1], 10);
          if (phaseNum < minPhase) minPhase = phaseNum;
        }
      }
    });
    if (minPhase < 99 && groups[minPhase]) groups[minPhase].push(t);
    else ungrouped.push(t);
  });
  return { groups: groups, ungrouped: ungrouped };
}

function renderPhaseStepper(projectTitle) {
  var lcs = getProjectLifecycleStatus(projectTitle);
  var phases = lcs.phases;
  var cur = lcs.currentPhase;
  var fillPct = phases.length > 1 ? Math.round((cur / (phases.length - 1)) * 100) : 0;
  var html = '<div class="detail-section">';
  html += '<div class="detail-section-label">Project lifecycle</div>';
  html += '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:16px;">';
  var cp = phases[cur];
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--navy);">Phase ' + cp.id + ' — ' + esc(LIFECYCLE_PHASES[cp.id].name) + '</div>';
  html += '<div style="font-size:12px;color:#6B7280;">' + cp.met + '/' + cp.total + ' requirements met</div>';
  html += '</div>';
  html += '<div class="phase-stepper">';
  html += '<div class="phase-stepper-track"></div>';
  html += '<div class="phase-stepper-fill" style="width:' + fillPct + '%;"></div>';
  phases.forEach(function(ph, i) {
    var dotClass = 'phase-dot';
    var labelClass = 'phase-label';
    var dotContent = '';
    if (i < cur) {
      dotClass += ' done';
      dotContent = '<svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" fill="none" stroke="white" stroke-width="1.5"/></svg>';
    } else if (i === cur) {
      dotClass += ' current';
      dotContent = '<span>' + ph.id + '</span>';
      labelClass += ' current';
    } else {
      dotClass += ' future';
      if (ph.isGateCheck) dotClass += ' gate';
      dotContent = '<span style="font-size:9px;">' + ph.id + '</span>';
    }
    html += '<div class="phase-step" onclick="togglePhaseDetail(' + i + ')" title="Phase ' + ph.id + ': ' + esc(LIFECYCLE_PHASES[ph.id].name) + ' (' + ph.met + '/' + ph.total + ')">';
    html += '<div class="' + dotClass + '">' + dotContent + '</div>';
    html += '<span class="' + labelClass + '">' + (ph.isGateCheck && i !== cur ? '<svg class="icon" aria-hidden="true"><use href="#ph-flag"></use></svg> ' : '') + esc(ph.shortName) + '</span>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div id="phase-detail-panel" style="display:none;margin-top:14px;border-top:1px solid #E8E6DF;padding-top:12px;"></div>';
  html += '</div></div>';
  return html;
}

function togglePhaseDetail(phaseIndex) {
  var panel = document.getElementById('phase-detail-panel');
  if (!panel) return;
  if (panel.style.display !== 'none' && panel.getAttribute('data-phase') === String(phaseIndex)) {
    panel.style.display = 'none'; return;
  }
  panel.setAttribute('data-phase', String(phaseIndex));
  panel.style.display = '';
  var phase = LIFECYCLE_PHASES[phaseIndex];
  if (!phase) return;
  var p = PROJECTS.find(function(pr) { return pr.objectId == currentDetail.id; });
  if (!p) return;
  var lcs = getProjectLifecycleStatus(p.title);
  var metReqs = lcs.metReqs;
  var _pNum = p.project_number != null ? String(p.project_number) : null;
  var relTasks = _pNum ? TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === _pNum; }) : [];
  var html = '<div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px;">Phase ' + phase.id + ' — ' + esc(phase.name) + '</div>';
  html += '<div style="font-size:11px;color:#6B7280;margin-bottom:10px;">Default duration: ' + phase.defaultDuration + '</div>';
  phase.requirements.forEach(function(req) {
    var isMet = metReqs[req.id];
    var linkedTasks = relTasks.filter(function(t) { return parsePhaseReqs(t).indexOf(req.id) !== -1; });
    var icon = isMet ? '<span style="color:#22C55E;font-weight:700;"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg></span>' : '<span style="color:#E1E2DD;">○</span>';
    var textStyle = isMet ? 'color:#6B7280;text-decoration:line-through;' : '';
    html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:13px;">';
    html += '<span style="flex-shrink:0;width:16px;text-align:center;">' + icon + '</span>';
    html += '<div style="flex:1;' + textStyle + '">' + esc(req.label);
    if (linkedTasks.length) {
      html += '<div style="margin-top:2px;">';
      linkedTasks.forEach(function(t) {
        var sc = STATUS_COLOR(t.status) || '#9CA3AF';
        html += '<span style="display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:' + sc + '18;color:' + sc + ';margin-right:4px;">' + esc(t.title) + '</span>';
      });
      html += '</div>';
    }
    html += '</div></div>';
  });
  panel.innerHTML = html;
}

function renderPhaseGroupedTasks(projectTitle, relTasks) {
  var grouped = getTasksByPhase(projectTitle);
  var lcs = getProjectLifecycleStatus(projectTitle);
  var hasAnyPhaseReqs = relTasks.some(function(t) { return t.phase_requirements; });
  if (!hasAnyPhaseReqs) return '';
  var html = '';
  LIFECYCLE_PHASES.forEach(function(phase) {
    var tasks = grouped.groups[phase.id];
    var phStatus = lcs.phases[phase.id];
    var pillBg = phStatus.complete ? '#DCFCE7' : (phase.id === lcs.currentPhase ? '#EEF2FF' : '#F3F1EB');
    var pillColor = phStatus.complete ? '#166534' : (phase.id === lcs.currentPhase ? 'var(--navy)' : '#6B7280');
    var progressColor = phStatus.complete ? '#22C55E' : (phStatus.met > 0 ? '#F59E0B' : '#9CA3AF');
    html += '<div class="phase-section-header" onclick="togglePhaseSection(' + phase.id + ')">';
    html += '<span class="phase-section-pill" style="background:' + pillBg + ';color:' + pillColor + ';">' + (phase.isGateCheck ? '<svg class="icon" aria-hidden="true"><use href="#ph-flag"></use></svg> ' : '') + 'Phase ' + phase.id + '</span>';
    html += '<span class="phase-section-name">' + esc(phase.name) + '</span>';
    html += '<span class="phase-section-progress" style="color:' + progressColor + ';">' + phStatus.met + '/' + phStatus.total + '</span>';
    html += '<span class="phase-section-chevron" id="phase-chevron-' + phase.id + '">▸</span>';
    html += '</div>';
    html += '<div id="phase-tasks-' + phase.id + '" style="display:' + (tasks.length > 0 || phase.id === lcs.currentPhase ? '' : 'none') + ';margin-left:12px;margin-bottom:4px;">';
    if (tasks.length > 0) {
      tasks.forEach(function(t) {
        var sc = STATUS_COLOR(t.status) || '#9CA3AF';
        var taskHrs = getTaskHours(t.idx);
        var myHrs = getMyTaskHours(t.idx);
        var hrsDisplay = taskHrs > 0 ? hoursLabel(taskHrs, myHrs) : '—';
        var reqChips = parsePhaseReqs(t).map(function(rId) {
          var info = resolveReqInfo(rId);
          if (!info) return '';
          var chipStyle = info.isOptional ? 'background:#FEF3C7;color:#92400E;' : '';
          return '<span class="phase-req-chip" style="' + chipStyle + '">' + esc(info.label).substring(0, 30) + '</span>';
        }).join('');
        html += '<div class="detail-task-row">';
        html += '<div style="text-align:center;" onclick="event.stopPropagation()"><input type="checkbox" class="batch-task-cb" data-task-id="' + t.objectId + '" onchange="updateBatchBar()" style="width:14px;height:14px;cursor:pointer;accent-color:var(--navy);"></div>';
        html += '<div class="detail-task-title" onclick="openTaskFromProject(' + t.objectId + ')" style="cursor:pointer;">' + projectNumChip(t.task_number) + esc(t.title);
        if (reqChips) html += '<div style="margin-top:2px;">' + reqChips + '</div>';
        html += '</div>';
        html += '<div onclick="event.stopPropagation()"><select class="mw-status-select" data-type="task" data-id="' + t.objectId + '" onchange="mwQuickStatus(this)" style="font-size:10px;padding:2px 4px;min-width:100px;background:' + sc + '18;color:' + sc + ';border-color:' + sc + '44;">';
        ['Active','Pending','On Hold','Waiting for Response','Complete','Canceled'].forEach(function(s) { html += '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + s + '</option>'; });
        html += '</select></div>';
        html += '<div class="detail-task-cell"><span class="priority-badge priority-' + (t.priority||'null') + '">' + (t.priority||'—') + '</span></div>';
        html += '<div onclick="event.stopPropagation()"><select class="dt-inline-select" data-task-id="' + t.objectId + '" onchange="inlineTaskAssignee(this)" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:' + (t.assignee ? 'var(--text-body)' : 'var(--text-muted)') + ';font-family:Lato,sans-serif;cursor:pointer;width:100%;background:var(--white);"><option value=""' + (!t.assignee ? ' selected' : '') + '>Unassigned</option>';
        var _members = RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return isFullMember(n); }).sort() : [];
        _members.forEach(function(n) { html += '<option value="' + esc(n) + '"' + (t.assignee === n ? ' selected' : '') + '>' + esc(n) + '</option>'; });
        html += '</select></div>';
        html += '<div onclick="event.stopPropagation()"><input type="date" class="dt-inline-date" data-task-id="' + t.objectId + '" data-has-due="' + (t.due ? '1' : '') + '" onchange="inlineTaskDueDate(this)" value="' + (t.working_due||t.due||'') + '" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:' + ((t.working_due||t.due) ? 'var(--text-body)' : 'var(--text-muted)') + ';font-family:Lato,sans-serif;cursor:pointer;width:100%;"></div>';
        html += '<div class="detail-task-cell" style="font-weight:700;color:var(--navy);">' + hrsDisplay + '</div>';
        html += '</div>';
      });
    } else {
      html += '<div style="padding:8px 0;font-size:12px;color:#9CA3AF;font-style:italic;">No tasks linked to this phase yet.</div>';
    }
    html += '</div>';
  });
  if (grouped.ungrouped.length > 0) {
    html += '<div class="phase-section-header" onclick="togglePhaseSection(\'ungrouped\')">';
    html += '<span class="phase-section-pill" style="background:var(--surface-2);color:#6B7280;">—</span>';
    html += '<span class="phase-section-name">Unlinked tasks</span>';
    html += '<span class="phase-section-progress" style="color:#9CA3AF;">' + grouped.ungrouped.length + '</span>';
    html += '<span class="phase-section-chevron" id="phase-chevron-ungrouped">▸</span>';
    html += '</div>';
    html += '<div id="phase-tasks-ungrouped" style="margin-left:12px;margin-bottom:4px;">';
    grouped.ungrouped.forEach(function(t) {
      var sc = STATUS_COLOR(t.status) || '#9CA3AF';
      var taskHrs = getTaskHours(t.idx);
      var myHrs = getMyTaskHours(t.idx);
      var hrsDisplay = taskHrs > 0 ? hoursLabel(taskHrs, myHrs) : '—';
      html += '<div class="detail-task-row">';
      html += '<div style="text-align:center;" onclick="event.stopPropagation()"><input type="checkbox" class="batch-task-cb" data-task-id="' + t.objectId + '" onchange="updateBatchBar()" style="width:14px;height:14px;cursor:pointer;accent-color:var(--navy);"></div>';
      html += '<div class="detail-task-title" onclick="openTaskFromProject(' + t.objectId + ')" style="cursor:pointer;">' + projectNumChip(t.task_number) + esc(t.title) + '</div>';
      html += '<div onclick="event.stopPropagation()"><select class="mw-status-select" data-type="task" data-id="' + t.objectId + '" onchange="mwQuickStatus(this)" style="font-size:10px;padding:2px 4px;min-width:100px;background:' + sc + '18;color:' + sc + ';border-color:' + sc + '44;">';
      ['Active','Pending','On Hold','Waiting for Response','Complete','Canceled'].forEach(function(s) { html += '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + s + '</option>'; });
      html += '</select></div>';
      html += '<div class="detail-task-cell"><span class="priority-badge priority-' + (t.priority||'null') + '">' + (t.priority||'—') + '</span></div>';
      html += '<div onclick="event.stopPropagation()"><select class="dt-inline-select" data-task-id="' + t.objectId + '" onchange="inlineTaskAssignee(this)" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:' + (t.assignee ? 'var(--text-body)' : 'var(--text-muted)') + ';font-family:Lato,sans-serif;cursor:pointer;width:100%;background:var(--white);"><option value=""' + (!t.assignee ? ' selected' : '') + '>Unassigned</option>';
      var _members2 = RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return isFullMember(n); }).sort() : [];
      _members2.forEach(function(n) { html += '<option value="' + esc(n) + '"' + (t.assignee === n ? ' selected' : '') + '>' + esc(n) + '</option>'; });
      html += '</select></div>';
      html += '<div onclick="event.stopPropagation()"><input type="date" class="dt-inline-date" data-task-id="' + t.objectId + '" data-has-due="' + (t.due ? '1' : '') + '" onchange="inlineTaskDueDate(this)" value="' + (t.working_due||t.due||'') + '" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:' + ((t.working_due||t.due) ? 'var(--text-body)' : 'var(--text-muted)') + ';font-family:Lato,sans-serif;cursor:pointer;width:100%;"></div>';
      html += '<div class="detail-task-cell" style="font-weight:700;color:var(--navy);">' + hrsDisplay + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }
  return html;
}

function togglePhaseSection(phaseId) {
  var el = document.getElementById('phase-tasks-' + phaseId);
  var chev = document.getElementById('phase-chevron-' + phaseId);
  if (!el) return;
  if (el.style.display === 'none') { el.style.display = ''; if (chev) chev.classList.add('open'); }
  else { el.style.display = 'none'; if (chev) chev.classList.remove('open'); }
}

// ── Detail navigation ──────────────────────────────────────
function openTaskFromProject(taskIdx) {
  const fromProjectId = currentDetail && currentDetail.type === 'project' ? currentDetail.id : null;
  const returnTab = currentDetail && currentDetail._returnTab ? currentDetail._returnTab : null;
  currentDetail = { type: 'task', id: taskIdx, _fromProject: fromProjectId, _returnTab: returnTab };
  render();
}

function addTaskToProject(projectObjectId, projectTitle) {
  // Pre-seed the project so buildTaskForm selects it from the start. This
  // replaces a brittle post-render DOM poke that (a) raced a 50ms timeout
  // and (b) failed to match the <option> value for any title containing
  // HTML special characters (&, <, >, ', "), which left the task with no
  // project on save. fmSelect adds the value as an option if it's not in
  // the active-project list, so closed/on-hold projects pre-select too.
  _prefillTaskProject = projectTitle;
  openFormModal('new-task');
}

// ══════════════════════════════════════════════════════════════════════
//  AI TASK SUGGESTION ENGINE
//  Uses Claude API to generate task suggestions based on project context
// ══════════════════════════════════════════════════════════════════════
var _suggestedTasks = []; // current suggestions
var _suggestProjectId = null;
var _suggestDetail = 'high'; // 'high' | 'medium' | 'low'

async function openSuggestPicker(projectObjectId) {
  _suggestProjectId = projectObjectId;
  var panel = document.getElementById('suggest-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'suggest-panel';
    panel.className = 'suggest-panel';
    var tasksSection = document.querySelector('.detail-section:last-of-type');
    if (tasksSection) tasksSection.parentNode.insertBefore(panel, tasksSection);
    else document.querySelector('.detail-body').appendChild(panel);
  }
  panel.style.display = '';
  panel.innerHTML = '<div class="suggest-header"><span class="suggest-title">✨ AI Task Suggestions</span>' +
    '<button class="suggest-close" onclick="closeSuggestPanel()"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg></button></div>' +
    '<div style="padding:8px 0;">' +
      '<div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:10px;">Choose a detail level:</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<div onclick="suggestWithDetail(\'low\')" style="flex:1;min-width:140px;cursor:pointer;background:var(--white);border:2px solid ' + (_suggestDetail === 'low' ? 'var(--navy)' : '#E8E6DF') + ';border-radius:10px;padding:14px;text-align:center;transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'var(--navy)\'" onmouseout="this.style.borderColor=\'' + (_suggestDetail === 'low' ? 'var(--navy)' : '#E8E6DF') + '\'">' +
          '<div style="font-size:20px;margin-bottom:4px;"><svg class="icon" aria-hidden="true"><use href="#ph-clipboard-text"></use></svg></div>' +
          '<div style="font-size:13px;font-weight:800;color:var(--navy);">Low</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Major phases<br>1-3 days each<br>4-8 tasks</div>' +
        '</div>' +
        '<div onclick="suggestWithDetail(\'medium\')" style="flex:1;min-width:140px;cursor:pointer;background:var(--white);border:2px solid ' + (_suggestDetail === 'medium' ? 'var(--navy)' : '#E8E6DF') + ';border-radius:10px;padding:14px;text-align:center;transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'var(--navy)\'" onmouseout="this.style.borderColor=\'' + (_suggestDetail === 'medium' ? 'var(--navy)' : '#E8E6DF') + '\'">' +
          '<div style="font-size:20px;margin-bottom:4px;"><svg class="icon" aria-hidden="true"><use href="#ph-note-pencil"></use></svg></div>' +
          '<div style="font-size:13px;font-weight:800;color:var(--navy);">Medium</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Grouped activities<br>4-16 hours each<br>8-15 tasks</div>' +
        '</div>' +
        '<div onclick="suggestWithDetail(\'high\')" style="flex:1;min-width:140px;cursor:pointer;background:var(--white);border:2px solid ' + (_suggestDetail === 'high' ? 'var(--navy)' : '#E8E6DF') + ';border-radius:10px;padding:14px;text-align:center;transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'var(--navy)\'" onmouseout="this.style.borderColor=\'' + (_suggestDetail === 'high' ? 'var(--navy)' : '#E8E6DF') + '\'">' +
          '<div style="font-size:20px;margin-bottom:4px;">🔬</div>' +
          '<div style="font-size:13px;font-weight:800;color:var(--navy);">High</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Atomic steps<br>1-8 hours each<br>15-25+ tasks</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Delete & contributor helpers ───────────────────────────
function confirmDeleteProject(id) {
  Editor.mode   = 'edit-project';
  Editor.editId = id;
  handleFormDelete();
}

function confirmDeleteTask(taskId) {
  Editor.mode   = 'edit-task';
  Editor.editId = taskId;
  handleFormDelete();
}

async function ensureProjectContributor(projectTitle, memberName) {
  if (!projectTitle || !memberName) return;
  var proj = PROJECTS.find(function(p) { return p.title === projectTitle; });
  if (!proj) return;
  // Already the lead
  if (proj.contact === memberName) return;
  // Already a contributor
  var currentMembers = proj.other_members ? proj.other_members.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  if (currentMembers.includes(memberName)) return;
  // Add as contributor
  currentMembers.push(memberName);
  var newOtherMembers = currentMembers.join(', ');
  try {
    await DataStore.updateProject(proj.objectId, { other_members: newOtherMembers });
    proj.other_members = newOtherMembers; // update local cache
    console.log('[Auto-contrib] Added ' + memberName + ' as contributor to "' + projectTitle + '"');
  } catch (err) {
    console.error('[Auto-contrib] Failed to add contributor:', err);
  }
}

// ── Mark complete, copy summary, batch bar ─────────────────
async function markTaskComplete(taskId) {
  if (!ensureValidSession(function() { markTaskComplete(taskId); })) return;
  const task = TASKS.find(function(t) { return t.objectId == taskId; });
  if (!task) return;
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var completeFields = { status: 'Complete', actual_end: todayStr };
  if (isFeatureOn('taskHistory')) {
    completeFields.task_status_history = appendTaskHistory(task, task.status, 'Complete', null);
  }
  await DataStore.updateTask(taskId, completeFields);
  showToast('Marked "' + task.title + '" as Complete.', 'success');
  markDataDirty();
  render();
}

async function markProjectComplete(objectId) {
  if (!Auth.loggedIn) { showToast('You must be signed in.', 'warn'); return; }
  const proj = PROJECTS.find(function(p) { return p.objectId == objectId; });
  if (!proj) return;
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  // Gate the status change behind the cascade modal. If the project has open
  // child tasks, the modal blocks the status change until every task has a
  // resolution. If there are no open children, closeProjectWithCascade just
  // runs the callback directly.
  if (typeof closeProjectWithCascade === 'function') {
    await closeProjectWithCascade(proj, 'Complete', async function() {
      await DataStore.updateProject(objectId, { status: 'Complete', actual_end: todayStr });
      showToast('Marked "' + proj.title + '" as Complete.', 'success');
      markDataDirty();
      render();
    });
  } else {
    // Fallback (resolve-tasks.js not loaded — shouldn't happen in practice)
    await DataStore.updateProject(objectId, { status: 'Complete', actual_end: todayStr });
    showToast('Marked "' + proj.title + '" as Complete.', 'success');
    markDataDirty();
    render();
  }
}

function copyProjectSummary(objectId) {
  var p = PROJECTS.find(function(pr) { return pr.objectId == objectId; });
  if (!p) { showToast('Project not found.', 'error'); return; }

  var _pNum = p.project_number != null ? String(p.project_number) : null;
  var relTasks = _pNum ? TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === _pNum; }) : [];
  relTasks.sort(function(a, b) { return (a.id || 0) - (b.id || 0); });

  // Build team list
  var team = [];
  if (p.contact) team.push(p.contact + ' (Lead)');
  if (p.other_members) {
    p.other_members.split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(n) {
      if (n !== p.contact) team.push(n);
    });
  }

  // Header
  var md = '# ' + (p.project_number || '') + (p.project_number ? ' — ' : '') + p.title + '\n\n';
  md += '**Status:** ' + (p.status || '—') + ' | **Priority:** ' + (p.priority || '—');
  if (p.project_size) md += ' | **Size:** ' + p.project_size;
  md += '\n';
  if (p.category) md += '**Category:** ' + p.category + '\n';
  if (p.partner_dept) md += '**Partner:** ' + p.partner_dept + '\n';
  if (p.itd_team) md += '**Unit:** ' + p.itd_team + '\n';
  if (p.is_data_program) md += '**Data Program:** Yes\n';
  if (p.it_initiative) md += '**IT Initiative:** ' + p.it_initiative + '\n';
  if (p.city_initiative) md += '**City Initiative:** ' + p.city_initiative + '\n';
  if (p.it_priority_project) md += '**IT Priority Project:** ' + p.it_priority_project + '\n';
  if (p.dp_goal) md += '**Data Program Goal:** ' + p.dp_goal + '\n';
  if (p.wwc_practice) md += '**WWC Practice:** ' + p.wwc_practice + '\n';
  if (p.wwc_criteria) md += '**WWC Criteria:** ' + p.wwc_criteria + '\n';
  if (team.length) md += '**Team:** ' + team.join(', ') + '\n';

  // Dates
  var dates = [];
  if (p.start) dates.push('**Start:** ' + p.start);
  if (p.end) dates.push('**Original End:** ' + p.end);
  if (p.working_due) dates.push('**Working Due:** ' + p.working_due);
  if (p.actual_end) dates.push('**Completed:** ' + p.actual_end);
  if (dates.length) md += dates.join(' | ') + '\n';

  // Problem statement
  if (p.problem_statement) md += '\n## Problem Statement\n' + p.problem_statement + '\n';

  // Description
  if (p.description) md += '\n## Description\n' + p.description + '\n';

  // Definition of Done
  if (p.definition_of_done) md += '\n## Definition of Done\n' + p.definition_of_done + '\n';

  // Key Results
  if (p.key_results) md += '\n## Key Results\n' + p.key_results + '\n';

  // Data sources
  if (p.data_sources) md += '\n## Data Sources\n' + p.data_sources + '\n';

  // Technical requirements
  if (p.technical_requirements) md += '\n## Technical Requirements\n' + p.technical_requirements + '\n';

  // Tasks
  if (relTasks.length > 0) {
    var statusCounts = {};
    relTasks.forEach(function(t) {
      var s = t.status || 'Unknown';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    var countParts = Object.keys(statusCounts).map(function(s) { return statusCounts[s] + ' ' + s.toLowerCase(); });

    md += '\n## Tasks (' + relTasks.length + ' total — ' + countParts.join(', ') + ')\n\n';
    md += '| # | Task | Status | Assignee | Due | Hours |\n';
    md += '|---|------|--------|----------|-----|-------|\n';
    relTasks.forEach(function(t) {
      var num = t.task_number || '—';
      var due = t.working_due || t.due || '—';
      var hrs = getTaskHours(t.idx);
      var hrsStr = hrs > 0 ? hrs + 'h' : '—';
      md += '| ' + num + ' | ' + (t.title || '—') + ' | ' + (t.status || '—') + ' | ' + (t.assignee || '—') + ' | ' + due + ' | ' + hrsStr + ' |\n';
    });

    // Hours summary
    var totalHrs = 0;
    var hrsByPerson = {};
    relTasks.forEach(function(t) {
      var h = getTaskHours(t.idx);
      if (h > 0) {
        totalHrs += h;
        var who = t.assignee || 'Unassigned';
        hrsByPerson[who] = (hrsByPerson[who] || 0) + h;
      }
    });
    if (totalHrs > 0) {
      var personParts = Object.keys(hrsByPerson).map(function(name) {
        return name + ': ' + Math.round(hrsByPerson[name] * 100) / 100 + 'h';
      });
      md += '\n**Hours Summary:** Total: ' + Math.round(totalHrs * 100) / 100 + 'h | ' + personParts.join(' | ') + '\n';
    }
  } else {
    md += '\n## Tasks\nNo tasks linked to this project.\n';
  }

  // Copy to clipboard
  navigator.clipboard.writeText(md).then(function() {
    showToast('Project summary copied to clipboard.', 'success');
  }).catch(function(err) {
    console.error('[CopySummary] Clipboard write failed:', err);
    showToast('Failed to copy — check browser permissions.', 'error');
  });
}

// ══════════════════════════════════════════════════════════════════════
//  BATCH TASK UPDATES — select and update multiple tasks at once
// ══════════════════════════════════════════════════════════════════════
function getSelectedTaskIds() {
  return [...document.querySelectorAll('.batch-task-cb:checked')].map(function(cb) { return parseInt(cb.dataset.taskId); });
}

function toggleSelectAllTasks(checked) {
  document.querySelectorAll('.batch-task-cb').forEach(function(cb) { cb.checked = checked; });
  updateBatchBar();
}

function updateBatchBar() {
  var selected = getSelectedTaskIds();
  var bar = document.getElementById('batch-action-bar');
  var count = document.getElementById('batch-count');
  if (bar) bar.style.display = selected.length > 0 ? 'flex' : 'none';
  if (count) count.textContent = selected.length + ' selected';
  // Update select-all checkbox state
  var selectAll = document.getElementById('batch-select-all');
  var allCbs = document.querySelectorAll('.batch-task-cb');
  if (selectAll && allCbs.length > 0) {
    selectAll.checked = selected.length === allCbs.length;
    selectAll.indeterminate = selected.length > 0 && selected.length < allCbs.length;
  }
}

async function applyBatchUpdate() {
  if (!ensureValidSession(function() { applyBatchUpdate(); })) return;
  var ids = getSelectedTaskIds();
  if (ids.length === 0) { showToast('No tasks selected.', 'warn'); return; }

  var newStatus = document.getElementById('batch-status').value;
  var newPriority = document.getElementById('batch-priority').value;
  var newAssignee = document.getElementById('batch-assignee').value;
  var newProject = (document.getElementById('batch-project-val') || document.getElementById('batch-project')).value;

  if (!newStatus && !newPriority && !newAssignee && !newProject) {
    showToast('Select a status, priority, assignee, or project to apply.', 'warn');
    return;
  }

  // Block batch-setting to Active if any selected tasks lack a due date
  if (newStatus === 'Active') {
    var tasksWithoutDates = ids.filter(function(id) {
      var task = TASKS.find(function(t) { return t.objectId == id; });
      return task && !task.due && !task.working_due;
    });
    if (tasksWithoutDates.length > 0) {
      showToast(tasksWithoutDates.length + ' selected task(s) are missing a due date. Add due dates before setting to Active.', 'warn');
      return;
    }
    var tasksWithoutStart = ids.filter(function(id) {
      var task = TASKS.find(function(t) { return t.objectId == id; });
      return task && !task.start;
    });
    if (tasksWithoutStart.length > 0) {
      showToast(tasksWithoutStart.length + ' selected task(s) are missing a start date. Add start dates before setting to Active.', 'warn');
      return;
    }
  }

  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var updated = 0;

  // Prompt for reason once for the whole batch if applicable
  var batchReason = null;
  if (newStatus && needsStatusReason(newStatus)) {
    var batchResult = await promptStatusReason('(multiple)', newStatus);
    if (!batchResult.confirmed) return;
    batchReason = batchResult.reason;
  }

  for (var i = 0; i < ids.length; i++) {
    var fields = {};
    if (newStatus) fields.status = newStatus;
    if (newPriority) fields.priority = newPriority;
    if (newAssignee) fields.assignee = newAssignee;
    if (newProject) fields.project = newProject;
    if (newStatus === 'Complete') fields.actual_end = todayStr;
    // Append status history for each task individually
    if (newStatus && isFeatureOn('taskHistory')) {
      var batchTask = TASKS.find(function(t) { return t.objectId == ids[i]; });
      if (batchTask) {
        fields.task_status_history = appendTaskHistory(batchTask, batchTask.status, newStatus, batchReason);
      }
    }
    try {
      await DataStore.updateTask(ids[i], fields);
      updated++;
    } catch (err) {
      console.error('[Batch] Failed to update task:', ids[i], err);
    }
  }

  showToast('Updated ' + updated + ' task(s).' + (newProject ? ' Moved to ' + newProject + '.' : ''), 'success');

  // Auto-add assignee as contributor to affected projects
  if (newAssignee) {
    var projectsToCheck = new Set();
    ids.forEach(function(id) {
      var task = TASKS.find(function(t) { return t.objectId == id; });
      if (task) projectsToCheck.add(newProject || task.project);
    });
    for (var projTitle of projectsToCheck) {
      if (projTitle) await ensureProjectContributor(projTitle, newAssignee);
    }
  }

  markDataDirty();
  render();
}

async function batchDeleteTasks() {
  if (!Auth.loggedIn) { showToast('You must be signed in.', 'warn'); return; }
  var ids = getSelectedTaskIds();
  if (ids.length === 0) { showToast('No tasks selected.', 'warn'); return; }
  if (!await confirmDialog('Delete ' + ids.length + ' selected task(s)?\n\nYou can undo this right after.', { title: 'Delete ' + ids.length + ' task' + (ids.length === 1 ? '' : 's') + '?', confirmLabel: 'Delete', danger: true })) return;

  var deleted = 0;
  var deletedIds = [];
  for (var i = 0; i < ids.length; i++) {
    try {
      await DataStore.deleteTask(ids[i]);
      deleted++; deletedIds.push(ids[i]);
    } catch (err) {
      console.error('[Batch] Failed to delete task:', ids[i], err);
    }
  }
  markDataDirty();
  render();
  if (deletedIds.length && typeof showUndoToast === 'function') {
    showUndoToast('Deleted ' + deleted + ' task' + (deleted === 1 ? '' : 's') + '.', function() {
      return DataStore.restoreDeleted({ tasks: deletedIds }).then(function() {
        showToast('Restored ' + deletedIds.length + ' task' + (deletedIds.length === 1 ? '' : 's') + '.', 'success');
      });
    });
  } else {
    showToast('Deleted ' + deleted + ' task(s).', 'success');
  }
}

// ── Detail page builders ───────────────────────────────────
// ─── PROJECT DETAIL PAGE ──────────────────────────────────────────────
function buildStrategicAlignmentSection(p) {
  var chipStyle = 'display:inline-block;font-size:11px;font-weight:600;padding:3px 10px;border-radius:6px;margin:2px;';
  var noneStyle = 'font-size:12px;color:var(--text-muted);font-style:italic;';
  function cell(label, val, bg, color) {
    var content;
    if (!val) {
      content = '<span style="' + noneStyle + '">Does not apply</span>';
    } else {
      content = '<div style="display:flex;flex-wrap:wrap;gap:0;">' + val.split(',').map(function(s) { return s.trim(); }).filter(Boolean).map(function(v) {
        return '<span style="' + chipStyle + 'background:' + bg + ';color:' + color + ';">' + esc(v) + '</span>';
      }).join('') + '</div>';
    }
    return '<div><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">' + label + '</div>' + content + '</div>';
  }
  var row = function(cells) { return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">' + cells + '</div>'; };

  var html = '<div class="detail-section"><div class="detail-section-label">Strategic Alignment</div>';
  // Row 1: IT Initiative | City Initiative
  html += row(cell('IT Initiative', p.it_initiative, 'var(--pill-blue-bg)', 'var(--pill-blue-fg)') + cell('City Initiative', p.city_initiative, 'var(--pill-orange-bg)', 'var(--pill-orange-fg)'));
  // Row 2: IT Priority Project | Data Program Goal
  html += row(cell('IT Priority Project', p.it_priority_project, 'var(--pill-green-bg)', 'var(--pill-green-fg)') + cell('Data Program Goal', p.dp_goal, 'var(--pill-purple-bg)', 'var(--pill-purple-fg)'));
  // Row 3: WWC Practice | WWC Criteria
  html += row(cell('WWC Foundational Practice', p.wwc_practice, 'var(--pill-amber-bg)', 'var(--pill-amber-fg)') + cell('WWC Criteria', p.wwc_criteria, 'var(--pill-cyan-bg)', 'var(--pill-cyan-fg)'));
  html += '</div>';
  return html;
}

function buildProjectTimeline(p, relTasks) {
  var projStart = p.start || null;
  var projEnd = p.working_due || p.end || null;
  var projActualEnd = p.actual_end || null;
  if (!projStart && !projEnd) return '';
  var todayStr = new Date().toISOString().slice(0, 10);

  var rangeStart = projStart || todayStr;
  var rangeEnd = projEnd || todayStr;
  if (projActualEnd && projActualEnd > rangeEnd) rangeEnd = projActualEnd;

  var tasksWithDates = (relTasks || []).filter(function(t) {
    return (t.start || t.due || t.working_due) && t.status !== 'Canceled';
  }).map(function(t) {
    var ts = t.start || t.due || t.working_due;
    var te = t.working_due || t.due || t.start;
    if (ts < rangeStart) rangeStart = ts;
    if (te > rangeEnd) rangeEnd = te;
    return { title: t.title, start: ts, end: te, status: t.status, objectId: t.objectId, assignee: t.assignee || '' };
  });

  var totalMs = new Date(rangeEnd + 'T00:00:00') - new Date(rangeStart + 'T00:00:00');
  var totalDays = Math.max(1, Math.ceil(totalMs / 86400000));

  function pct(dateStr) {
    var ms = new Date(dateStr + 'T00:00:00') - new Date(rangeStart + 'T00:00:00');
    return Math.max(0, Math.min(100, (ms / 86400000 / totalDays) * 100));
  }

  var projLeftPct = pct(projStart || rangeStart);
  var projRightPct = pct(projEnd || rangeEnd);
  var projWidthPct = Math.max(1, projRightPct - projLeftPct);
  var todayPct = pct(todayStr);

  // Month labels
  var months = '';
  var startD = new Date(rangeStart + 'T00:00:00');
  var endD = new Date(rangeEnd + 'T00:00:00');
  var m = new Date(startD.getFullYear(), startD.getMonth(), 1);
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  while (m <= endD) {
    var mp = pct(m.toISOString().slice(0, 10));
    if (mp >= 0 && mp <= 95) {
      months += '<span style="position:absolute;left:' + mp + '%;font-size:10px;color:var(--text-muted);white-space:nowrap;">' + monthNames[m.getMonth()] + ' ' + String(m.getFullYear()).slice(2) + '</span>';
    }
    m.setMonth(m.getMonth() + 1);
  }

  // Task ticks
  var ticks = '';
  tasksWithDates.forEach(function(t) {
    var sc = STATUS_COLOR(t.status) || '#9CA3AF';
    var opacity = t.status === 'Complete' ? '0.5' : '0.9';
    var startPct = pct(t.start);
    var endPct = pct(t.end);
    ticks += '<div style="position:absolute;left:' + startPct + '%;width:1.5px;height:8px;background:' + sc + ';opacity:' + opacity + ';top:0;" title="' + esc(t.title) + ' start: ' + t.start + '"></div>';
    ticks += '<div style="position:absolute;left:' + endPct + '%;width:1.5px;height:8px;background:' + sc + ';opacity:' + opacity + ';top:0;" title="' + esc(t.title) + ' end: ' + t.end + '"></div>';
    var tickW = Math.max(0.5, endPct - startPct);
    ticks += '<div style="position:absolute;left:' + startPct + '%;width:' + tickW + '%;height:2px;background:' + sc + ';opacity:' + (parseFloat(opacity) * 0.4) + ';top:3px;"></div>';
  });

  var taskDataJson = JSON.stringify(tasksWithDates.map(function(t) {
    return { title: t.title, start: t.start, end: t.end, status: t.status, assignee: t.assignee, objectId: t.objectId };
  }));

  var tlId = 'proj-tl-' + (p.objectId || p.id);

  var html = '<div class="detail-section">';
  html += '<div class="detail-section-label detail-section-label-flex">';
  html += '<span>Project Timeline</span>';
  if (Auth.devMode) html += '<button onclick="toggleStatusHistoryEditor(\'' + p.id + '\',' + p.objectId + ')" class="btn-navy-sm">\ud83d\udcc5 Edit History</button>';
  html += '</div>';

  html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;padding:0 2px;">';
  html += '<span style="font-size:11px;font-weight:700;color:var(--text-muted);">' + (projStart || '\u2014') + '</span>';
  if (projActualEnd) {
    html += '<span style="font-size:11px;"><span style="font-weight:700;color:#0088FF;">\u2713 Completed</span> <span style="color:var(--text-muted);">' + projActualEnd + '</span></span>';
  } else {
    html += '<span style="font-size:11px;font-weight:700;color:var(--text-muted);">' + (projEnd || '\u2014') + '</span>';
  }
  html += '</div>';

  html += '<div style="position:relative;height:16px;margin-bottom:2px;">' + months + '</div>';

  html += '<div id="' + tlId + '" style="position:relative;cursor:crosshair;" onmousemove="tlHover(event,this)" onmouseleave="tlLeave(this)" data-tasks="' + taskDataJson.replace(/"/g, '&quot;') + '" data-range-start="' + rangeStart + '" data-total-days="' + totalDays + '">';
  html += '<div style="position:relative;height:28px;background:var(--surface-2);border-radius:6px;overflow:hidden;">';
  html += '<div style="position:absolute;left:' + projLeftPct + '%;width:' + projWidthPct + '%;height:100%;background:var(--navy);border-radius:6px;"></div>';
  if (todayPct > 0 && todayPct < 100) {
    html += '<div style="position:absolute;left:' + todayPct + '%;top:0;bottom:0;width:2px;background:#EF4444;opacity:0.8;z-index:3;"></div>';
  }
  html += '</div>';

  html += '<div style="position:relative;height:12px;margin-top:2px;">' + ticks + '</div>';

  if (todayPct > 0 && todayPct < 100) {
    html += '<div style="position:absolute;top:-2px;left:' + todayPct + '%;transform:translateX(-50%);font-size:8px;font-weight:800;color:#EF4444;z-index:4;">TODAY</div>';
  }

  html += '<div id="' + tlId + '-pop" style="display:none;position:absolute;left:0;top:48px;background:var(--white);border:1px solid #E8E6DF;border-radius:8px;padding:8px 12px;font-size:11px;color:var(--text-body);z-index:10;min-width:200px;max-width:320px;pointer-events:none;"></div>';

  html += '</div>';

  html += '<div style="display:flex;gap:12px;margin-top:8px;font-size:10px;color:var(--text-muted);flex-wrap:wrap;">';
  html += '<span style="display:flex;align-items:center;gap:3px;"><span style="width:10px;height:8px;border-radius:2px;background:var(--navy);display:inline-block;"></span>Project span</span>';
  if (tasksWithDates.length > 0) html += '<span style="display:flex;align-items:center;gap:3px;"><span style="width:1.5px;height:10px;background:#83AC16;display:inline-block;"></span><span style="width:1.5px;height:10px;background:#83AC16;display:inline-block;margin-left:3px;"></span> Task start/end</span>';
  if (todayPct > 0 && todayPct < 100) html += '<span style="display:flex;align-items:center;gap:3px;"><span style="width:2px;height:10px;background:#EF4444;display:inline-block;"></span>Today</span>';
  html += '</div>';

  html += '<div id="status-history-editor"></div>';
  html += '</div>';
  return html;
}

function renderProjectDetail(id) {
  const p = PROJECTS.find(x => x.objectId == id);
  if (!p) return '<div class="empty-state">Project not found.</div>';
  const _pNum = p.project_number != null ? String(p.project_number) : null;
  const relTasks = !_pNum ? [] : TASKS.filter(function(t) {
    return t.project_number != null && String(t.project_number) === _pNum;
  });
  const statusColor = STATUS_COLOR(p.status) || '#9CA3AF';
  const returnTab = currentDetail._returnTab || 'projects';
  // Labels for every tab that can link to a project. Falls back to a
  // generic "← Back" when the originating tab isn't in the map, so we
  // never promise the wrong destination.
  const backLabels = {
    overview:      '← Back to Overview',
    mywork:        '← Back to My Work',
    projects:      '← Back to Projects',
    tasks:         '← Back to Tasks',
    projectReview: '← Back to Project Review',
    resources:     '← Back to Resources',
    forecast:      '← Back to Forecast',
    insights:      '← Back to Insights',
    issues:        '← Back to Issues',
    achievements:  '← Back to Achievements',
    slideshow:     '← Back to Slideshow',
    settings:      '← Back to Settings'
  };
  const backLabel = backLabels[returnTab] || '← Back';

  const allMembers = (() => {
    const arr = [p.contact, ...(p.other_members||'').split(',').map(s=>s.trim())].filter(Boolean);
    return [...new Set(arr)];
  })();

  const memberChips = allMembers.map(name => {
    const av = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    return `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--surface-2);border:1px solid #E8E6DF;border-radius:20px;padding:4px 12px 4px 6px;font-size:12px;white-space:nowrap;color:var(--text-body);">
      <span style="width:22px;height:22px;border-radius:50%;background:var(--navy);color:#fff;font-size:8px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${av}</span>${esc(name)}</span>`;
  }).join('');

  // ── Build task row HTML helper ──
  function buildDetailTaskRow(t) {
    const sc = STATUS_COLOR(t.status) || '#9CA3AF';
    const taskHrs = getTaskHours(t.idx);
    const myHrs = getMyTaskHours(t.idx);
    const hrsDisplay = taskHrs > 0 ? hoursLabel(taskHrs, myHrs) : '—';
    return `<div class="detail-task-row">
      <div style="text-align:center;" onclick="event.stopPropagation()">
        <input type="checkbox" class="batch-task-cb" data-task-id="${t.objectId}" onchange="updateBatchBar()" style="width:14px;height:14px;cursor:pointer;accent-color:var(--navy);">
      </div>
      <div class="detail-task-cell" style="font-family:monospace;font-size:11px;font-weight:600;color:var(--text-muted);white-space:nowrap;">${esc(t.task_number || '—')}</div>
      <div class="detail-task-title" onclick="openTaskFromProject(${t.objectId})" style="cursor:pointer;">${getDependencyIcon(t)}${esc(t.title)}${t.resolution ? '<div style="font-size:11px;font-weight:400;color:var(--text-muted);margin-top:2px;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + esc(t.resolution.length > 150 ? t.resolution.slice(0, 150) + '…' : t.resolution) + '</div>' : ''}</div>
      <div onclick="event.stopPropagation()">
        <select class="mw-status-select" data-type="task" data-id="${t.objectId}" onchange="mwQuickStatus(this)" style="font-size:10px;padding:2px 4px;min-width:100px;background:${sc}18;color:${sc};border-color:${sc}44;">
          ${['Active','Pending','On Hold','Waiting for Response','Complete','Canceled'].map(function(s) { return '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')}
        </select>
      </div>
      <div class="detail-task-cell"><span class="priority-badge priority-${t.priority||'null'}">${t.priority||'—'}</span></div>
      <div onclick="event.stopPropagation()">
        <select class="dt-inline-select" data-task-id="${t.objectId}" onchange="inlineTaskAssignee(this)" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:${t.assignee ? 'var(--text-body)' : 'var(--text-muted)'};font-family:Lato,sans-serif;cursor:pointer;width:100%;background:var(--white);">
          <option value=""${!t.assignee ? ' selected' : ''}>Unassigned</option>
          ${(RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return RESOURCES_DATA.people[n].active !== false; }).sort() : []).map(function(n) { return '<option value="' + esc(n) + '"' + (t.assignee === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('')}
        </select>
      </div>
      <div onclick="event.stopPropagation()">
        <input type="date" class="dt-inline-date" data-task-id="${t.objectId}" data-has-due="${t.due ? '1' : ''}" onchange="inlineTaskDueDate(this)" value="${t.working_due||t.due||''}" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:${(t.working_due||t.due) ? 'var(--text-body)' : 'var(--text-muted)'};font-family:Lato,sans-serif;cursor:pointer;width:100%;">
      </div>
      <div class="detail-task-cell" style="font-weight:700;color:var(--navy);">${hrsDisplay}</div>
    </div>`;
  }

  // ── Split tasks into In Progress, Complete, and Canceled ──
  const IN_PROGRESS_STATUSES = ['Active', 'On Hold', 'Waiting for Response'];
  const inProgressTasks = sortDetailTasks(relTasks.filter(function(t) { return IN_PROGRESS_STATUSES.indexOf(t.status) >= 0; }));
  const completeTasks = sortDetailTasks(relTasks.filter(function(t) { return t.status === 'Complete'; }));
  const canceledTasks = sortDetailTasks(relTasks.filter(function(t) { return t.status === 'Canceled'; }));
  const pendingTasks = sortDetailTasks(relTasks.filter(function(t) { return IN_PROGRESS_STATUSES.indexOf(t.status) < 0 && t.status !== 'Complete' && t.status !== 'Canceled'; }));

  const taskRows = relTasks.length ? (function() {
    var html = '';
    // In Progress section
    if (inProgressTasks.length > 0) {
      html += '<div class="dt-task-group dt-task-group-active"><span>In progress (' + inProgressTasks.length + ')</span><span style="font-size:10px;font-weight:400;text-transform:none;letter-spacing:0;">Active, On hold, Waiting for response</span></div>';
      html += inProgressTasks.map(buildDetailTaskRow).join('');
    }
    // Pending section (if any Pending tasks exist, show them between In Progress and Complete)
    if (pendingTasks.length > 0) {
      html += '<div class="dt-task-group dt-task-group-other"><span>Pending (' + pendingTasks.length + ')</span></div>';
      html += pendingTasks.map(function(t) { return buildDetailTaskRow(t).replace('class="detail-task-row"', 'class="detail-task-row" style="opacity:0.7;"'); }).join('');
    }
    // Complete section (collapsible based on preference)
    if (completeTasks.length > 0) {
      var compCollapsed = UserPrefs.completedCollapsed && !window._dtCompleteOpen;
      html += '<div class="dt-task-group dt-task-group-complete" style="cursor:pointer;" onclick="window._dtCompleteOpen=!window._dtCompleteOpen;render();"><span>' + (compCollapsed ? '▶' : '▼') + ' Complete (' + completeTasks.length + ')</span></div>';
      if (!compCollapsed) {
        html += completeTasks.map(function(t) { return buildDetailTaskRow(t).replace('class="detail-task-row"', 'class="detail-task-row" style="opacity:0.6;"'); }).join('');
      }
    }
    // Canceled section (collapsible based on preference)
    if (canceledTasks.length > 0) {
      var cancCollapsed = UserPrefs.completedCollapsed && !window._dtCanceledOpen;
      html += '<div class="dt-task-group dt-task-group-canceled" style="cursor:pointer;" onclick="window._dtCanceledOpen=!window._dtCanceledOpen;render();"><span>' + (cancCollapsed ? '▶' : '▼') + ' Canceled (' + canceledTasks.length + ')</span></div>';
      if (!cancCollapsed) {
        html += canceledTasks.map(function(t) {
          return buildDetailTaskRow(t)
            .replace('class="detail-task-row"', 'class="detail-task-row" style="opacity:0.6;"')
            .replace('class="detail-task-title"', 'class="detail-task-title" style="text-decoration:line-through;color:var(--text-muted);"');
        }).join('');
      }
    }
    if (!inProgressTasks.length && !completeTasks.length && !canceledTasks.length && !pendingTasks.length) {
      html += '<div style="padding:32px;text-align:center;color:var(--text-muted);font-style:italic;">No tasks linked to this project.</div>';
    }
    return html;
  })() : '<div style="padding:32px;text-align:center;color:var(--text-muted);font-style:italic;">No tasks linked to this project.</div>';

  // Project hours total
  const projTotalHrs = getProjectHours(p.title);
  const projMyHrs = getMyProjectHours(p.title);
  const projHrsRow = relTasks.length && projTotalHrs > 0 ? `<div class="detail-task-row" style="background:var(--surface-2);cursor:default;font-weight:700;">
    <div></div>
    <div></div>
    <div class="detail-task-title" style="font-weight:800;color:var(--navy);">Total</div>
    <div class="detail-task-cell"></div><div class="detail-task-cell"></div><div class="detail-task-cell"></div><div class="detail-task-cell"></div>
    <div class="detail-task-cell" style="font-weight:800;color:var(--navy);">${hoursLabel(projTotalHrs, projMyHrs)}</div>
  </div>` : '';

  // Use the shared permission check so Team Leads get edit rights on their team's
  // projects (not just admins / the project's own contact).
  var canEdit = (typeof canEditProject === 'function')
    ? canEditProject(p)
    : (isAdmin() || (Auth.fullName && p.contact === Auth.fullName));

  // Initiative breadcrumb — slim navy band above the hero, shown when this
  // project belongs to an initiative. Click-through opens the initiative
  // detail page.
  const _initiativeForP = (p.initiative_id && typeof getInitiative === 'function') ? getInitiative(p.initiative_id) : null;
  const _initiativeBreadcrumb = _initiativeForP ? `<div class="proj-initiative-breadcrumb" onclick="initOpenFromProject('${esc(_initiativeForP.initiative_id).replace(/'/g, "\\'")}')">
    <svg class="icon" aria-hidden="true"><use href="#ph-flag-banner"></use></svg>
    <div>
      <div class="proj-init-label">Part of initiative</div>
      <div class="proj-init-name">${esc(_initiativeForP.name)}</div>
    </div>
    <div class="proj-init-siblings">${(typeof getProjectsForInitiative === 'function' ? getProjectsForInitiative(_initiativeForP.initiative_id).length - 1 : 0)} sibling project(s) · <span class="proj-init-link">View initiative →</span></div>
  </div>` : '';

  return `<div class="detail-page">
    ${_initiativeBreadcrumb}
    <div class="detail-hero">
      <div class="detail-hero-sidebar" style="background:${statusColor};color:${STATUS_TEXT_COLOR(p.status)};">
        <span class="detail-hero-sidebar-label">${esc(p.status || '—')}</span>
        <span class="detail-hero-sidebar-id">${esc(p.project_number || '')}</span>
      </div>
      <div class="detail-hero-main">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <button class="detail-back-btn" onclick="goBackFromDetail()">← ${backLabel}</button>
          <div class="detail-hero-actions">
            ${canEdit && p.status && p.status !== 'Complete' && p.status !== 'Canceled' ? `<button class="modal-edit-btn" style="background:#EAF3DE;color:#27500A;border-color:#83AC1644;" onclick="markProjectComplete(${p.objectId})"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg> Complete</button>` : ''}
            ${canEdit ? `<button class="modal-edit-btn" onclick="openFormModal('edit-project',${p.objectId})"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg> Edit</button>` : ''}
            <button class="modal-edit-btn" style="background:var(--bg-surface,#F3F1EB);color:var(--text-muted);border-color:#E8E6DF;" onclick="copyProjectSummary(${p.objectId})"><svg class="icon" aria-hidden="true"><use href="#ph-clipboard-text"></use></svg> Copy</button>
            ${canEdit ? `<button class="modal-del-btn" onclick="confirmDeleteProject(${p.objectId})"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg> Delete</button>` : ''}
          </div>
        </div>
        <div class="detail-hero-title">${esc(p.title)}</div>
        <div class="detail-hero-badges">
          <span class="priority-badge priority-${p.priority||'null'}">${p.priority||'—'}</span>
          ${p.is_data_program ? '<span class="detail-hero-chip" style="background:var(--pill-orange-bg);color:var(--pill-orange-fg);border-color:transparent;">Data Program</span>' : ''}
          ${projTotalHrs > 0 ? `<span class="detail-hero-chip"><svg class="icon" aria-hidden="true"><use href="#ph-clock"></use></svg> ${hoursLabel(projTotalHrs, projMyHrs)}</span>` : ''}
          ${p.actual_end ? `<span class="detail-hero-chip"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg> Completed ${p.actual_end}</span>` : ''}
        </div>
        ${allMembers.length ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">${memberChips}</div>` : ''}
      </div>
    </div>

    <div class="detail-content">
      <div class="detail-section">
        <div class="detail-section-label">Project Details</div>
        <div class="detail-meta-grid">
          <div class="detail-meta-item"><label>Project Lead</label><p>${esc(p.contact||'—')}</p></div>
          <div class="detail-meta-item"><label>Partner Department</label><p>${esc(p.partner_dept||'—')}</p></div>
          <div class="detail-meta-item"><label>Unit</label><p>${esc(p.itd_team||'—')}</p></div>
          <div class="detail-meta-item"><label>Category</label><p>${esc(p.category||'—')}</p></div>
          <div class="detail-meta-item"><label>Project Size</label><p>${esc(p.project_size||'—')}</p></div>
          <div class="detail-meta-item"><label>Data Program</label><p>${p.is_data_program ? '<span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--pill-orange-bg);color:var(--pill-orange-fg);">Yes</span>' : '—'}</p></div>
          <div class="detail-meta-item"><label>Start Date</label><p>${p.start||'—'}</p></div>
          <div class="detail-meta-item"><label>Working Due Date</label><p>${p.working_due || p.end || '—'}</p></div>
          ${p.actual_end ? `<div class="detail-meta-item"><label>Actual End</label><p>${p.actual_end}</p></div>` : ''}
        </div>
      </div>

      ${buildStrategicAlignmentSection(p)}

      ${buildProjectTimeline(p, relTasks)}

      ${p.problem_statement ? `<div class="detail-section">
        <div class="detail-section-label">Problem Statement</div>
        <div class="detail-prose">${renderMd(p.problem_statement)}</div>
      </div>` : ''}

      ${p.description ? `<div class="detail-section">
        <div class="detail-section-label">Description</div>
        <div class="detail-prose">${renderMd(p.description)}</div>
      </div>` : ''}

      ${p.definition_of_done ? `<div class="detail-section">
        <div class="detail-section-label">Definition of Done</div>
        <div class="detail-prose">${renderMd(p.definition_of_done)}</div>
      </div>` : ''}

      ${p.key_results ? `<div class="detail-section">
        <div class="detail-section-label">Key Results</div>
        <div class="detail-prose">${renderMd(p.key_results)}</div>
      </div>` : ''}

      ${p.data_sources ? `<div class="detail-section">
        <div class="detail-section-label">Data Sources</div>
        <div class="detail-prose">${renderMd(p.data_sources)}</div>
      </div>` : ''}

      ${p.technical_requirements ? `<div class="detail-section">
        <div class="detail-section-label">Technical Requirements</div>
        <div class="detail-prose">${renderMd(p.technical_requirements)}</div>
      </div>` : ''}

      ${p.urgency_notes ? `<div class="detail-section">
        <div class="detail-section-label" style="color:#C24200;">Urgency / Timeline Notes</div>
        <div class="detail-prose">${esc(p.urgency_notes)}</div>
      </div>` : ''}

      ${p.reviewer_notes ? `<div class="detail-section">
        <div class="detail-section-label">Reviewer Notes</div>
        <div class="detail-prose" style="white-space:pre-line;">${esc(p.reviewer_notes)}</div>
      </div>` : ''}

      ${typeof renderProjectJournalSection === 'function' ? renderProjectJournalSection(p) : ''}

      <div class="detail-section">
        <div class="detail-section-label detail-section-label-flex">
          <span>Time Logged${calcInfoIcon('ytdHours')}</span>
        </div>
        ${(function() {
          var personHrs = getProjectHoursByPerson(p.title);
          var totalHrs = getProjectHours(p.title);
          if (!personHrs.length) return '<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">No time entries recorded for this project yet.</div>';
          var maxHrs = personHrs[0].hours;
          var rows = personHrs.map(function(ph) {
            var initials = ph.name.split(' ').map(function(w) { return w[0]; }).join('').slice(0,2).toUpperCase();
            var barPct = maxHrs > 0 ? Math.round(ph.hours / maxHrs * 100) : 0;
            return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #F3F1EB;">' +
              '<div style="width:28px;height:28px;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;">' + initials + '</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:13px;font-weight:700;color:var(--navy);">' + esc(ph.name) + '</div>' +
                '<div style="height:4px;background:var(--surface-2);border-radius:2px;margin-top:3px;"><div style="height:4px;background:var(--navy);border-radius:2px;width:' + barPct + '%;"></div></div>' +
              '</div>' +
              '<div style="font-size:14px;font-weight:800;color:var(--navy);min-width:50px;text-align:right;">' + ph.hours + 'h</div>' +
            '</div>';
          }).join('');
          return '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:12px 16px;">' +
            rows +
            '<div style="display:flex;justify-content:space-between;padding:8px 0 0;margin-top:4px;border-top:2px solid #E8E6DF;font-size:13px;font-weight:800;color:var(--navy);">' +
              '<span>Total</span><span>' + totalHrs + 'h</span>' +
            '</div>' +
          '</div>';
        })()}
      </div>

      <div class="detail-section">
        <div class="detail-section-label detail-section-label-flex">
          <span>Tasks (${relTasks.length})${relTasks.length ? ` · <span style="font-weight:400;font-size:12px;color:var(--text-muted);">${getProjectHours(p.title)}h logged</span>` : ''}</span>
          <div style="display:flex;gap:6px;">
            <button onclick="openSuggestPicker(${p.objectId})" class="btn-navy-md" style="background:#FFDB22;color:#92400E;border-color:#FFDB22;" onmouseover="this.style.background='#F0CC00'" onmouseout="this.style.background='#FFDB22'">✨ Suggest Tasks</button>
            <button data-project-id="${p.objectId}" data-project-title="${esc(p.title)}" onclick="addTaskToProject(this.dataset.projectId, this.dataset.projectTitle)" class="btn-navy-md">＋ Add Task</button>
          </div>
        </div>
        <div id="batch-action-bar" style="display:none;background:#EEF2FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px 16px;margin-bottom:10px;display:none;align-items:center;gap:10px;flex-wrap:nowrap;">
          <span style="font-size:12px;font-weight:700;color:var(--navy);" id="batch-count">0 selected</span>
          <select id="batch-status" class="fm-input" style="font-size:11px;padding:4px 8px;width:auto;min-width:100px;">
            <option value="">Set status…</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="On Hold">On Hold</option>
            <option value="Complete">Complete</option>
            <option value="Canceled">Canceled</option>
            <option value="Waiting for Response">Waiting for Response</option>
          </select>
          <select id="batch-priority" class="fm-input" style="font-size:11px;padding:4px 8px;width:auto;min-width:100px;">
            <option value="">Set priority…</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select id="batch-assignee" class="fm-input" style="font-size:11px;padding:4px 8px;width:auto;min-width:120px;">
            <option value="">Set assignee…</option>
            ${(RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return RESOURCES_DATA.people[n].active !== false; }).sort() : []).map(function(n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('')}
          </select>
          ${(() => {
            var bpProjects = PROJECTS.filter(function(pr) {
              if (pr.status === 'Complete' || pr.status === 'Canceled') return false;
              if (pr.contact === Auth.fullName) return true;
              if (pr.other_members && pr.other_members.split(',').some(function(m) { return m.trim() === Auth.fullName; })) return true;
              return false;
            });
            bpProjects.sort(function(a,b) { return (a.title||'').localeCompare(b.title||''); });
            var bpOpts = bpProjects.map(function(pr) {
              var label = (pr.project_number ? pr.project_number + ' — ' : '') + pr.title;
              return '<div class="fm-search-option" data-value="' + esc(pr.title) + '"><span class="fm-search-option-name">' + esc(label) + '</span></div>';
            }).join('');
            return '<div class="fm-search-select" id="batch-project-wrap" style="flex:1;min-width:180px;">' +
              '<input type="text" id="batch-project" class="fm-input" style="font-size:11px;padding:4px 8px;" placeholder="Move to project…" autocomplete="off">' +
              '<input type="hidden" id="batch-project-val" value="">' +
              '<div class="fm-search-dropdown" id="batch-project-dropdown">' + bpOpts + '</div>' +
            '</div>';
          })()}
          <button onclick="btnPending(this, () => applyBatchUpdate(), 'Applying…')" style="padding:5px 14px;background:var(--navy);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Apply</button>
          <button onclick="btnPending(this, () => batchDeleteTasks(), 'Deleting…')" style="padding:5px 14px;background:#FEE2E2;color:#991B1B;border:1px solid #FECACA;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Delete Selected</button>
        </div>
        <div class="detail-tasks-table">
          ${(() => {
            function sortArrow(col) {
              var active = _dtSortCol === col;
              var arrow = active ? (_dtSortDir === 'asc' ? '▲' : '▼') : '▼';
              return '<span class="dt-sort-arrow' + (active ? ' active' : '') + '">' + arrow + '</span>';
            }
            var header = relTasks.length ? '<div class="detail-tasks-header">' +
              '<div style="text-align:center;"><input type="checkbox" id="batch-select-all" onchange="toggleSelectAllTasks(this.checked)" style="width:14px;height:14px;cursor:pointer;accent-color:#fff;" title="Select all"></div>' +
              '<div class="dt-sortable" onclick="toggleDetailTaskSort(\'id\')">ID ' + sortArrow('id') + '</div>' +
              '<div class="dt-sortable" onclick="toggleDetailTaskSort(\'title\')">Task ' + sortArrow('title') + '</div>' +
              '<div class="dt-sortable" onclick="toggleDetailTaskSort(\'status\')">Status ' + sortArrow('status') + '</div>' +
              '<div class="dt-sortable" onclick="toggleDetailTaskSort(\'priority\')">Priority ' + sortArrow('priority') + '</div>' +
              '<div class="dt-sortable" onclick="toggleDetailTaskSort(\'assignee\')">Assignee ' + sortArrow('assignee') + '</div>' +
              '<div class="dt-sortable" onclick="toggleDetailTaskSort(\'due\')">Due Date ' + sortArrow('due') + '</div>' +
              '<div class="dt-sortable" onclick="toggleDetailTaskSort(\'hours\')">Hours ' + sortArrow('hours') + '</div>' +
            '</div>' : '';
            return header + taskRows + projHrsRow;
          })()}
        </div>
      </div>
    </div>
  </div>`;
}

// ─── TASK DETAIL PAGE ─────────────────────────────────────────────────
function renderTaskDetail(idx) {
  const t = TASKS.find(x => x.objectId == idx);
  if (!t) return '<div class="empty-state">Task not found.</div>';
  const statusColor = STATUS_COLOR(t.status) || '#9CA3AF';
  const proj = typeof getProjectByNumber === 'function' ? getProjectByNumber(t.project_number) : null;
  const taskReturnTab = currentDetail._returnTab || 'tasks';
  const taskFromProject = currentDetail._fromProject;
  // Labels for every tab that can link to a task. Same comprehensive map
  // as the project detail. "← Back to Project" is reserved for the case
  // where the user genuinely navigated here from a project's detail view
  // (openTaskFromProject set _fromProject) — NOT just because the task
  // happens to have a parent project. Forcing _fromProject onto every
  // task with a resolvable proj used to make Back skip past the user's
  // actual originating tab; that behavior is removed.
  const taskBackLabels = {
    overview:      '← Back to Overview',
    mywork:        '← Back to My Work',
    projects:      '← Back to Projects',
    tasks:         '← Back to Tasks',
    projectReview: '← Back to Project Review',
    resources:     '← Back to Resources',
    forecast:      '← Back to Forecast',
    insights:      '← Back to Insights',
    issues:        '← Back to Issues',
    achievements:  '← Back to Achievements',
    slideshow:     '← Back to Slideshow',
    settings:      '← Back to Settings'
  };
  const taskBackLabel = taskFromProject ? '← Back to Project'
    : taskBackLabels[taskReturnTab] || '← Back';

  const isCompletable = t.status && t.status !== 'Complete' && t.status !== 'Canceled';

  return `<div class="detail-page">
    <div class="detail-hero">
      <div class="detail-hero-sidebar" style="background:${statusColor};color:${STATUS_TEXT_COLOR(t.status)};">
        <span class="detail-hero-sidebar-label">${esc(t.status || '—')}</span>
        <span class="detail-hero-sidebar-id">${esc(t.task_number || '')}</span>
      </div>
      <div class="detail-hero-main">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <button class="detail-back-btn" onclick="goBackFromDetail()">← ${taskBackLabel}</button>
          <div class="detail-hero-actions">
            ${isCompletable ? `<button class="modal-edit-btn" style="background:#EAF3DE;color:#27500A;border-color:#83AC1644;" onclick="event.stopPropagation();markTaskComplete(${t.objectId})"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg> Complete</button>` : ''}
            <button class="modal-edit-btn" onclick="openFormModal('edit-task',${t.objectId})"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg> Edit</button>
            <button class="modal-del-btn" onclick="confirmDeleteTask(${t.objectId})"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg> Delete</button>
          </div>
        </div>
        <div style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Task</div>
        <div class="detail-hero-title">${esc(t.title)}</div>
        <div class="detail-hero-badges">
          <span class="priority-badge priority-${t.priority||'null'}">${t.priority||'—'}</span>
          ${t.assignee ? `<span class="detail-hero-chip">${esc(t.assignee)}</span>` : ''}
          ${getTaskHours(t.idx) > 0 ? `<span class="detail-hero-chip"><svg class="icon" aria-hidden="true"><use href="#ph-clock"></use></svg> ${hoursLabel(getTaskHours(t.idx), getMyTaskHours(t.idx))}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="detail-content">
      <div class="detail-section">
        <div class="detail-section-label">Task Details</div>
        <div class="detail-meta-grid">
          <div class="detail-meta-item"><label>Assignee</label><p>${esc(t.assignee||'—')}</p></div>
          <div class="detail-meta-item"><label>Project</label>
            <p>${proj ? `<span onclick="openProject(${proj.objectId})" style="color:var(--navy);cursor:pointer;text-decoration:underline;">${esc(proj.title)}</span>` : '—'}</p>
          </div>
          <div class="detail-meta-item"><label>Category</label><p>${esc(t.category||'—')}</p></div>
          <div class="detail-meta-item"><label>Tool</label><p>${esc(t.tool||'—')}</p></div>
          <div class="detail-meta-item"><label>Start Date</label><p>${t.start||'—'}</p></div>
          <div class="detail-meta-item"><label>Original Due Date</label><p>${t.due||'—'}</p></div>
          <div class="detail-meta-item"><label>Working Due Date</label><p>${t.working_due ? t.working_due + (t.due && t.working_due !== t.due ? ' <span style="font-size:10px;color:#EF4444;">(moved)</span>' : '') : '—'}</p></div>
          <div class="detail-meta-item"><label>Hours Logged</label><p>${getTaskHours(t.idx) > 0 ? hoursLabel(getTaskHours(t.idx), getMyTaskHours(t.idx)) : '—'}</p></div>
          ${t.actual_end ? `<div class="detail-meta-item"><label>Actual End</label><p>${t.actual_end}</p></div>` : ''}
          ${t.hours_worked ? `<div class="detail-meta-item"><label>Hours Worked</label><p>${t.hours_worked}</p></div>` : ''}
        </div>
      </div>

      ${t.description ? `<div class="detail-section">
        <div class="detail-section-label">Description</div>
        <div class="detail-prose task-prose">${renderMd(t.description)}</div>
      </div>` : ''}

      ${t.resolution ? `<div class="detail-section">
        <div class="detail-section-label">Resolution</div>
        <div class="detail-prose task-prose">${renderMd(t.resolution)}</div>
      </div>` : ''}

      ${renderTaskHistorySection(t)}

      ${proj ? `<div class="detail-section">
        <div class="detail-section-label">Parent Project</div>
        <div onclick="openProject(${proj.objectId})" style="cursor:pointer;border:1px solid var(--border);border-radius:6px;padding:16px 20px;background:var(--white);display:flex;align-items:center;gap:16px;transition:background 0.15s;" onmouseenter="this.style.background='#F0F4FF'" onmouseleave="this.style.background='var(--white)'">
          <div style="width:40px;height:40px;border-radius:6px;background:var(--navy);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="color:#fff;font-size:10px;font-weight:800;">${proj.title.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</span>
          </div>
          <div style="min-width:0;">
            <div style="font-weight:700;color:var(--text-dark);font-size:14px;">${esc(proj.title)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${esc(proj.status||'—')} · ${esc(proj.category||'—')}</div>
          </div>
          <div style="margin-left:auto;color:var(--navy);font-size:18px;">→</div>
        </div>
      </div>` : ''}

      ${isFeatureOn('dependencies') ? (() => {
        var blockedBy = parseBlockedBy(t);
        var blocking = getBlockingTasks(t.task_number);
        if (!blockedBy.length && !blocking.length) return '';
        var html = '<div class="detail-section">';
        html += '<div class="detail-section-label">Dependencies</div>';
        if (blockedBy.length) {
          html += '<div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Depends on</div>';
          blockedBy.forEach(function(ref) {
            var dep = resolveDependency(ref);
            if (!dep) { html += '<div style="font-size:12px;color:var(--text-muted);padding:4px 0;">' + esc(ref) + ' (not found)</div>'; return; }
            var sc = STATUS_COLOR(dep.obj.status);
            var isDone = dep.obj.status === 'Complete' || dep.obj.status === 'Canceled';
            var typeIcon = dep.type === 'project' ? '<svg class="icon" aria-hidden="true"><use href="#ph-folder"></use></svg>' : (isDone ? '<svg class="icon" aria-hidden="true"><use href="#ph-check-circle"></use></svg>' : '<svg class="icon" aria-hidden="true"><use href="#ph-lock"></use></svg>');
            var typeLabel = dep.type === 'project' ? 'Project' : 'Task';
            var clickAction = dep.type === 'project' ? 'openProject(' + dep.obj.objectId + ')' : 'openTask(' + dep.obj.objectId + ')';
            html += '<div onclick="' + clickAction + '" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;background:var(--white);transition:background 0.15s;" onmouseenter="this.style.background=\'#F0F4FF\'" onmouseleave="this.style.background=\'var(--white)\'">';
            html += '<span style="font-size:12px;">' + typeIcon + '</span>';
            html += '<span style="font-family:monospace;font-size:10px;color:var(--text-muted);">' + esc(ref) + '</span>';
            html += '<span style="flex:1;font-size:13px;font-weight:500;' + (isDone ? 'text-decoration:line-through;color:var(--text-muted);' : 'color:var(--text-body);') + '">' + esc(dep.obj.title) + '</span>';
            html += '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:' + sc + '18;color:' + sc + ';">' + esc(dep.obj.status) + '</span>';
            html += '<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:' + (isDone ? '#EAF3DE' : '#FCEBEB') + ';color:' + (isDone ? '#27500A' : '#791F1F') + ';flex-shrink:0;">' + (isDone ? 'Resolved' : 'Unresolved') + '</span>';
            html += '</div>';
          });
          html += '</div>';
        }
        if (blocking.length) {
          html += '<div><div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Required by</div>';
          blocking.forEach(function(bt) {
            var sc = STATUS_COLOR(bt.status);
            html += '<div onclick="openTask(' + bt.objectId + ')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;background:var(--white);transition:background 0.15s;" onmouseenter="this.style.background=\'#F0F4FF\'" onmouseleave="this.style.background=\'var(--white)\'">';
            html += '<span style="font-size:12px;"><svg class="icon" aria-hidden="true"><use href="#ph-link"></use></svg></span>';
            html += '<span style="font-family:monospace;font-size:10px;color:var(--text-muted);">' + esc(bt.task_number || '') + '</span>';
            html += '<span style="flex:1;font-size:13px;font-weight:500;color:var(--text-body);">' + esc(bt.title) + '</span>';
            html += '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:' + sc + '18;color:' + sc + ';">' + esc(bt.status) + '</span>';
            html += '</div>';
          });
          html += '</div>';
        }
        html += '</div>';
        return html;
      })() : ''}
    </div>
  </div>`;
}

// ── Project Timeline hover popover ─────────────────────────
// ── Project Timeline hover popover ─────────────────────────────
function tlHover(evt, container) {
  var pop = container.querySelector('[id$="-pop"]');
  if (!pop) return;
  var tasks;
  try { tasks = JSON.parse(container.getAttribute('data-tasks')); } catch(e) { return; }
  if (!tasks || !tasks.length) return;

  var rect = container.getBoundingClientRect();
  var x = evt.clientX - rect.left;
  var pct = (x / rect.width) * 100;

  var rangeStart = container.getAttribute('data-range-start');
  var totalDays = parseInt(container.getAttribute('data-total-days')) || 1;
  var rangeStartMs = new Date(rangeStart + 'T00:00:00').getTime();
  var cursorMs = rangeStartMs + (pct / 100) * totalDays * 86400000;

  var activeTasks = tasks.filter(function(t) {
    var tStartMs = new Date(t.start + 'T00:00:00').getTime();
    var tEndMs = new Date(t.end + 'T00:00:00').getTime();
    return cursorMs >= tStartMs && cursorMs <= tEndMs;
  });

  if (activeTasks.length === 0) {
    pop.style.display = 'none';
    return;
  }

  // Calculate cursor date for display
  var cursorDate = new Date(cursorMs);
  var dateStr = cursorDate.toISOString().slice(0, 10);

  var html = '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-bottom:4px;">' + dateStr + '</div>';
  activeTasks.forEach(function(t) {
    var sc = STATUS_COLOR(t.status) || '#9CA3AF';
    html += '<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">';
    html += '<span style="width:8px;height:8px;border-radius:2px;background:' + sc + ';flex-shrink:0;display:inline-block;"></span>';
    html += '<span style="font-weight:600;color:var(--text-body);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.title) + '</span>';
    html += '<span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">' + t.start + ' \u2013 ' + t.end + '</span>';
    html += '</div>';
    if (t.assignee) {
      html += '<div style="font-size:10px;color:var(--text-muted);padding-left:14px;margin-top:-1px;">' + esc(t.assignee) + '</div>';
    }
  });

  pop.innerHTML = html;
  pop.style.display = '';
  // Position horizontally near cursor
  var popLeft = Math.min(x, rect.width - 240);
  pop.style.left = Math.max(0, popLeft) + 'px';
}

function tlLeave(container) {
  var pop = container.querySelector('[id$="-pop"]');
  if (pop) pop.style.display = 'none';
}

// ── Detail task sort state ─────────────────────────────────
let _taskViewMode = 'list'; // 'list' or 'phase' — controls task display on project detail page
let _dtSortCol = 'due';    // default sort column for project detail tasks
let _dtSortDir = 'asc';    // 'asc' or 'desc'

function toggleDetailTaskSort(col) {
  if (_dtSortCol === col) {
    _dtSortDir = _dtSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _dtSortCol = col;
    _dtSortDir = 'asc';
  }
  render();
}

// ═════════════════════════════════════════════════════════════════════════
//  OE DETAIL RENDERERS — Laura's project + task detail layouts (mock-first
//  approved). Dispatched alongside the Classic renderers in render.js / my-work
//  via _oeDetail(). Classic versions stay completely untouched.
// ═════════════════════════════════════════════════════════════════════════
function _oeDetail() { return typeof document !== 'undefined' && document.body && /^oe/.test(document.body.dataset.theme || ''); }

// Aggregate allocation data for a project: per-person totals + per-week hours
// (the stacked-bar chart input). Returns null if no contributors.
function _projAllocData(p) {
  var pNum = p && p.project_number != null ? String(p.project_number) : '';
  if (!pNum || typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return null;
  var contributors = [];
  Object.keys(RESOURCES_DATA.people).forEach(function(name) {
    var person = RESOURCES_DATA.people[name];
    if (!person || !Array.isArray(person.allocations)) return;
    var alloc = person.allocations.find(function(a) { return a.analytics_id != null && String(a.analytics_id) === pNum; });
    if (!alloc || !Array.isArray(alloc.hours)) return;
    var totalHrs = alloc.hours.reduce(function(s, h) { return s + (h || 0); }, 0);
    if (totalHrs <= 0) return;
    contributors.push({ name: name, role: alloc.role || 'Contributor', hours: totalHrs, weeklyHours: alloc.hours.slice() });
  });
  if (!contributors.length) return null;
  contributors.sort(function(a, b) { return b.hours - a.hours; });
  contributors.forEach(function(c, i) { c.dataIdx = (i < 8) ? (i + 1) : 'other'; });
  var total = contributors.reduce(function(s, c) { return s + c.hours; }, 0);
  var N = contributors[0].weeklyHours.length;
  var firstWk = -1, lastWk = -1;
  for (var i = 0; i < N; i++) {
    var anyHrs = contributors.some(function(c) { return (c.weeklyHours[i] || 0) > 0; });
    if (anyHrs) { if (firstWk < 0) firstWk = i; lastWk = i; }
  }
  return { contributors: contributors, total: total, firstWk: firstWk, lastWk: lastWk };
}

// Task-status segments for the OE progress strip (% complete + segmented bar).
// Also breaks out milestones as a sub-count — every task counts toward the
// main total (per design), and the milestone sub-line answers "are we hitting
// our checkpoints?" separately from raw task throughput.
function _projProgressSegments(relTasks) {
  var counts = { complete: 0, active: 0, hold: 0, future: 0, canceled: 0 };
  var msTotal = 0, msHit = 0, msMissed = 0;
  relTasks.forEach(function(t) {
    var s = t.status || '';
    if (s === 'Complete') counts.complete++;
    else if (s === 'Active') counts.active++;
    else if (s === 'On Hold' || s === 'Waiting for Response' || s === 'Pending') counts.hold++;
    else if (s === 'Canceled') counts.canceled++;
    else counts.future++;
    if (typeof isMilestone === 'function' && isMilestone(t)) {
      msTotal++;
      var st = milestoneState(t);
      if (st === 'hit') msHit++;
      else if (st === 'missed') msMissed++;
    }
  });
  var total = relTasks.length;
  var doneOrActive = counts.complete + counts.active;
  var pct = total > 0 ? Math.round((doneOrActive / total) * 100) : 0;
  return { counts: counts, total: total, pct: pct, doneOrActive: doneOrActive,
           msTotal: msTotal, msHit: msHit, msMissed: msMissed };
}

// Build an OE-styled inline task row for the project detail Tasks tab. Mirrors
// buildDetailTaskRow's inline edits (status / priority / assignee / due date) so
// every editor users rely on still works.
function _oeDetailTaskRow(t) {
  var sc = STATUS_COLOR(t.status) || '#9CA3AF';
  var taskHrs = getTaskHours(t.idx);
  var myHrs = getMyTaskHours(t.idx);
  var hrsDisplay = taskHrs > 0 ? hoursLabel(taskHrs, myHrs) : '—';
  var due = t.working_due || t.due || '';
  var isDone = t.status === 'Complete' || t.status === 'Canceled';
  return '<div class="pd-task-row' + (isDone ? ' pd-task-row--done' : '') + '">' +
    '<div style="text-align:center;" onclick="event.stopPropagation()"><input type="checkbox" class="batch-task-cb" data-task-id="' + t.objectId + '" onchange="updateBatchBar()"></div>' +
    '<div><span class="oe-mono" style="font-size:11px;color:var(--ink-5);">' + esc(t.task_number || '—') + '</span></div>' +
    '<div class="pd-task-title" onclick="openTaskFromProject(' + t.objectId + ')">' + (typeof getDependencyIcon === 'function' ? getDependencyIcon(t) : '') + ((typeof isMilestone === 'function' && isMilestone(t)) ? renderMilestoneDiamond(t, 12) + ' ' : '') + '<span' + ((typeof isMilestone === 'function' && isMilestone(t)) ? ' style="font-weight:600;' + (milestoneState(t) === 'missed' ? 'color:var(--status-overdue-fg);' : '') + '"' : '') + '>' + esc(t.title) + '</span></div>' +
    '<div onclick="event.stopPropagation()"><select class="mw-status-select" data-type="task" data-id="' + t.objectId + '" onchange="mwQuickStatus(this)" style="background:' + sc + '18;color:' + sc + ';border-color:' + sc + '44;">' +
      ['Active','Pending','On Hold','Waiting for Response','Complete','Canceled'].map(function(s) { return '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
    '</select></div>' +
    '<div><span class="priority-badge priority-' + (t.priority || 'null') + '">' + (t.priority || '—') + '</span></div>' +
    '<div onclick="event.stopPropagation()"><select class="dt-inline-select" data-task-id="' + t.objectId + '" onchange="inlineTaskAssignee(this)">' +
      '<option value=""' + (!t.assignee ? ' selected' : '') + '>Unassigned</option>' +
      ((RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return RESOURCES_DATA.people[n].active !== false; }).sort() : []).map(function(n) { return '<option value="' + esc(n) + '"' + (t.assignee === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('')) +
    '</select></div>' +
    '<div onclick="event.stopPropagation()"><input type="date" class="dt-inline-date" data-task-id="' + t.objectId + '" data-has-due="' + (t.due ? '1' : '') + '" onchange="inlineTaskDueDate(this)" value="' + (due || '') + '"></div>' +
    '<div class="pd-task-hours"><span class="oe-mono" style="font-size:11px;color:var(--ink-7);">' + hrsDisplay + '</span></div>' +
  '</div>';
}

// ─── OE PROJECT DETAIL ────────────────────────────────────────────────
function renderProjectDetailOE(id) {
  var p = PROJECTS.find(function(x) { return x.objectId == id; });
  if (!p) return '<div class="empty-state">Project not found.</div>';
  var _pNum = p.project_number != null ? String(p.project_number) : null;
  var relTasks = !_pNum ? [] : TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === _pNum; });

  // Status grouping (mirrors Classic): In Progress, Pending, Complete, Canceled.
  var IN_PROGRESS_STATUSES = ['Active', 'On Hold', 'Waiting for Response'];
  var inProgressTasks = sortDetailTasks(relTasks.filter(function(t) { return IN_PROGRESS_STATUSES.indexOf(t.status) >= 0; }));
  var pendingTasks    = sortDetailTasks(relTasks.filter(function(t) { return t.status === 'Pending'; }));
  var completeTasks   = sortDetailTasks(relTasks.filter(function(t) { return t.status === 'Complete'; }));
  var canceledTasks   = sortDetailTasks(relTasks.filter(function(t) { return t.status === 'Canceled'; }));

  var canEdit = (typeof canEditProject === 'function') ? canEditProject(p) : (isAdmin() || (Auth.fullName && p.contact === Auth.fullName));
  var isCompletable = canEdit && p.status && p.status !== 'Complete' && p.status !== 'Canceled';

  // Progress strip
  var prog = _projProgressSegments(relTasks);
  var segs = [
    { count: prog.counts.complete, color: 'var(--status-complete-dot)', label: 'Complete' },
    { count: prog.counts.active,   color: 'var(--status-active-dot)',   label: 'Active' },
    { count: prog.counts.hold,     color: 'var(--status-hold-dot)',     label: 'On hold' },
    { count: prog.counts.future,   color: 'var(--ink-2)',               label: 'Future' },
    { count: prog.counts.canceled, color: 'var(--status-canceled-dot)', label: 'Canceled' }
  ].filter(function(s) { return s.count > 0; });

  // Sidebar — People
  var supporting = (p.other_members || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var supAvatars = supporting.slice(0, 3).map(function(name, i) {
    var init = name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    var styles = ['', 'background:var(--sage-100);color:var(--sage-700);', 'background:var(--steel-100);color:var(--steel-700);'];
    return '<span class="oe-avatar oe-avatar--sm" style="margin-right:-8px;border:2px solid var(--ink-paper);' + (styles[i] || '') + '">' + esc(init) + '</span>';
  }).join('');
  if (supporting.length > 3) supAvatars += '<span class="oe-avatar oe-avatar--sm" style="border:2px solid var(--ink-paper);background:var(--ink-1);color:var(--ink-5);">+' + (supporting.length - 3) + '</span>';

  // Sidebar — Schedule
  var startDate = p.start || '';
  var dueDate = p.working_due || p.end || '';
  var timeRemaining = (function() {
    if (!dueDate || p.status === 'Complete' || p.status === 'Canceled') return null;
    var due = new Date(dueDate + 'T00:00:00');
    var today = new Date(); today.setHours(0,0,0,0);
    var days = Math.round((due - today) / 86400000);
    return { days: days, overdue: days < 0 };
  })();

  // Sidebar — Effort
  var loggedHrs = getProjectHours(p.title);
  // Estimated hours: sum of task est/working_due — we don't carry per-task estimates, so derive
  // from project_size convention used elsewhere in the app (S/M/L/XL → rough h band).
  var sizeHours = { 'S': 40, 'M': 120, 'L': 400, 'XL': 1000 };
  var estimatedHrs = sizeHours[p.project_size] || 0;
  var capPct = estimatedHrs > 0 ? Math.min(100, Math.round((loggedHrs / estimatedHrs) * 100)) : 0;

  var allocData = _projAllocData(p);

  // ── HEADER ──
  var headerCategory = p.category ? '<span class="oe-body-sm" style="display:inline-flex;align-items:center;gap:4px;"><svg class="icon" aria-hidden="true" style="width:12px;height:12px;"><use href="#ph-folder-open"></use></svg>' + esc(p.category) + '</span>' : '';
  var headerDept = p.partner_dept ? '<span class="oe-body-sm">' + esc(p.partner_dept) + '</span>' : '';

  var html = '<div class="oe-detail oe-detail--project">';

  // Breadcrumb — sticky so it's always reachable from anywhere on the page.
  html += '<div class="oe-detail-crumbs">' +
    '<a class="oe-detail-back" onclick="goBackFromDetail()" title="Back to where you came from">' +
      '<svg class="icon" aria-hidden="true" style="width:12px;height:12px;"><use href="#ph-caret-left"></use></svg>' +
      'Portfolio' +
    '</a>' +
    '<svg class="icon" aria-hidden="true" style="width:10px;height:10px;color:var(--ink-5);"><use href="#ph-caret-right"></use></svg>' +
    '<span style="color:var(--ink-5);">' + esc(p.status || '—') + '</span>' +
    '<svg class="icon" aria-hidden="true" style="width:10px;height:10px;color:var(--ink-5);"><use href="#ph-caret-right"></use></svg>' +
    '<span style="color:var(--ink-7);">' + esc(p.title) + '</span>' +
  '</div>';

  // Initiative breadcrumb (OE) — slim navy band when this project belongs to
  // an initiative. Click-through opens the initiative detail page.
  var _initForP = (p.initiative_id && typeof getInitiative === 'function') ? getInitiative(p.initiative_id) : null;
  if (_initForP) {
    var _sibCount = (typeof getProjectsForInitiative === 'function') ? getProjectsForInitiative(_initForP.initiative_id).length - 1 : 0;
    html += '<div class="proj-initiative-breadcrumb" onclick="initOpenFromProject(\'' + esc(_initForP.initiative_id).replace(/'/g, "\\'") + '\')">' +
      '<svg class="icon" aria-hidden="true"><use href="#ph-flag-banner"></use></svg>' +
      '<div>' +
        '<div class="proj-init-label">Part of initiative</div>' +
        '<div class="proj-init-name">' + esc(_initForP.name) + '</div>' +
      '</div>' +
      '<div class="proj-init-siblings">' + _sibCount + ' sibling project' + (_sibCount === 1 ? '' : 's') + ' · <span class="proj-init-link">View initiative →</span></div>' +
    '</div>';
  }

  // Header
  html += '<div class="oe-detail-head">' +
    '<div class="oe-detail-head-left">' +
      '<div class="oe-detail-pills">' +
        '<span class="oe-mono" style="font-size:12px;color:var(--ink-5);letter-spacing:0.04em;">' + esc(p.project_number || '') + '</span>' +
        '<span class="status-pill" data-status="' + esc(p.status || '') + '" style="background:' + (STATUS_COLOR(p.status) || '#9CA3AF') + '22;color:var(--ink-7);"><span style="width:6px;height:6px;border-radius:50%;background:' + (STATUS_COLOR(p.status) || '#9CA3AF') + ';display:inline-block;"></span>' + esc(p.status || '—') + '</span>' +
        '<span class="priority-badge priority-' + (p.priority || 'null') + '">' + (p.priority || '—') + '</span>' +
        headerCategory +
        headerDept +
      '</div>' +
      '<h1 class="oe-detail-title">' + esc(p.title) + '</h1>' +
      (p.description ? '<p class="oe-detail-blurb">' + esc(p.description) + '</p>' : '') +
    '</div>' +
    '<div class="oe-detail-actions">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">' +
        (isCompletable ? '<button class="oe-btn oe-btn--secondary oe-btn--sm" onclick="markProjectComplete(' + p.objectId + ')"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg>Complete</button>' : '') +
        (canEdit ? '<button class="oe-btn oe-btn--secondary oe-btn--sm" onclick="openFormModal(\'edit-project\',' + p.objectId + ')"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg>Edit</button>' : '') +
        '<button class="oe-btn oe-btn--primary oe-btn--sm" data-project-id="' + p.objectId + '" data-project-title="' + esc(p.title) + '" onclick="addTaskToProject(this.dataset.projectId, this.dataset.projectTitle)"><svg class="icon" aria-hidden="true"><use href="#ph-plus"></use></svg>Add task</button>' +
        '<button class="oe-btn oe-btn--ghost oe-btn--sm" onclick="copyProjectSummary(' + p.objectId + ')" title="Copy project summary"><svg class="icon" aria-hidden="true"><use href="#ph-clipboard-text"></use></svg></button>' +
        (canEdit ? '<button class="oe-btn oe-btn--ghost oe-btn--sm" onclick="confirmDeleteProject(' + p.objectId + ')" title="Delete project" style="color:var(--status-overdue-fg);"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></button>' : '') +
      '</div>' +
      (p.actual_end ? '<div class="oe-mono" style="font-size:10px;color:var(--ink-4);margin-top:8px;">Completed ' + p.actual_end + '</div>' : '') +
    '</div>' +
  '</div>';

  // Progress strip — includes a milestone sub-line when any task on the
  // project is flagged as a milestone (see _projProgressSegments).
  if (prog.total > 0) {
    var msSubLine = '';
    if (prog.msTotal > 0) {
      var msIcon = '<svg width="11" height="11" viewBox="0 0 28 28" style="vertical-align:middle;"><polygon points="14,2 26,14 14,26 2,14" fill="var(--status-complete-dot,#8a4c70)" stroke="var(--status-complete-dot,#8a4c70)" stroke-width="2.5"/></svg>';
      var msMissedNote = prog.msMissed > 0 ? ' · <span style="color:var(--status-overdue-fg,#6e2a0a);font-weight:600;">' + prog.msMissed + ' missed</span>' : '';
      msSubLine =
        '<span class="oe-body-sm" style="color:var(--ink-3,#d9d1bf);margin:0 4px;">·</span>' +
        '<span class="oe-body-sm" style="color:var(--status-complete-fg,#4d2a4d);display:inline-flex;align-items:center;gap:4px;">' +
          msIcon + '<strong>' + prog.msHit + ' of ' + prog.msTotal + ' milestone' + (prog.msTotal === 1 ? '' : 's') + ' hit</strong>' +
        '</span>' + msMissedNote;
    }
    html += '<div class="oe-card oe-detail-progress">' +
      '<div class="oe-detail-progress-num"><div class="oe-meta" style="margin-bottom:4px;">Progress</div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">' +
          '<span class="oe-mono" style="font-size:22px;color:var(--ink-7);">' + prog.pct + '%</span>' +
          '<span class="oe-body-sm">' + prog.doneOrActive + ' of ' + prog.total + ' tasks complete or in progress</span>' +
          msSubLine +
        '</div>' +
      '</div>' +
      '<div class="oe-detail-progress-bar-wrap">' +
        '<div class="oe-detail-progress-bar">' +
          segs.map(function(s) { return '<div style="flex:' + s.count + ';background:' + s.color + ';" title="' + s.label + ' · ' + s.count + '"></div>'; }).join('') +
        '</div>' +
        '<div class="oe-detail-progress-legend">' +
          segs.map(function(s) { return '<div><span style="width:8px;height:8px;border-radius:2px;background:' + s.color + ';"></span><span class="oe-body-sm" style="font-size:11px;">' + s.label + ' <span class="oe-mono" style="color:var(--ink-5);">' + s.count + '</span></span></div>'; }).join('') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Two-column body
  html += '<div class="oe-detail-body">';

  // ── MAIN ──
  html += '<div class="oe-detail-main">';

  // Markdown sections above the tabs (description, problem, etc.)
  function mdSection(label, content, color) {
    if (!content) return '';
    var col = color || 'var(--ink-5)';
    return '<div class="oe-detail-mdsec"><div class="oe-meta" style="color:' + col + ';margin-bottom:8px;">' + label + '</div><div class="oe-detail-prose">' + (typeof renderMd === 'function' ? renderMd(content) : esc(content)) + '</div></div>';
  }
  html += mdSection('Problem statement', p.problem_statement);
  html += mdSection('Definition of done', p.definition_of_done);
  html += mdSection('Key results', p.key_results);
  html += mdSection('Data sources', p.data_sources);
  html += mdSection('Technical requirements', p.technical_requirements);
  if (p.urgency_notes) html += mdSection('Urgency / timeline notes', p.urgency_notes, 'var(--status-overdue-fg)');
  html += mdSection('Reviewer notes', p.reviewer_notes);
  if (typeof renderProjectJournalSection === 'function') html += '<div class="oe-detail-mdsec">' + renderProjectJournalSection(p) + '</div>';

  // Tabs
  var tabs = [
    { id: 'tasks', label: 'Tasks', count: relTasks.length },
    { id: 'alloc', label: 'Allocations', count: allocData ? allocData.contributors.length : 0 }
  ];
  html += '<div class="oe-tabs oe-detail-tabs">' +
    tabs.map(function(t) {
      return '<button class="oe-tab" id="pd-tab-' + t.id + '" aria-selected="' + (t.id === 'tasks' ? 'true' : 'false') + '" onclick="showPdTab(\'' + t.id + '\')">' + t.label + (t.count ? ' <span class="oe-tab-count">' + t.count + '</span>' : '') + '</button>';
    }).join('') +
  '</div>';

  // Tasks panel
  html += '<div id="pd-panel-tasks" class="oe-detail-tabpanel">';
  // Batch action bar
  html += '<div id="batch-action-bar" style="display:none;background:var(--ink-1);border:1px solid var(--ink-2);border-radius:8px;padding:10px 14px;margin-bottom:10px;align-items:center;gap:10px;flex-wrap:nowrap;">' +
    '<span style="font-size:12px;font-weight:600;color:var(--ink-7);" id="batch-count">0 selected</span>' +
    '<select id="batch-status" class="fm-input" style="font-size:11px;padding:4px 8px;width:auto;min-width:100px;"><option value="">Set status…</option><option value="Active">Active</option><option value="Pending">Pending</option><option value="On Hold">On Hold</option><option value="Complete">Complete</option><option value="Canceled">Canceled</option><option value="Waiting for Response">Waiting for Response</option></select>' +
    '<select id="batch-priority" class="fm-input" style="font-size:11px;padding:4px 8px;width:auto;min-width:100px;"><option value="">Set priority…</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option></select>' +
    '<select id="batch-assignee" class="fm-input" style="font-size:11px;padding:4px 8px;width:auto;min-width:120px;"><option value="">Set assignee…</option>' +
      (RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return RESOURCES_DATA.people[n].active !== false; }).sort().map(function(n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('') : '') +
    '</select>' +
    '<button onclick="btnPending(this, () => applyBatchUpdate(), \'Applying…\')" class="oe-btn oe-btn--primary oe-btn--sm">Apply</button>' +
    '<button onclick="btnPending(this, () => batchDeleteTasks(), \'Deleting…\')" class="oe-btn oe-btn--secondary oe-btn--sm" style="color:var(--status-overdue-fg);">Delete</button>' +
  '</div>';

  // Task table
  if (relTasks.length) {
    function sortArrow(col) {
      var active = _dtSortCol === col;
      var arrow = active ? (_dtSortDir === 'asc' ? '↑' : '↓') : '↕';
      return '<span style="opacity:' + (active ? '1' : '0.35') + ';font-size:10px;">' + arrow + '</span>';
    }
    function thSortable(label, col) { return '<div class="pd-task-th" onclick="toggleDetailTaskSort(\'' + col + '\')">' + label + ' ' + sortArrow(col) + '</div>'; }
    html += '<div class="oe-card pd-tasks-card">' +
      '<div class="pd-task-header">' +
        '<div style="text-align:center;"><input type="checkbox" id="batch-select-all" onchange="toggleSelectAllTasks(this.checked)"></div>' +
        thSortable('ID', 'id') +
        thSortable('Task', 'title') +
        thSortable('Status', 'status') +
        thSortable('Priority', 'priority') +
        thSortable('Assignee', 'assignee') +
        thSortable('Due', 'due') +
        thSortable('Hours', 'hours') +
      '</div>';
    if (inProgressTasks.length) {
      html += '<div class="pd-task-group">In progress · ' + inProgressTasks.length + '</div>';
      html += inProgressTasks.map(_oeDetailTaskRow).join('');
    }
    if (pendingTasks.length) {
      html += '<div class="pd-task-group">Pending · ' + pendingTasks.length + '</div>';
      html += pendingTasks.map(_oeDetailTaskRow).join('');
    }
    if (completeTasks.length) {
      html += '<div class="pd-task-group">Complete · ' + completeTasks.length + '</div>';
      html += completeTasks.map(_oeDetailTaskRow).join('');
    }
    if (canceledTasks.length) {
      html += '<div class="pd-task-group">Canceled · ' + canceledTasks.length + '</div>';
      html += canceledTasks.map(_oeDetailTaskRow).join('');
    }
    html += '</div>';
  } else {
    html += '<div class="empty-state" style="padding:32px;text-align:center;">No tasks linked to this project yet.</div>';
  }

  // Time logged below the task table (existing structure, OE-shaped)
  if (loggedHrs > 0) {
    var personHrs = getProjectHoursByPerson(p.title);
    if (personHrs.length) {
      var maxHrs = personHrs[0].hours;
      var rows = personHrs.map(function(ph) {
        var initials = ph.name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        var barPct = maxHrs > 0 ? Math.round(ph.hours / maxHrs * 100) : 0;
        return '<div class="pd-loggedrow"><span class="oe-avatar oe-avatar--sm">' + initials + '</span><div class="pd-loggedrow-name">' + esc(ph.name) + '<div class="pd-loggedrow-bar"><div style="width:' + barPct + '%;"></div></div></div><span class="oe-mono pd-loggedrow-h">' + ph.hours + 'h</span></div>';
      }).join('');
      html += '<div class="pd-logged"><div class="oe-meta" style="margin-bottom:10px;">Time logged</div>' + rows + '<div class="pd-loggedrow pd-loggedrow--total"><div></div><div class="pd-loggedrow-name" style="font-weight:600;">Total</div><span class="oe-mono pd-loggedrow-h" style="font-weight:600;">' + loggedHrs + 'h</span></div></div>';
    }
  }

  html += '</div>'; // /#pd-panel-tasks

  // Allocations panel
  html += '<div id="pd-panel-alloc" class="oe-detail-tabpanel" style="display:none;">';
  if (allocData) {
    var weeks = allocData.lastWk - allocData.firstWk + 1;
    var maxStack = 0;
    for (var wi = allocData.firstWk; wi <= allocData.lastWk; wi++) {
      var stack = 0;
      allocData.contributors.forEach(function(c) { stack += (c.weeklyHours[wi] || 0); });
      if (stack > maxStack) maxStack = stack;
    }
    var chartH = 88;
    var pxPerHr = maxStack > 0 ? chartH / maxStack : 0;
    var cols = '';
    for (var ci = allocData.firstWk; ci <= allocData.lastWk; ci++) {
      var segHtml = '';
      allocData.contributors.forEach(function(c) {
        var h = c.weeklyHours[ci] || 0;
        if (h > 0) segHtml += '<div class="alloc-seg" style="height:' + (h * pxPerHr) + 'px;background:var(--data-' + c.dataIdx + ');"></div>';
      });
      cols += '<div class="alloc-col">' + segHtml + '</div>';
    }
    var legendItems = allocData.contributors.slice(0, 6).map(function(c) {
      return '<div class="alloc-legend-item"><span class="alloc-legend-dot" style="background:var(--data-' + c.dataIdx + ');"></span>' + esc(c.name) + '</div>';
    }).join('');
    if (allocData.contributors.length > 6) legendItems += '<div class="alloc-legend-item" style="color:var(--ink-5);">+ ' + (allocData.contributors.length - 6) + ' more</div>';

    var allocRows = allocData.contributors.map(function(c) {
      var pct = allocData.total > 0 ? Math.round((c.hours / allocData.total) * 100) : 0;
      var roleCls = c.role === 'Lead' ? 'alloc-role--lead' : (c.role === 'Reviewer' ? 'alloc-role--reviewer' : '');
      var init = c.name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      return '<tr><td><div style="display:flex;align-items:center;gap:8px;"><span class="oe-avatar oe-avatar--sm">' + init + '</span><span style="font-weight:500;">' + esc(c.name) + '</span></div></td>' +
        '<td><span class="alloc-role ' + roleCls + '">' + esc(c.role) + '</span></td>' +
        '<td><div class="alloc-share-bar"><div class="alloc-share-fill" style="width:' + pct + '%;background:var(--data-' + c.dataIdx + ');"></div></div></td>' +
        '<td style="text-align:right;"><span class="oe-mono" style="font-size:12px;">' + Math.round(c.hours) + 'h</span></td>' +
        '<td style="text-align:right;"><span class="oe-mono" style="font-size:12px;">' + pct + '%</span></td></tr>';
    }).join('');

    html += '<div class="oe-card pd-alloc-sum">' +
      '<div class="pd-alloc-stat"><div class="oe-mono pd-alloc-stat-num">' + Math.round(allocData.total) + 'h</div><div class="oe-meta">Allocated</div></div>' +
      '<div class="pd-alloc-stat-div"></div>' +
      '<div class="pd-alloc-stat"><div class="oe-mono pd-alloc-stat-num">' + allocData.contributors.length + '</div><div class="oe-meta">Contributors</div></div>' +
      '<div class="pd-alloc-stat-div"></div>' +
      '<div class="pd-alloc-stat"><div class="oe-mono pd-alloc-stat-num" style="font-size:14px;">' + weeks + ' weeks active</div><div class="oe-meta">Range</div></div>' +
    '</div>' +
    '<div class="oe-card pd-alloc-chart-card">' +
      '<div class="oe-meta" style="margin-bottom:14px;">Weekly load</div>' +
      '<div class="alloc-chart" style="grid-template-columns:repeat(' + weeks + ', 1fr);">' + cols + '</div>' +
      '<div class="alloc-legend">' + legendItems + '</div>' +
    '</div>' +
    '<div class="oe-card" style="padding:0;overflow:hidden;">' +
      '<table class="oe-table"><thead><tr><th>Member</th><th style="width:110px;">Role</th><th>Share</th><th style="width:70px;text-align:right;">Hours</th><th style="width:60px;text-align:right;">%</th></tr></thead><tbody>' + allocRows + '</tbody></table>' +
    '</div>';
  } else {
    html += '<div class="empty-state" style="padding:48px 24px;text-align:center;">No allocations recorded for this project yet.</div>';
  }
  html += '</div>'; // /#pd-panel-alloc
  html += '</div>'; // /.oe-detail-main

  // ── SIDEBAR ──
  html += '<div class="oe-detail-side">';

  // People card
  html += '<div class="oe-card oe-side-card"><div class="oe-meta">People</div>' +
    '<div class="oe-side-field"><div class="oe-side-label">Lead</div><div style="display:flex;align-items:center;gap:8px;">' +
      (p.contact ? '<span class="oe-avatar oe-avatar--sm" style="background:var(--navy-500);color:var(--ink-paper);">' + esc(p.contact.split(' ').map(function(w) { return w[0]; }).join('').slice(0,2).toUpperCase()) + '</span><span style="font-size:13px;">' + esc(p.contact) + '</span>' : '<span style="color:var(--ink-4);">Unassigned</span>') +
    '</div></div>' +
    (supporting.length ? '<div class="oe-side-field"><div class="oe-side-label">Supporting</div><div style="display:flex;align-items:center;">' + supAvatars + '</div></div>' : '') +
    (p.partner_dept ? '<div class="oe-side-field"><div class="oe-side-label">Partner dept.</div><div style="font-size:13px;">' + esc(p.partner_dept) + '</div></div>' : '') +
    (p.itd_team ? '<div class="oe-side-field"><div class="oe-side-label">Unit</div><div style="font-size:13px;">' + esc(p.itd_team) + '</div></div>' : '') +
  '</div>';

  // Schedule card
  html += '<div class="oe-card oe-side-card"><div class="oe-meta">Schedule</div>' +
    '<div class="oe-side-field"><div class="oe-side-label">Started</div><div><span class="oe-mono" style="font-size:12px;">' + (startDate || '—') + '</span></div></div>' +
    '<div class="oe-side-field"><div class="oe-side-label">Due</div><div><span class="oe-mono" style="font-size:12px;">' + (dueDate || '—') + '</span></div></div>' +
    (timeRemaining ? '<div class="oe-side-field"><div class="oe-side-label">Time remaining</div><div><span style="font-size:13px;color:' + (timeRemaining.overdue ? 'var(--status-overdue-fg)' : 'var(--ink-7)') + ';font-weight:600;"><span class="oe-mono">' + (timeRemaining.overdue ? Math.abs(timeRemaining.days) + ' days overdue' : timeRemaining.days + ' days') + '</span></span></div></div>' : '') +
    (p.actual_end ? '<div class="oe-side-field"><div class="oe-side-label">Completed</div><div><span class="oe-mono" style="font-size:12px;">' + esc(p.actual_end) + '</span></div></div>' : '') +
  '</div>';

  // Calibrated forecast — applies the team's learned Schedule Multiplier (from
  // completed projects in this project's category, last 12 months) to project
  // a realistic end date. Quietly omitted when there's no signal (no category,
  // no planned dates, or <3 similar completed siblings).
  if (typeof projectScheduleForecast === 'function') {
    var fc = projectScheduleForecast(p);
    if (fc) {
      var calibFmt = (function() {
        var d = new Date(fc.calibratedEnd + 'T12:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      })();
      var deltaWksAbs = Math.abs(fc.deltaWks);
      var deltaLbl, deltaCol;
      if (fc.deltaWks > 0.5) {
        var lateWks = deltaWksAbs >= 1 ? Math.round(deltaWksAbs) : Number(deltaWksAbs.toFixed(1));
        deltaLbl = '+' + lateWks + ' wk' + (Math.round(lateWks) === 1 ? '' : 's') + ' later';
        deltaCol = 'var(--status-overdue-fg)';
      } else if (fc.deltaWks < -0.5) {
        var earlyWks = deltaWksAbs >= 1 ? Math.round(deltaWksAbs) : Number(deltaWksAbs.toFixed(1));
        deltaLbl = '−' + earlyWks + ' wk' + (Math.round(earlyWks) === 1 ? '' : 's') + ' earlier';
        deltaCol = 'var(--sage-700)';
      } else {
        deltaLbl = 'On plan';
        deltaCol = 'var(--ink-7)';
      }
      html += '<div class="oe-card oe-side-card"><div class="oe-meta">Calibrated forecast' + (typeof calcInfoIcon === 'function' ? calcInfoIcon('calibMultiplier') : '') + '</div>' +
        '<div class="oe-side-field"><div class="oe-side-label">Projected end</div><div><span class="oe-mono" style="font-size:12px;">' + esc(calibFmt) + '</span></div></div>' +
        '<div class="oe-side-field"><div class="oe-side-label">vs original plan</div><div><span style="font-size:12px;color:' + deltaCol + ';font-weight:600;">' + deltaLbl + '</span></div></div>' +
        '<div style="font-size:11px;color:var(--ink-5);margin-top:8px;line-height:1.45;">From <strong>' + fc.n + '</strong> completed ' + esc(fc.category) + ' project' + (fc.n === 1 ? '' : 's') + ' · <span class="oe-mono">' + fc.multiplier.toFixed(2) + '×</span> · <span style="color:' + fc.confidence.fg + ';font-weight:700;text-transform:uppercase;letter-spacing:0.03em;font-size:10px;">' + fc.confidence.label + '</span></div>' +
      '</div>';
    }
  }

  // Effort card
  if (loggedHrs > 0 || estimatedHrs > 0) {
    html += '<div class="oe-card oe-side-card"><div class="oe-meta">Effort</div>' +
      '<div class="oe-side-field"><div class="oe-side-label">Logged</div><div><span class="oe-mono" style="font-size:12px;">' + loggedHrs + 'h</span></div></div>' +
      (estimatedHrs > 0 ? '<div class="oe-side-field"><div class="oe-side-label">Estimated</div><div><span class="oe-mono" style="font-size:12px;">~' + estimatedHrs + 'h <span style="color:var(--ink-5);">(' + esc(p.project_size || '') + ')</span></span></div></div>' : '') +
      (estimatedHrs > 0 ? '<div class="oe-side-field"><div class="oe-side-label">Capacity used</div><div style="display:flex;align-items:center;gap:8px;width:100%;"><div style="flex:1;height:4px;background:var(--ink-1);border-radius:2px;overflow:hidden;"><div style="width:' + capPct + '%;height:100%;background:' + (capPct > 100 ? 'var(--status-overdue-dot)' : 'var(--sage-500)') + ';"></div></div><span class="oe-mono" style="font-size:11px;">' + capPct + '%</span></div></div>' : '') +
    '</div>';
  }

  // Data Program / size badges row
  if (p.is_data_program || p.project_size) {
    html += '<div class="oe-card oe-side-card"><div class="oe-meta">Tags</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
        (p.is_data_program ? '<span class="oe-chip" style="background:var(--ink-1);color:var(--ink-6);">Data Program</span>' : '') +
        (p.project_size ? '<span class="oe-chip" style="background:var(--ink-1);color:var(--ink-6);">Size ' + esc(p.project_size) + '</span>' : '') +
      '</div>' +
    '</div>';
  }

  html += '</div>'; // /.oe-detail-side
  html += '</div>'; // /.oe-detail-body
  html += '</div>'; // /.oe-detail

  return html;
}

// Tab switch for the OE project detail (Tasks ↔ Allocations).
function showPdTab(name) {
  ['tasks', 'alloc'].forEach(function(n) {
    var panel = document.getElementById('pd-panel-' + n);
    if (panel) panel.style.display = (n === name) ? '' : 'none';
    var tab = document.getElementById('pd-tab-' + n);
    if (tab) tab.setAttribute('aria-selected', (n === name) ? 'true' : 'false');
  });
}

// ─── OE TASK DETAIL ────────────────────────────────────────────────────
function renderTaskDetailOE(idx) {
  var t = TASKS.find(function(x) { return x.objectId == idx; });
  if (!t) return '<div class="empty-state">Task not found.</div>';
  var proj = typeof getProjectByNumber === 'function' ? getProjectByNumber(t.project_number) : null;
  var statusColor = STATUS_COLOR(t.status) || '#9CA3AF';
  var isCompletable = t.status && t.status !== 'Complete' && t.status !== 'Canceled';
  var loggedH = getTaskHours(t.idx);
  var myH = getMyTaskHours(t.idx);

  var due = t.working_due || t.due || '';
  var timeRemaining = (function() {
    if (!due || !isCompletable) return null;
    var d = new Date(due + 'T00:00:00');
    var today = new Date(); today.setHours(0,0,0,0);
    var days = Math.round((d - today) / 86400000);
    return { days: days, overdue: days < 0 };
  })();

  var html = '<div class="oe-detail oe-detail--task">';

  // Breadcrumb — sticky so it's always reachable from anywhere on the page.
  html += '<div class="oe-detail-crumbs">' +
    '<a class="oe-detail-back" onclick="goBackFromDetail()" title="Back to where you came from">' +
      '<svg class="icon" aria-hidden="true" style="width:12px;height:12px;"><use href="#ph-caret-left"></use></svg>' +
      'Portfolio' +
    '</a>' +
    '<svg class="icon" aria-hidden="true" style="width:10px;height:10px;color:var(--ink-5);"><use href="#ph-caret-right"></use></svg>' +
    (proj ? '<a onclick="openProject(' + proj.objectId + ')" style="color:var(--ink-5);text-decoration:none;cursor:pointer;">' + esc(proj.title) + '</a><svg class="icon" aria-hidden="true" style="width:10px;height:10px;color:var(--ink-5);"><use href="#ph-caret-right"></use></svg>' : '') +
    '<span class="oe-mono" style="color:var(--ink-7);font-size:12px;">' + esc(t.task_number || '') + '</span>' +
  '</div>';

  // Header
  html += '<div class="oe-detail-head oe-detail-head--task">' +
    '<div class="oe-detail-head-left">' +
      '<div class="oe-detail-pills">' +
        '<span class="oe-mono" style="font-size:12px;color:var(--ink-5);letter-spacing:0.04em;">' + esc(t.task_number || '') + '</span>' +
        '<span class="status-pill" data-status="' + esc(t.status || '') + '" style="background:' + statusColor + '22;color:var(--ink-7);"><span style="width:6px;height:6px;border-radius:50%;background:' + statusColor + ';display:inline-block;"></span>' + esc(t.status || '—') + '</span>' +
        '<span class="priority-badge priority-' + (t.priority || 'null') + '">' + (t.priority || '—') + '</span>' +
        (proj ? '<a style="font-size:13px;color:var(--ink-5);text-decoration:none;display:inline-flex;align-items:center;gap:4px;cursor:pointer;" onclick="openProject(' + proj.objectId + ')"><svg class="icon" aria-hidden="true" style="width:12px;height:12px;"><use href="#ph-folder-open"></use></svg><span class="oe-mono" style="font-size:11px;">' + esc(proj.project_number || '') + '</span><span style="color:var(--ink-6);">' + esc(proj.title) + '</span></a>' : '') +
        (t.category ? '<span class="oe-body-sm" style="display:inline-flex;align-items:center;gap:4px;color:var(--ink-5);">' + esc(t.category) + '</span>' : '') +
      '</div>' +
      '<h1 class="oe-detail-title oe-detail-title--task">' + esc(t.title) + '</h1>' +
      (t.assignee ? '<div class="oe-body-sm" style="margin-top:8px;display:inline-flex;align-items:center;gap:8px;"><span class="oe-avatar oe-avatar--sm" style="background:var(--navy-500);color:var(--ink-paper);">' + esc(t.assignee.split(' ').map(function(w) { return w[0]; }).join('').slice(0,2).toUpperCase()) + '</span>' + esc(t.assignee) + '</div>' : '') +
    '</div>' +
    '<div class="oe-detail-actions">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">' +
        (isCompletable ? '<button class="oe-btn oe-btn--primary oe-btn--sm" onclick="markTaskComplete(' + t.objectId + ')"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg>Mark complete</button>' : '') +
        '<button class="oe-btn oe-btn--secondary oe-btn--sm" onclick="openFormModal(\'edit-task\',' + t.objectId + ')"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg>Edit</button>' +
        '<button class="oe-btn oe-btn--ghost oe-btn--sm" onclick="confirmDeleteTask(' + t.objectId + ')" title="Delete" style="color:var(--status-overdue-fg);"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></button>' +
      '</div>' +
      (t.actual_end ? '<div class="oe-mono" style="font-size:10px;color:var(--ink-4);margin-top:8px;">Completed ' + t.actual_end + '</div>' : '') +
    '</div>' +
  '</div>';

  // Two-column body
  html += '<div class="oe-detail-body">';

  // MAIN
  html += '<div class="oe-detail-main">';

  if (t.description) {
    html += '<div class="oe-detail-mdsec"><div class="oe-meta" style="margin-bottom:8px;">Description</div><div class="oe-detail-prose">' + (typeof renderMd === 'function' ? renderMd(t.description) : esc(t.description)) + '</div></div>';
  }
  if (t.resolution) {
    html += '<div class="oe-detail-mdsec"><div class="oe-meta" style="margin-bottom:8px;color:var(--sage-700);">Resolution</div><div class="oe-detail-prose">' + (typeof renderMd === 'function' ? renderMd(t.resolution) : esc(t.resolution)) + '</div></div>';
  }
  if (typeof renderTaskHistorySection === 'function') {
    html += '<div class="oe-detail-mdsec">' + renderTaskHistorySection(t) + '</div>';
  }

  // Dependencies
  if (typeof isFeatureOn === 'function' && isFeatureOn('dependencies')) {
    var blockedBy = typeof parseBlockedBy === 'function' ? parseBlockedBy(t) : [];
    var blocking  = typeof getBlockingTasks === 'function' ? getBlockingTasks(t.task_number) : [];
    if (blockedBy.length || blocking.length) {
      html += '<div class="oe-detail-mdsec"><div class="oe-meta" style="margin-bottom:10px;">Dependencies</div>';
      if (blockedBy.length) {
        html += '<div style="font-size:11px;font-weight:600;color:var(--ink-5);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Depends on</div>';
        blockedBy.forEach(function(ref) {
          var dep = typeof resolveDependency === 'function' ? resolveDependency(ref) : null;
          if (!dep) { html += '<div class="oe-body-sm" style="padding:4px 0;">' + esc(ref) + ' (not found)</div>'; return; }
          var isDone = dep.obj.status === 'Complete' || dep.obj.status === 'Canceled';
          var sc = STATUS_COLOR(dep.obj.status);
          var openFn = dep.type === 'project' ? ('openProject(' + dep.obj.objectId + ')') : ('openTask(' + dep.obj.objectId + ')');
          html += '<div class="td-dep-row" onclick="' + openFn + '">' +
            '<span class="oe-mono" style="font-size:11px;color:var(--ink-5);">' + esc(ref) + '</span>' +
            '<span class="td-dep-title" style="' + (isDone ? 'text-decoration:line-through;color:var(--ink-5);' : '') + '">' + esc(dep.obj.title) + '</span>' +
            '<span class="status-pill" data-status="' + esc(dep.obj.status) + '" style="background:' + sc + '22;color:var(--ink-7);font-size:11px;"><span style="width:5px;height:5px;border-radius:50%;background:' + sc + ';display:inline-block;"></span>' + esc(dep.obj.status) + '</span>' +
          '</div>';
        });
      }
      if (blocking.length) {
        html += '<div style="font-size:11px;font-weight:600;color:var(--ink-5);text-transform:uppercase;letter-spacing:0.06em;margin:10px 0 6px;">Required by</div>';
        blocking.forEach(function(bt) {
          var sc = STATUS_COLOR(bt.status);
          html += '<div class="td-dep-row" onclick="openTask(' + bt.objectId + ')">' +
            '<span class="oe-mono" style="font-size:11px;color:var(--ink-5);">' + esc(bt.task_number || '') + '</span>' +
            '<span class="td-dep-title">' + esc(bt.title) + '</span>' +
            '<span class="status-pill" data-status="' + esc(bt.status) + '" style="background:' + sc + '22;color:var(--ink-7);font-size:11px;"><span style="width:5px;height:5px;border-radius:50%;background:' + sc + ';display:inline-block;"></span>' + esc(bt.status) + '</span>' +
          '</div>';
        });
      }
      html += '</div>';
    }
  }

  html += '</div>'; // /.oe-detail-main

  // SIDEBAR
  html += '<div class="oe-detail-side">';

  html += '<div class="oe-card oe-side-card"><div class="oe-meta">Assigned</div>' +
    (t.assignee ? '<div style="display:flex;align-items:center;gap:8px;"><span class="oe-avatar oe-avatar--sm" style="background:var(--navy-500);color:var(--ink-paper);">' + esc(t.assignee.split(' ').map(function(w) { return w[0]; }).join('').slice(0,2).toUpperCase()) + '</span><span style="font-size:13px;">' + esc(t.assignee) + '</span></div>' : '<div style="color:var(--ink-4);font-size:13px;">Unassigned</div>') +
  '</div>';

  html += '<div class="oe-card oe-side-card"><div class="oe-meta">Schedule</div>' +
    '<div class="oe-side-field"><div class="oe-side-label">Started</div><div><span class="oe-mono" style="font-size:12px;">' + (t.start || '—') + '</span></div></div>' +
    '<div class="oe-side-field"><div class="oe-side-label">Due</div><div><span class="oe-mono" style="font-size:12px;">' + (due || '—') + '</span>' + (t.due && t.working_due && t.working_due !== t.due ? ' <span style="font-size:10px;color:var(--status-overdue-fg);">(moved)</span>' : '') + '</div></div>' +
    (timeRemaining ? '<div class="oe-side-field"><div class="oe-side-label">Time remaining</div><div><span style="font-size:13px;color:' + (timeRemaining.overdue ? 'var(--status-overdue-fg)' : 'var(--ink-7)') + ';font-weight:600;"><span class="oe-mono">' + (timeRemaining.overdue ? Math.abs(timeRemaining.days) + ' days overdue' : timeRemaining.days + ' days') + '</span></span></div></div>' : '') +
    (t.actual_end ? '<div class="oe-side-field"><div class="oe-side-label">Completed</div><div><span class="oe-mono" style="font-size:12px;">' + esc(t.actual_end) + '</span></div></div>' : '') +
  '</div>';

  if (loggedH > 0 || t.hours_worked) {
    html += '<div class="oe-card oe-side-card"><div class="oe-meta">Effort</div>' +
      '<div class="oe-side-field"><div class="oe-side-label">Logged</div><div><span class="oe-mono" style="font-size:12px;">' + (loggedH > 0 ? hoursLabel(loggedH, myH) : '—') + '</span></div></div>' +
      (t.hours_worked ? '<div class="oe-side-field"><div class="oe-side-label">Reported</div><div><span class="oe-mono" style="font-size:12px;">' + esc(t.hours_worked) + 'h</span></div></div>' : '') +
    '</div>';
  }

  if (proj) {
    html += '<div class="oe-card oe-side-card"><div class="oe-meta">Parent project</div>' +
      '<a class="td-parent" onclick="openProject(' + proj.objectId + ')">' +
        '<svg class="icon" aria-hidden="true" style="width:14px;height:14px;color:var(--ink-5);"><use href="#ph-folder-open"></use></svg>' +
        '<div style="flex:1;min-width:0;"><div class="oe-mono" style="font-size:11px;color:var(--ink-5);">' + esc(proj.project_number || '') + '</div><div style="font-size:13px;color:var(--ink-7);">' + esc(proj.title) + '</div></div>' +
        '<svg class="icon" aria-hidden="true" style="width:11px;height:11px;color:var(--ink-4);flex-shrink:0;"><use href="#ph-caret-right"></use></svg>' +
      '</a>' +
    '</div>';
  }

  if (t.tool) {
    html += '<div class="oe-card oe-side-card"><div class="oe-meta">Tool</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;"><span class="oe-chip" style="background:var(--ink-1);color:var(--ink-6);">' + esc(t.tool) + '</span></div>' +
    '</div>';
  }

  html += '</div>'; // /.oe-detail-side
  html += '</div>'; // /.oe-detail-body
  html += '</div>'; // /.oe-detail

  return html;
}

function sortDetailTasks(tasks) {
  var col = _dtSortCol;
  var dir = _dtSortDir === 'asc' ? 1 : -1;
  var priOrder = { High: 0, Medium: 1, Low: 2 };
  return tasks.slice().sort(function(a, b) {
    var av, bv;
    if (col === 'id') { av = (a.task_number || '').toLowerCase(); bv = (b.task_number || '').toLowerCase(); return av < bv ? -dir : av > bv ? dir : 0; }
    if (col === 'title') { av = (a.title || '').toLowerCase(); bv = (b.title || '').toLowerCase(); return av < bv ? -dir : av > bv ? dir : 0; }
    if (col === 'status') { av = a.status || ''; bv = b.status || ''; return av < bv ? -dir : av > bv ? dir : 0; }
    if (col === 'priority') { av = priOrder[a.priority] !== undefined ? priOrder[a.priority] : 9; bv = priOrder[b.priority] !== undefined ? priOrder[b.priority] : 9; return (av - bv) * dir; }
    if (col === 'assignee') { av = (a.assignee || 'zzz').toLowerCase(); bv = (b.assignee || 'zzz').toLowerCase(); return av < bv ? -dir : av > bv ? dir : 0; }
    if (col === 'due') { av = a.working_due || a.due || '9999'; bv = b.working_due || b.due || '9999'; return av < bv ? -dir : av > bv ? dir : 0; }
    if (col === 'hours') { av = getTaskHours(a.idx) || 0; bv = getTaskHours(b.idx) || 0; return (av - bv) * dir; }
    return 0;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  OE EDIT PAGES — dedicated /project/:id/edit and /task/:id/edit views
//
//  Replaces the modal-based edit flow. Same data + validation as the
//  modal (collectProjectFields / collectTaskFields → DataStore) but the
//  experience is an editorial page that lives at its own currentDetail
//  state. See mockups/detail-editors.html (Option C) for the design.
//
//  Module-local dirty-tracker — a snapshot of every visible input's
//  value at mount time. Cancel compares current values against the
//  snapshot to decide whether to prompt "Discard changes?".
// ═══════════════════════════════════════════════════════════════════════════
var _oeEditOriginalValues = null;

// Snapshot every input/select/textarea inside the editor body so Cancel
// can detect unsaved edits. Called once after the page mounts.
function _oeEditCaptureSnapshot() {
  var body = document.getElementById('fm-body');
  if (!body) { _oeEditOriginalValues = null; return; }
  _oeEditOriginalValues = {};
  body.querySelectorAll('input, select, textarea').forEach(function(el) {
    if (!el.id) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      _oeEditOriginalValues[el.id] = el.checked ? '1' : '0';
    } else {
      _oeEditOriginalValues[el.id] = el.value || '';
    }
  });
  // Also capture the editorial title input (renders outside #fm-body).
  var titleInput = document.getElementById('oe-edit-title-input');
  if (titleInput) _oeEditOriginalValues['_oeEditTitle'] = titleInput.value || '';
}

// Compare current input values against the snapshot. Returns the number
// of changed fields (0 means clean — no prompt needed on Cancel).
function _oeEditCountChanges() {
  if (!_oeEditOriginalValues) return 0;
  var n = 0;
  var body = document.getElementById('fm-body');
  if (body) {
    body.querySelectorAll('input, select, textarea').forEach(function(el) {
      if (!el.id) return;
      var orig = _oeEditOriginalValues[el.id];
      var cur;
      if (el.type === 'checkbox' || el.type === 'radio') cur = el.checked ? '1' : '0';
      else cur = el.value || '';
      if (orig === undefined) {
        if (cur !== '') n++;
      } else if (orig !== cur) {
        n++;
      }
    });
  }
  var titleInput = document.getElementById('oe-edit-title-input');
  if (titleInput && _oeEditOriginalValues['_oeEditTitle'] !== undefined
      && titleInput.value !== _oeEditOriginalValues['_oeEditTitle']) {
    n++;
  }
  return n;
}

// Refresh the eyebrow's "N unsaved changes" indicator. Called on every
// input/change event inside the editor.
function oeEditUpdateDirtyIndicator() {
  var el = document.getElementById('oe-edit-dirty-indicator');
  if (!el) return;
  var n = _oeEditCountChanges();
  if (n === 0) {
    el.innerHTML = '<span class="oe-mono">No unsaved changes</span>';
  } else {
    el.innerHTML = '<span class="oe-edit-dirty-dot"></span><strong>' +
      n + ' unsaved change' + (n === 1 ? '' : 's') + '</strong>';
  }
}

// Wire the dirty-tracker after the editor body mounts: capture initial
// snapshot, then listen for any input/change events to refresh the
// counter. Also syncs the title input back to #fm-title-val so the
// existing save pipeline (collectProjectFields/collectTaskFields)
// picks it up without any per-field plumbing.
function _oeEditWireDirtyTracker() {
  setTimeout(function() {
    _oeEditCaptureSnapshot();
    oeEditUpdateDirtyIndicator();
    var body = document.getElementById('fm-body');
    if (body) {
      body.addEventListener('input', oeEditUpdateDirtyIndicator);
      body.addEventListener('change', oeEditUpdateDirtyIndicator);
    }
    var titleInput = document.getElementById('oe-edit-title-input');
    var titleField = document.getElementById('fm-title-val');
    if (titleInput && titleField) {
      // Two-way bind: typing in the editorial header updates the hidden
      // #fm-title-val that collectProjectFields/collectTaskFields reads.
      titleField.value = titleInput.value;
      titleInput.addEventListener('input', function() {
        titleField.value = titleInput.value;
        oeEditUpdateDirtyIndicator();
      });
    }
  }, 0);
}

// Save handler — reuses handleFormSubmit so all validation, character
// limits, business rules, and DataStore plumbing land in one place.
// On success, routes back to the read-only view.
async function oeEditSave() {
  var saveBtn = document.getElementById('oe-edit-save-btn');
  var cancelBtn = document.getElementById('oe-edit-cancel-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.6'; saveBtn.textContent = 'Saving…'; }
  if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.style.opacity = '0.6'; }

  // handleFormSubmit reads Editor.mode + Editor.editId; the edit-page
  // opener (openProjectEdit / openTaskEdit) sets those up before render.
  try { await handleFormSubmit(false, false); } catch (e) { console.error('[oeEditSave]', e); }

  // After save: the underlying save fired closeFormModal (no-op since
  // the modal isn't open) and render(). currentDetail.type still says
  // 'project-edit' / 'task-edit' — flip it back to the read-only view.
  if (currentDetail && currentDetail.type === 'project-edit') currentDetail.type = 'project';
  else if (currentDetail && currentDetail.type === 'task-edit') currentDetail.type = 'task';
  _oeEditOriginalValues = null;
  if (typeof render === 'function') render();

  if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; saveBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg>Save changes'; }
  if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.style.opacity = '1'; }
}

// Cancel handler — prompts "Discard changes?" when the form is dirty.
async function oeEditCancel() {
  var n = _oeEditCountChanges();
  if (n > 0) {
    var msg = 'Discard ' + n + ' unsaved change' + (n === 1 ? '' : 's') + '?';
    var ok = (typeof confirmDialog === 'function')
      ? await confirmDialog(msg, { title: 'Discard changes?', confirmLabel: 'Discard', danger: true })
      : confirm(msg);
    if (!ok) return;
  }
  _oeEditOriginalValues = null;
  if (currentDetail && currentDetail.type === 'project-edit') currentDetail.type = 'project';
  else if (currentDetail && currentDetail.type === 'task-edit') currentDetail.type = 'task';
  if (typeof render === 'function') render();
}

// ── Project edit page ────────────────────────────────────────────────
function renderProjectEditOE(id) {
  var p = PROJECTS.find(function(x) { return x.objectId == id; });
  if (!p) return '<div class="empty-state">Project not found.</div>';

  // Set up Editor.mode for handleFormSubmit + form wiring (a11y, soft prompts).
  Editor.mode = 'edit-project';
  Editor.editId = id;

  var pNum = p.project_number != null ? String(p.project_number) : '';
  var formHtml = (typeof buildProjectForm === 'function') ? buildProjectForm(p) : '<div class="empty-state">Form builder not available.</div>';

  // Hide the duplicate Title field inside the form body — the editorial
  // header above renders the title with serif typography. We keep
  // #fm-title-val in the DOM (hidden) so collectProjectFields reads it.
  formHtml = formHtml.replace(/<div class="fm-section-label">Basic Info<\/div>\s*<div class="fm-grid">/,
    '<div class="fm-section-label" style="display:none;">Basic Info</div><div class="fm-grid" data-oe-edit-hide-title="1">');

  // Schedule post-mount wiring (dirty tracker, label/a11y, soft prompts,
  // milestone toggle). The form builders rely on the same DOM ids the
  // modal uses; rendering them inside the page reuses everything.
  setTimeout(function() {
    if (typeof fmWireA11y === 'function') fmWireA11y();
    // Hide the title row inside the form body — its content is duplicated
    // by the editorial header at the top.
    var titleField = document.querySelector('[data-oe-edit-hide-title="1"] > .fm-field:first-child');
    if (titleField) titleField.style.display = 'none';
    _oeEditWireDirtyTracker();
  }, 0);

  return '<div class="oe-edit-page">' +
    '<div class="oe-edit-crumbs">' +
      '<a class="oe-edit-back" onclick="oeEditCancel()" title="Back without saving">' +
        '<svg class="icon" aria-hidden="true" style="width:11px;height:11px;"><use href="#ph-caret-left"></use></svg>Portfolio' +
      '</a>' +
      '<svg class="icon" aria-hidden="true" style="width:9px;height:9px;color:var(--ink-5);"><use href="#ph-caret-right"></use></svg>' +
      '<span style="color:var(--ink-5);">' + esc(p.title) + '</span>' +
      '<svg class="icon" aria-hidden="true" style="width:9px;height:9px;color:var(--ink-5);"><use href="#ph-caret-right"></use></svg>' +
      '<span style="color:var(--ink-7);">Edit</span>' +
    '</div>' +
    '<div class="oe-edit-head">' +
      '<div>' +
        '<div class="oe-edit-eyebrow">Editing project' + (pNum ? ' · ' + esc(pNum) : '') + '</div>' +
        '<input class="oe-edit-title-input" id="oe-edit-title-input" value="' + esc(p.title || '') + '" placeholder="Project title…">' +
        '<div class="oe-edit-context" id="oe-edit-dirty-indicator"><span class="oe-mono">No unsaved changes</span></div>' +
      '</div>' +
      '<div class="oe-edit-actions">' +
        '<button id="oe-edit-cancel-btn" class="oe-btn oe-btn--secondary oe-btn--sm" onclick="oeEditCancel()">Cancel</button>' +
        '<button id="oe-edit-save-btn" class="oe-btn oe-btn--primary oe-btn--sm" onclick="oeEditSave()"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg>Save changes</button>' +
      '</div>' +
    '</div>' +
    '<div class="oe-edit-body" id="fm-body">' + formHtml + '</div>' +
    '<div class="oe-edit-foot">' +
      '<button class="oe-btn oe-btn--secondary oe-btn--sm" onclick="oeEditCancel()">Cancel</button>' +
      '<button class="oe-btn oe-btn--primary oe-btn--sm" onclick="oeEditSave()"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg>Save changes</button>' +
    '</div>' +
  '</div>';
}

// ── Task edit page ──────────────────────────────────────────────────
function renderTaskEditOE(idx) {
  var t = TASKS.find(function(x) { return x.objectId == idx; });
  if (!t) return '<div class="empty-state">Task not found.</div>';

  Editor.mode = 'edit-task';
  Editor.editId = idx;

  var tNum = t.task_number != null ? String(t.task_number) : '';
  var formHtml = (typeof buildTaskForm === 'function') ? buildTaskForm(t) : '<div class="empty-state">Form builder not available.</div>';

  // Hide the duplicate Title field inside the form body.
  formHtml = formHtml.replace(/<div class="fm-section-label">Basic Info<\/div>\s*<div class="fm-grid">/,
    '<div class="fm-section-label" style="display:none;">Basic Info</div><div class="fm-grid" data-oe-edit-hide-title="1">');

  setTimeout(function() {
    if (typeof fmWireA11y === 'function') fmWireA11y();
    if (typeof fmWireTaskStatusPrompts === 'function') fmWireTaskStatusPrompts();
    if (typeof fmWireMilestoneToggle === 'function') fmWireMilestoneToggle();
    // Original due date is locked for edits (same rule as the modal).
    var origDateField = document.getElementById('fm-due');
    if (origDateField) {
      origDateField.disabled = true;
      origDateField.style.background = '#F3F1EB';
      origDateField.style.color = '#6B7280';
      origDateField.style.cursor = 'not-allowed';
      origDateField.title = 'Original date is locked after creation. Use Working Due Date to adjust the timeline.';
    }
    var titleField = document.querySelector('[data-oe-edit-hide-title="1"] > .fm-field:first-child');
    if (titleField) titleField.style.display = 'none';
    _oeEditWireDirtyTracker();
  }, 0);

  var proj = (typeof getProjectByNumber === 'function') ? getProjectByNumber(t.project_number) : null;

  return '<div class="oe-edit-page">' +
    '<div class="oe-edit-crumbs">' +
      '<a class="oe-edit-back" onclick="oeEditCancel()" title="Back without saving">' +
        '<svg class="icon" aria-hidden="true" style="width:11px;height:11px;"><use href="#ph-caret-left"></use></svg>Portfolio' +
      '</a>' +
      (proj ? '<svg class="icon" aria-hidden="true" style="width:9px;height:9px;color:var(--ink-5);"><use href="#ph-caret-right"></use></svg><span style="color:var(--ink-5);">' + esc(proj.title) + '</span>' : '') +
      '<svg class="icon" aria-hidden="true" style="width:9px;height:9px;color:var(--ink-5);"><use href="#ph-caret-right"></use></svg>' +
      '<span style="color:var(--ink-5);">' + esc(t.title || '(untitled)') + '</span>' +
      '<svg class="icon" aria-hidden="true" style="width:9px;height:9px;color:var(--ink-5);"><use href="#ph-caret-right"></use></svg>' +
      '<span style="color:var(--ink-7);">Edit</span>' +
    '</div>' +
    '<div class="oe-edit-head">' +
      '<div>' +
        '<div class="oe-edit-eyebrow">Editing task' + (tNum ? ' · ' + esc(tNum) : '') + '</div>' +
        '<input class="oe-edit-title-input" id="oe-edit-title-input" value="' + esc(t.title || '') + '" placeholder="Task title…">' +
        '<div class="oe-edit-context" id="oe-edit-dirty-indicator"><span class="oe-mono">No unsaved changes</span></div>' +
      '</div>' +
      '<div class="oe-edit-actions">' +
        '<button id="oe-edit-cancel-btn" class="oe-btn oe-btn--secondary oe-btn--sm" onclick="oeEditCancel()">Cancel</button>' +
        '<button id="oe-edit-save-btn" class="oe-btn oe-btn--primary oe-btn--sm" onclick="oeEditSave()"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg>Save changes</button>' +
      '</div>' +
    '</div>' +
    '<div class="oe-edit-body" id="fm-body">' + formHtml + '</div>' +
    '<div class="oe-edit-foot">' +
      '<button class="oe-btn oe-btn--secondary oe-btn--sm" onclick="oeEditCancel()">Cancel</button>' +
      '<button class="oe-btn oe-btn--primary oe-btn--sm" onclick="oeEditSave()"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg>Save changes</button>' +
    '</div>' +
  '</div>';
}

// ── Navigation helpers ─────────────────────────────────────────────
function openProjectEdit(id) {
  // Only meaningful under the OE theme; non-OE themes fall back to the modal.
  if (!_oeDetail()) {
    if (typeof openFormModal === 'function') openFormModal('edit-project', id);
    return;
  }
  currentDetail = { type: 'project-edit', id: id, _returnTo: (currentDetail && currentDetail.type === 'project') ? currentDetail : null };
  render();
}

function openTaskEdit(id) {
  if (!_oeDetail()) {
    if (typeof openFormModal === 'function') openFormModal('edit-task', id);
    return;
  }
  currentDetail = { type: 'task-edit', id: id, _returnTo: (currentDetail && currentDetail.type === 'task') ? currentDetail : null };
  render();
}
