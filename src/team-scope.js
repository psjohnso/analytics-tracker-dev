// Team scoping (multi-team, soft in-app isolation) — Phase 1.
// When team scoping is OFF (the default), every helper is a no-op and the app
// behaves exactly like the original single-team build. When ON, non-admins are
// locked to their own team; admins can preview/switch.
//
// Classic script: the functions/vars below are globals shared with the rest of
// the app. Relied-on globals are resolved at call time: RESOURCES_DATA, PROJECTS,
// TASKS, getProjectByNumber, Auth, isAdmin. The enabled flag + home team are set
// from app_config 'team_scoping' in applyAppConfig (src/config.js).

var HOME_TEAM = 'Data Intelligence';   // legacy/home team; a blank owning_team maps here. Overridable via app_config.
var _teamScopingEnabled = false;        // global rollout flag (app_config 'team_scoping')
var _teamScopeActive = false;           // resolved for this session (global flag OR admin preview)
var CURRENT_TEAM = null;                // the team currently in view; null = no scoping

// Team-name matching is case- and whitespace-insensitive. Team names live in
// several places (project owning_team, member team, the configured team list,
// and admin-typed URL params), so exact matching silently breaks on casing /
// stray spaces — compare normalized instead.
function _normTeam(t) { return (t == null ? '' : String(t)).trim().toLowerCase(); }
function sameTeam(a, b) { return _normTeam(a) === _normTeam(b); }

// Resolve a (possibly mis-cased) team name to its canonical casing as stored in
// the data/config, so CURRENT_TEAM is clean for display and matching. Falls back
// to the input unchanged if no known team matches.
function canonicalTeam(name) {
  var n = _normTeam(name);
  if (!n) return name;
  var pool = [];
  if (typeof _customOwningTeams !== 'undefined' && Array.isArray(_customOwningTeams)) pool = pool.concat(_customOwningTeams);
  if (typeof PROJECTS !== 'undefined' && PROJECTS) PROJECTS.forEach(function (p) { if (p && p.owning_team) pool.push(p.owning_team); });
  if (typeof RESOURCES_DATA !== 'undefined' && RESOURCES_DATA && RESOURCES_DATA.people) {
    Object.keys(RESOURCES_DATA.people).forEach(function (k) { var t = RESOURCES_DATA.people[k].team; if (t) pool.push(t); });
  }
  for (var i = 0; i < pool.length; i++) { if (_normTeam(pool[i]) === n) return String(pool[i]).trim(); }
  return String(name).trim();
}

// Admin team-scope selection (the switcher) persists in localStorage.
// '' / null = "All teams" (no scope). Admins control their own lens regardless of
// the global flag; non-admins are scoped to their own team only when the flag is on.
var _teamScopeBooted = false;
var TEAM_SCOPE_STORAGE_KEY = 'tracker_admin_team_scope';

function _adminTeamSelGet() {
  try { return localStorage.getItem(TEAM_SCOPE_STORAGE_KEY) || ''; } catch (e) { return ''; }
}
function _adminTeamSelSet(team) {
  try {
    if (team) localStorage.setItem(TEAM_SCOPE_STORAGE_KEY, team);
    else localStorage.removeItem(TEAM_SCOPE_STORAGE_KEY);
  } catch (e) {}
}

// Resolve whether (and to what) we scope this session. Call after auth +
// resources + app_config have loaded; safe to re-call (admin switch / preview).
function initTeamScope() {
  // Use the durable group flag, not isAdmin(): while an admin impersonates a
  // lead/member, isAdmin() is false but the admin team lens must still apply.
  var isRealAdmin = (typeof Auth !== 'undefined' && Auth && Auth.isTeamLead);
  // On first boot, fold a ?team=/?teamscope= deep-link into the stored admin
  // selection, then strip it from the URL so later switcher changes win.
  if (!_teamScopeBooted) {
    _teamScopeBooted = true;
    if (isRealAdmin) {
      var params = null;
      try { params = new URLSearchParams(window.location.search); } catch (e) {}
      if (params && (params.has('team') || params.has('teamscope'))) {
        var who0 = (typeof Auth !== 'undefined' && Auth) ? Auth.fullName : null;
        var deep = params.has('team') ? String(params.get('team') || '').trim() : (personTeam(who0) || '');
        _adminTeamSelSet(deep);
        try {
          params.delete('team'); params.delete('teamscope');
          var qs = params.toString();
          history.replaceState(history.state, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
        } catch (e) {}
      }
    }
  }
  if (isRealAdmin) {
    // Admin lens = switcher selection. Empty = All teams (no scope).
    var sel = _adminTeamSelGet();
    if (sel) { CURRENT_TEAM = canonicalTeam(sel); _teamScopeActive = !!CURRENT_TEAM; }
    else { CURRENT_TEAM = null; _teamScopeActive = false; }
    return;
  }
  // Non-admin: scoped to own team only when the global rollout flag is on.
  if (!_teamScopingEnabled) { CURRENT_TEAM = null; _teamScopeActive = false; return; }
  var who = (typeof Auth !== 'undefined' && Auth) ? Auth.fullName : null;
  CURRENT_TEAM = canonicalTeam(personTeam(who)) || null;
  _teamScopeActive = !!CURRENT_TEAM;
}

// Switch the admin's team lens and re-render. team = '' → All teams (no scope).
function setTeamScope(team) {
  team = (team && String(team).trim()) || '';
  _adminTeamSelSet(team);
  // "Lead" requires a specific team — drop back to admin (or member) when All.
  if (!team && typeof Auth !== 'undefined' && Auth && Auth.actAsRole === 'lead') {
    Auth.actAsRole = 'admin'; Auth.previewMode = false;
  }
  initTeamScope();
  if (typeof applyOptionalTabVisibility === 'function') applyOptionalTabVisibility();
  if (typeof renderTeamSwitcher === 'function') renderTeamSwitcher();
  // Mark dirty so render() rebuilds the header stats + sidebar filters (those are
  // gated on Internal.dataDirty); otherwise a team switch leaves stale counts.
  if (typeof markDataDirty === 'function') markDataDirty();
  if (typeof render === 'function') render();
}

// Admin "act as" role for the current team: 'admin' | 'lead' | 'member'.
// Lead/member de-admin the session so the admin experiences that role; lead also
// requires a specific team (its lead team = CURRENT_TEAM).
function setActAsRole(role) {
  role = (role === 'lead' || role === 'member') ? role : 'admin';
  if (role === 'lead' && !CURRENT_TEAM) role = 'admin'; // can't lead "All teams"
  if (typeof Auth !== 'undefined' && Auth) {
    Auth.actAsRole = role;
    Auth.previewMode = (role !== 'admin'); // keep legacy previewMode consumers in sync
  }
  if (typeof applyOptionalTabVisibility === 'function') applyOptionalTabVisibility();
  initTeamScope();
  if (typeof renderTeamSwitcher === 'function') renderTeamSwitcher();
  if (typeof markDataDirty === 'function') markDataDirty();
  if (typeof render === 'function') render();
}

function isTeamScopingOn() { return _teamScopeActive && !!CURRENT_TEAM; }

// The team a project effectively belongs to (blank/empty → HOME_TEAM).
function effectiveTeam(p) {
  if (!p) return HOME_TEAM;
  var t = (p.owning_team == null) ? '' : String(p.owning_team).trim();
  return t || HOME_TEAM;
}

// The team a person belongs to (unknown/blank → HOME_TEAM).
function personTeam(name) {
  if (!name) return HOME_TEAM;
  if (typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return HOME_TEAM;
  var p = RESOURCES_DATA.people[name];
  if (!p) return HOME_TEAM;
  var t = (p.team == null) ? '' : String(p.team).trim();
  return t || HOME_TEAM;
}

// The team a task belongs to, derived via its parent project (no team field on tasks).
function taskTeam(t) {
  if (!t) return HOME_TEAM;
  var proj = (typeof getProjectByNumber === 'function') ? getProjectByNumber(t.project_number) : null;
  return proj ? effectiveTeam(proj) : HOME_TEAM;
}

// Filter predicates — return true (no-op) when scoping is off.
function inCurrentTeamProject(p) { return !isTeamScopingOn() || sameTeam(effectiveTeam(p), CURRENT_TEAM); }
function inCurrentTeamTask(t)    { return !isTeamScopingOn() || sameTeam(taskTeam(t), CURRENT_TEAM); }
function inCurrentTeamPerson(n)  { return !isTeamScopingOn() || sameTeam(personTeam(n), CURRENT_TEAM); }

// True if the team (default CURRENT_TEAM) is a Data Program team. Used to hide
// DP-specific views for non-DP teams. Unscoped / All teams → true (show DP).
function isDataProgramTeam(team) {
  if (typeof team === 'undefined') team = CURRENT_TEAM;
  if (!team) return true;
  var dp = (typeof getDataProgramTeams === 'function') ? getDataProgramTeams() : [];
  return dp.some(function (t) {
    var n = (t && t.name) ? t.name : t;
    return (typeof sameTeam === 'function') ? sameTeam(n, team) : n === team;
  });
}

// List builders — return the full set when scoping is off.
function teamProjects(team) {
  if (typeof PROJECTS === 'undefined' || !PROJECTS) return [];
  if (!isTeamScopingOn()) return PROJECTS.slice();
  team = team || CURRENT_TEAM;
  return PROJECTS.filter(function (p) { return sameTeam(effectiveTeam(p), team); });
}
function teamTasks(team) {
  if (typeof TASKS === 'undefined' || !TASKS) return [];
  if (!isTeamScopingOn()) return TASKS.slice();
  team = team || CURRENT_TEAM;
  return TASKS.filter(function (t) { return sameTeam(taskTeam(t), team); });
}
// Names of people on a team (all people when scoping is off). Used by capacity
// views in Phase 2 ("follow the person").
function teamPeopleNames(team) {
  if (typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return [];
  var names = Object.keys(RESOURCES_DATA.people);
  if (!isTeamScopingOn()) return names;
  team = team || CURRENT_TEAM;
  return names.filter(function (n) { return sameTeam(personTeam(n), team); });
}

// ── Admin team switcher (header) ──────────────────────────────────────
function _tsEsc(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s); }

// All known team names (configured list + data + home team), sorted.
function allKnownTeams() {
  var set = {};
  function add(t) { if (t != null && String(t).trim()) set[String(t).trim()] = true; }
  if (typeof _customOwningTeams !== 'undefined' && Array.isArray(_customOwningTeams)) _customOwningTeams.forEach(add);
  if (typeof PROJECTS !== 'undefined' && PROJECTS) PROJECTS.forEach(function (p) { if (p) add(p.owning_team); });
  if (typeof RESOURCES_DATA !== 'undefined' && RESOURCES_DATA && RESOURCES_DATA.people) {
    Object.keys(RESOURCES_DATA.people).forEach(function (k) { add(RESOURCES_DATA.people[k].team); });
  }
  add(HOME_TEAM);
  return Object.keys(set).sort();
}

// Render the admin-only "view as team" switcher into the header. Hidden (no-op)
// for non-admins / signed-out; reflects the current selection.
function renderTeamSwitcher() {
  var wrap = (typeof document !== 'undefined') ? document.getElementById('team-switcher-wrap') : null;
  if (!wrap) return;
  // Gate on the durable group flag so the controls stay visible (and the admin
  // can switch back) even while impersonating a lead/member.
  var isRealAdmin = (typeof Auth !== 'undefined' && Auth && Auth.isTeamLead);
  var loggedIn = !(typeof Auth !== 'undefined' && Auth) || Auth.loggedIn !== false;
  if (!isRealAdmin || !loggedIn) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  var cur = CURRENT_TEAM || '';
  // The header is pinned dark in the Dark theme, and --navy lightens there, so the
  // light-on-white select styling becomes unreadable. Branch on the dark theme.
  var _tsDark = (typeof document !== 'undefined' && document.body && document.body.dataset.theme === 'dark');
  var sStyle = _tsDark
    ? 'font-size:11px;font-weight:700;font-family:Lato,sans-serif;color:#F2F4F7;background:#2A2F38;border:1px solid #4A5360;border-radius:4px;padding:4px 8px;cursor:pointer;'
    : 'font-size:11px;font-weight:700;font-family:Lato,sans-serif;color:var(--navy);background:rgba(255,255,255,0.92);border:1px solid rgba(255,255,255,0.5);border-radius:4px;padding:4px 8px;cursor:pointer;';
  var optStyle = _tsDark ? 'color:#F2F4F7;background:#2A2F38;' : 'color:#111;background:var(--white);';

  // Team lens — grouped by department (optgroups) when an org structure is set.
  function _tsOption(t) {
    var sel = cur && ((typeof sameTeam === 'function') ? sameTeam(t, cur) : (t === cur));
    return '<option value="' + _tsEsc(t) + '" style="' + optStyle + '"' + (sel ? ' selected' : '') + '>' + _tsEsc(t) + '</option>';
  }
  var opts = '<option value=""' + (cur ? '' : ' selected') + '>All teams</option>';
  var teams = allKnownTeams();
  var deptOf = (typeof departmentOfTeam === 'function') ? departmentOfTeam : null;
  var byDept = {}, depOrder = [], ungrouped = [];
  teams.forEach(function (t) {
    var d = deptOf ? deptOf(t) : null;
    if (d && d.name) {
      if (!byDept[d.name]) { byDept[d.name] = []; depOrder.push(d.name); }
      byDept[d.name].push(t);
    } else {
      ungrouped.push(t);
    }
  });
  if (depOrder.length) {
    depOrder.sort();
    depOrder.forEach(function (dn) {
      opts += '<optgroup label="' + _tsEsc(dn) + '">';
      byDept[dn].forEach(function (t) { opts += _tsOption(t); });
      opts += '</optgroup>';
    });
    if (ungrouped.length) {
      opts += '<optgroup label="Other">';
      ungrouped.forEach(function (t) { opts += _tsOption(t); });
      opts += '</optgroup>';
    }
  } else {
    teams.forEach(function (t) { opts += _tsOption(t); });
  }
  var html = '<select title="View as team — admin only" onchange="setTeamScope(this.value)" style="' + sStyle + 'max-width:170px;">' + opts + '</select>';

  // Act-as role: Admin always; Lead only with a specific team; Member always.
  var role = (Auth.actAsRole || 'admin');
  var roleItems = [['admin', 'Admin']];
  if (cur) roleItems.push(['lead', 'Lead of ' + cur]);
  roleItems.push(['member', cur ? ('Member of ' + cur) : 'Member (view as)']);
  var ropts = roleItems.map(function (r) {
    return '<option value="' + r[0] + '"' + (role === r[0] ? ' selected' : '') + ' style="' + optStyle + '">' + _tsEsc(r[1]) + '</option>';
  }).join('');
  var roleHighlight = role !== 'admin' ? (_tsDark ? 'background:rgba(245,200,66,0.18);color:#EBCF77;' : 'background:#FEF3C7;') : '';
  html += ' <select title="Act as role — admin only" onchange="setActAsRole(this.value)" style="' + sStyle + 'max-width:190px;' + roleHighlight + '">' + ropts + '</select>';

  wrap.style.display = '';
  wrap.innerHTML = html;
}
