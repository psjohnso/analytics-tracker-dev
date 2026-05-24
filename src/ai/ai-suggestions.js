// ─────────────────────────────────────────────────────────────────────
// ai/ai-suggestions.js — AI-powered features
//
// Cloudflare Worker proxy URL, AI task-suggestion engine, and AI
// phase-assignment. The Strategic Alignment AI lives with the
// project form in modals/forms.js.
// ─────────────────────────────────────────────────────────────────────

// AI_PROXY_URL, AI_MODEL, and callAiProxy() live in src/ai/prompts.js
// (loaded earlier in the page). Each call site here uses callAiProxy().

// ── AI settings ──────────────────────────────────────────
// ── AI Settings ─────────────────────────────────────────────────
let _aiPhaseAssignment = false;

// ── Task-suggestion engine ───────────────────────────────
function suggestWithDetail(level) {
  _suggestDetail = level;
  suggestTasksForProject(_suggestProjectId);
}

async function suggestTasksForProject(projectObjectId) {
  var p = PROJECTS.find(function(pr) { return pr.objectId === projectObjectId; });
  if (!p) { showToast('Project not found.', 'error'); return; }
  _suggestProjectId = projectObjectId;

  // Gather existing tasks for this project
  var pNum = p.project_number != null ? String(p.project_number) : null;
  var existingTasks = pNum
    ? TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === pNum; }).map(function(t) { return t.title; })
    : [];

  // Gather available categories and tools
  var categories = (FM_TASK_CATEGORIES || []).join(', ');
  var tools = (FM_TASK_TOOLS_ACTIVE || FM_TASK_TOOLS || []).join(', ');
  var members = [];
  if (p.contact) members.push(p.contact + ' (Lead)');
  if (p.other_members) {
    p.other_members.split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(n) {
      var role = _formMemberRoles[n] || 'Contributor';
      members.push(n + ' (' + role + ')');
    });
  }

  // Show loading state
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
    '<div class="suggest-loading"><div style="font-size:24px;margin-bottom:8px;">🤔</div>Generating ' + _suggestDetail + '-detail task breakdown for ' + sizeLabel + ' project…<br><span style="font-size:11px;opacity:0.7;">Expecting ' + range + ' tasks. This may take 10-15 seconds.</span></div>';

  // Scroll to the panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Detail-level-specific prompt instructions scaled by project size
  var size = (p.project_size || 'M').charAt(0).toUpperCase(); // S, M, L, X
  var taskRanges = {
    S: { low: '3–5',  medium: '5–8',   high: '8–12' },
    M: { low: '4–8',  medium: '8–15',  high: '15–25' },
    L: { low: '6–10', medium: '12–20', high: '20–35' },
    X: { low: '8–12', medium: '15–25', high: '25–50' },
  };
  var range = (taskRanges[size] || taskRanges['M'])[_suggestDetail] || '8–15';
  var sizeLabel = { S: 'Small', M: 'Medium', L: 'Large', X: 'XL' }[size] || 'Medium';

  // Multi-phase guidance: smaller projects at lower detail should combine phases
  var multiPhaseGuidance = '';
  if (_suggestDetail === 'low') {
    multiPhaseGuidance = 'IMPORTANT: Since this is a ' + _suggestDetail + '-detail breakdown, you should COMBINE multiple lifecycle phases into single tasks where it makes sense. ' +
      'For example, a single task like "Plan and scope project" can satisfy requirements from phases 1, 2, and 3 simultaneously. ' +
      'A "Build and test" task can cover phases 5 and 6. A "Review, document, and close" task can cover phases 8, 9, and 10. ' +
      'Each task\'s phase_requirements array should include ALL the requirement IDs it satisfies, even across multiple phases. ' +
      'The goal is to have fewer, broader tasks — not one task per phase.\n\n';
    if (size === 'S') {
      multiPhaseGuidance += 'This is a SMALL project — many phases can be collapsed together. ' +
        'It is completely acceptable to have 3–5 tasks that collectively cover all 10 phases. ' +
        'Do not create a separate task for every phase — that would be over-engineering for a small effort.\n\n';
    }
  } else if (_suggestDetail === 'medium' && (size === 'S' || size === 'M')) {
    multiPhaseGuidance = 'For this ' + sizeLabel + ' project at medium detail, adjacent lifecycle phases can be combined into single tasks where the work naturally overlaps. ' +
      'For example, early planning phases (1–3) might be covered by 1–2 tasks, and closing phases (8–10) by 1–2 tasks. ' +
      'Each task\'s phase_requirements array should include ALL requirement IDs it satisfies across phases.\n\n';
  }

  var detailInstructions = {
    low: 'Suggest the major phases or milestones needed to complete this ' + sizeLabel + ' project. ' +
      'Each task should represent a significant chunk of work (1–3 days). ' +
      'Aim for ' + range + ' high-level tasks that capture the overall project lifecycle. ' +
      'Order them so prerequisite phases come first.',
    medium: 'Suggest the key activities needed to complete this ' + sizeLabel + ' project. ' +
      'Each task should represent a meaningful work activity (4–16 hours). ' +
      'Aim for ' + range + ' tasks that break the project into manageable pieces without being overly granular. ' +
      'Order them so tasks with prerequisites come after the tasks they depend on.',
    high: 'Suggest ALL the tasks needed to complete this ' + sizeLabel + ' project — as many as make sense for the scope and size (' + range + ' is a reasonable range). ' +
      'Each task should be atomic — small enough that one person could complete it in a single focused work session (roughly 1–8 hours). Break larger activities into their component steps. ' +
      'Order tasks so that prerequisite tasks come first. If Task B depends on Task A being done, Task A must appear earlier in the list. Group related tasks together within that dependency order.'
  };

  // Build the prompt
  var phaseReqList = LIFECYCLE_PHASES.map(function(phase) {
    var reqs = phase.requirements.map(function(r) { return r.id; }).join(', ');
    return 'P' + phase.id + ' ' + phase.name + ': ' + reqs + ' (+ P' + phase.id + '_TASK for optional work)';
  }).join('\n');

  var prompt = 'You are a project management assistant for a City of Tucson government GIS/Data Analytics team. ' +
    detailInstructions[_suggestDetail] + '\n\n' +
    multiPhaseGuidance +
    'IMPORTANT: This project follows a 10-phase lifecycle with formal advancement requirements. ' +
    'Suggest a mix of REQUIRED tasks (linked to phase requirements) and OPTIONAL tasks (practical work that needs to happen but does not map to a formal gate check). ' +
    'Every requirement across all phases should have at least one task that satisfies it — but a single task CAN satisfy requirements from MULTIPLE phases. ' +
    'Additionally, include tasks for hands-on project work that fall outside the formal requirements — things like data processing, building specific features, creating visualizations, writing scripts, etc. ' +
    'ALL tasks must belong to at least one phase. For required tasks, set phase_requirements to an array of requirement IDs (can span multiple phases). ' +
    'For optional tasks, set phase_requirements to ["Px_TASK"] where x is the phase number the task belongs to (e.g., ["P3_TASK"] for optional work during the build phase). ' +
    'A task can have BOTH requirement IDs and phase task tags from multiple phases if needed.\n\n' +
    'For each task, provide:\n' +
    '- title: a clear, specific task name (not generic like "Research" but specific like "Extract crime incident data from Hansen API")\n' +
    '- description: 1-2 sentences explaining the work\n' +
    '- category: choose from: ' + categories + '\n' +
    '- tool: choose the primary tool from: ' + tools + '\n' +
    '- priority: High, Medium, or Low\n' +
    '- suggested_assignee: choose from the team members listed, or leave blank\n' +
    '- phase_requirements: an array of requirement IDs this task satisfies (a task can satisfy requirements from multiple phases)\n\n' +
    'LIFECYCLE PHASE REQUIREMENTS (use these exact IDs):\n' + phaseReqList + '\n\n' +
    'STRICT PRIORITY RULE: No more than 3 tasks may be High priority. The majority must be Medium. At least 20% should be Low. ' +
    'High is ONLY for tasks where delay would block the entire project. Gate check requirements are NOT automatically High.\n\n' +
    'PROJECT DETAILS:\n' +
    'Title: ' + p.title + '\n' +
    'Category: ' + (p.category || 'Not set') + '\n' +
    'Size: ' + (p.project_size || 'Not set') + '\n' +
    'Partner Department: ' + (p.partner_dept || 'Not set') + '\n' +
    'Problem Statement: ' + (p.problem_statement || 'Not provided') + '\n' +
    'Description: ' + (p.description || 'Not provided') + '\n' +
    'Definition of Done: ' + (p.definition_of_done || 'Not specified') + '\n' +
    'Key Results: ' + (p.key_results || 'Not specified') + '\n' +
    'Data Sources: ' + (p.data_sources || 'Not specified') + '\n' +
    'Technical Requirements: ' + (p.technical_requirements || 'Not specified') + '\n' +
    'Team Members: ' + (members.length > 0 ? members.join(', ') : 'Not assigned') + '\n';

  if (existingTasks.length > 0) {
    prompt += '\nEXISTING TASKS (do not duplicate these):\n' + existingTasks.map(function(t) { return '- ' + t; }).join('\n') + '\n';
  }

  prompt += '\nRespond ONLY with a JSON array (no markdown, no backticks, no preamble). Each element should have: title, description, category, tool, priority, suggested_assignee, phase_requirements (array of requirement ID strings).';

  try {
    var aiText = await callAiProxy('taskSuggest', prompt);
    console.log('[TaskSuggest] Raw text length:', aiText.length);

    console.log('[TaskSuggest] Response text:', aiText.slice(0, 300));

    // Robust JSON extraction — find the JSON array in the response
    var clean = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
    // Find the first [ and last ] to extract the JSON array
    var arrayStart = clean.indexOf('[');
    var arrayEnd = clean.lastIndexOf(']');
    var jsonStr;
    if (arrayStart === -1) {
      throw new Error('Could not find task list in AI response. Raw: ' + aiText.slice(0, 200));
    }
    if (arrayEnd === -1 || arrayEnd <= arrayStart) {
      // Response was truncated — try to repair
      jsonStr = clean.substring(arrayStart);
    } else {
      jsonStr = clean.substring(arrayStart, arrayEnd + 1);
    }

    // Attempt to repair truncated JSON
    try {
      _suggestedTasks = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn('[TaskSuggest] JSON parse failed, attempting repair…', parseErr.message);
      // Remove trailing incomplete object (find last complete },)
      var lastComplete = jsonStr.lastIndexOf('}');
      if (lastComplete > 0) {
        var repaired = jsonStr.substring(0, lastComplete + 1);
        // Remove trailing comma and close array
        repaired = repaired.replace(/,\s*$/, '') + ']';
        // Ensure it starts with [
        if (repaired[0] !== '[') repaired = '[' + repaired;
        try {
          _suggestedTasks = JSON.parse(repaired);
          console.log('[TaskSuggest] Repaired JSON successfully, got ' + _suggestedTasks.length + ' tasks');
        } catch (repairErr) {
          throw new Error('Could not parse AI response as JSON. ' + parseErr.message);
        }
      } else {
        throw new Error('Could not parse AI response as JSON. ' + parseErr.message);
      }
    }

    if (!Array.isArray(_suggestedTasks) || _suggestedTasks.length === 0) {
      throw new Error('AI returned an empty or invalid task list.');
    }
    renderSuggestions(p);
  } catch (err) {
    console.error('[TaskSuggest] Failed:', err);
    panel.innerHTML = '<div class="suggest-header"><span class="suggest-title">✨ AI Task Suggestions</span>' +
      '<button class="suggest-close" onclick="closeSuggestPanel()">✕</button></div>' +
      '<div style="text-align:center;padding:20px;color:#991B1B;font-size:13px;">' +
        '<div style="font-size:24px;margin-bottom:8px;">⚠️</div>' +
        'Failed to generate suggestions. ' + esc(err.message) +
        '<br><button onclick="suggestTasksForProject(' + projectObjectId + ')" style="margin-top:10px;padding:6px 14px;background:var(--navy);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Try Again</button>' +
      '</div>';
  }
}

function renderSuggestions(project) {
  var panel = document.getElementById('suggest-panel');
  if (!panel || !_suggestedTasks.length) return;

  var detailLabels = { low: 'Low detail · major phases', medium: 'Medium detail · grouped activities', high: 'High detail · atomic steps' };
  var html = '<div class="suggest-header"><span class="suggest-title">✨ AI Task Suggestions</span>' +
    '<span style="font-size:10px;font-weight:700;color:#92400E;background:#FEF3C7;padding:2px 8px;border-radius:6px;margin-left:8px;">' + (detailLabels[_suggestDetail] || '') + '</span>' +
    '<button class="suggest-close" onclick="closeSuggestPanel()">✕</button></div>';
  html += '<div style="font-size:11px;color:#92400E;margin-bottom:12px;">Tasks are ordered by dependency — prerequisites first. Review and adjust assignees, then click "Add" or "Add All."</div>';

  _suggestedTasks.forEach(function(task, i) {
    var accepted = task._accepted ? ' accepted' : '';
    html += '<div class="suggest-task' + accepted + '" id="suggest-task-' + i + '">';
    html += '<div style="width:24px;height:24px;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px;">' + (i + 1) + '</div>';
    html += '<div class="suggest-task-body">';
    html += '<div class="suggest-task-title">' + esc(task.title) + '</div>';
    html += '<div class="suggest-task-desc">' + esc(task.description || '') + '</div>';
    html += '<div class="suggest-task-meta">';
    if (task.category) html += '<span class="suggest-task-chip">' + esc(task.category) + '</span>';
    if (task.tool) html += '<span class="suggest-task-chip">' + esc(task.tool) + '</span>';
    if (task.priority) html += '<span class="suggest-task-chip">' + esc(task.priority) + '</span>';
    var taskReqs = Array.isArray(task.phase_requirements) ? task.phase_requirements : [];
    taskReqs.forEach(function(rId) {
      var info = resolveReqInfo(rId);
      if (info) {
        var chipStyle = info.isOptional ? 'background:#FEF3C7;color:#92400E;' : 'background:#EEF2FF;color:var(--navy);';
        html += '<span class="suggest-task-chip" style="' + chipStyle + '">P' + info.phaseId + ': ' + esc(info.label).substring(0, 30) + '</span>';
      }
    });
    // Editable assignee dropdown
    var members = RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return RESOURCES_DATA.people[n].active !== false; }).sort() : (FM_ACTIVE_MEMBERS || FM_TASK_ASSIGNEES || []);
    html += '<select id="suggest-assignee-' + i + '" onchange="suggestAssigneeChange(' + i + ',this.value)" style="font-size:10px;font-weight:700;padding:2px 6px;border:1px solid #E8E6DF;border-radius:6px;font-family:Lato,sans-serif;color:var(--navy);background:var(--surface-2);cursor:pointer;">';
    html += '<option value="">Unassigned</option>';
    members.forEach(function(m) {
      var sel = (task.suggested_assignee === m) ? ' selected' : '';
      html += '<option value="' + esc(m) + '"' + sel + '>' + esc(m) + '</option>';
    });
    html += '</select>';
    html += '</div></div>';
    if (!task._accepted) {
      html += '<button class="suggest-accept-btn" onclick="acceptSuggestedTask(' + i + ')">Add</button>';
    } else {
      html += '<span style="font-size:11px;font-weight:700;color:#22C55E;flex-shrink:0;align-self:center;">✓ Added</span>';
    }
    html += '</div>';
  });

  var allAccepted = _suggestedTasks.every(function(t) { return t._accepted; });
  var remaining = _suggestedTasks.filter(function(t) { return !t._accepted; }).length;
  html += '<div class="suggest-footer">';
  html += '<span style="font-size:12px;color:#92400E;">' + remaining + ' suggestion' + (remaining !== 1 ? 's' : '') + ' remaining</span>';
  if (!allAccepted) {
    html += '<button class="suggest-accept-all" onclick="acceptAllSuggestedTasks()">Add All (' + remaining + ')</button>';
  } else {
    html += '<span style="font-size:12px;font-weight:700;color:#22C55E;">All tasks added!</span>';
  }
  html += '</div>';

  panel.innerHTML = html;
}

function suggestAssigneeChange(index, value) {
  if (_suggestedTasks[index]) {
    _suggestedTasks[index].suggested_assignee = value || null;
  }
}

async function acceptSuggestedTask(index) {
  var task = _suggestedTasks[index];
  if (!task || task._accepted) return;

  // Read current assignee from dropdown (user may have changed it)
  var assigneeSelect = document.getElementById('suggest-assignee-' + index);
  var assignee = assigneeSelect ? assigneeSelect.value : (task.suggested_assignee || null);

  var project = PROJECTS.find(function(p) { return p.objectId === _suggestProjectId; });
  if (!project) return;

  var fields = {
    title: task.title,
    description: task.description || null,
    status: 'Pending',
    priority: task.priority || 'Medium',
    project: project.title,
    category: task.category || null,
    tool: task.tool || null,
    assignee: assignee || null,
    phase_requirements: Array.isArray(task.phase_requirements) ? task.phase_requirements.join(',') : (task.phase_requirements || null),
  };

  try {
    await DataStore.createTask(fields);
    task._accepted = true;
    renderSuggestions(project);
    showToast('Task "' + task.title + '" created.', 'success');
    markDataDirty();
    var allDone = _suggestedTasks.every(function(t) { return t._accepted; });
    if (allDone) { closeSuggestPanel(); render(); }
  } catch (err) {
    showToast('Failed to create task: ' + err.message, 'error');
  }
}

async function acceptAllSuggestedTasks() {
  var project = PROJECTS.find(function(p) { return p.objectId === _suggestProjectId; });
  if (!project) return;

  var remaining = _suggestedTasks.filter(function(t) { return !t._accepted; });
  if (remaining.length === 0) return;

  var created = 0;
  for (var i = 0; i < _suggestedTasks.length; i++) {
    if (_suggestedTasks[i]._accepted) continue;
    var task = _suggestedTasks[i];
    var assigneeSelect = document.getElementById('suggest-assignee-' + i);
    var assignee = assigneeSelect ? assigneeSelect.value : (task.suggested_assignee || null);
    var fields = {
      title: task.title,
      description: task.description || null,
      status: 'Pending',
      priority: task.priority || 'Medium',
      project: project.title,
      category: task.category || null,
      tool: task.tool || null,
      assignee: assignee || null,
      phase_requirements: Array.isArray(task.phase_requirements) ? task.phase_requirements.join(',') : (task.phase_requirements || null),
    };
    try {
      await DataStore.createTask(fields);
      task._accepted = true;
      created++;
    } catch (err) {
      console.error('[TaskSuggest] Failed to create task:', task.title, err);
    }
  }
  renderSuggestions(project);
  showToast('Created ' + created + ' task' + (created !== 1 ? 's' : '') + '.', 'success');
  markDataDirty();
  var allDone = _suggestedTasks.every(function(t) { return t._accepted; });
  if (allDone) { closeSuggestPanel(); render(); }
}

function closeSuggestPanel() {
  var panel = document.getElementById('suggest-panel');
  if (panel) panel.style.display = 'none';
  _suggestedTasks = [];
  _suggestProjectId = null;
}

// ── AI phase-requirement suggestion ──────────────────────
// ── AI Phase Requirement Suggestion ──────────────────────────────
async function suggestPhaseRequirements(taskId) {
  var task = TASKS.find(function(t) { return t.objectId == taskId; });
  if (!task || !task.project) return;
  var proj = PROJECTS.find(function(p) { return p.title === task.project; });
  if (!proj) return;

  // Show loading indicator on the task detail page
  var panel = document.getElementById('ai-phase-suggest');
  if (!panel) return;
  panel.style.display = '';
  panel.innerHTML = '<div style="text-align:center;padding:16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;">' +
    '<div style="font-size:20px;margin-bottom:6px;">🤔</div>' +
    '<div style="font-size:12px;color:#92400E;font-weight:600;">Analyzing task for phase assignment…</div>' +
    '<div style="font-size:11px;color:#92400E;opacity:0.7;margin-top:4px;">This may take a few seconds.</div></div>';

  // Build a compact requirements reference
  var reqList = LIFECYCLE_PHASES.map(function(phase) {
    return 'Phase ' + phase.id + ' — ' + phase.name + ':\n' +
      phase.requirements.map(function(r) { return '  ' + r.id + ': ' + r.label; }).join('\n');
  }).join('\n');

  var prompt = 'You are a project lifecycle advisor for a city government data analytics team. ' +
    'Analyze the following task and determine which project lifecycle phase requirement(s) it satisfies.\n\n' +
    'TASK:\n' +
    'Title: ' + task.title + '\n' +
    'Category: ' + (task.category || 'Not set') + '\n' +
    'Description: ' + (task.description || 'Not provided') + '\n\n' +
    'PROJECT CONTEXT:\n' +
    'Project: ' + proj.title + '\n' +
    'Status: ' + (proj.status || 'Unknown') + '\n' +
    'Category: ' + (proj.category || 'Not set') + '\n\n' +
    'LIFECYCLE PHASE REQUIREMENTS:\n' + reqList + '\n\n' +
    'RULES:\n' +
    '- Select 1-3 requirements that this task DIRECTLY satisfies. Most tasks satisfy exactly 1.\n' +
    '- Only select requirements where the task\'s work is a clear, direct contribution to completing that requirement.\n' +
    '- Do NOT force-fit. If no requirement clearly matches, return an empty array.\n' +
    '- Consider the task title and description most heavily. Category is a secondary signal.\n' +
    '- A task can span multiple phases if it genuinely contributes to requirements in different phases.\n\n' +
    'Respond ONLY with a JSON object (no markdown, no backticks):\n' +
    '{"requirements": [{"id": "P1_GOALS", "reason": "brief reason why this task satisfies this requirement"}]}';

  try {
    var text = await callAiProxy('phaseAssign', prompt);
    var clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    var objStart = clean.indexOf('{');
    var objEnd = clean.lastIndexOf('}');
    if (objStart === -1 || objEnd === -1) throw new Error('Could not find JSON in response.');
    var result = JSON.parse(clean.substring(objStart, objEnd + 1));

    var suggestions = (result.requirements || []).filter(function(s) {
      return s.id && REQUIREMENT_LOOKUP[s.id];
    });

    if (suggestions.length === 0) {
      panel.innerHTML = '<div style="padding:12px 16px;background:var(--surface-2);border:1px solid #E8E6DF;border-radius:8px;font-size:12px;color:var(--text-muted);">' +
        '✨ AI analyzed this task but no clear phase requirement match was found. You can assign one manually via Edit.</div>';
      setTimeout(function() { if (panel) panel.style.display = 'none'; }, 5000);
      return;
    }

    // Store suggestions for accept handler
    window._pendingPhaseSuggestions = { taskId: taskId, suggestions: suggestions };

    // Render suggestion panel
    var sugHtml = '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;">';
    sugHtml += '<div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:8px;">✨ Suggested Phase Requirements</div>';
    suggestions.forEach(function(s) {
      var info = REQUIREMENT_LOOKUP[s.id];
      sugHtml += '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #FDE68A;">';
      sugHtml += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:#EEF2FF;color:var(--navy);white-space:nowrap;flex-shrink:0;">Phase ' + info.phaseId + '</span>';
      sugHtml += '<div><div style="font-size:12px;font-weight:600;color:var(--text-body);">' + esc(info.label) + '</div>';
      if (s.reason) sugHtml += '<div style="font-size:11px;color:#92400E;margin-top:2px;">' + esc(s.reason) + '</div>';
      sugHtml += '</div></div>';
    });
    sugHtml += '<div style="display:flex;gap:8px;margin-top:10px;">';
    sugHtml += '<button onclick="acceptPhaseSuggestions()" style="padding:6px 16px;background:var(--navy);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Accept</button>';
    sugHtml += '<button onclick="dismissPhaseSuggestions()" style="padding:6px 16px;background:var(--surface-2);color:var(--text-body);border:1px solid #E8E6DF;border-radius:6px;font-size:12px;font-weight:600;font-family:Lato,sans-serif;cursor:pointer;">Dismiss</button>';
    sugHtml += '</div></div>';
    panel.innerHTML = sugHtml;
  } catch (err) {
    console.error('[AI Phase] Error:', err);
    panel.innerHTML = '<div style="padding:12px 16px;background:#FEE2E2;border:1px solid #FECACA;border-radius:8px;font-size:12px;color:#991B1B;">AI phase suggestion failed: ' + esc(err.message) + '</div>';
    setTimeout(function() { if (panel) panel.style.display = 'none'; }, 5000);
  }
}

async function acceptPhaseSuggestions() {
  var pending = window._pendingPhaseSuggestions;
  if (!pending) return;
  var reqIds = pending.suggestions.map(function(s) { return s.id; }).join(', ');
  try {
    await DataStore.updateTask(pending.taskId, { phase_requirements: reqIds });
    showToast('Phase requirements assigned.', 'success');
    window._pendingPhaseSuggestions = null;
    markDataDirty();
    render();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  }
}

function dismissPhaseSuggestions() {
  window._pendingPhaseSuggestions = null;
  var panel = document.getElementById('ai-phase-suggest');
  if (panel) panel.style.display = 'none';
}
