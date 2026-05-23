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

// Resolve whether (and to what) we scope this session. Call once at boot, after
// auth + resources + app_config have loaded. Safe to re-call (e.g. admin switch).
function initTeamScope() {
  var params;
  try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }
  var isAdm = (typeof isAdmin === 'function') && isAdmin();
  // Admin-only preview so we can verify before the global flag is flipped on:
  //   ?teamscope=1  → scope to own team   |   ?team=NAME → scope to a specific team
  var preview = isAdm && !!params && (params.has('teamscope') || params.has('team'));
  _teamScopeActive = !!_teamScopingEnabled || preview;
  if (!_teamScopeActive) { CURRENT_TEAM = null; return; }
  var override = (isAdm && params) ? String(params.get('team') || '').trim() : '';
  var who = (typeof Auth !== 'undefined' && Auth) ? Auth.fullName : null;
  var resolved = override || personTeam(who) || null;
  CURRENT_TEAM = resolved ? canonicalTeam(resolved) : null;
  if (!CURRENT_TEAM) _teamScopeActive = false; // no team to scope to → don't hide everything
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
