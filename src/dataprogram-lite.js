// ─────────────────────────────────────────────────────────────────────
// dataprogram-lite.js — Data Program Lead Console
//
// A simplified standalone page (dataprogram.html) for non-DI team
// leads (Data Architecture, Data Librarian, Emerging Data
// Infrastructure) to manage their team's Data Program projects
// without touching the rest of the main app.
//
// Reuses src/auth.js (OAuth + session), src/agol.js (AGO query +
// applyEdits), src/constants.js, src/util.js (esc helper). All data
// reads/writes go to the same projects feature service the main app
// uses, so edits from either entry point round-trip through the same
// records.
//
// Forward references (resolved by script-load order in
// dataprogram.html): Auth, ARCGIS_CONFIG, agolQuery, agolApplyEdits,
// agolProjectToLocal, ensureAgolToken, ensureValidSession,
// fetchAgolUserInfo, clearAgolToken, agolAuthorizeUrl, esc.
// ─────────────────────────────────────────────────────────────────────

var _lpProjects = [];
var _lpLeadTeam = null;
var _lpFullName = null;
var _lpEditingId = null;          // null = new; otherwise project's objectId
var _lpPartnerDepts = [];
var _lpStatuses = ['Active', 'Scheduled', 'On Hold', 'Complete', 'Canceled', 'Future'];
var _lpActiveFilter = 'all';
var _lpAdminView = false;         // true when an admin has access via isAdmin() rather than data_program_lead_team
var _lpAllTeams = [];             // full Data Program team list (admin team-switcher uses this)

document.addEventListener('DOMContentLoaded', function() {
  // Status-change handler: show/hide the Completion-date field
  var statusSel = document.getElementById('lp-f-status');
  if (statusSel) {
    statusSel.addEventListener('change', function() {
      var wrap = document.getElementById('lp-f-actual-end-wrap');
      if (wrap) wrap.style.display = this.value === 'Complete' ? '' : 'none';
    });
  }
  // Sign-out: clear token, redirect to OAuth (will land back here on success)
  var signOutEl = document.getElementById('lp-signout');
  if (signOutEl) {
    signOutEl.addEventListener('click', function(e) {
      e.preventDefault();
      if (typeof clearAgolToken === 'function') clearAgolToken();
      Auth.loggedIn = false;
      window.location.replace(typeof agolAuthorizeUrl === 'function' ? agolAuthorizeUrl() : window.location.pathname);
    });
  }
  lpBootstrap();
});

async function lpBootstrap() {
  try {
    // 1. Get/refresh ArcGIS token (may redirect to OAuth)
    var token = await ensureAgolToken();
    if (!token) return; // page is redirecting
    Auth.token = token;
    Auth.loggedIn = true;

    // 2. Populate Auth.fullName (used to find the user's member record).
    // If the stored token is invalid (AGO 498), Auth.fullName won't be
    // set — auto-recover by clearing the stale token and bouncing
    // through OAuth to get a fresh one.
    await fetchAgolUserInfo(token);
    if (!Auth.fullName) {
      if (typeof clearAgolToken === 'function') clearAgolToken();
      window.location.replace(agolAuthorizeUrl());
      return;
    }

    // 3. Load the Data Program team list (used by admin team-switcher
    // and as a fallback validator). Falls back to the constant default.
    try {
      var dpFeats = await agolQuery(ARCGIS_CONFIG.appConfigUrl, "config_key='data_program'");
      if (dpFeats && dpFeats.length) {
        var dpParsed = JSON.parse(dpFeats[0].attributes.config_value);
        if (dpParsed && Array.isArray(dpParsed.teams)) _lpAllTeams = dpParsed.teams;
      }
    } catch (e) { /* fall through to default */ }
    if (!_lpAllTeams.length && typeof DATA_PROGRAM_DEFAULT_CONFIG !== 'undefined') {
      _lpAllTeams = (DATA_PROGRAM_DEFAULT_CONFIG.teams || []);
    }

    // 4. Look up the user's member record + their data_program_lead_team
    var safeName = Auth.fullName.replace(/'/g, "''");
    var members = await agolQuery(ARCGIS_CONFIG.teamMembersUrl, "name='" + safeName + "'");
    var leadTeam = null;
    if (members && members.length > 0) {
      var attrs = members[0].attributes || {};
      // Case-insensitive field lookup (AGO field names sometimes differ in case)
      Object.keys(attrs).forEach(function(k) {
        if (k.toLowerCase() === 'data_program_lead_team' && attrs[k]) {
          var v = String(attrs[k]).trim();
          if (v) leadTeam = v;
        }
      });
    }

    // 5. Decide access mode: lead has data_program_lead_team set; admins
    // (Team Leads group) get an admin view that defaults to the first
    // configured team and gets a team-switcher in the header.
    if (leadTeam) {
      _lpLeadTeam = leadTeam;
      _lpAdminView = false;
    } else if (typeof isAdmin === 'function' && isAdmin()) {
      _lpAdminView = true;
      _lpLeadTeam = (_lpAllTeams.length > 0 ? _lpAllTeams[0].name : 'Data Intelligence');
    } else {
      lpShowAccessDenied();
      return;
    }
    _lpFullName = Auth.fullName;

    // 6. Update header
    var soEl = document.getElementById('lp-signout');
    if (soEl) soEl.style.display = '';
    lpRenderHeaderContext();

    // 5. Load projects + partner_depts (parallel)
    await lpReload();

    // 6. Show the main view
    document.getElementById('lp-bootstrap').style.display = 'none';
    document.getElementById('lp-main').style.display = '';
  } catch (err) {
    console.error('[Lite] Bootstrap failed:', err);
    lpShowError('Could not load data. ' + (err && err.message ? err.message : ''));
  }
}

function lpRenderHeaderContext() {
  var ctxEl = document.getElementById('lp-context');
  if (!ctxEl) return;
  if (_lpAdminView) {
    // Admin team-switcher dropdown + admin badge
    var opts = _lpAllTeams.map(function(t) {
      return '<option value="' + esc(t.name) + '"' + (t.name === _lpLeadTeam ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');
    ctxEl.innerHTML =
      '<select id="lp-admin-team" onchange="lpAdminSwitchTeam(this.value)" ' +
        'style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.25);' +
        'border-radius:6px;padding:4px 10px;font-size:18px;font-weight:900;font-family:Lato,sans-serif;cursor:pointer;">' +
        opts +
      '</select>' +
      '<span style="font-size:13px;font-weight:600;opacity:0.85;margin-left:10px;">— ' + esc(Auth.fullName) + '</span>' +
      '<span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;background:rgba(255,219,34,0.25);color:#FFDB22;padding:2px 8px;border-radius:4px;margin-left:10px;">Admin view</span>';
  } else {
    ctxEl.textContent = _lpLeadTeam + ' — ' + Auth.fullName;
  }
}

async function lpAdminSwitchTeam(teamName) {
  if (!_lpAdminView) return;
  _lpLeadTeam = teamName;
  await lpReload();
}

async function lpReload() {
  var safeTeam = _lpLeadTeam.replace(/'/g, "''");
  var [projFeatures, configFeatures] = await Promise.all([
    agolQuery(ARCGIS_CONFIG.projectsUrl, "data_program_team='" + safeTeam + "'"),
    agolQuery(ARCGIS_CONFIG.appConfigUrl, "config_key='partner_depts'")
  ]);
  _lpProjects = (projFeatures || []).map(function(f) { return agolProjectToLocal(f); });
  _lpPartnerDepts = [];
  if (configFeatures && configFeatures.length) {
    try {
      var parsed = JSON.parse(configFeatures[0].attributes.config_value);
      if (Array.isArray(parsed)) _lpPartnerDepts = parsed;
    } catch (e) { /* fall back to empty list */ }
  }
  lpRender();
}

function lpShowAccessDenied() {
  document.getElementById('lp-bootstrap').style.display = 'none';
  document.getElementById('lp-access-denied').style.display = '';
}

function lpShowError(msg) {
  var bs = document.getElementById('lp-bootstrap');
  if (bs) {
    bs.innerHTML = '<h2>Something went wrong</h2>' +
      '<p>' + esc(msg) + '</p>' +
      '<a href="index.html" class="lp-btn-primary">Open the full Tracker</a>';
  }
}

// ─── Filter chips ─────────────────────────────────────────────────────
function lpSetFilter(name) {
  _lpActiveFilter = name;
  document.querySelectorAll('.lp-chip').forEach(function(c) {
    c.classList.toggle('active', c.getAttribute('data-filter') === name);
  });
  lpRender();
}

// ─── Render the project list ──────────────────────────────────────────
function lpRender() {
  var listEl = document.getElementById('lp-list');
  var summaryEl = document.getElementById('lp-list-summary');
  if (!listEl) return;

  var projects = _lpProjects.slice();
  // Apply filter
  if (_lpActiveFilter === 'Active') {
    projects = projects.filter(function(p) { return p.status === 'Active'; });
  } else if (_lpActiveFilter === 'Scheduled') {
    projects = projects.filter(function(p) { return p.status === 'Scheduled'; });
  } else if (_lpActiveFilter === 'Complete') {
    var yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    projects = projects.filter(function(p) {
      return p.status === 'Complete' && p.actual_end && p.actual_end >= yearStart;
    });
  }

  // Empty states
  if (projects.length === 0) {
    if (_lpProjects.length === 0) {
      listEl.innerHTML = '<div class="lp-empty">' +
        '<div class="lp-empty-icon">📋</div>' +
        '<div class="lp-empty-title">No projects yet</div>' +
        '<div class="lp-empty-body">Click <strong>＋ New project</strong> above to add your team&rsquo;s first.</div>' +
        '</div>';
    } else {
      listEl.innerHTML = '<div class="lp-empty">' +
        '<div class="lp-empty-icon">🔍</div>' +
        '<div class="lp-empty-title">No projects match this filter</div>' +
        '<div class="lp-empty-body">Try the <em>All</em> chip above.</div>' +
        '</div>';
    }
    if (summaryEl) summaryEl.textContent = '';
    return;
  }

  // Group by status
  var statusOrder = ['Active', 'Scheduled', 'On Hold', 'Future', 'Complete', 'Canceled'];
  var groups = {};
  projects.forEach(function(p) {
    var s = p.status || 'Other';
    if (!groups[s]) groups[s] = [];
    groups[s].push(p);
  });
  // Sort each group by working_due / end / actual_end ascending
  Object.keys(groups).forEach(function(s) {
    groups[s].sort(function(a, b) {
      var da = a.actual_end || a.working_due || a.end || '9999-12-31';
      var db = b.actual_end || b.working_due || b.end || '9999-12-31';
      return da < db ? -1 : (da > db ? 1 : 0);
    });
  });

  var html = '';
  statusOrder.forEach(function(s) {
    var arr = groups[s];
    if (!arr || arr.length === 0) return;
    html += '<div class="lp-group">';
    html += '<div class="lp-group-head">' + esc(s) + ' (' + arr.length + ')</div>';
    arr.forEach(function(p) {
      var statusClass = (p.status || '').toLowerCase().replace(/\s+/g, '');
      if (statusClass === 'onhold') statusClass = 'hold';
      var endDate = p.actual_end || p.working_due || p.end || '';
      var endLabel = '';
      if (endDate) {
        try {
          var d = new Date(endDate + 'T00:00:00');
          endLabel = (p.actual_end ? 'Completed ' : 'Target ') +
            d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) { endLabel = endDate; }
      } else {
        endLabel = '—';
      }
      var pid = p.project_number || ('#' + p.objectId);
      html += '<div class="lp-row" onclick="lpOpenEdit(' + p.objectId + ')">';
      html +=   '<span class="lp-row-pid">' + esc(pid) + '</span>';
      html +=   '<span class="lp-row-status ' + statusClass + '">' + esc(p.status || '—') + '</span>';
      html +=   '<span class="lp-row-title">' + esc(p.title || '(untitled)') + '</span>';
      html +=   '<span class="lp-row-date">' + esc(endLabel) + '</span>';
      html +=   '<span class="lp-row-edit">Edit ›</span>';
      html += '</div>';
    });
    html += '</div>';
  });

  listEl.innerHTML = html;
  if (summaryEl) summaryEl.textContent = projects.length + ' shown · ' + _lpProjects.length + ' total';
}

// ─── Modal: New / Edit / Save / Delete ────────────────────────────────
function lpPopulateSelects(currentStatus, currentDept) {
  var statusSel = document.getElementById('lp-f-status');
  statusSel.innerHTML = _lpStatuses.map(function(s) {
    return '<option value="' + esc(s) + '"' + (s === currentStatus ? ' selected' : '') + '>' + esc(s) + '</option>';
  }).join('');

  var deptSel = document.getElementById('lp-f-partner-dept');
  var deptOptions = '<option value="">— No partner department —</option>';
  _lpPartnerDepts.forEach(function(d) {
    deptOptions += '<option value="' + esc(d) + '"' + (d === currentDept ? ' selected' : '') + '>' + esc(d) + '</option>';
  });
  // If currentDept isn't in the list (e.g. older value), add it so it stays selected
  if (currentDept && _lpPartnerDepts.indexOf(currentDept) < 0) {
    deptOptions += '<option value="' + esc(currentDept) + '" selected>' + esc(currentDept) + '</option>';
  }
  deptSel.innerHTML = deptOptions;
}

function lpOpenNew() {
  _lpEditingId = null;
  document.getElementById('lp-modal-title').textContent = 'New ' + _lpLeadTeam + ' project';
  document.getElementById('lp-btn-delete').style.display = 'none';
  lpPopulateSelects('Active', '');
  document.getElementById('lp-f-title').value = '';
  document.getElementById('lp-f-start').value = '';
  document.getElementById('lp-f-end').value = '';
  document.getElementById('lp-f-working-due').value = '';
  document.getElementById('lp-f-actual-end').value = '';
  document.getElementById('lp-f-description').value = '';
  document.getElementById('lp-f-actual-end-wrap').style.display = 'none';
  document.getElementById('lp-modal-backdrop').classList.add('open');
  setTimeout(function() { document.getElementById('lp-f-title').focus(); }, 50);
}

function lpOpenEdit(objectId) {
  var p = _lpProjects.find(function(x) { return x.objectId === objectId; });
  if (!p) return;
  _lpEditingId = objectId;
  var pid = p.project_number || ('#' + p.objectId);
  document.getElementById('lp-modal-title').textContent = pid + ' — Edit';
  document.getElementById('lp-btn-delete').style.display = '';
  lpPopulateSelects(p.status, p.partner_dept);
  document.getElementById('lp-f-title').value = p.title || '';
  document.getElementById('lp-f-start').value = p.start || '';
  document.getElementById('lp-f-end').value = p.end || '';
  document.getElementById('lp-f-working-due').value = p.working_due || '';
  document.getElementById('lp-f-actual-end').value = p.actual_end || '';
  document.getElementById('lp-f-description').value = p.description || '';
  document.getElementById('lp-f-actual-end-wrap').style.display = (p.status === 'Complete') ? '' : 'none';
  document.getElementById('lp-modal-backdrop').classList.add('open');
}

function lpCloseModal() {
  document.getElementById('lp-modal-backdrop').classList.remove('open');
  _lpEditingId = null;
}

async function lpSaveProject() {
  if (typeof ensureValidSession === 'function' && !ensureValidSession(function() { lpSaveProject(); })) return;
  var title = document.getElementById('lp-f-title').value.trim();
  if (!title) { lpToast('Title is required.', 'error'); return; }
  var status = document.getElementById('lp-f-status').value;
  var actualEndVal = document.getElementById('lp-f-actual-end').value;
  var attrs = {
    title: title,
    status: status,
    contact: _lpFullName,
    data_program_team: _lpLeadTeam,
    start: document.getElementById('lp-f-start').value || null,
    end_: document.getElementById('lp-f-end').value || null,  // ArcGIS field is end_ (end is reserved)
    working_due: document.getElementById('lp-f-working-due').value || null,
    actual_end: status === 'Complete' ? (actualEndVal || new Date().toISOString().slice(0, 10)) : null,
    partner_dept: document.getElementById('lp-f-partner-dept').value || null,
    description: document.getElementById('lp-f-description').value.trim() || null,
  };
  try {
    var result;
    if (_lpEditingId) {
      attrs.OBJECTID = _lpEditingId;
      result = await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, { updates: [{ attributes: attrs }] });
    } else {
      result = await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, { adds: [{ attributes: attrs }] });
    }
    var ok = (result.updateResults && result.updateResults[0] && result.updateResults[0].success) ||
             (result.addResults && result.addResults[0] && result.addResults[0].success);
    if (!ok) {
      var failedResult = (result.updateResults && result.updateResults[0]) || (result.addResults && result.addResults[0]) || {};
      var msg = (failedResult.error && (failedResult.error.description || failedResult.error.message)) || 'Save returned failure.';
      throw new Error(msg);
    }
    lpToast(_lpEditingId ? 'Project updated.' : 'Project created.', 'success');
    lpCloseModal();
    await lpReload();
  } catch (err) {
    console.error('[Lite] Save failed:', err);
    lpToast('Save failed: ' + (err.message || 'unknown error'), 'error');
  }
}

async function lpDeleteProject() {
  if (!_lpEditingId) return;
  if (!confirm('Permanently delete this project? This cannot be undone.')) return;
  if (typeof ensureValidSession === 'function' && !ensureValidSession(function() { lpDeleteProject(); })) return;
  try {
    var result = await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, { deletes: [_lpEditingId] });
    var ok = result.deleteResults && result.deleteResults[0] && result.deleteResults[0].success;
    if (!ok) throw new Error('Delete returned failure.');
    lpToast('Project deleted.', 'success');
    lpCloseModal();
    await lpReload();
  } catch (err) {
    console.error('[Lite] Delete failed:', err);
    lpToast('Delete failed: ' + (err.message || 'unknown error'), 'error');
  }
}

// ─── Toast ────────────────────────────────────────────────────────────
function lpToast(msg, kind) {
  var el = document.createElement('div');
  el.className = 'lp-toast ' + (kind || 'info');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 3200);
  setTimeout(function() { if (el.parentNode) el.remove(); }, 3600);
}

// Function used by the session-expired modal (auth.js triggers this)
function showToast(msg, kind) { lpToast(msg, kind); }
