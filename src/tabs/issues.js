// ─────────────────────────────────────────────────────────────────────
// tabs/issues.js — Issues tab (bug tracker + improvement requests)
//
// Owns: filter state, the data loader, the page builder, the form
// modal handlers (open/close/submit/toggle), and status-change /
// delete CRUD. The shared issue feature service URL lives in
// ARCGIS_CONFIG (agol.js).
//
// Forward references: ISSUES (state in inline script), Auth, esc,
// showToast, currentTab. Backward references: agolQuery,
// agolApplyEdits, ARCGIS_CONFIG.
// ─────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════
//  ISSUES TAB — Bug & Improvement Tracker
// ═══════════════════════════════════════════════════════════════════════
var _issuesFilter = 'all'; // 'all' | 'Bug' | 'Improvement'
var _issuesStatusFilter = 'open'; // 'open' | 'all' | 'done'
var _editingIssueId = null;

async function loadIssues() {
  try {
    var features = await agolQuery(ARCGIS_CONFIG.issuesUrl);
    ISSUES = features.map(function(f) {
      var a = f.attributes;
      return {
        objectId: a.OBJECTID || a.ObjectID,
        title: a.title || '',
        type: a.type_ || a.type || 'Bug',
        description: a.description || '',
        steps_to_reproduce: a.steps_to_reproduce || '',
        status: a.status || 'Submitted',
        priority: a.priority || 'Medium',
        submitted_by: a.submitted_by || '',
        submitted_date: a.submitted_date || '',
        resolved_date: a.resolved_date || '',
      };
    });
    console.log('[Issues] Loaded', ISSUES.length, 'issues');
    updateIssuesTabCount();
  } catch (err) {
    console.warn('[Issues] Load failed:', err);
    ISSUES = [];
  }
}

function updateIssuesTabCount() {
  var openCount = ISSUES.filter(function(iss) { return iss.status !== 'Done'; }).length;
  var badge = document.getElementById('issues-tab-count');
  if (badge) badge.textContent = openCount > 0 ? openCount : '';
}

function setIssuesFilter(type) {
  _issuesFilter = type;
  document.getElementById('content-area').innerHTML = buildIssuesPage();
}

function setIssuesStatusFilter(status) {
  _issuesStatusFilter = status;
  document.getElementById('content-area').innerHTML = buildIssuesPage();
}

function buildIssuesPage() {
  var filtered = ISSUES.slice();

  // Type filter
  if (_issuesFilter !== 'all') {
    filtered = filtered.filter(function(iss) { return iss.type === _issuesFilter; });
  }

  // Status filter
  if (_issuesStatusFilter === 'open') {
    filtered = filtered.filter(function(iss) { return iss.status !== 'Done'; });
  } else if (_issuesStatusFilter === 'done') {
    filtered = filtered.filter(function(iss) { return iss.status === 'Done'; });
  }

  // Sort: open issues by priority then date, done issues by resolved date
  var priOrder = { High: 0, Medium: 1, Low: 2 };
  filtered.sort(function(a, b) {
    if (a.status === 'Done' && b.status !== 'Done') return 1;
    if (a.status !== 'Done' && b.status === 'Done') return -1;
    if (a.status === 'Done' && b.status === 'Done') return (b.resolved_date || '').localeCompare(a.resolved_date || '');
    var pa = priOrder[a.priority] != null ? priOrder[a.priority] : 1;
    var pb = priOrder[b.priority] != null ? priOrder[b.priority] : 1;
    if (pa !== pb) return pa - pb;
    return (b.submitted_date || '').localeCompare(a.submitted_date || '');
  });

  var openCount = ISSUES.filter(function(iss) { return iss.status !== 'Done'; }).length;
  var bugCount = ISSUES.filter(function(iss) { return iss.type === 'Bug' && iss.status !== 'Done'; }).length;
  var impCount = ISSUES.filter(function(iss) { return iss.type === 'Improvement' && iss.status !== 'Done'; }).length;

  var html = '<div class="issues-page">';

  // Header
  html += '<div class="issues-header">';
  html += '<div class="issues-title">🐛 Issues & Improvements</div>';
  html += '<div class="issues-filters">';
  html += '<button class="issues-pill' + (_issuesFilter === 'all' ? ' active' : '') + '" onclick="setIssuesFilter(\'all\')">All (' + openCount + ')</button>';
  html += '<button class="issues-pill' + (_issuesFilter === 'Bug' ? ' active' : '') + '" onclick="setIssuesFilter(\'Bug\')">🐛 Bugs (' + bugCount + ')</button>';
  html += '<button class="issues-pill' + (_issuesFilter === 'Improvement' ? ' active' : '') + '" onclick="setIssuesFilter(\'Improvement\')">✨ Improvements (' + impCount + ')</button>';
  html += '</div>';
  html += '<div class="issues-filters" style="margin-left:8px;">';
  html += '<button class="issues-pill' + (_issuesStatusFilter === 'open' ? ' active' : '') + '" onclick="setIssuesStatusFilter(\'open\')">Open</button>';
  html += '<button class="issues-pill' + (_issuesStatusFilter === 'all' ? ' active' : '') + '" onclick="setIssuesStatusFilter(\'all\')">All</button>';
  html += '<button class="issues-pill' + (_issuesStatusFilter === 'done' ? ' active' : '') + '" onclick="setIssuesStatusFilter(\'done\')">Done</button>';
  html += '</div>';
  html += '<button class="issues-submit-btn" onclick="openIssueForm()">＋ Report Issue</button>';
  html += '</div>';

  // Issue cards
  if (filtered.length === 0) {
    html += '<div class="issue-empty">';
    html += '<div style="font-size:48px;margin-bottom:12px;">' + (_issuesStatusFilter === 'done' ? '✅' : '🎉') + '</div>';
    html += '<div style="font-weight:700;font-size:16px;color:var(--navy);margin-bottom:4px;">' + (_issuesStatusFilter === 'done' ? 'No resolved issues yet' : 'No open issues!') + '</div>';
    html += '<div>' + (_issuesStatusFilter === 'done' ? 'Resolved issues will appear here.' : 'Everything is running smoothly. Report a bug or suggest an improvement if you spot something.') + '</div>';
    html += '</div>';
  } else {
    html += '<div class="issues-list">';
    filtered.forEach(function(iss) {
      var typeIcon = iss.type === 'Bug' ? '🐛' : '✨';
      var typeClass = iss.type === 'Bug' ? 'issue-type-bug' : 'issue-type-improvement';
      var statusClass = 'issue-status-' + iss.status.replace(/\s/g, '');

      html += '<div class="issue-card">';
      html += '<div class="issue-card-top">';
      html += '<div class="issue-type-icon ' + typeClass + '">' + typeIcon + '</div>';
      html += '<div class="issue-card-body">';
      html += '<div class="issue-card-title">' + esc(iss.title) + '</div>';
      if (iss.description) html += '<div class="issue-card-desc">' + esc(iss.description) + '</div>';
      if (iss.type === 'Bug' && iss.steps_to_reproduce) {
        html += '<div style="font-size:11px;color:#991B1B;background:#FEF2F2;border-radius:6px;padding:6px 10px;margin-bottom:8px;">';
        html += '<span style="font-weight:700;">Steps to reproduce:</span> ' + esc(iss.steps_to_reproduce);
        html += '</div>';
      }
      html += '<div class="issue-card-meta">';
      html += '<span class="issue-status-badge ' + statusClass + '">' + esc(iss.status) + '</span>';
      if (iss.priority) html += '<span class="issue-priority-chip">' + esc(iss.priority) + '</span>';
      if (iss.submitted_by) html += '<span style="color:var(--text-muted);">by ' + esc(iss.submitted_by) + '</span>';
      if (iss.submitted_date) html += '<span style="color:var(--text-muted);">' + esc(iss.submitted_date) + '</span>';
      html += '</div>';
      html += '</div>';

      // Actions
      html += '<div class="issue-card-actions">';
      var statuses = ['Submitted', 'Accepted', 'In Progress', 'User Testing', 'Done'];
      html += '<select class="issue-action-btn" style="padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:#fff;font-size:11px;font-weight:600;font-family:Lato,sans-serif;cursor:pointer;color:var(--navy);" onchange="changeIssueStatus(' + iss.objectId + ',this.value)" onclick="event.stopPropagation()">';
      statuses.forEach(function(s) {
        html += '<option value="' + s + '"' + (iss.status === s ? ' selected' : '') + '>' + s + '</option>';
      });
      html += '</select>';
      html += '<button class="issue-action-btn" onclick="openIssueForm(' + iss.objectId + ')" title="Edit">✏</button>';
      html += '<button class="issue-action-btn" onclick="deleteIssue(' + iss.objectId + ')" title="Delete" style="color:#EF4444;">🗑</button>';
      html += '</div>';

      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function openIssueForm(issueId) {
  _editingIssueId = issueId || null;
  var iss = issueId ? ISSUES.find(function(i) { return i.objectId == issueId; }) : null;

  var titleText = iss ? 'Edit Issue' : 'Report an Issue';
  document.getElementById('issue-form-title').textContent = titleText;

  var html = '<div class="issue-form-field">';
  html += '<label class="issue-form-label">Type</label>';
  html += '<select id="issue-type" class="fm-input" onchange="toggleIssueSteps()">';
  html += '<option value="Bug"' + (iss && iss.type === 'Bug' ? ' selected' : (!iss ? ' selected' : '')) + '>🐛 Bug</option>';
  html += '<option value="Improvement"' + (iss && iss.type === 'Improvement' ? ' selected' : '') + '>✨ Improvement</option>';
  html += '</select></div>';

  html += '<div class="issue-form-field">';
  html += '<label class="issue-form-label">Title</label>';
  html += '<input id="issue-title" class="fm-input" type="text" placeholder="Brief summary of the issue…" value="' + (iss ? esc(iss.title) : '') + '">';
  html += '</div>';

  html += '<div class="issue-form-field">';
  html += '<label class="issue-form-label">Description</label>';
  html += '<textarea id="issue-desc" class="fm-textarea" rows="3" placeholder="What happened? What did you expect?">' + (iss ? esc(iss.description) : '') + '</textarea>';
  html += '</div>';

  var stepsDisplay = (!iss || iss.type === 'Bug') ? '' : 'display:none;';
  html += '<div class="issue-form-field" id="issue-steps-field" style="' + stepsDisplay + '">';
  html += '<label class="issue-form-label">Steps to Reproduce (for bugs)</label>';
  html += '<textarea id="issue-steps" class="fm-textarea" rows="2" placeholder="1. Go to…  2. Click on…  3. See error…">' + (iss ? esc(iss.steps_to_reproduce) : '') + '</textarea>';
  html += '</div>';

  html += '<div class="issue-form-field">';
  html += '<label class="issue-form-label">Priority</label>';
  html += '<select id="issue-priority" class="fm-input">';
  ['High', 'Medium', 'Low'].forEach(function(p) {
    var sel = (iss && iss.priority === p) ? ' selected' : (!iss && p === 'Medium' ? ' selected' : '');
    html += '<option value="' + p + '"' + sel + '>' + p + '</option>';
  });
  html += '</select></div>';

  if (iss) {
    html += '<div class="issue-form-field">';
    html += '<label class="issue-form-label">Status</label>';
    html += '<select id="issue-status" class="fm-input">';
    ['Submitted', 'Accepted', 'In Progress', 'User Testing', 'Done'].forEach(function(s) {
      html += '<option value="' + s + '"' + (iss.status === s ? ' selected' : '') + '>' + s + '</option>';
    });
    html += '</select></div>';
  }

  document.getElementById('issue-form-body').innerHTML = html;
  document.getElementById('issue-form-backdrop').classList.add('open');
}

function toggleIssueSteps() {
  var type = document.getElementById('issue-type').value;
  var stepsField = document.getElementById('issue-steps-field');
  if (stepsField) stepsField.style.display = type === 'Bug' ? '' : 'none';
}

function closeIssueForm() {
  document.getElementById('issue-form-backdrop').classList.remove('open');
  _editingIssueId = null;
}

async function submitIssueForm() {
  var title = (document.getElementById('issue-title').value || '').trim();
  if (!title) { showToast('Please enter a title.', 'warn'); return; }

  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var type = document.getElementById('issue-type').value;
  var statusEl = document.getElementById('issue-status');

  var attrs = {
    title: title,
    type_: type,
    description: (document.getElementById('issue-desc').value || '').trim(),
    steps_to_reproduce: type === 'Bug' ? (document.getElementById('issue-steps').value || '').trim() : '',
    priority: document.getElementById('issue-priority').value,
  };

  if (_editingIssueId) {
    // Edit existing
    attrs.OBJECTID = _editingIssueId;
    if (statusEl) {
      attrs.status = statusEl.value;
      if (statusEl.value === 'Done') attrs.resolved_date = todayStr;
    }
    try {
      await agolApplyEdits(ARCGIS_CONFIG.issuesUrl, { updates: [{ attributes: attrs }] });
      showToast('Issue updated.', 'success');
    } catch (err) {
      showToast('Failed to update: ' + err.message, 'error');
      return;
    }
  } else {
    // New issue
    attrs.status = 'Submitted';
    attrs.submitted_by = Auth.fullName || 'Anonymous';
    attrs.submitted_date = todayStr;
    try {
      await agolApplyEdits(ARCGIS_CONFIG.issuesUrl, { adds: [{ attributes: attrs }] });
      showToast('Issue submitted! Thank you for the feedback.', 'success');
    } catch (err) {
      showToast('Failed to submit: ' + err.message, 'error');
      return;
    }
  }

  closeIssueForm();
  await loadIssues();
  if (currentTab === 'issues') {
    document.getElementById('content-area').innerHTML = buildIssuesPage();
  }
}

async function changeIssueStatus(issueId, newStatus) {
  var iss = ISSUES.find(function(i) { return i.objectId == issueId; });
  if (!iss || iss.status === newStatus) return;

  var attrs = { OBJECTID: issueId, status: newStatus };
  if (newStatus === 'Done') {
    var today = new Date();
    attrs.resolved_date = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  }

  try {
    await agolApplyEdits(ARCGIS_CONFIG.issuesUrl, { updates: [{ attributes: attrs }] });
    showToast('Issue moved to ' + newStatus + '.', 'success');
    await loadIssues();
    if (currentTab === 'issues') {
      document.getElementById('content-area').innerHTML = buildIssuesPage();
    }
  } catch (err) {
    showToast('Failed to update: ' + err.message, 'error');
  }
}

async function deleteIssue(issueId) {
  if (!confirm('Delete this issue? This cannot be undone.')) return;
  try {
    await agolApplyEdits(ARCGIS_CONFIG.issuesUrl, { deletes: [issueId] });
    showToast('Issue deleted.', 'success');
    await loadIssues();
    if (currentTab === 'issues') {
      document.getElementById('content-area').innerHTML = buildIssuesPage();
    }
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}
