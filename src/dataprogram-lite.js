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
var _lpFullName = null;
var _lpEditingId = null;          // null = new; otherwise project's objectId
var _lpPartnerDepts = [];
var _lpStatuses = ['Active', 'Scheduled', 'On Hold', 'Complete', 'Canceled', 'Future'];
var _lpActiveFilter = 'all';      // status filter chips
var _lpRole = 'viewer';           // 'admin' | 'lead' | 'viewer' — drives create/edit UI
var _lpMyTeam = null;             // Set only when _lpRole === 'lead' (the team they own)
var _lpFilterTeam = 'all';        // 'all' or a specific team name — drives the project list query
var _lpAllTeams = [];             // full Data Program team list (header dropdown options)
var _lpMembers = [];              // sorted list of active team-member names for the Contact dropdown

document.addEventListener('DOMContentLoaded', function() {
  // Show the app version next to the title — pulled from APP_VERSION
  // (constants.js) so it stays in sync with each deploy.
  var verEl = document.getElementById('lp-version');
  if (verEl && typeof APP_VERSION !== 'undefined') {
    verEl.textContent = '· v' + APP_VERSION;
  }
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

    // 4. Load all active team members. We need this for two things:
    // (a) find the signed-in user's record to read their
    //     data_program_lead_team flag, and
    // (b) populate the Contact dropdown in the project edit form.
    var allMembers = await agolQuery(ARCGIS_CONFIG.teamMembersUrl, "1=1");
    var activeMembers = (allMembers || []).filter(function(f) {
      var a = f.attributes || {};
      return a.active !== 'false' && a.active !== false && a.active !== 0;
    });
    _lpMembers = activeMembers
      .map(function(f) { return (f.attributes || {}).name; })
      .filter(Boolean)
      .sort();
    var safeNameLc = Auth.fullName.toLowerCase();
    var myMember = activeMembers.find(function(f) {
      var nm = (f.attributes || {}).name || '';
      return nm.toLowerCase() === safeNameLc;
    });
    var leadTeam = null;
    if (myMember) {
      var attrs = myMember.attributes || {};
      Object.keys(attrs).forEach(function(k) {
        if (k.toLowerCase() === 'data_program_lead_team' && attrs[k]) {
          var v = String(attrs[k]).trim();
          if (v) leadTeam = v;
        }
      });
    }

    // 5. Determine role. The page is open to any authenticated user;
    // role just controls who can create / edit. Default view (filter)
    // is "all teams" for everyone, including leads — they can scope
    // down to their own team via the dropdown.
    if (leadTeam) {
      _lpRole = 'lead';
      _lpMyTeam = leadTeam;
    } else if (typeof isAdmin === 'function' && isAdmin()) {
      _lpRole = 'admin';
    } else {
      _lpRole = 'viewer';
    }
    _lpFullName = Auth.fullName;
    _lpFilterTeam = 'all';

    // 6. Update header + toolbar visibility
    var soEl = document.getElementById('lp-signout');
    if (soEl) soEl.style.display = '';
    lpRenderHeaderContext();
    lpUpdateNewButton();

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
  // Team filter dropdown — always shown, "All teams" option first.
  var opts = '<option value="all"' + (_lpFilterTeam === 'all' ? ' selected' : '') + '>All teams</option>';
  opts += _lpAllTeams.map(function(t) {
    return '<option value="' + esc(t.name) + '"' + (t.name === _lpFilterTeam ? ' selected' : '') + '>' + esc(t.name) + '</option>';
  }).join('');
  var dropdown = '<select id="lp-filter-team" onchange="lpSwitchFilterTeam(this.value)" ' +
    'style="background:rgba(255,255,255,0.1);color:white;border:1px solid rgba(255,255,255,0.25);' +
    'border-radius:6px;padding:4px 10px;font-size:18px;font-weight:900;font-family:Lato,sans-serif;cursor:pointer;">' +
    opts + '</select>';
  var nameLabel = '<span style="font-size:13px;font-weight:600;opacity:0.85;margin-left:10px;">— ' + esc(Auth.fullName) + '</span>';
  // Role badge (admin / lead). Viewers get no badge.
  var roleBadge = '';
  if (_lpRole === 'admin') {
    roleBadge = '<span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;background:rgba(255,219,34,0.25);color:#FFDB22;padding:2px 8px;border-radius:4px;margin-left:10px;">Admin</span>';
  } else if (_lpRole === 'lead') {
    roleBadge = '<span style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;background:rgba(131,172,22,0.3);color:#83AC16;padding:2px 8px;border-radius:4px;margin-left:10px;">' + esc(_lpMyTeam) + ' Lead</span>';
  }
  ctxEl.innerHTML = dropdown + nameLabel + roleBadge;
}

async function lpSwitchFilterTeam(val) {
  _lpFilterTeam = val;
  lpUpdateNewButton();
  await lpReload();
}

function lpUpdateNewButton() {
  var btn = document.getElementById('lp-btn-new');
  if (!btn) return;
  if (_lpRole === 'viewer') {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  // Admins viewing 'all teams' need to pick a specific team before
  // creating, since each project must belong to one team. Leads always
  // create for their own team regardless of filter.
  if (_lpRole === 'admin' && _lpFilterTeam === 'all') {
    btn.disabled = true;
    btn.title = 'Pick a specific team in the dropdown above first.';
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  } else {
    btn.disabled = false;
    btn.title = '';
    btn.style.opacity = '';
    btn.style.cursor = '';
  }
}

function lpCanEditProject(p) {
  if (_lpRole === 'admin') return true;
  if (_lpRole === 'lead' && p && p.is_data_program && p.owning_team === _lpMyTeam) return true;
  return false;
}

async function lpReload() {
  // 'all' filter → fetch every Data Program project. Otherwise filter to
  // is_data_program=1 AND the selected owning_team. is_data_program is now
  // an explicit stored flag (set by forms / by the 2026-05 backfill).
  var query;
  if (_lpFilterTeam === 'all') {
    query = "is_data_program=1";
  } else {
    var safeTeam = _lpFilterTeam.replace(/'/g, "''");
    query = "is_data_program=1 AND owning_team='" + safeTeam + "'";
  }
  var [projFeatures, configFeatures] = await Promise.all([
    agolQuery(ARCGIS_CONFIG.projectsUrl, query),
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
      var bodyMsg;
      if (_lpRole === 'viewer') {
        bodyMsg = 'No Data Program projects' + (_lpFilterTeam !== 'all' ? ' for ' + esc(_lpFilterTeam) : '') + ' yet.';
      } else if (_lpRole === 'admin' && _lpFilterTeam === 'all') {
        bodyMsg = 'Pick a specific team in the dropdown above, then click <strong>＋ New project</strong> to add the first.';
      } else {
        bodyMsg = 'Click <strong>＋ New project</strong> above to add the first.';
      }
      listEl.innerHTML = '<div class="lp-empty">' +
        '<div class="lp-empty-icon"><svg class="icon" aria-hidden="true"><use href="#ph-clipboard-text"></use></svg></div>' +
        '<div class="lp-empty-title">No projects yet</div>' +
        '<div class="lp-empty-body">' + bodyMsg + '</div>' +
        '</div>';
    } else {
      listEl.innerHTML = '<div class="lp-empty">' +
        '<div class="lp-empty-icon"><svg class="icon" aria-hidden="true"><use href="#ph-magnifying-glass"></use></svg></div>' +
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
      // When viewing 'all teams', surface each project's team via a small
      // chip (color from the configured team). Helps disambiguate at a glance.
      var teamChip = '';
      if (_lpFilterTeam === 'all' && p.is_data_program && p.owning_team) {
        var teamCfg = _lpAllTeams.find(function(t) { return t.name === p.owning_team; });
        var color = (teamCfg && teamCfg.color) || '#6B7280';
        var shortId = (teamCfg && teamCfg.id) || p.owning_team;
        teamChip = ' <span style="font-size:10px;font-weight:800;letter-spacing:0.04em;background:' + color + ';color:white;padding:2px 8px;border-radius:999px;margin-right:6px;" title="' + esc(p.owning_team) + '">' + esc(shortId) + '</span>';
      }
      // Edit affordance: viewers / leads-on-other-team can still click to view (read-only modal)
      var canEdit = lpCanEditProject(p);
      var actionLabel = canEdit ? 'Edit ›' : 'View ›';
      html += '<div class="lp-row" onclick="lpOpenEdit(' + p.objectId + ')">';
      html +=   '<span class="lp-row-pid">' + esc(pid) + '</span>';
      html +=   '<span class="lp-row-status ' + statusClass + '">' + esc(p.status || '—') + '</span>';
      html +=   '<span class="lp-row-title">' + teamChip + esc(p.title || '(untitled)') + '</span>';
      html +=   '<span class="lp-row-date">' + esc(endLabel) + '</span>';
      html +=   '<span class="lp-row-edit">' + actionLabel + '</span>';
      html += '</div>';
    });
    html += '</div>';
  });

  listEl.innerHTML = html;
  if (summaryEl) summaryEl.textContent = projects.length + ' shown · ' + _lpProjects.length + ' total';
}

// ─── Modal: New / Edit / Save / Delete ────────────────────────────────

// Assign the next P-NNN project_number on create. Queries AGO globally
// rather than computing from _lpProjects, which typically holds only
// one team's subset — local max would collide with numbers in teams
// the Lite app hasn't loaded. Mirrors getNextProjectNumber() in
// src/tabs/projects-tasks.js.
async function lpGetNextProjectNumber() {
  var features = await agolQuery(ARCGIS_CONFIG.projectsUrl, "project_number LIKE 'P-%'");
  var maxNum = 0;
  (features || []).forEach(function(f) {
    var pn = f.attributes && f.attributes.project_number;
    if (!pn) return;
    var m = String(pn).match(/^P-(\d+)$/);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  return 'P-' + String(maxNum + 1).padStart(3, '0');
}

function lpClearFieldErrors() {
  document.querySelectorAll('#lp-modal-backdrop .err').forEach(function(el) {
    el.classList.remove('err');
  });
}

function lpMarkFieldError(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('err');
}

// Build the dp_goal checkbox group. currentVal is the comma-separated
// string from the project record (e.g. "Establish Data Governance,
// Build Data Literacy and Culture") or null.
function lpPopulateDpGoals(currentVal) {
  var container = document.getElementById('lp-f-dp-goals');
  if (!container) return;
  var goals = (typeof FM_DP_GOALS !== 'undefined') ? FM_DP_GOALS : [];
  // Drop the 'None' sentinel — empty checkbox group already means "none"
  goals = goals.filter(function(g) { return g && g.trim() !== 'None'; });
  var selected = (currentVal || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  container.innerHTML = goals.map(function(g) {
    var checked = selected.indexOf(g) >= 0 ? ' checked' : '';
    return '<label><input type="checkbox" value="' + esc(g) + '"' + checked + '><span>' + esc(g) + '</span></label>';
  }).join('');
}

function lpCollectDpGoals() {
  var boxes = document.querySelectorAll('#lp-f-dp-goals input[type="checkbox"]:checked');
  var values = [];
  boxes.forEach(function(cb) { values.push(cb.value); });
  return values.length > 0 ? values.join(', ') : null;
}

function lpPopulateSelects(currentStatus, currentDept, currentContact) {
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

  // Contact (Project lead) — pulled from active team_members on bootstrap
  var contactSel = document.getElementById('lp-f-contact');
  var contactOptions = '<option value="">— Unassigned —</option>';
  _lpMembers.forEach(function(n) {
    contactOptions += '<option value="' + esc(n) + '"' + (n === currentContact ? ' selected' : '') + '>' + esc(n) + '</option>';
  });
  // Preserve out-of-list values so existing records don't lose their contact
  if (currentContact && _lpMembers.indexOf(currentContact) < 0) {
    contactOptions += '<option value="' + esc(currentContact) + '" selected>' + esc(currentContact) + ' (not in team list)</option>';
  }
  contactSel.innerHTML = contactOptions;
}

// Toggle modal fields and Save/Delete visibility based on whether the
// current user can edit the open record. Read-only mode (viewers, or
// leads looking at another team's project) shows the same form but
// with all inputs disabled and only Cancel available.
function lpSetModalEditability(editable) {
  ['lp-f-title','lp-f-status','lp-f-contact','lp-f-partner-dept','lp-f-start','lp-f-end','lp-f-working-due','lp-f-actual-end','lp-f-problem-statement','lp-f-description','lp-f-definition-of-done','lp-f-key-results'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.disabled = !editable;
  });
  // Disable / enable the dp_goal checkbox group too
  document.querySelectorAll('#lp-f-dp-goals input[type="checkbox"]').forEach(function(cb) {
    cb.disabled = !editable;
  });
  var saveBtn = document.querySelector('.lp-btn-save');
  if (saveBtn) saveBtn.style.display = editable ? '' : 'none';
  var delBtn = document.getElementById('lp-btn-delete');
  if (delBtn) delBtn.style.display = (editable && _lpEditingId) ? '' : 'none';
  var cancelBtn = document.querySelector('.lp-btn-cancel');
  if (cancelBtn) cancelBtn.textContent = editable ? 'Cancel' : 'Close';
}

function lpOpenNew() {
  if (_lpRole === 'viewer') return;
  if (_lpRole === 'admin' && _lpFilterTeam === 'all') {
    lpToast('Pick a specific team in the dropdown above first.', 'info');
    return;
  }
  _lpEditingId = null;
  // Determine the team this new project will be created for
  var targetTeam = (_lpRole === 'lead') ? _lpMyTeam : _lpFilterTeam;
  document.getElementById('lp-modal-title').textContent = 'New ' + targetTeam + ' project';
  // Default Contact to the current user (they can change it via dropdown)
  lpPopulateSelects('Active', '', _lpFullName);
  document.getElementById('lp-f-title').value = '';
  document.getElementById('lp-f-start').value = '';
  document.getElementById('lp-f-end').value = '';
  document.getElementById('lp-f-working-due').value = '';
  document.getElementById('lp-f-actual-end').value = '';
  document.getElementById('lp-f-problem-statement').value = '';
  document.getElementById('lp-f-description').value = '';
  document.getElementById('lp-f-definition-of-done').value = '';
  document.getElementById('lp-f-key-results').value = '';
  lpClearFieldErrors();
  lpPopulateDpGoals(null);
  document.getElementById('lp-f-actual-end-wrap').style.display = 'none';
  lpSetModalEditability(true);
  document.getElementById('lp-modal-backdrop').classList.add('open');
  setTimeout(function() { document.getElementById('lp-f-title').focus(); }, 50);
}

function lpOpenEdit(objectId) {
  var p = _lpProjects.find(function(x) { return x.objectId === objectId; });
  if (!p) return;
  _lpEditingId = objectId;
  var pid = p.project_number || ('#' + p.objectId);
  var canEdit = lpCanEditProject(p);
  var titleSuffix = canEdit ? ' — Edit' : ' — View';
  // Show the team in the title when filter is 'all' so it's clear which team owns this
  var teamPrefix = (_lpFilterTeam === 'all' && p.is_data_program && p.owning_team) ? ' (' + p.owning_team + ')' : '';
  document.getElementById('lp-modal-title').textContent = pid + teamPrefix + titleSuffix;
  lpPopulateSelects(p.status, p.partner_dept, p.contact);
  document.getElementById('lp-f-title').value = p.title || '';
  document.getElementById('lp-f-start').value = p.start || '';
  document.getElementById('lp-f-end').value = p.end || '';
  document.getElementById('lp-f-working-due').value = p.working_due || '';
  document.getElementById('lp-f-actual-end').value = p.actual_end || '';
  document.getElementById('lp-f-problem-statement').value = p.problem_statement || '';
  document.getElementById('lp-f-description').value = p.description || '';
  document.getElementById('lp-f-definition-of-done').value = p.definition_of_done || '';
  document.getElementById('lp-f-key-results').value = p.key_results || '';
  lpClearFieldErrors();
  lpPopulateDpGoals(p.dp_goal);
  document.getElementById('lp-f-actual-end-wrap').style.display = (p.status === 'Complete') ? '' : 'none';
  lpSetModalEditability(canEdit);
  document.getElementById('lp-modal-backdrop').classList.add('open');
}

function lpCloseModal() {
  document.getElementById('lp-modal-backdrop').classList.remove('open');
  _lpEditingId = null;
}

async function lpSaveProject() {
  if (_lpRole === 'viewer') return;
  if (typeof ensureValidSession === 'function' && !ensureValidSession(function() { lpSaveProject(); })) return;
  // Required-field validation — mirrors the idea-submission form
  // (modals/idea.js openSimpleIdeaForm): Title, Project lead, Problem statement.
  lpClearFieldErrors();
  var title = document.getElementById('lp-f-title').value.trim();
  var contact = document.getElementById('lp-f-contact').value;
  var problemStmt = document.getElementById('lp-f-problem-statement').value.trim();
  var missing = [];
  if (!title)       { missing.push('Title');             lpMarkFieldError('lp-f-title'); }
  if (!contact)     { missing.push('Project lead');      lpMarkFieldError('lp-f-contact'); }
  if (!problemStmt) { missing.push('Problem statement'); lpMarkFieldError('lp-f-problem-statement'); }
  if (missing.length) {
    lpToast('Required: ' + missing.join(', '), 'error');
    return;
  }
  var status = document.getElementById('lp-f-status').value;
  var actualEndVal = document.getElementById('lp-f-actual-end').value;
  // Build using local field names (start, end) — localToAgolProject
  // routes them through PROJECT_FIELD_MAP to the schema names
  // (start_date, end_date). Same pattern the main app uses.
  var local = {
    title: title,
    status: status,
    contact: contact,
    start: document.getElementById('lp-f-start').value || null,
    end: document.getElementById('lp-f-end').value || null,
    working_due: document.getElementById('lp-f-working-due').value || null,
    actual_end: status === 'Complete' ? (actualEndVal || new Date().toISOString().slice(0, 10)) : null,
    partner_dept: document.getElementById('lp-f-partner-dept').value || null,
    problem_statement: problemStmt,
    description: document.getElementById('lp-f-description').value.trim() || null,
    definition_of_done: document.getElementById('lp-f-definition-of-done').value.trim() || null,
    key_results: document.getElementById('lp-f-key-results').value.trim() || null,
    dp_goal: lpCollectDpGoals(),
  };
  if (!_lpEditingId) {
    // New: stamp owning_team based on role/filter, and assign the next
    // project_number. We query AGO directly because _lpProjects typically
    // holds only one team's subset — computing the max locally would collide
    // with numbers in teams we haven't loaded.
    local.owning_team = (_lpRole === 'lead') ? _lpMyTeam : _lpFilterTeam;
    try {
      local.project_number = await lpGetNextProjectNumber();
    } catch (err) {
      console.error('[Lite] Project-number assignment failed:', err);
      lpToast('Could not assign a project number: ' + (err.message || 'unknown error'), 'error');
      return;
    }
  }
  // Lite only manages Data Program projects, so always stamp is_data_program=1
  // so the lpReload "All teams" query (is_data_program=1) finds the record.
  local.is_data_program = 1;
  var attrs = localToAgolProject(local);
  if (_lpEditingId) attrs.ObjectId = _lpEditingId;  // capital-O is the real schema PK; projection only skips lowercase aliases
  try {
    var result;
    if (_lpEditingId) {
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
