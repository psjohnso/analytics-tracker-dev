// ─────────────────────────────────────────────────────────────────────
// modals/idea.js — Idea submission form + Idea review page
//
// Owns: the simple idea form (openSimpleIdeaForm), the AI-guided
// 3-step intake (openGuidedIdeaForm + renderGuidedStep1/2/3), submit
// handlers, the close handlers, the Idea Review page (renderIdeaReview),
// project-availability lookups for cards (toggleIdeaAvail,
// renderIdeaAvail), and openProjectFromReview navigation.
//
// Forward references: Auth, Editor, ensureValidSession, refreshEnums,
// isFeatureOn, openFormModal, agolApplyEdits, ARCGIS_CONFIG,
// markDataDirty, render, currentDetail, showToast, esc, escapeAttr,
// PROJECTS, TASKS, RESOURCES_DATA, getEnums, fmSearchableSelect, etc.
// ─────────────────────────────────────────────────────────────────────

// ─── IDEA SUBMISSION ──────────────────────────────────────────────────

// Resolve the submitter's ITD team from their member record so a new idea
// inherits it without the submitter having to pick. Returns null if the
// name doesn't match a known member or the member has no team set.
function lookupSubmitterTeam(contactName) {
  if (!contactName) return null;
  if (!RESOURCES_DATA || !RESOURCES_DATA.people) return null;
  var member = RESOURCES_DATA.people[contactName];
  if (!member) return null;
  return member.team || null;
}

function openIdeaForm() {
  if (!ensureValidSession(function() { openIdeaForm(); })) return;
  refreshEnums();
  if (isFeatureOn('aiIntake')) {
    openGuidedIdeaForm();
  } else {
    openSimpleIdeaForm();
  }
}

function openSimpleIdeaForm() {
  const body = document.getElementById('idea-modal-body');
  body.innerHTML = `
    <div class="idea-field">
      <label>Idea Title <span class="req">*</span></label>
      <input id="idea-title" class="idea-input" type="text" placeholder="Give your idea a clear, descriptive title…" maxlength="200">
    </div>
    <div class="idea-field">
      <label>Submitted By <span class="req">*</span></label>
      <select id="idea-contact" class="idea-select">
        <option value="">Select your name…</option>
        ${(FM_ACTIVE_MEMBERS || FM_TASK_ASSIGNEES).map(n => `<option value="${esc(n)}"${n === Auth.fullName ? ' selected' : ''}>${esc(n)}</option>`).join('')}
      </select>
    </div>
    <div class="idea-field">
      <label>Partner / Requesting Department</label>
      <select id="idea-dept" class="idea-select">
        <option value="">Select department…</option>
        ${FM_PARTNER_DEPTS.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
      </select>
    </div>
    <div class="idea-field">
      <label>Problem Statement <span class="req">*</span></label>
      <textarea id="idea-problem" class="idea-textarea" rows="3" placeholder="What problem does this solve? Why does it matter?"></textarea>
    </div>
    <div class="idea-field">
      <label>Priority</label>
      <select id="idea-priority" class="idea-select">
        <option value="">Select priority…</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
    </div>
    <div class="idea-field">
      <label>Urgency / Timeline Notes</label>
      <textarea id="idea-urgency" class="idea-textarea" rows="2" placeholder="Is there a deadline, dependency, or reason this needs attention soon?"></textarea>
    </div>
    <div style="background:#FEF3C7;border:1.5px solid #F59E0B;border-radius:6px;padding:14px 16px;font-size:12px;color:#92400E;line-height:1.7;">
      <div style="font-weight:800;font-size:13px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
        ⚠️ Before you submit — have you talked to your team lead?
      </div>
      Please make sure you've discussed this idea with your respective team lead first:
      <div style="display:flex;gap:10px;margin:10px 0 4px;flex-wrap:wrap;">
        <span style="background:#fff;border:1.5px solid #F59E0B;border-radius:20px;padding:4px 14px;font-weight:700;">🤖 AI Team Lead</span>
        <span style="background:#fff;border:1.5px solid #F59E0B;border-radius:20px;padding:4px 14px;font-weight:700;">📊 Analytics Team Lead</span>
        <span style="background:#fff;border:1.5px solid #F59E0B;border-radius:20px;padding:4px 14px;font-weight:700;">🗺️ GIS Team Lead</span>
      </div>
      This ensures your team lead is prepared to speak to the idea at the Monday review meeting.
    </div>
    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13px;color:var(--text-body);line-height:1.5;">
      <input type="checkbox" id="idea-team-check" style="margin-top:3px;accent-color:var(--orange);width:15px;height:15px;flex-shrink:0;">
      <span>I have discussed this idea with my team lead and they are aware of the submission.</span>
    </label>
    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:12px 14px;font-size:12px;color:#1E40AF;line-height:1.6;">
      <strong>📅 What happens next:</strong> Your idea will appear in the project list with an <em>Idea</em> status. Leadership reviews new ideas every Monday and will reach out if they have questions.
    </div>
  `;
  // Update footer for simple form
  var footer = document.querySelector('#idea-modal .idea-modal-footer');
  if (footer) footer.innerHTML = '<button class="idea-btn-cancel" onclick="closeIdeaFormDirect()">Cancel</button><button class="idea-btn-submit" onclick="submitIdeaForm()">💡 Submit Idea</button>';
  document.getElementById('idea-modal-backdrop').classList.add('open');
  setTimeout(() => document.getElementById('idea-title').focus(), 50);
}

// ── AI-Guided Intake Form ─────────────────────────────────────────
var _guidedIntakeState = { step: 1, starterAnswers: {}, aiQuestions: [], followUpAnswers: {}, aiSummary: '' };

function openGuidedIdeaForm() {
  _guidedIntakeState = { step: 1, starterAnswers: {}, aiQuestions: [], followUpAnswers: {}, aiSummary: '' };
  renderGuidedStep1();
  document.getElementById('idea-modal-backdrop').classList.add('open');
}

function renderGuidedStep1() {
  var header = document.querySelector('#idea-modal .idea-modal-header');
  if (header) {
    header.querySelector('h2').textContent = '💡 Guided Project Intake — Step 1 of 3';
    header.querySelector('p').textContent = 'Answer these starter questions to help us understand your idea. We\'ll generate tailored follow-up questions next.';
  }
  var body = document.getElementById('idea-modal-body');
  var s = _guidedIntakeState.starterAnswers;
  body.innerHTML = `
    <div style="display:flex;gap:6px;margin-bottom:16px;">
      <div style="flex:1;height:4px;background:var(--navy);border-radius:2px;"></div>
      <div style="flex:1;height:4px;background:#E8E6DF;border-radius:2px;"></div>
      <div style="flex:1;height:4px;background:#E8E6DF;border-radius:2px;"></div>
    </div>
    <div class="idea-field">
      <label>Idea Title <span class="req">*</span></label>
      <input id="gi-title" class="idea-input" type="text" placeholder="Give your idea a clear, descriptive title…" maxlength="200" value="${esc(s.title || '')}">
    </div>
    <div class="idea-field">
      <label>Submitted By <span class="req">*</span></label>
      <select id="gi-contact" class="idea-select">
        <option value="">Select your name…</option>
        ${(FM_ACTIVE_MEMBERS || FM_TASK_ASSIGNEES).map(n => `<option value="${esc(n)}"${n === (s.contact || Auth.fullName) ? ' selected' : ''}>${esc(n)}</option>`).join('')}
      </select>
    </div>
    <div class="idea-field">
      <label>Category <span class="req">*</span></label>
      <select id="gi-category" class="idea-select">
        <option value="">Select a category…</option>
        ${(FM_PROJ_CATEGORIES || []).map(c => `<option value="${esc(c)}"${c === s.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
    <div class="idea-field">
      <label>What problem does this solve and who benefits? <span class="req">*</span></label>
      <textarea id="gi-problem" class="idea-textarea" rows="3" placeholder="Describe the problem, who experiences it, and what impact it has…">${esc(s.problem || '')}</textarea>
    </div>
    <div class="idea-field">
      <label>Partner / Requesting Department</label>
      <select id="gi-dept" class="idea-select">
        <option value="">Select department…</option>
        ${FM_PARTNER_DEPTS.map(d => `<option value="${esc(d)}"${d === s.dept ? ' selected' : ''}>${esc(d)}</option>`).join('')}
      </select>
    </div>
    <div class="idea-field">
      <label>How urgent is this?</label>
      <select id="gi-urgency" class="idea-select">
        <option value="">Select urgency…</option>
        <option value="Immediate — blocking other work"${s.urgency === 'Immediate — blocking other work' ? ' selected' : ''}>Immediate — blocking other work</option>
        <option value="This quarter"${s.urgency === 'This quarter' ? ' selected' : ''}>This quarter</option>
        <option value="Next quarter"${s.urgency === 'Next quarter' ? ' selected' : ''}>Next quarter</option>
        <option value="No rush — just an idea"${s.urgency === 'No rush — just an idea' ? ' selected' : ''}>No rush — just an idea</option>
      </select>
    </div>
    <div class="idea-field">
      <label>Is there a hard deadline? If so, what's driving it?</label>
      <textarea id="gi-deadline" class="idea-textarea" rows="2" placeholder="e.g. Council presentation on June 15, grant deadline, regulatory requirement…">${esc(s.deadline || '')}</textarea>
    </div>
  `;
  var footer = document.querySelector('#idea-modal .idea-modal-footer');
  if (footer) footer.innerHTML = '<button class="idea-btn-cancel" onclick="closeIdeaFormDirect()">Cancel</button><button class="idea-btn-submit" onclick="guidedStep1Next()">Continue →</button>';
  setTimeout(() => document.getElementById('gi-title').focus(), 50);
}

async function guidedStep1Next() {
  // Validate required fields
  var title = (document.getElementById('gi-title').value || '').trim();
  var contact = document.getElementById('gi-contact').value;
  var category = document.getElementById('gi-category').value;
  var problem = (document.getElementById('gi-problem').value || '').trim();
  var valid = true;
  if (!title) { document.getElementById('gi-title').classList.add('err'); valid = false; }
  else document.getElementById('gi-title').classList.remove('err');
  if (!contact) { document.getElementById('gi-contact').style.borderColor = '#EF4444'; valid = false; }
  else document.getElementById('gi-contact').style.borderColor = '';
  if (!category) { document.getElementById('gi-category').style.borderColor = '#EF4444'; valid = false; }
  else document.getElementById('gi-category').style.borderColor = '';
  if (!problem) { document.getElementById('gi-problem').classList.add('err'); valid = false; }
  else document.getElementById('gi-problem').classList.remove('err');
  if (!valid) { showToast('Please fill in all required fields.', 'warn'); return; }

  // Save starter answers
  _guidedIntakeState.starterAnswers = {
    title: title,
    contact: contact,
    category: category,
    problem: problem,
    dept: document.getElementById('gi-dept').value || '',
    urgency: document.getElementById('gi-urgency').value || '',
    deadline: (document.getElementById('gi-deadline').value || '').trim()
  };

  // Show loading state
  var body = document.getElementById('idea-modal-body');
  body.innerHTML = '<div style="text-align:center;padding:40px 20px;"><div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:8px;">Generating follow-up questions...</div><div style="font-size:12px;color:var(--text-muted);">Our AI is analyzing your responses to ask the right questions for a ' + esc(category) + ' project.</div><div style="margin-top:16px;"><div style="width:40px;height:40px;border:3px solid #E8E6DF;border-top-color:var(--navy);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto;"></div></div></div>';
  var footer = document.querySelector('#idea-modal .idea-modal-footer');
  if (footer) footer.innerHTML = '<button class="idea-btn-cancel" onclick="closeIdeaFormDirect()">Cancel</button>';

  // Generate AI follow-up questions
  try {
    var sa = _guidedIntakeState.starterAnswers;
    var prompt = 'You are helping a City of Tucson GIS/Data Analytics team collect project intake information. A team member has submitted this project idea:\n\n' +
      'Title: ' + sa.title + '\n' +
      'Category: ' + sa.category + '\n' +
      'Problem/Need: ' + sa.problem + '\n' +
      (sa.dept ? 'Requesting Department: ' + sa.dept + '\n' : '') +
      (sa.urgency ? 'Urgency: ' + sa.urgency + '\n' : '') +
      (sa.deadline ? 'Deadline: ' + sa.deadline + '\n' : '') +
      '\nThe team works with: ArcGIS Online, ArcGIS Pro, ArcGIS Server, FME, Python, SQL, Power BI, Snowflake, and web development (HTML/CSS/JS).\n\n' +
      'Based on this information, generate 4-6 follow-up questions that would help the project leads determine:\n' +
      '1. Whether this project should be done (value, alignment, impact)\n' +
      '2. Whether the team can do it (skills, data, dependencies)\n' +
      '3. When to schedule it (effort, phases, constraints)\n' +
      '4. Who should work on it (skills needed, SME knowledge)\n\n' +
      'Make the questions specific to this particular idea and category — not generic.\n' +
      'For each question, indicate the input type: "text" for free-form, "select" for multiple choice (provide 3-5 options), or "yesno" for yes/no.\n\n' +
      'Respond ONLY with a JSON array, no other text. Example format:\n' +
      '[{"id":"q1","question":"...","type":"text"},{"id":"q2","question":"...","type":"select","options":["Option A","Option B","Option C"]},{"id":"q3","question":"...","type":"yesno"}]';

    var aiText = await callAiProxy('intakeQuestions', prompt);
    // Parse JSON from response
    var jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      _guidedIntakeState.aiQuestions = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Could not parse AI response');
    }
    renderGuidedStep2();
  } catch (err) {
    console.error('AI question generation failed:', err);
    // Fallback: generic follow-up questions
    _guidedIntakeState.aiQuestions = [
      { id: 'q1', question: 'What data sources are needed for this project? Do they already exist?', type: 'text' },
      { id: 'q2', question: 'Are there any dependencies on other teams, systems, or projects?', type: 'text' },
      { id: 'q3', question: 'Has something similar been attempted before?', type: 'yesno' },
      { id: 'q4', question: 'Can this be broken into phases or delivered incrementally?', type: 'yesno' },
      { id: 'q5', question: 'What does success look like? How will you know this project delivered value?', type: 'text' }
    ];
    renderGuidedStep2();
    showToast('Using standard follow-up questions (AI unavailable).', 'warn');
  }
}

function renderGuidedStep2() {
  var header = document.querySelector('#idea-modal .idea-modal-header');
  if (header) {
    header.querySelector('h2').textContent = '💡 Guided Project Intake — Step 2 of 3';
    header.querySelector('p').textContent = 'Answer these follow-up questions to help the team scope and prioritize your idea.';
  }
  var body = document.getElementById('idea-modal-body');
  var questions = _guidedIntakeState.aiQuestions;
  var answers = _guidedIntakeState.followUpAnswers;

  var html = '<div style="display:flex;gap:6px;margin-bottom:16px;">';
  html += '<div style="flex:1;height:4px;background:var(--navy);border-radius:2px;"></div>';
  html += '<div style="flex:1;height:4px;background:var(--navy);border-radius:2px;"></div>';
  html += '<div style="flex:1;height:4px;background:#E8E6DF;border-radius:2px;"></div>';
  html += '</div>';

  html += '<div style="background:#F0F4FF;border:1px solid #BFDBFE;border-radius:6px;padding:10px 14px;font-size:12px;color:#1E40AF;margin-bottom:12px;">These questions were generated based on your project description and category. They help leadership evaluate and schedule your idea.</div>';

  questions.forEach(function(q, i) {
    html += '<div class="idea-field">';
    html += '<label>' + (i + 1) + '. ' + esc(q.question) + '</label>';
    if (q.type === 'select' && q.options) {
      html += '<select id="gi-q-' + q.id + '" class="idea-select">';
      html += '<option value="">Select…</option>';
      q.options.forEach(function(opt) {
        html += '<option value="' + esc(opt) + '"' + (answers[q.id] === opt ? ' selected' : '') + '>' + esc(opt) + '</option>';
      });
      html += '</select>';
    } else if (q.type === 'yesno') {
      html += '<select id="gi-q-' + q.id + '" class="idea-select">';
      html += '<option value="">Select…</option>';
      html += '<option value="Yes"' + (answers[q.id] === 'Yes' ? ' selected' : '') + '>Yes</option>';
      html += '<option value="No"' + (answers[q.id] === 'No' ? ' selected' : '') + '>No</option>';
      html += '<option value="Not sure"' + (answers[q.id] === 'Not sure' ? ' selected' : '') + '>Not sure</option>';
      html += '</select>';
    } else {
      html += '<textarea id="gi-q-' + q.id + '" class="idea-textarea" rows="2" placeholder="Your answer…">' + esc(answers[q.id] || '') + '</textarea>';
    }
    html += '</div>';
  });

  body.innerHTML = html;
  var footer = document.querySelector('#idea-modal .idea-modal-footer');
  if (footer) footer.innerHTML = '<button class="idea-btn-cancel" onclick="renderGuidedStep1()">← Back</button><button class="idea-btn-submit" onclick="guidedStep2Next()">Generate Summary →</button>';
}

async function guidedStep2Next() {
  // Collect follow-up answers
  var questions = _guidedIntakeState.aiQuestions;
  questions.forEach(function(q) {
    var el = document.getElementById('gi-q-' + q.id);
    if (el) _guidedIntakeState.followUpAnswers[q.id] = (el.value || '').trim();
  });

  // Show loading
  var body = document.getElementById('idea-modal-body');
  body.innerHTML = '<div style="text-align:center;padding:40px 20px;"><div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:8px;">Generating project summary...</div><div style="font-size:12px;color:var(--text-muted);">Writing a structured summary for the review team.</div><div style="margin-top:16px;"><div style="width:40px;height:40px;border:3px solid #E8E6DF;border-top-color:var(--navy);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto;"></div></div></div>';
  var footer = document.querySelector('#idea-modal .idea-modal-footer');
  if (footer) footer.innerHTML = '<button class="idea-btn-cancel" onclick="closeIdeaFormDirect()">Cancel</button>';

  // Build Q&A text for the summary prompt
  var qaText = '';
  var sa = _guidedIntakeState.starterAnswers;
  qaText += 'Title: ' + sa.title + '\n';
  qaText += 'Category: ' + sa.category + '\n';
  qaText += 'Problem/Need: ' + sa.problem + '\n';
  if (sa.dept) qaText += 'Requesting Department: ' + sa.dept + '\n';
  if (sa.urgency) qaText += 'Urgency: ' + sa.urgency + '\n';
  if (sa.deadline) qaText += 'Deadline: ' + sa.deadline + '\n\n';
  qaText += 'Follow-up Q&A:\n';
  _guidedIntakeState.aiQuestions.forEach(function(q) {
    var ans = _guidedIntakeState.followUpAnswers[q.id] || '(no answer)';
    qaText += '- ' + q.question + '\n  Answer: ' + ans + '\n';
  });

  try {
    var summaryPrompt = 'You are helping a City of Tucson GIS/Data Analytics team summarize a project intake submission for leadership review.\n\n' +
      'Here is all the information collected:\n\n' + qaText + '\n\n' +
      'Write a structured project summary with these sections:\n' +
      '1. **Project Description** — A clear 2-3 sentence description of what this project would deliver.\n' +
      '2. **Business Value** — Why this matters, who benefits, and what impact it would have.\n' +
      '3. **Technical Considerations** — What tools, data sources, skills, or dependencies are involved.\n' +
      '4. **Suggested Size** — Estimate the project size as S (1-2 weeks), M (3-6 weeks), L (7-13 weeks), or XL (14+ weeks) with a brief justification.\n' +
      '5. **Risks & Open Questions** — Any concerns, unknowns, or things that need clarification.\n\n' +
      'Write in a professional but conversational tone. Keep each section to 2-3 sentences. Do not use markdown formatting — use plain text with section labels.';

    var summaryText = await callAiProxy('intakeSummary', summaryPrompt);
    _guidedIntakeState.aiSummary = summaryText.trim();
    renderGuidedStep3();
  } catch (err) {
    console.error('AI summary generation failed:', err);
    _guidedIntakeState.aiSummary = 'Summary generation failed. The raw Q&A responses have been saved below.';
    renderGuidedStep3();
    showToast('Could not generate AI summary. Responses will be saved as-is.', 'warn');
  }
}

function renderGuidedStep3() {
  var header = document.querySelector('#idea-modal .idea-modal-header');
  if (header) {
    header.querySelector('h2').textContent = '💡 Guided Project Intake — Step 3 of 3';
    header.querySelector('p').textContent = 'Review the AI-generated summary and submit your idea.';
  }
  var sa = _guidedIntakeState.starterAnswers;
  var body = document.getElementById('idea-modal-body');

  var html = '<div style="display:flex;gap:6px;margin-bottom:16px;">';
  html += '<div style="flex:1;height:4px;background:var(--navy);border-radius:2px;"></div>';
  html += '<div style="flex:1;height:4px;background:var(--navy);border-radius:2px;"></div>';
  html += '<div style="flex:1;height:4px;background:var(--navy);border-radius:2px;"></div>';
  html += '</div>';

  // Summary card
  html += '<div style="background:var(--bg-surface, #F3F1EB);border-radius:8px;padding:14px 16px;margin-bottom:12px;">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:0.04em;margin-bottom:4px;">PROJECT TITLE</div>';
  html += '<div style="font-size:16px;font-weight:700;color:var(--navy);margin-bottom:8px;">' + esc(sa.title) + '</div>';
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--text-muted);">';
  html += '<span>📂 ' + esc(sa.category) + '</span>';
  if (sa.dept) html += '<span>🏛 ' + esc(sa.dept) + '</span>';
  if (sa.urgency) html += '<span>⏱ ' + esc(sa.urgency) + '</span>';
  html += '<span>👤 ' + esc(sa.contact) + '</span>';
  html += '</div>';
  html += '</div>';

  // AI Summary (editable)
  html += '<div class="idea-field">';
  html += '<label>AI-Generated Summary <span style="font-weight:400;color:var(--text-muted);">(you can edit this)</span></label>';
  html += '<textarea id="gi-summary" class="idea-textarea" rows="12" style="font-size:13px;line-height:1.6;">' + esc(_guidedIntakeState.aiSummary) + '</textarea>';
  html += '</div>';

  // Team lead check
  html += '<div style="background:#FEF3C7;border:1.5px solid #F59E0B;border-radius:6px;padding:12px 14px;font-size:12px;color:#92400E;line-height:1.6;margin-bottom:8px;">';
  html += '<strong>⚠️ Before you submit</strong> — have you discussed this idea with your team lead?';
  html += '</div>';
  html += '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13px;color:var(--text-body);line-height:1.5;">';
  html += '<input type="checkbox" id="gi-team-check" style="margin-top:3px;accent-color:var(--orange);width:15px;height:15px;flex-shrink:0;">';
  html += '<span>I have discussed this idea with my team lead and they are aware of the submission.</span>';
  html += '</label>';

  body.innerHTML = html;
  var footer = document.querySelector('#idea-modal .idea-modal-footer');
  if (footer) footer.innerHTML = '<button class="idea-btn-cancel" onclick="renderGuidedStep2()">← Back</button><button class="idea-btn-submit" onclick="submitGuidedIdeaForm()">💡 Submit Idea</button>';
}

async function submitGuidedIdeaForm() {
  var teamCheck = document.getElementById('gi-team-check');
  if (teamCheck && !teamCheck.checked) {
    teamCheck.closest('label').style.color = '#EF4444';
    teamCheck.style.outline = '2px solid #EF4444';
    showToast('Please confirm you\'ve discussed this with your team lead.', 'warn');
    return;
  }

  var sa = _guidedIntakeState.starterAnswers;
  var summary = (document.getElementById('gi-summary').value || '').trim();

  // Business rule: unique title
  var duplicate = PROJECTS.find(function(p) { return p.title.toLowerCase() === sa.title.toLowerCase(); });
  if (duplicate) { showToast('A project named "' + sa.title + '" already exists.', 'warn'); return; }

  // Build intake_responses JSON
  var intakeData = {
    starterAnswers: sa,
    aiQuestions: _guidedIntakeState.aiQuestions.map(function(q) {
      return { question: q.question, answer: _guidedIntakeState.followUpAnswers[q.id] || '' };
    }),
    aiSummary: summary,
    submittedVia: 'guided-intake',
    submittedAt: new Date().toISOString()
  };

  var todayStr = new Date().toISOString().slice(0, 10);
  var submitterTeam = lookupSubmitterTeam(sa.contact);

  await DataStore.createProject({
    title:             sa.title,
    status:            'Idea',
    priority:          null,
    contact:           sa.contact,
    other_members:     null,
    partner_dept:      sa.dept || null,
    itd_team:          submitterTeam,
    category:          sa.category,
    start:             todayStr,
    end:               null,
    actual_end:        null,
    problem_statement: sa.problem,
    description:       summary,
    urgency_notes:     (sa.urgency ? sa.urgency + (sa.deadline ? ' — ' + sa.deadline : '') : sa.deadline) || null,
    intake_responses:  JSON.stringify(intakeData),
  });

  closeIdeaFormDirect();
  markDirty();

  // Reset header
  var header = document.querySelector('#idea-modal .idea-modal-header');
  if (header) {
    header.querySelector('h2').textContent = '💡 Submit a New Idea';
    header.querySelector('p').textContent = 'Share your project idea with the analytics team. Leadership will review it every Monday.';
  }

  showToast('Idea "' + sa.title + '" submitted with AI-generated summary!', 'success');
  markDataDirty();
  render();
}

function closeIdeaForm(e) {
  if (e.target === document.getElementById('idea-modal-backdrop')) closeIdeaFormDirect();
}

function closeIdeaFormDirect() {
  document.getElementById('idea-modal-backdrop').classList.remove('open');
}

async function submitIdeaForm() {
  const title   = (document.getElementById('idea-title').value || '').trim();
  const contact = document.getElementById('idea-contact').value;
  const problem = (document.getElementById('idea-problem').value || '').trim();

  const teamCheck = document.getElementById('idea-team-check');
  // Validate required fields
  let valid = true;
  if (teamCheck && !teamCheck.checked) {
    teamCheck.closest('label').style.color = '#EF4444';
    teamCheck.style.outline = '2px solid #EF4444';
    if (valid) teamCheck.focus();
    valid = false;
  } else if (teamCheck) {
    teamCheck.closest('label').style.color = '';
    teamCheck.style.outline = '';
  }
  if (!title) {
    document.getElementById('idea-title').classList.add('err');
    document.getElementById('idea-title').focus();
    valid = false;
  } else {
    document.getElementById('idea-title').classList.remove('err');
  }
  if (!contact) {
    document.getElementById('idea-contact').style.borderColor = '#EF4444';
    if (valid) document.getElementById('idea-contact').focus();
    valid = false;
  } else {
    document.getElementById('idea-contact').style.borderColor = '';
  }
  if (!problem) {
    document.getElementById('idea-problem').classList.add('err');
    if (valid) document.getElementById('idea-problem').focus();
    valid = false;
  } else {
    document.getElementById('idea-problem').classList.remove('err');
  }
  if (!valid) return;

  // Business rule: project names must be unique
  const duplicate = PROJECTS.find(function(p) {
    return p.title.toLowerCase() === title.toLowerCase();
  });
  if (duplicate) {
    showToast('A project named "' + title + '" already exists.', 'warn');
    return;
  }

  const dept     = (document.getElementById('idea-dept').value || '').trim();
  const priority = document.getElementById('idea-priority').value || null;
  const urgency  = (document.getElementById('idea-urgency').value || '').trim();

  const todayStr = new Date().toISOString().slice(0, 10);
  const submitterTeam = lookupSubmitterTeam(contact);

  await DataStore.createProject({
    title,
    status:            'Idea',
    priority:          priority,
    contact,
    other_members:     null,
    partner_dept:      dept || null,
    itd_team:          submitterTeam,
    category:          null,
    start:             todayStr,
    end:               null,
    actual_end:        null,
    problem_statement: problem,
    description:       null,
    urgency_notes:     urgency || null,
  });

  closeIdeaFormDirect();
  markDirty();

  // Update idea badge count if on projects tab
  const badge = document.getElementById('idea-count-badge');
  if (badge) {
    const count = PROJECTS.filter(p => p.status === 'Idea').length;
    badge.textContent = count > 0 ? count : '';
  }

  // Show a quick confirmation toast
  showToast('💡 Idea submitted! Leadership will review it Monday.');
  markDataDirty();
  render();
}

// ─── IDEA REVIEW PAGE ────────────────────────────────────────────────

function openIdeaReview() {
  currentDetail = { type: 'idea-review' };
  render();
}

function renderIdeaReview() {
  const ideas = PROJECTS.filter(p => p.status === 'Idea');
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // Sort by priority: High first, then Medium, Low, unset
  const priOrder = { High: 0, Medium: 1, Low: 2 };
  ideas.sort(function(a, b) {
    const pa = priOrder[a.priority] !== undefined ? priOrder[a.priority] : 3;
    const pb = priOrder[b.priority] !== undefined ? priOrder[b.priority] : 3;
    return pa - pb;
  });

  // Promote action buttons config
  const actions = [
    { label: 'Activate',  status: 'Active',     color: '#83AC16', bg: '#F0FDF4', border: '#86EFAC', tip: 'Start this project immediately. Allocations will be created for assigned team members.' },
    { label: 'Schedule',  status: 'Scheduled',  color: '#9E0059', bg: '#FDF2F8', border: '#F9A8D4', tip: 'Approve and commit this project with planned dates and resources. Allocations will be created for assigned team members.' },
    { label: 'Queue',     status: 'Future',     color: '#C24200', bg: '#FFF7ED', border: '#FED7AA', tip: 'Acknowledge this project but place it in the backlog. No dates or allocations are committed yet.' },
    { label: 'Hold',      status: 'On Hold',    color: '#FFDB22', bg: '#FEFCE8', border: '#FDE047', tip: 'Pause this project. It has been reviewed but is not ready to proceed at this time.' },
    { label: 'Decline',   status: 'Canceled',   color: '#B0B3AE', bg: '#F9FAFB', border: '#E1E2DD', tip: 'Decline this project idea. It will be marked as Canceled.' },
  ];

  // Days ago helper
  function daysAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0,0,0,0);
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return diff + ' days ago';
  }

  const cards = ideas.length === 0
    ? `<div class="review-empty">
        <div class="empty-icon">✅</div>
        <div style="font-weight:700;font-size:17px;color:var(--text-dark);margin-bottom:8px;">All caught up!</div>
        <div>No new ideas to review. New submissions will appear here.</div>
      </div>`
    : `<div class="idea-cards-grid">
        ${ideas.map(p => {
          const btns = actions.map(a =>
            `<button class="idea-promote-btn"
               style="background:${a.bg};color:${a.color};border-color:${a.border};"
               title="${a.tip}"
               onmouseover="this.style.background='${a.color}';this.style.color='#fff';"
               onmouseout="this.style.background='${a.bg}';this.style.color='${a.color}';"
               onclick="promoteIdea(${p.objectId}, '${a.status}')">
              ${a.label}
            </button>`
          ).join('');

          // Submission date: use start date or try to detect from data
          const submittedDate = p.start || '';
          const submittedLabel = submittedDate ? daysAgo(submittedDate) + ' · ' + submittedDate : '';

          // Priority badge
          const priBadge = p.priority ? `<span class="priority-badge priority-${p.priority}">${p.priority}</span>` : '<span class="priority-badge priority-null" style="opacity:0.4;">No priority</span>';

          return `<div class="idea-card" id="idea-card-${p.objectId}">
            <div class="idea-card-top">
              <div class="idea-lightbulb">💡</div>
              <div class="flex-1-min0">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <div class="idea-card-title" onclick="openProjectFromReview(${p.objectId})" class="flex-1-min0">${esc(p.title)}</div>
                  ${priBadge}
                </div>
                <div class="idea-card-meta">
                  ${p.contact ? `<span>👤 ${esc(p.contact)}</span>` : ''}
                  ${p.partner_dept ? `<span>🏢 ${esc(p.partner_dept)}</span>` : ''}
                  ${submittedLabel ? `<span>📅 ${submittedLabel}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="idea-card-body">
              ${p.problem_statement ? `<div class="idea-card-section">
                <div class="idea-card-section-label">Problem Statement</div>
                <div class="idea-card-text">${esc(p.problem_statement)}</div>
              </div>` : ''}
              ${p.urgency_notes ? `<div class="idea-card-section">
                <div class="idea-card-section-label" style="color:#C24200;">Urgency / Timeline</div>
                <div class="idea-card-text">${esc(p.urgency_notes)}</div>
              </div>` : ''}
              ${p.reviewer_notes ? `<div class="idea-card-section">
                <div class="idea-card-section-label">Previous Notes</div>
                <div class="idea-card-text" style="white-space:pre-line;">${esc(p.reviewer_notes)}</div>
              </div>` : ''}
            </div>
            <div style="padding:0 20px 12px;">
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Reviewer Notes</div>
              <textarea id="idea-notes-${p.objectId}" class="idea-textarea" rows="2" style="font-size:11px;margin-bottom:0;" placeholder="Add notes before promoting (saves to description)…"></textarea>
              <button onclick="saveIdeaReviewNotes(${p.objectId})" style="margin-top:4px;background:var(--navy);color:#fff;border:none;border-radius:5px;padding:4px 12px;font-size:10px;font-weight:700;cursor:pointer;font-family:Lato,sans-serif;">Save Notes</button>
            </div>
            <div class="idea-card-actions">
              <span class="idea-card-actions-label">Move to →</span>
              ${btns}
              <button class="idea-edit-btn" onclick="openFormModal('edit-project', ${p.objectId})">✏ Edit</button>
            </div>
            <div class="idea-avail-section">
              <div class="idea-avail-toggle" onclick="toggleIdeaAvail(${p.objectId})">
                <span id="idea-avail-arrow-${p.objectId}">▶</span> Team availability
              </div>
              <div id="idea-avail-body-${p.objectId}" style="display:none;"></div>
            </div>
          </div>`;
        }).join('')}
      </div>`;

  return `<div class="review-page">
    <div class="review-hero">
      <button class="review-hero-back" onclick="goBackFromDetail()">← Back to Projects</button>
      <div class="review-hero-title">📋 Weekly Idea Review</div>
      <div class="review-hero-sub">${today} · ${ideas.length} idea${ideas.length !== 1 ? 's' : ''} awaiting review</div>
    </div>
    <div class="review-body">
      ${cards}
    </div>
  </div>`;
}

async function promoteIdea(id, newStatus) {
  // Save any reviewer notes before promoting
  const notesEl = document.getElementById('idea-notes-' + id);
  if (notesEl && notesEl.value.trim()) {
    const proj = PROJECTS.find(function(p) { return p.objectId == id; });
    const existing = proj ? (proj.reviewer_notes || '') : '';
    const notes = notesEl.value.trim();
    const newNotes = existing ? existing + '\n' + notes : notes;
    await DataStore.updateProject(id, { reviewer_notes: newNotes });
  }
  await DataStore.updateProject(id, { status: newStatus });
  markDirty();
  // Animate card out then re-render
  const card = document.getElementById('idea-card-' + id);
  if (card) {
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => {
      document.getElementById('content-area').innerHTML = renderIdeaReview();
    }, 300);
  } else {
    document.getElementById('content-area').innerHTML = renderIdeaReview();
  }
  // Update badge
  const badge = document.getElementById('idea-count-badge');
  if (badge) {
    const count = PROJECTS.filter(p => p.status === 'Idea').length;
    badge.textContent = count > 0 ? count : '';
  }
  showToast(`Project moved to "${newStatus}"`);
}

async function saveIdeaReviewNotes(id) {
  const notesEl = document.getElementById('idea-notes-' + id);
  if (!notesEl) return;
  const notes = notesEl.value.trim();
  if (!notes) { showToast('No notes to save.', 'warn'); return; }
  const proj = PROJECTS.find(function(p) { return p.objectId == id; });
  if (!proj) return;
  const existing = proj.reviewer_notes || '';
  const newNotes = existing ? existing + '\n' + notes : notes;
  await DataStore.updateProject(id, { reviewer_notes: newNotes });
  notesEl.value = '';
  showToast('Notes saved for "' + proj.title + '"');
  document.getElementById('content-area').innerHTML = renderIdeaReview();
}

function openProjectFromReview(id) {
  currentDetail = { type: 'project', id, _returnToReview: true };
  render();
}

function toggleIdeaAvail(projectId) {
  var body = document.getElementById('idea-avail-body-' + projectId);
  var arrow = document.getElementById('idea-avail-arrow-' + projectId);
  if (!body) return;
  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (arrow) arrow.textContent = '▼';
    renderIdeaAvail(projectId);
  } else {
    body.style.display = 'none';
    if (arrow) arrow.textContent = '▶';
  }
}

function renderIdeaAvail(projectId) {
  var body = document.getElementById('idea-avail-body-' + projectId);
  if (!body || !RESOURCES_DATA || !RESOURCES_DATA.people) return;

  var proj = PROJECTS.find(function(p) { return p.objectId === projectId; });
  var size = (proj && proj.project_size) ? proj.project_size : 'M';

  // Read current dropdown value BEFORE rebuilding (preserves user's selection)
  var existingSelect = document.getElementById('idea-size-' + projectId);
  if (existingSelect) size = existingSelect.value;

  var avData = fcAvailData();
  var people = Object.keys(avData);

  // Size/role selector for this idea
  var sizeLabels = { S: 'S — Small', M: 'M — Medium', L: 'L — Large', XL: 'XL — Extra large' };
  var html = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">';
  html += '<select id="idea-size-' + projectId + '" onchange="renderIdeaAvail(' + projectId + ')" style="padding:3px 6px;border:1px solid #E8E6DF;border-radius:4px;font-size:11px;font-family:Lato,sans-serif;">';
  ['S','M','L','XL'].forEach(function(s) {
    html += '<option value="' + s + '"' + (s === size ? ' selected' : '') + '>' + sizeLabels[s] + '</option>';
  });
  html += '</select>';
  html += '<span style="font-size:10px;color:var(--text-muted);">' + SIZE_DURATIONS[size] + ' week duration</span>';
  html += '</div>';

  var dur = SIZE_DURATIONS[size] || 6;

  // Results for each team member as Lead and Contributor
  var rows = people.map(function(name) {
    var leadResult = findEarliestStart(avData, name, size, 'Lead');
    var contribResult = findEarliestStart(avData, name, size, 'Contributor');
    var leadPct = (_allocationDefaults[size] || {}).Lead || 0;
    var contribPct = (_allocationDefaults[size] || {}).Contributor || 0;
    return { name: name, role: avData[name].role || '', lead: leadResult, contrib: contribResult, leadPct: leadPct, contribPct: contribPct };
  });

  // Sort: available soonest as Lead first
  rows.sort(function(a, b) {
    var aW = a.lead.startWeek === -1 ? 999 : a.lead.startWeek;
    var bW = b.lead.startWeek === -1 ? 999 : b.lead.startWeek;
    return aW - bW;
  });

  var curIdx = window.currentWeekIdx || 9;
  html += '<div class="idea-avail-grid">';
  html += '<div style="display:flex;gap:4px;padding:4px 0;border-bottom:1px solid #E8E6DF;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">';
  html += '<span style="min-width:130px;">Team member</span>';
  html += '<span style="min-width:80px;text-align:center;">As lead (' + ((_allocationDefaults[size]||{}).Lead||0) + '%)</span>';
  html += '<span style="min-width:80px;text-align:center;">As contributor (' + ((_allocationDefaults[size]||{}).Contributor||0) + '%)</span>';
  html += '</div>';

  rows.forEach(function(r) {
    function badge(result) {
      if (result.startWeek === -1) return '<span class="idea-avail-badge" style="background:#FEE2E2;color:#991B1B;">At capacity</span>';
      if (result.startWeek <= curIdx) return '<span class="idea-avail-badge" style="background:#D1FAE5;color:#065F46;">Now</span>';
      return '<span class="idea-avail-badge" style="background:#DBEAFE;color:#1E40AF;">' + cpWeekLabel(result.startWeek) + '</span>';
    }
    html += '<div class="idea-avail-row">';
    html += '<span class="idea-avail-name">' + esc(r.name) + '</span>';
    html += '<span style="min-width:80px;text-align:center;">' + badge(r.lead) + '</span>';
    html += '<span style="min-width:80px;text-align:center;">' + badge(r.contrib) + '</span>';
    html += '</div>';
  });
  html += '</div>';

  body.innerHTML = html;
}
