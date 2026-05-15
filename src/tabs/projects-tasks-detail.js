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
  var relTasks = TASKS.filter(function(t) { return t.project === projectTitle; });
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
  var relTasks = TASKS.filter(function(t) { return t.project === projectTitle; });
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
  html += '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:10px;padding:16px;">';
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
    html += '<span class="' + labelClass + '">' + (ph.isGateCheck && i !== cur ? '⚑ ' : '') + esc(ph.shortName) + '</span>';
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
  var relTasks = TASKS.filter(function(t) { return t.project === p.title; });
  var html = '<div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:4px;">Phase ' + phase.id + ' — ' + esc(phase.name) + '</div>';
  html += '<div style="font-size:11px;color:#6B7280;margin-bottom:10px;">Default duration: ' + phase.defaultDuration + '</div>';
  phase.requirements.forEach(function(req) {
    var isMet = metReqs[req.id];
    var linkedTasks = relTasks.filter(function(t) { return parsePhaseReqs(t).indexOf(req.id) !== -1; });
    var icon = isMet ? '<span style="color:#22C55E;font-weight:700;">✓</span>' : '<span style="color:#E1E2DD;">○</span>';
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
    html += '<span class="phase-section-pill" style="background:' + pillBg + ';color:' + pillColor + ';">' + (phase.isGateCheck ? '⚑ ' : '') + 'Phase ' + phase.id + '</span>';
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
        html += '<div onclick="event.stopPropagation()"><select class="dt-inline-select" data-task-id="' + t.objectId + '" onchange="inlineTaskAssignee(this)" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:' + (t.assignee ? '#374151' : '#9CA3AF') + ';font-family:Lato,sans-serif;cursor:pointer;width:100%;background:#fff;"><option value=""' + (!t.assignee ? ' selected' : '') + '>Unassigned</option>';
        var _members = RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return isFullMember(n); }).sort() : [];
        _members.forEach(function(n) { html += '<option value="' + esc(n) + '"' + (t.assignee === n ? ' selected' : '') + '>' + esc(n) + '</option>'; });
        html += '</select></div>';
        html += '<div onclick="event.stopPropagation()"><input type="date" class="dt-inline-date" data-task-id="' + t.objectId + '" data-has-due="' + (t.due ? '1' : '') + '" onchange="inlineTaskDueDate(this)" value="' + (t.working_due||t.due||'') + '" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:' + ((t.working_due||t.due) ? '#374151' : '#9CA3AF') + ';font-family:Lato,sans-serif;cursor:pointer;width:100%;"></div>';
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
    html += '<span class="phase-section-pill" style="background:#F3F1EB;color:#6B7280;">—</span>';
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
      html += '<div onclick="event.stopPropagation()"><select class="dt-inline-select" data-task-id="' + t.objectId + '" onchange="inlineTaskAssignee(this)" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:' + (t.assignee ? '#374151' : '#9CA3AF') + ';font-family:Lato,sans-serif;cursor:pointer;width:100%;background:#fff;"><option value=""' + (!t.assignee ? ' selected' : '') + '>Unassigned</option>';
      var _members2 = RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return isFullMember(n); }).sort() : [];
      _members2.forEach(function(n) { html += '<option value="' + esc(n) + '"' + (t.assignee === n ? ' selected' : '') + '>' + esc(n) + '</option>'; });
      html += '</select></div>';
      html += '<div onclick="event.stopPropagation()"><input type="date" class="dt-inline-date" data-task-id="' + t.objectId + '" data-has-due="' + (t.due ? '1' : '') + '" onchange="inlineTaskDueDate(this)" value="' + (t.working_due||t.due||'') + '" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:' + ((t.working_due||t.due) ? '#374151' : '#9CA3AF') + ';font-family:Lato,sans-serif;cursor:pointer;width:100%;"></div>';
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
  openFormModal('new-task');
  // Pre-fill the project dropdown after the form renders
  setTimeout(function() {
    const projSelect = document.getElementById('fm-project');
    if (projSelect) {
      projSelect.value = projectTitle;
    }
  }, 50);
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
    '<button class="suggest-close" onclick="closeSuggestPanel()">✕</button></div>' +
    '<div style="padding:8px 0;">' +
      '<div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:10px;">Choose a detail level:</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<div onclick="suggestWithDetail(\'low\')" style="flex:1;min-width:140px;cursor:pointer;background:#fff;border:2px solid ' + (_suggestDetail === 'low' ? 'var(--navy)' : '#E8E6DF') + ';border-radius:10px;padding:14px;text-align:center;transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'var(--navy)\'" onmouseout="this.style.borderColor=\'' + (_suggestDetail === 'low' ? 'var(--navy)' : '#E8E6DF') + '\'">' +
          '<div style="font-size:20px;margin-bottom:4px;">📋</div>' +
          '<div style="font-size:13px;font-weight:800;color:var(--navy);">Low</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Major phases<br>1-3 days each<br>4-8 tasks</div>' +
        '</div>' +
        '<div onclick="suggestWithDetail(\'medium\')" style="flex:1;min-width:140px;cursor:pointer;background:#fff;border:2px solid ' + (_suggestDetail === 'medium' ? 'var(--navy)' : '#E8E6DF') + ';border-radius:10px;padding:14px;text-align:center;transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'var(--navy)\'" onmouseout="this.style.borderColor=\'' + (_suggestDetail === 'medium' ? 'var(--navy)' : '#E8E6DF') + '\'">' +
          '<div style="font-size:20px;margin-bottom:4px;">📝</div>' +
          '<div style="font-size:13px;font-weight:800;color:var(--navy);">Medium</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Grouped activities<br>4-16 hours each<br>8-15 tasks</div>' +
        '</div>' +
        '<div onclick="suggestWithDetail(\'high\')" style="flex:1;min-width:140px;cursor:pointer;background:#fff;border:2px solid ' + (_suggestDetail === 'high' ? 'var(--navy)' : '#E8E6DF') + ';border-radius:10px;padding:14px;text-align:center;transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'var(--navy)\'" onmouseout="this.style.borderColor=\'' + (_suggestDetail === 'high' ? 'var(--navy)' : '#E8E6DF') + '\'">' +
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
  await DataStore.updateProject(objectId, { status: 'Complete', actual_end: todayStr });
  showToast('Marked "' + proj.title + '" as Complete.', 'success');
  markDataDirty();
  render();
}

function copyProjectSummary(objectId) {
  var p = PROJECTS.find(function(pr) { return pr.objectId == objectId; });
  if (!p) { showToast('Project not found.', 'error'); return; }

  var relTasks = TASKS.filter(function(t) { return t.project === p.title || (!t.project && t.project_id == p.id); });
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
  if (p.itd_team) md += '**ITD Team:** ' + p.itd_team + '\n';
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
  if (!confirm('Delete ' + ids.length + ' selected task(s)? This cannot be undone.')) return;

  var deleted = 0;
  for (var i = 0; i < ids.length; i++) {
    try {
      await DataStore.deleteTask(ids[i]);
      deleted++;
    } catch (err) {
      console.error('[Batch] Failed to delete task:', ids[i], err);
    }
  }
  showToast('Deleted ' + deleted + ' task(s).', 'success');
  markDataDirty();
  render();
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
  html += row(cell('IT Initiative', p.it_initiative, '#EEF2FF', '#002669') + cell('City Initiative', p.city_initiative, '#FFF7ED', '#9A3412'));
  // Row 2: IT Priority Project | Data Program Goal
  html += row(cell('IT Priority Project', p.it_priority_project, '#F0FDF4', '#166534') + cell('Data Program Goal', p.dp_goal, '#FDF4FF', '#86198F'));
  // Row 3: WWC Practice | WWC Criteria
  html += row(cell('WWC Foundational Practice', p.wwc_practice, '#FFFBEB', '#92400E') + cell('WWC Criteria', p.wwc_criteria, '#F0F9FF', '#0C4A6E'));
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
  if (Auth.devMode) html += '<button onclick="toggleStatusHistoryEditor(' + p.id + ',' + p.objectId + ')" class="btn-navy-sm">\ud83d\udcc5 Edit History</button>';
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
  html += '<div style="position:relative;height:28px;background:#F3F1EB;border-radius:6px;overflow:hidden;">';
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
  const relTasks = TASKS.filter(function(t) {
    // Primary: match on project title (unique, most reliable)
    if (t.project && t.project === p.title) return true;
    // Fallback: match on project_id only if task has no project title
    if (!t.project && t.project_id != null && t.project_id == p.id) return true;
    return false;
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
    return `<span style="display:inline-flex;align-items:center;gap:5px;background:#F3F1EB;border:1px solid #E8E6DF;border-radius:20px;padding:4px 12px 4px 6px;font-size:12px;white-space:nowrap;color:var(--text-body);">
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
        <select class="dt-inline-select" data-task-id="${t.objectId}" onchange="inlineTaskAssignee(this)" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:${t.assignee ? '#374151' : '#9CA3AF'};font-family:Lato,sans-serif;cursor:pointer;width:100%;background:#fff;">
          <option value=""${!t.assignee ? ' selected' : ''}>Unassigned</option>
          ${(RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return RESOURCES_DATA.people[n].active !== false; }).sort() : []).map(function(n) { return '<option value="' + esc(n) + '"' + (t.assignee === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('')}
        </select>
      </div>
      <div onclick="event.stopPropagation()">
        <input type="date" class="dt-inline-date" data-task-id="${t.objectId}" data-has-due="${t.due ? '1' : ''}" onchange="inlineTaskDueDate(this)" value="${t.working_due||t.due||''}" style="font-size:11px;padding:2px 4px;border-radius:6px;border:1px solid #E8E6DF;color:${(t.working_due||t.due) ? '#374151' : '#9CA3AF'};font-family:Lato,sans-serif;cursor:pointer;width:100%;">
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
  const projHrsRow = relTasks.length && projTotalHrs > 0 ? `<div class="detail-task-row" style="background:#F0F4FF;cursor:default;font-weight:700;">
    <div></div>
    <div></div>
    <div class="detail-task-title" style="font-weight:800;color:var(--navy);">Total</div>
    <div class="detail-task-cell"></div><div class="detail-task-cell"></div><div class="detail-task-cell"></div><div class="detail-task-cell"></div>
    <div class="detail-task-cell" style="font-weight:800;color:var(--navy);">${hoursLabel(projTotalHrs, projMyHrs)}</div>
  </div>` : '';

  var canEditProject = isAdmin() || (Auth.fullName && p.contact === Auth.fullName);

  return `<div class="detail-page">
    <div class="detail-hero">
      <div class="detail-hero-sidebar" style="background:${statusColor};color:${STATUS_TEXT_COLOR(p.status)};">
        <span class="detail-hero-sidebar-label">${esc(p.status || '—')}</span>
        <span class="detail-hero-sidebar-id">${esc(p.project_number || '')}</span>
      </div>
      <div class="detail-hero-main">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <button class="detail-back-btn" onclick="goBackFromDetail()">← ${backLabel}</button>
          <div class="detail-hero-actions">
            ${canEditProject && p.status && p.status !== 'Complete' && p.status !== 'Canceled' ? `<button class="modal-edit-btn" style="background:#EAF3DE;color:#27500A;border-color:#83AC1644;" onclick="markProjectComplete(${p.objectId})">✓ Complete</button>` : ''}
            ${canEditProject ? `<button class="modal-edit-btn" onclick="openFormModal('edit-project',${p.objectId})">✏ Edit</button>` : ''}
            <button class="modal-edit-btn" style="background:var(--bg-surface,#F3F1EB);color:var(--text-muted);border-color:#E8E6DF;" onclick="copyProjectSummary(${p.objectId})">📋 Copy</button>
            ${canEditProject ? `<button class="modal-del-btn" onclick="confirmDeleteProject(${p.objectId})">🗑 Delete</button>` : ''}
          </div>
        </div>
        <div class="detail-hero-title">${esc(p.title)}</div>
        <div class="detail-hero-badges">
          <span class="priority-badge priority-${p.priority||'null'}">${p.priority||'—'}</span>
          ${p.is_data_program ? '<span class="detail-hero-chip" style="background:#FFF7ED;color:#9A3412;border-color:#FED7AA;">Data Program</span>' : ''}
          ${projTotalHrs > 0 ? `<span class="detail-hero-chip">⏱ ${hoursLabel(projTotalHrs, projMyHrs)}</span>` : ''}
          ${p.actual_end ? `<span class="detail-hero-chip">✓ Completed ${p.actual_end}</span>` : ''}
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
          <div class="detail-meta-item"><label>ITD Team</label><p>${esc(p.itd_team||'—')}</p></div>
          <div class="detail-meta-item"><label>Category</label><p>${esc(p.category||'—')}</p></div>
          <div class="detail-meta-item"><label>Project Size</label><p>${esc(p.project_size||'—')}</p></div>
          <div class="detail-meta-item"><label>Data Program</label><p>${p.is_data_program ? '<span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;background:#FFF7ED;color:#9A3412;">Yes</span>' : '—'}</p></div>
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
                '<div style="height:4px;background:#E8E6DF;border-radius:2px;margin-top:3px;"><div style="height:4px;background:var(--navy);border-radius:2px;width:' + barPct + '%;"></div></div>' +
              '</div>' +
              '<div style="font-size:14px;font-weight:800;color:var(--navy);min-width:50px;text-align:right;">' + ph.hours + 'h</div>' +
            '</div>';
          }).join('');
          return '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:10px;padding:12px 16px;">' +
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
            <button onclick="addTaskToProject(${p.objectId}, '${esc(p.title).replace(/'/g, "\\'")}')" class="btn-navy-md">＋ Add Task</button>
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
          <button onclick="applyBatchUpdate()" style="padding:5px 14px;background:var(--navy);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Apply</button>
          <button onclick="batchDeleteTasks()" style="padding:5px 14px;background:#FEE2E2;color:#991B1B;border:1px solid #FECACA;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Delete Selected</button>
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
  const proj = t.project ? PROJECTS.find(function(x) { return x.title === t.project; }) : PROJECTS.find(function(x) { return x.id == t.project_id; });
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
            ${isCompletable ? `<button class="modal-edit-btn" style="background:#EAF3DE;color:#27500A;border-color:#83AC1644;" onclick="event.stopPropagation();markTaskComplete(${t.objectId})">✓ Complete</button>` : ''}
            <button class="modal-edit-btn" onclick="openFormModal('edit-task',${t.objectId})">✏ Edit</button>
            <button class="modal-del-btn" onclick="confirmDeleteTask(${t.objectId})">🗑 Delete</button>
          </div>
        </div>
        <div style="font-size:10px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Task</div>
        <div class="detail-hero-title">${esc(t.title)}</div>
        <div class="detail-hero-badges">
          <span class="priority-badge priority-${t.priority||'null'}">${t.priority||'—'}</span>
          ${t.assignee ? `<span class="detail-hero-chip">${esc(t.assignee)}</span>` : ''}
          ${getTaskHours(t.idx) > 0 ? `<span class="detail-hero-chip">⏱ ${hoursLabel(getTaskHours(t.idx), getMyTaskHours(t.idx))}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="detail-content">
      <div class="detail-section">
        <div class="detail-section-label">Task Details</div>
        <div class="detail-meta-grid">
          <div class="detail-meta-item"><label>Assignee</label><p>${esc(t.assignee||'—')}</p></div>
          <div class="detail-meta-item"><label>Project</label>
            <p>${proj ? `<span onclick="openProject(${proj.objectId})" style="color:var(--navy);cursor:pointer;text-decoration:underline;">${esc(proj.title)}</span>` : esc(t.project||'—')}</p>
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
            var typeIcon = dep.type === 'project' ? '📁' : (isDone ? '✅' : '🔒');
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
            html += '<span style="font-size:12px;">⛓</span>';
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
