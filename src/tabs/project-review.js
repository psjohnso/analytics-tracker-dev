// ─────────────────────────────────────────────────────────────────────
// tabs/project-review.js — Project Review tab (beta)
//
// Owns: review-type configuration (default seed + runtime list),
// PROJECT_REVIEWS in-memory store, all data helpers (next id, lookups),
// the entire UI render pipeline (cards, table, quarter grouping,
// fiscal-quarter math), the Log Review modal, and the Settings →
// Project config → Review Types editor.
//
// Forward references (resolve at call time): Auth, showToast, esc,
// PROJECTS, TASKS, RESOURCES_DATA, currentTab, _configOids,
// saveConfigKey, applyAppConfig, isFeatureOn — all defined in inline
// script which loads after this file.
// Backward references: agolQuery, agolApplyEdits, ARCGIS_CONFIG,
// prFmtDate, prFmtDateShort, prDaysSince, prDateToEpoch,
// prEpochToInputDate, isProjectRef.
// ─────────────────────────────────────────────────────────────────────



// ── Project Review configuration ──────────────────────────────
// ── Project Review configuration ──────────────────────────────
// Default review types — seeded into app_config on first load if missing.
const _defaultReviewTypes = [
  {
    id: 'data-intel',
    name: 'Data Intelligence Review',
    description: 'Weekly task-level review for the Data Intelligence team (GIS, Analytics, AI sub-teams).',
    filter: {
      teams: ['Data Intelligence'],
      review_mode: 'task',
      default_statuses: ['Active', 'On Hold', 'Waiting for Response']
    },
    cadence_days: 7,
    default_attendees: [
      'Peter Johnson','Jessica Fraver','James McGinnis','Kate Carter',
      'Andrew Sutton','Vladimir Berg','Liz Wilshin','Jean Paul Nduwayo Ntore',
      'Daniel Jackson-Reeves'
    ]
  },
  {
    id: 'data-team',
    name: 'Data Team Review',
    description: 'Biweekly cross-team review covering the broader Data Team — Data Intelligence, Architecture, DBA, and Cloud Engineering (Snowflake).',
    filter: {
      teams: [
        'Data Intelligence',
        'Emerging Data Infrastructure',
        'Architects'
      ],
      require_data_program: true,
      group_by_quarter: true,
      default_statuses: ['Active', 'Scheduled', 'On Hold', 'Future']
    },
    cadence_days: 14,
    default_attendees: [
      'Peter Johnson','James McGinnis','Andrew Sutton','Jessica Fraver',
      'Kate Carter','Jason Barrett','Adam Silva','Debbie Vulcan',
      'Chance Muscarella','Tracey McCroskey','Eric Pfaff'
    ]
  }
];
let _reviewTypes = _defaultReviewTypes.map(function(rt) { return JSON.parse(JSON.stringify(rt)); });

// In-memory store of all project review log entries, keyed by project_number then review_type_id.
// Each entry: { objectId, review_id, review_type_id, project_number, meeting_date, attendees, notes, decisions, action_items, created_by, created_at }
let PROJECT_REVIEWS = [];
let _projectReviewsLoaded = false;
// Risk-scoring context for the review's per-project badges — built once per
// render (leads/admins only) so each card reuses it instead of rebuilding.
var _prRiskCtx = null;

// ── Project Review data helpers ──────────────────────────────
// Seed the default review_types into app_config if no record exists yet.
async function ensureReviewTypesSeeded() {
  if (_configOids.review_types) return; // already in ArcGIS
  if (!Auth.loggedIn) return;             // need write access
  console.log('[Reviews] No review_types config found; seeding defaults.');
  try {
    await saveConfigKey('review_types', _reviewTypes);
  } catch (e) {
    console.warn('[Reviews] Failed to seed default review_types:', e);
  }
}

// Load all entries from the Project_Reviews layer into PROJECT_REVIEWS.
async function loadProjectReviews() {
  if (!Auth.loggedIn) return;
  try {
    const features = await agolQuery(ARCGIS_CONFIG.projectReviewsUrl);
    PROJECT_REVIEWS = features.map(function(f) {
      const a = f.attributes || {};
      return {
        objectId: a.OBJECTID || a.ObjectId || a.objectid,
        review_id: a.review_id,
        review_type_id: a.review_type_id,
        project_number: a.project_number,
        // meeting_date on the wire is DateOnly (YYYY-MM-DD string in new
        // schema). Local model uses epoch ms for sort/date math. Normalize.
        meeting_date: (typeof a.meeting_date === 'string') ? prDateToEpoch(a.meeting_date) : a.meeting_date,
        attendees: a.attendees || '',
        notes: a.notes || '',
        decisions: a.decisions || '',
        action_items: a.action_items || '',
        created_by: a.created_by || a.Creator || '',
        created_at: a.created_at || a.CreationDate
      };
    });
    _projectReviewsLoaded = true;
    console.log('[Reviews] Loaded', PROJECT_REVIEWS.length, 'review entries.');
  } catch (e) {
    console.warn('[Reviews] Failed to load project reviews:', e);
    PROJECT_REVIEWS = [];
  }
}

// Compute next review_id (max existing + 1, or 1 if empty).
function nextReviewId() {
  let max = 0;
  PROJECT_REVIEWS.forEach(function(r) {
    if (typeof r.review_id === 'number' && r.review_id > max) max = r.review_id;
  });
  return max + 1;
}

// Find the most recent review for a project under a given review type.
function getLastReviewForProject(projectNumber, reviewTypeId) {
  let best = null;
  PROJECT_REVIEWS.forEach(function(r) {
    if (r.project_number !== projectNumber) return;
    if (r.review_type_id !== reviewTypeId) return;
    if (!best || (r.meeting_date || 0) > (best.meeting_date || 0)) best = r;
  });
  return best;
}

// All reviews for a project under a given review type, sorted newest first.
function getReviewsForProject(projectNumber, reviewTypeId) {
  return PROJECT_REVIEWS
    .filter(function(r) { return r.project_number === projectNumber && r.review_type_id === reviewTypeId; })
    .sort(function(a, b) { return (b.meeting_date || 0) - (a.meeting_date || 0); });
}

// Find a review type by id.
function getReviewType(id) {
  return _reviewTypes.find(function(rt) { return rt.id === id; }) || null;
}

// ── Project Review tab UI / modal / render ──────────────────
// ══════════════════════════════════════════════════════════════════════
//  PROJECT REVIEW TAB (beta)
// ══════════════════════════════════════════════════════════════════════

var _currentReviewTypeId = null;
var _reviewFilterStatuses = [];  // array of selected statuses (project or task per review_mode); empty = no narrowing
var _reviewAssigneeFilter = '';  // single assignee name; empty = all assignees
var _reviewSearchQuery = '';     // free-text search (case-insensitive). Persists across view-mode toggle; clears on review-type switch.
var _prViewMode = 'card';        // 'card' (expanded cards, default) or 'table' (simplified table)
var _prTasksOpen = {};           // map of project_number -> bool. undefined = open by default.
var _prShowAllLog = {};          // map of project_number -> bool (show all log entries)
var _prSectionOpen = {};         // map of bucket key -> bool (quarter section expanded). undefined = use bucket default.
var _prModalState = null;        // { projectNumber, reviewTypeId, editObjectId }

// Tucson fiscal-year convention: FY runs Jul 1 → Jun 30.
// FY-name = the calendar year the FY ends in. So Jul 2025–Jun 2026 = FY26.
// Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun.
function prFiscalQuarter(dateStr) {
  if (!dateStr) return null;
  var s = String(dateStr).slice(0, 10);
  var parts = s.split('-');
  if (parts.length !== 3) return null;
  var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return null;
  var fyYear = (m >= 7) ? (y + 1) : y;
  var q = (m >= 7 && m <= 9) ? 1 : (m >= 10 && m <= 12) ? 2 : (m >= 1 && m <= 3) ? 3 : 4;
  return {
    fyYear: fyYear,
    q: q,
    key: 'fy' + fyYear + '-q' + q,
    label: 'FY' + String(fyYear).slice(-2) + ' Q' + q,
    sortIdx: fyYear * 4 + q
  };
}
function prCurrentFiscalQuarter() {
  var d = new Date();
  return prFiscalQuarter(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01');
}

// Bucket projects into ordered fiscal-quarter sections.
// Past quarters are lumped; current and each future quarter that has projects get their own bucket.
// Projects without a target end date land in "No target date".
// Sort within each bucket is preserved from the input array.
function prGroupByFiscalQuarter(projects) {
  var current = prCurrentFiscalQuarter();
  var pastBucket = { key: 'past', label: 'Past quarters', defaultOpen: true, projects: [], sortIdx: -1 };
  var noDateBucket = { key: 'no-date', label: 'No target date', defaultOpen: false, projects: [], sortIdx: 1e9 };
  var futureMap = {}; // key -> bucket
  var currentBucket = null;
  projects.forEach(function(p) {
    var dateStr = p.working_due || p.end;
    var fq = prFiscalQuarter(dateStr);
    if (!fq) { noDateBucket.projects.push(p); return; }
    if (fq.sortIdx < current.sortIdx) {
      pastBucket.projects.push(p);
    } else if (fq.sortIdx === current.sortIdx) {
      if (!currentBucket) {
        currentBucket = { key: fq.key, label: fq.label + ' — current', defaultOpen: true, projects: [], sortIdx: fq.sortIdx };
      }
      currentBucket.projects.push(p);
    } else {
      if (!futureMap[fq.key]) {
        futureMap[fq.key] = { key: fq.key, label: fq.label, defaultOpen: false, projects: [], sortIdx: fq.sortIdx };
      }
      futureMap[fq.key].projects.push(p);
    }
  });
  // Always show Past + Current sections (even if empty) so reviewers can confirm "nothing past due."
  if (!currentBucket) currentBucket = { key: current.key, label: current.label + ' — current', defaultOpen: true, projects: [], sortIdx: current.sortIdx };
  var buckets = [pastBucket, currentBucket];
  Object.keys(futureMap).map(function(k) { return futureMap[k]; })
    .sort(function(a, b) { return a.sortIdx - b.sortIdx; })
    .forEach(function(b) { buckets.push(b); });
  if (noDateBucket.projects.length) buckets.push(noDateBucket);
  return buckets;
}
function prCycleBadge(lastEpoch, cadenceDays) {
  if (lastEpoch == null) return { cls: 'pr-cycle-never', label: 'Not yet reviewed' };
  var days = prDaysSince(lastEpoch);
  if (days == null) return { cls: 'pr-cycle-never', label: 'Not yet reviewed' };
  var cap = cadenceDays || 14;
  if (days <= cap) return { cls: 'pr-cycle-fresh', label: 'Reviewed ' + days + 'd ago' };
  if (days <= cap * 1.5) return { cls: 'pr-cycle-due', label: 'Due (' + days + 'd)' };
  return { cls: 'pr-cycle-overdue', label: 'Overdue (' + days + 'd)' };
}

// Parse contact + other_members into a unique ordered list of {name, isLead}.
function prGetRoster(p) {
  var seen = {};
  var roster = [];
  if (p.contact) {
    seen[p.contact] = true;
    roster.push({ name: p.contact, isLead: true });
  }
  if (p.other_members) {
    String(p.other_members).split(',').forEach(function(raw) {
      var n = raw.trim();
      if (!n || seen[n]) return;
      seen[n] = true;
      roster.push({ name: n, isLead: false });
    });
  }
  return roster;
}

function prTaskDotClass(status) {
  if (!status) return 'pr-task-dot-default';
  var s = String(status).replace(/[^A-Za-z]/g, '');
  return 'pr-task-dot-' + s;
}

// Group tasks for a project by assignee. Returns Map-like {name: [tasks]}.
// statusFilter: optional array of task statuses to include. Empty/missing = all.
// assigneeFilter: optional single assignee name. Empty/missing = all.
// searchQuery: optional free-text. Tasks pass when their title/assignee match, OR when the
//   parent project's title/number match (so typing the project name keeps all the project's tasks visible).
function prGetTasksForProject(p, statusFilter, assigneeFilter, searchQuery) {
  var byPerson = {};
  var qLower = (searchQuery && String(searchQuery).trim()) ? String(searchQuery).trim().toLowerCase() : '';
  for (var i = 0; i < TASKS.length; i++) {
    var t = TASKS[i];
    if (t.project_id !== p.id) continue;
    if (!prTaskPassesFilters(t, p, statusFilter, assigneeFilter, qLower)) continue;
    var who = t.assignee || '(Unassigned)';
    if (!byPerson[who]) byPerson[who] = [];
    byPerson[who].push(t);
  }
  // Sort each person's tasks: Active/InProgress first, then Pending/NotStarted, then OnHold/Waiting, then Complete/Canceled
  var rank = { 'In Progress': 0, 'Active': 0, 'Not Started': 1, 'Pending': 1, 'Waiting for Response': 2, 'On Hold': 2, 'Complete': 3, 'Completed': 3, 'Canceled': 4, 'Cancelled': 4 };
  Object.keys(byPerson).forEach(function(name) {
    byPerson[name].sort(function(a, b) {
      return ((rank[a.status] != null ? rank[a.status] : 5) - (rank[b.status] != null ? rank[b.status] : 5)) ||
        (String(a.title || '').localeCompare(String(b.title || '')));
    });
  });
  return byPerson;
}

// Resolve the review mode: 'project' (default) or 'task'.
function prGetReviewMode(rt) {
  return (rt && rt.filter && rt.filter.review_mode === 'task') ? 'task' : 'project';
}

// True if the named person is the project lead or appears in other_members.
function prProjectInvolves(p, name) {
  if (!name) return true;
  if (p.contact === name) return true;
  if (p.other_members) {
    var members = String(p.other_members).split(',').map(function(s) { return s.trim(); });
    if (members.indexOf(name) >= 0) return true;
  }
  return false;
}

// Filter PROJECTS to those in scope for a review type.
// statuses: optional array of status names. In project mode these match project.status;
//   in task mode a project is in scope if it has ≥1 task whose status is in the list.
// assignee: optional name. In project mode the project must involve this person (contact or other_members);
//   in task mode a project is in scope only if it has ≥1 task assigned to this person.
// query: optional free-text search (case-insensitive). Project mode matches title/number/contact/members;
//   task mode matches task title/assignee plus the parent project's title/number.
// Map a set of legacy unit names (filter.itd_teams) to the parent teams
// (owning_team) of the projects currently in those units. Used only to
// pre-fill / display legacy review types that predate team-based scoping.
function prDeriveTeamsFromUnits(units) {
  if (!Array.isArray(units) || !units.length || typeof PROJECTS === 'undefined') return [];
  var seen = {};
  PROJECTS.forEach(function(p) {
    if (p.itd_team && units.indexOf(p.itd_team) >= 0 && p.owning_team) seen[p.owning_team] = true;
  });
  return Object.keys(seen).sort();
}

// The teams a review type is scoped to, for display + editor pre-fill.
// New configs store team names in filter.teams; legacy configs stored unit
// names in filter.itd_teams, which we map up to their parent teams.
function prRtScopeTeams(rt) {
  if (!rt || !rt.filter) return [];
  if (Array.isArray(rt.filter.teams) && rt.filter.teams.length) return rt.filter.teams.slice();
  if (Array.isArray(rt.filter.itd_teams) && rt.filter.itd_teams.length) return prDeriveTeamsFromUnits(rt.filter.itd_teams);
  return [];
}

function prGetProjectsForReview(rt, statuses, assignee, query) {
  if (!rt || !rt.filter) return [];
  // New configs scope by team (owning_team). Legacy configs scope by unit
  // (itd_team) — keep matching those by unit so their scope is unchanged
  // until the admin re-saves the review type, which migrates it to teams.
  var useTeams = Array.isArray(rt.filter.teams) && rt.filter.teams.length > 0;
  var scope = useTeams ? rt.filter.teams : (Array.isArray(rt.filter.itd_teams) ? rt.filter.itd_teams : []);
  if (!scope.length) return [];
  var requireDataProgram = !!(rt.filter && rt.filter.require_data_program);
  var inScope = PROJECTS.filter(function(p) {
    // Team scope first (no-op when off): a broad review type must never surface
    // another team's projects to a scoped user.
    if (typeof inCurrentTeamProject === 'function' && !inCurrentTeamProject(p)) return false;
    var scopeVal = useTeams ? p.owning_team : p.itd_team;
    if (!scopeVal) return false;
    if (scope.indexOf(scopeVal) < 0) return false;
    // Exclude Idea (not yet promoted). Show others — reviewers decide what to skip.
    if (p.status === 'Idea') return false;
    if (requireDataProgram && !p.is_data_program) return false;
    return true;
  });
  var hasStatuses = Array.isArray(statuses) && statuses.length > 0;
  var hasAssignee = !!assignee;
  var qLower = (query && String(query).trim()) ? String(query).trim().toLowerCase() : '';
  if (!hasStatuses && !hasAssignee && !qLower) return inScope;
  if (prGetReviewMode(rt) === 'task') {
    return inScope.filter(function(p) {
      return TASKS.some(function(t) {
        if (t.project_id !== p.id) return false;
        return prTaskPassesFilters(t, p, statuses, assignee, qLower);
      });
    });
  }
  return inScope.filter(function(p) {
    if (hasStatuses && statuses.indexOf(p.status) < 0) return false;
    if (hasAssignee && !prProjectInvolves(p, assignee)) return false;
    if (qLower) {
      var match = (p.title && p.title.toLowerCase().indexOf(qLower) >= 0) ||
                  (p.project_number && String(p.project_number).toLowerCase().indexOf(qLower) >= 0) ||
                  (p.contact && p.contact.toLowerCase().indexOf(qLower) >= 0) ||
                  (p.other_members && String(p.other_members).toLowerCase().indexOf(qLower) >= 0);
      if (!match) return false;
    }
    return true;
  });
}

// Build the assignee dropdown options for a review type.
// Names come from the in-scope projects (lead + other_members in project mode; task assignees in task mode).
// In task-mode reviews the list is restricted to active employees, since task review is about live work.
function prGetAssigneeOptions(rt) {
  var inScope = prGetProjectsForReview(rt);
  var names = {};
  var isTaskMode = (prGetReviewMode(rt) === 'task');
  if (isTaskMode) {
    var ids = {};
    inScope.forEach(function(p) { ids[p.id] = true; });
    TASKS.forEach(function(t) {
      if (!ids[t.project_id]) return;
      if (t.assignee) names[t.assignee] = true;
    });
  } else {
    inScope.forEach(function(p) {
      if (p.contact) names[p.contact] = true;
      if (p.other_members) {
        String(p.other_members).split(',').forEach(function(n) {
          var s = n.trim();
          if (s) names[s] = true;
        });
      }
    });
  }
  var sorted = Object.keys(names).sort();
  if (isTaskMode && typeof RESOURCES_DATA !== 'undefined' && RESOURCES_DATA && RESOURCES_DATA.people) {
    sorted = sorted.filter(function(n) {
      var person = RESOURCES_DATA.people[n];
      return person && person.active !== false;
    });
  }
  return sorted;
}

function prSetAssigneeFilter(name) {
  _reviewAssigneeFilter = name || '';
  render();
}

function prSetSearchQuery(q) {
  // Re-render preserves the input's focus and caret position because we keep the same id and
  // restore selection after the synchronous render.
  var prev = document.activeElement;
  var caret = (prev && prev.id === 'pr-search-input') ? prev.selectionStart : null;
  _reviewSearchQuery = q || '';
  render();
  if (caret != null) {
    var el = document.getElementById('pr-search-input');
    if (el) {
      try { el.focus(); el.setSelectionRange(caret, caret); } catch (e) {}
    }
  }
}

// Wrap matches of `query` inside `text` with <mark> tags. HTML-escapes the rest.
// Returns escaped HTML safe to assign to innerHTML.
function prHighlight(text, query) {
  if (text == null) return '';
  if (!query) return esc(text);
  var s = String(text);
  var lower = s.toLowerCase();
  var qLower = String(query).toLowerCase();
  var qLen = qLower.length;
  if (!qLen) return esc(s);
  var out = '';
  var i = 0;
  while (i < s.length) {
    var idx = lower.indexOf(qLower, i);
    if (idx < 0) { out += esc(s.substring(i)); break; }
    if (idx > i) out += esc(s.substring(i, idx));
    out += '<mark class="pr-search-mark">' + esc(s.substring(idx, idx + qLen)) + '</mark>';
    i = idx + qLen;
  }
  return out;
}

// Does this task pass the active status / assignee / search filters?
// In task mode the parent project's title/number also count as a search match (so typing the
// project name surfaces all of its tasks that pass the other filters).
function prTaskPassesFilters(t, p, statuses, assignee, qLower) {
  if (statuses && statuses.length && statuses.indexOf(t.status) < 0) return false;
  if (assignee && t.assignee !== assignee) return false;
  if (qLower) {
    var taskMatch = (t.title && t.title.toLowerCase().indexOf(qLower) >= 0) ||
                    (t.assignee && t.assignee.toLowerCase().indexOf(qLower) >= 0);
    if (taskMatch) return true;
    var projMatch = (p.title && p.title.toLowerCase().indexOf(qLower) >= 0) ||
                    (p.project_number && String(p.project_number).toLowerCase().indexOf(qLower) >= 0);
    if (!projMatch) return false;
  }
  return true;
}

function prGetDefaultStatusesFor(rt) {
  if (rt && rt.filter && Array.isArray(rt.filter.default_statuses)) return rt.filter.default_statuses.slice();
  return [];
}

function prSwitchReviewType(id) {
  _currentReviewTypeId = id;
  _reviewFilterStatuses = prGetDefaultStatusesFor(getReviewType(id));
  _reviewAssigneeFilter = '';
  _reviewSearchQuery = '';
  _prTasksOpen = {};
  _prShowAllLog = {};
  _prSectionOpen = {};
  render();
}

// Toggle a status chip on/off. Pass 'all' (or no value) to clear the selection.
function prToggleFilterStatus(status) {
  if (!status || status === 'all') {
    _reviewFilterStatuses = [];
  } else {
    var i = _reviewFilterStatuses.indexOf(status);
    if (i >= 0) _reviewFilterStatuses.splice(i, 1);
    else _reviewFilterStatuses.push(status);
  }
  render();
}

function prToggleTasks(projNum) {
  // Default state is open; explicitly track collapsed/expanded once user toggles.
  var currentOpen = (_prTasksOpen[projNum] === false) ? false : true;
  _prTasksOpen[projNum] = !currentOpen;
  var el = document.getElementById('pr-tasks-' + projNum);
  if (el) el.classList.toggle('open', !!_prTasksOpen[projNum]);
}

function prToggleSection(bucketKey) {
  // Resolve current state (respects per-bucket default), then flip and store explicitly.
  var defaults = { 'past': true, 'no-date': false };
  var current;
  if (_prSectionOpen[bucketKey] != null) current = _prSectionOpen[bucketKey];
  else if (defaults[bucketKey] != null) current = defaults[bucketKey];
  else if (bucketKey.indexOf('fy') === 0) {
    var cur = prCurrentFiscalQuarter();
    current = (cur && bucketKey === cur.key);
  } else current = false;
  _prSectionOpen[bucketKey] = !current;
  render();
}

function prToggleAllLog(projNum) {
  _prShowAllLog[projNum] = !_prShowAllLog[projNum];
  render();
}

// Review types relevant to the current team (returns all when scoping is off).
// A type is relevant if its team scope includes CURRENT_TEAM. Falls back to all
// if none are configured for the team, so the page never goes blank — inScope
// still hard-filters projects to the team regardless.
function _prVisibleReviewTypes() {
  var all = _reviewTypes || [];
  if (typeof isTeamScopingOn !== 'function' || !isTeamScopingOn()) return all;
  // A team sees only the reviews that apply to it (their team is in filter.teams).
  // No fallback: a team with no applicable reviews sees none — never another
  // team's reviews. (e.g. Office of Equity sees neither the Data Intelligence nor
  // the Data Team review; EDI sees the Data Team review since EDI is in its scope.)
  return all.filter(function(rt) {
    var teams = (rt && rt.filter && Array.isArray(rt.filter.teams)) ? rt.filter.teams : [];
    return teams.some(function(t) { return (typeof sameTeam === 'function') ? sameTeam(t, CURRENT_TEAM) : t === CURRENT_TEAM; });
  });
}

function renderProjectReview(area) {
  // Pick a default review type if none selected, the previous is gone, or it's
  // not visible under the current team scope.
  var _visRts = _prVisibleReviewTypes();
  var _curVisible = _currentReviewTypeId && getReviewType(_currentReviewTypeId) &&
    _visRts.some(function(t) { return t.id === _currentReviewTypeId; });
  if (!_curVisible) {
    _currentReviewTypeId = _visRts.length ? _visRts[0].id : null;
    _reviewFilterStatuses = prGetDefaultStatusesFor(getReviewType(_currentReviewTypeId));
    _reviewAssigneeFilter = '';
  }
  var rt = getReviewType(_currentReviewTypeId);

  var html = '<div class="pr-page">';

  // Header + review type selector
  html += '<div class="pr-header">';
  html += '<div>';
  html += '<div class="pr-title">Project Review <span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;background:#FFF7ED;color:#9A3412;border:1px solid #FED7AA;margin-left:8px;vertical-align:middle;letter-spacing:0.06em;text-transform:uppercase;font-family:Lato,sans-serif;">Beta</span></div>';
  html += '<div class="pr-subtitle">Recurring portfolio review &mdash; one card per project, walked through person-by-person.</div>';
  html += '</div>';
  if (_visRts && _visRts.length) {
    html += '<div class="pr-rt-selector">';
    html += '<span class="pr-rt-label">Review Type</span>';
    _visRts.forEach(function(t) {
      var inScopeCount = prGetProjectsForReview(t).filter(function(p) { return p.status === 'Active' || p.status === 'Scheduled'; }).length;
      var cls = 'pr-rt-pill' + (t.id === _currentReviewTypeId ? ' active' : '');
      html += '<button class="' + cls + '" onclick="prSwitchReviewType(\'' + esc(t.id) + '\')">' +
        esc(t.name) +
        '<span class="pr-rt-meta">' + ((t.cadence_days === 7) ? 'weekly' : ((t.cadence_days === 14) ? 'biweekly' : (t.cadence_days || '?') + 'd')) + ' &middot; ' + inScopeCount + ' active</span>' +
        '</button>';
    });
    html += '</div>';
  }
  html += '</div>'; // pr-header

  if (!rt) {
    html += '<div class="pr-empty-state">No review types configured. A Team Lead can add one in Settings &rarr; Reviews.</div>';
    html += '</div>';
    area.innerHTML = html;
    return;
  }

  // Cycle strip
  var cadenceLabel = (rt.cadence_days === 7) ? 'Weekly &middot; 7 days' :
                     (rt.cadence_days === 14) ? 'Biweekly &middot; 14 days' :
                     (rt.cadence_days ? (rt.cadence_days + ' days') : '—');
  var attendees = (rt.default_attendees && rt.default_attendees.length)
    ? rt.default_attendees.join(', ')
    : '(none configured)';
  html += '<div class="pr-cycle-strip">';
  html += '<div class="pr-cs-block"><div class="pr-cs-label">Cadence</div><div class="pr-cs-value">' + cadenceLabel + '</div></div>';
  html += '<div class="pr-cs-block"><div class="pr-cs-label">Review Level</div><div class="pr-cs-value">' + (prGetReviewMode(rt) === 'task' ? 'Task-level' : 'Project-level') + '</div></div>';
  if (rt.description) {
    html += '<div class="pr-cs-block" style="flex:1;min-width:240px;"><div class="pr-cs-label">Description</div><div style="font-family:Cardo,serif;font-size:13px;font-style:italic;color:var(--text-body);">' + esc(rt.description) + '</div></div>';
  }
  html += '<div class="pr-cs-block pr-cs-attendees"><div class="pr-cs-label">Default Attendees</div><div>' + esc(attendees) + '</div></div>';
  html += '</div>';

  // Status filter chips with counts (only render statuses with > 0 matches in scope).
  // In project mode: chips count and filter projects by project.status.
  // In task mode: chips count and filter tasks (within in-scope projects) by task.status.
  // The assignee filter further narrows what's counted, so chip totals always reflect what's visible.
  var reviewMode = prGetReviewMode(rt);
  var assigneeOpts = prGetAssigneeOptions(rt);
  // If the saved assignee is no longer in the available list (e.g. data changed), drop it.
  if (_reviewAssigneeFilter && assigneeOpts.indexOf(_reviewAssigneeFilter) < 0) _reviewAssigneeFilter = '';
  var assigneeNarrowed = prGetProjectsForReview(rt, [], _reviewAssigneeFilter);
  var statusCounts = {};
  var totalForAll = 0;
  var statusOrder;
  if (reviewMode === 'task') {
    var inScopeIds = {};
    assigneeNarrowed.forEach(function(p) { inScopeIds[p.id] = true; });
    TASKS.forEach(function(t) {
      if (!inScopeIds[t.project_id]) return;
      if (_reviewAssigneeFilter && t.assignee !== _reviewAssigneeFilter) return;
      var s = t.status || '(none)';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      totalForAll++;
    });
    statusOrder = ['Active', 'In Progress', 'Pending', 'Not Started', 'Waiting for Response', 'On Hold', 'Complete', 'Canceled'];
  } else {
    assigneeNarrowed.forEach(function(p) {
      var s = p.status || '(none)';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    totalForAll = assigneeNarrowed.length;
    statusOrder = ['Active', 'Scheduled', 'On Hold', 'Waiting for Response', 'Future', 'Pending', 'Complete', 'Canceled'];
  }

  function chip(value, label, count) {
    var isActive = (value === 'all') ? (_reviewFilterStatuses.length === 0) : (_reviewFilterStatuses.indexOf(value) >= 0);
    var cls = 'pr-tb-chip' + (isActive ? ' active' : '');
    return '<button class="' + cls + '" onclick="prToggleFilterStatus(\'' + value + '\')">' +
      label + '<span class="pr-count">' + count + '</span></button>';
  }
  // Row 1 — controls bar: search + assignee (left) + view toggle (right). Stable single row on any reasonable width.
  html += '<div class="pr-controls-bar">';
  html += '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">';
  html += '<div class="pr-control-group">';
  html += '<label class="pr-control-label" for="pr-search-input">Search</label>';
  html += '<input type="search" id="pr-search-input" class="pr-search-input" placeholder="Title, number, person..." value="' + esc(_reviewSearchQuery || '') + '" oninput="prSetSearchQuery(this.value)" onkeydown="if(event.key===\'Escape\'){this.value=\'\';prSetSearchQuery(\'\');}">';
  html += '</div>';
  html += '<div class="pr-control-group">';
  html += '<label class="pr-control-label" for="pr-assignee-select">Assignee</label>';
  html += '<select id="pr-assignee-select" class="pr-assignee-select" onchange="prSetAssigneeFilter(this.value)">';
  html += '<option value=""' + (!_reviewAssigneeFilter ? ' selected' : '') + '>All assignees</option>';
  assigneeOpts.forEach(function(n) {
    html += '<option value="' + esc(n) + '"' + (_reviewAssigneeFilter === n ? ' selected' : '') + '>' + esc(n) + '</option>';
  });
  html += '</select>';
  html += '</div>';
  html += '</div>';
  html += '<div class="pr-view-toggle">';
  html += '<button class="pr-vt-btn' + (_prViewMode === 'card' ? ' active' : '') + '" onclick="prSetViewMode(\'card\')">Cards</button>';
  html += '<button class="pr-vt-btn' + (_prViewMode === 'table' ? ' active' : '') + '" onclick="prSetViewMode(\'table\')">Table</button>';
  html += '</div>';
  html += '</div>';

  // Row 2 — status chip bar. Wraps within the row at narrow widths but never displaces the controls bar.
  html += '<div class="pr-chips-bar">';
  html += '<span class="pr-control-label pr-chips-label">Status</span>';
  html += chip('all', 'All', totalForAll);
  // Always render the canonical statuses (even if count is 0) so chip set stays consistent across assignees.
  statusOrder.forEach(function(s) { html += chip(s, s, statusCounts[s] || 0); });
  // Surface any non-canonical status spellings that actually appear in the data (e.g. 'Completed' vs 'Complete').
  Object.keys(statusCounts).forEach(function(s) {
    if (statusOrder.indexOf(s) < 0 && statusCounts[s]) html += chip(s, s, statusCounts[s]);
  });
  html += '</div>';

  // Project cards — build the risk context once for this render (leads/admins
  // only) so each card can show its risk badge without recomputing it.
  _prRiskCtx = (typeof isAdmin === 'function' && isAdmin() && typeof _rkBuildContext === 'function') ? _rkBuildContext() : null;
  var projects = prGetProjectsForReview(rt, _reviewFilterStatuses, _reviewAssigneeFilter, _reviewSearchQuery);
  if (!projects.length) {
    var emptyMsg = _reviewSearchQuery ? 'Nothing matches "' + esc(_reviewSearchQuery) + '" with the current filters.' : 'No projects match the current filter.';
    html += '<div class="pr-empty-state">' + emptyMsg + '</div>';
  } else {
    // Sort alphabetically by project title within each fiscal-quarter bucket.
    // Stable order keeps just-reviewed projects in place rather than sinking
    // them to the bottom (which made it look like they had disappeared).
    projects.sort(function(a, b) {
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    if (rt.filter && rt.filter.group_by_quarter) {
      var buckets = prGroupByFiscalQuarter(projects);
      buckets.forEach(function(b) {
        var isOpen = (_prSectionOpen[b.key] != null) ? _prSectionOpen[b.key] : b.defaultOpen;
        var headerCls = 'pr-quarter-header' + (b.key === 'past' ? ' past' : '') + (b.label.indexOf('current') >= 0 ? ' current' : '');
        html += '<div class="pr-quarter-section' + (isOpen ? ' open' : '') + '">';
        html += '<div class="' + headerCls + '" onclick="prToggleSection(\'' + b.key + '\')">';
        html += '<span class="pr-quarter-caret">▶</span>';
        html += '<span>' + b.label + '</span>';
        html += '<span class="pr-quarter-count">' + b.projects.length + '</span>';
        // Per-status breakdown for this bucket (counts of project.status across the bucket).
        if (b.projects.length) {
          var bStatusOrder = ['Active', 'Scheduled', 'On Hold', 'Waiting for Response', 'Future', 'Pending', 'Complete', 'Canceled'];
          var bCounts = {};
          b.projects.forEach(function(p) { var s = p.status || '(none)'; bCounts[s] = (bCounts[s] || 0) + 1; });
          var pieces = [];
          bStatusOrder.forEach(function(s) { if (bCounts[s]) pieces.push('<span class="pr-q-status">' + bCounts[s] + ' ' + esc(s) + '</span>'); });
          Object.keys(bCounts).forEach(function(s) { if (bStatusOrder.indexOf(s) < 0 && bCounts[s]) pieces.push('<span class="pr-q-status">' + bCounts[s] + ' ' + esc(s) + '</span>'); });
          if (pieces.length) html += '<span class="pr-q-statuses">' + pieces.join('') + '</span>';
        }
        html += '</div>';
        html += '<div class="pr-quarter-body">';
        html += renderProjectsForReview(b.projects, rt, true);
        html += '</div></div>';
      });
    } else {
      html += renderProjectsForReview(projects, rt, false);
    }
  }

  html += '</div>'; // pr-page

  // Modal placeholder
  html += '<div class="pr-modal-backdrop" id="pr-modal-backdrop" onclick="if(event.target===this)prCloseLogModal()"><div class="pr-modal" id="pr-modal"></div></div>';

  area.innerHTML = html;
}

// Dispatch a list of in-scope projects to the appropriate view.
function renderProjectsForReview(projectsArr, rt, isInBucket) {
  if (!projectsArr.length) return '<div class="pr-empty-state" style="margin:' + (isInBucket ? '8px 0' : '0') + ';">No projects in this bucket.</div>';
  if (_prViewMode === 'table') {
    return (prGetReviewMode(rt) === 'task')
      ? renderProjectReviewTaskTable(projectsArr, rt)
      : renderProjectReviewTable(projectsArr, rt);
  }
  var out = '';
  projectsArr.forEach(function(p) { out += renderProjectReviewCard(p, rt); });
  return out;
}

// Task-row table view for task-mode reviews. Each row is a task; sorted by project then task title.
function renderProjectReviewTaskTable(projects, rt) {
  var todayStr = new Date().toISOString().slice(0, 10);
  var projectById = {};
  projects.forEach(function(p) { projectById[p.id] = p; });
  var taskFilter = _reviewFilterStatuses;
  var qLower = (_reviewSearchQuery && _reviewSearchQuery.trim()) ? _reviewSearchQuery.trim().toLowerCase() : '';
  var rows = [];
  TASKS.forEach(function(t) {
    var p = projectById[t.project_id];
    if (!p) return;
    if (!prTaskPassesFilters(t, p, taskFilter, _reviewAssigneeFilter || null, qLower)) return;
    rows.push({ task: t, project: p });
  });
  if (!rows.length) return '<div class="pr-empty-state" style="margin:8px 0;">No tasks match the current filter.</div>';
  rows.sort(function(a, b) {
    var ap = String(a.project.title || '').localeCompare(String(b.project.title || ''));
    if (ap !== 0) return ap;
    return String(a.task.title || '').localeCompare(String(b.task.title || ''));
  });

  var html = '<table class="pr-simple-table"><thead><tr>' +
    '<th>Project</th>' +
    '<th>Task</th>' +
    '<th>Status</th>' +
    '<th>Assignee</th>' +
    '<th>Due</th>' +
    '</tr></thead><tbody>';
  rows.forEach(function(r) {
    var p = r.project, t = r.task;
    var dueStr = t.working_due || t.due || '';
    var dueLate = dueStr && dueStr < todayStr;
    var clickHandler = t.objectId ? ' onclick="openTask(' + t.objectId + ')"' : '';
    html += '<tr class="pr-simple-row"' + clickHandler + '>';
    html += '<td><div class="pr-st-num">' + prHighlight(p.project_number || ('#' + p.id), _reviewSearchQuery) + '</div><div class="pr-st-title">' + prHighlight(p.title || '(no title)', _reviewSearchQuery) + '</div></td>';
    html += '<td>' + prHighlight(t.title || '(untitled task)', _reviewSearchQuery) + '</td>';
    html += '<td><span class="pr-status-pill">' + esc(t.status || '—') + '</span></td>';
    html += '<td>' + prHighlight(t.assignee || '—', _reviewSearchQuery) + '</td>';
    html += '<td' + (dueLate ? ' style="color:#A32D2D;font-weight:700;"' : '') + '>' + (dueStr ? prFmtDate(dueStr) : '—') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

// Simplified table view — quick-scan alternative to the cards.
function renderProjectReviewTable(projects, rt) {
  var todayStr = new Date().toISOString().slice(0, 10);
  var html = '<table class="pr-simple-table"><thead><tr>' +
    '<th>Project</th>' +
    '<th>Status</th>' +
    '<th>Contact</th>' +
    '<th>Target End</th>' +
    '<th>Last Reviewed</th>' +
    '<th>Action Items</th>' +
    '</tr></thead><tbody>';
  projects.forEach(function(p) {
    var pn = p.project_number || ('#' + (p.id || ''));
    var endStr = p.working_due || p.end || '';
    var endLate = endStr && endStr < todayStr;
    var last = getLastReviewForProject(p.project_number, rt.id);
    var lastLabel = last ? prFmtDate(last.meeting_date) + ' <span style="color:var(--text-muted);">(' + prDaysSince(last.meeting_date) + 'd)</span>' : '<em style="color:var(--text-muted);">Never</em>';
    var hasActions = last && last.action_items && last.action_items.trim().length > 0;
    var clickHandler = p.objectId ? ' onclick="openProject(' + p.objectId + ')"' : '';
    html += '<tr class="pr-simple-row"' + clickHandler + '>';
    html += '<td><div class="pr-st-num">' + prHighlight(pn, _reviewSearchQuery) + '</div><div class="pr-st-title">' + prHighlight(p.title || '(no title)', _reviewSearchQuery) + '</div></td>';
    html += '<td><span class="pr-status-pill">' + esc(p.status || '—') + '</span></td>';
    html += '<td>' + prHighlight(p.contact || '—', _reviewSearchQuery) + '</td>';
    html += '<td' + (endLate ? ' style="color:#A32D2D;font-weight:700;"' : '') + '>' + (endStr ? prFmtDate(endStr) : '—') + '</td>';
    html += '<td>' + lastLabel + '</td>';
    html += '<td>' + (hasActions ? '<span class="pr-actions-pill">Open</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function prSetViewMode(mode) {
  if (mode !== 'card' && mode !== 'table') return;
  _prViewMode = mode;
  render();
}

function renderProjectReviewCard(p, rt) {
  var pn = p.project_number || '';
  var statusCls = 'pr-status-' + String(p.status || '').replace(/[^A-Za-z]/g, '');
  var last = getLastReviewForProject(pn, rt.id);
  var badge = prCycleBadge(last ? last.meeting_date : null, rt.cadence_days);
  // Risk badge — leads/admins only, and only for live (not Complete/Canceled) projects.
  var rkLive = p.status !== 'Complete' && p.status !== 'Canceled';
  var risk = (_prRiskCtx && rkLive && typeof computeProjectRisk === 'function') ? computeProjectRisk(p, _prRiskCtx) : null;
  var rkId = 'prr' + (p.objectId || String(pn).replace(/[^A-Za-z0-9]/g, ''));

  var html = '<article class="pr-card">';

  // Header
  html += '<div class="pr-card-header">';
  html += '<div class="pr-card-header-main">';
  html += '<span class="pr-card-id" onclick="if(' + (p.objectId || 0) + ')openProject(' + (p.objectId || 0) + ')">Project &middot; ' + prHighlight(pn || ('#' + p.id), _reviewSearchQuery) + '</span>';
  html += '<div class="pr-card-title" onclick="if(' + (p.objectId || 0) + ')openProject(' + (p.objectId || 0) + ')">' + prHighlight(p.title || '(no title)', _reviewSearchQuery) + '</div>';
  html += '<div class="pr-card-meta-row">';
  if (p.partner_dept) html += '<span><strong>Partner:</strong>' + esc(p.partner_dept) + '</span>';
  if (p.category) html += '<span><strong>Category:</strong>' + esc(p.category) + '</span>';
  if (p.itd_team) html += '<span><strong>Unit:</strong>' + esc(p.itd_team) + '</span>';
  if (p.project_size) html += '<span><strong>Size:</strong>' + esc(p.project_size) + '</span>';
  if (p.start || p.end) {
    html += '<span><strong>Window:</strong>' + (p.start ? prFmtDate(p.start) : '—') + ' &mdash; ' + (p.end ? prFmtDate(p.end) : '—') + '</span>';
  }
  html += '</div>';
  html += '</div>'; // pr-card-header-main
  html += '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">';
  if (risk) {
    html += '<div style="display:flex;align-items:center;gap:6px;">' +
      (typeof _rkBadge === 'function' ? _rkBadge(risk.score, risk.band) : '') +
      '<button onclick="event.stopPropagation();rkToggle(\'' + rkId + '\')" style="border:1px solid var(--navy);background:#fff;color:var(--navy);border-radius:6px;padding:3px 8px;font-weight:700;font-size:10px;cursor:pointer;font-family:Lato,sans-serif;">Why? <span id="rk-caret-' + rkId + '">▸</span></button>' +
    '</div>';
  }
  html += '<span class="pr-status-badge ' + statusCls + '">' + esc(p.status || '—') + '</span>';
  html += '<span class="pr-cycle-badge ' + badge.cls + '">' + esc(badge.label) + '</span>';
  html += '</div>';
  html += '</div>'; // pr-card-header

  // Body
  html += '<div class="pr-card-body">';
  if (risk) {
    html += '<div data-rk-parent="' + rkId + '" style="display:none;margin-bottom:14px;border:1px solid #E8E6DF;border-radius:8px;background:#FCFCFB;padding:12px 14px;">' +
      (typeof _rkBreakdownHtml === 'function' ? _rkBreakdownHtml(risk) : '') + '</div>';
  }

  // People (+ Definition of Done underneath when set)
  var roster = prGetRoster(p);
  html += '<div>';
  html += '<div class="pr-section-label">People on Project</div>';
  if (roster.length) {
    html += '<div class="pr-people-chips">';
    roster.forEach(function(r) {
      html += '<span class="pr-person-chip' + (r.isLead ? ' pr-lead' : '') + '">' + esc(r.name) +
        (r.isLead ? '<span class="pr-role-tag">Lead</span>' : '') + '</span>';
    });
    html += '</div>';
  } else {
    html += '<div class="pr-tbp-empty">No contact or other members listed on the project record.</div>';
  }
  // Definition of Done — appears below the people chips when set on the project
  if (p.definition_of_done) {
    html += '<div class="pr-section-label" style="margin-top:16px;">Definition of Done</div>';
    html += '<div class="pr-dod-body">' + (typeof renderMd === 'function' ? renderMd(p.definition_of_done) : esc(p.definition_of_done)) + '</div>';
  }
  html += '</div>';

  // Tasks
  // In task mode, only include tasks matching the active status + assignee + search filters inside the WIP block.
  var isTaskMode = (prGetReviewMode(rt) === 'task');
  var taskStatusFilter = (isTaskMode && _reviewFilterStatuses.length) ? _reviewFilterStatuses : null;
  var taskAssigneeFilter = (isTaskMode && _reviewAssigneeFilter) ? _reviewAssigneeFilter : null;
  var taskSearchFilter = isTaskMode ? _reviewSearchQuery : '';
  var byPerson = prGetTasksForProject(p, taskStatusFilter, taskAssigneeFilter, taskSearchFilter);
  var personNames = Object.keys(byPerson);
  var taskCount = personNames.reduce(function(s, n) { return s + byPerson[n].length; }, 0);
  var counts = { Complete:0, Active:0, Pending:0, Other:0 };
  personNames.forEach(function(n) {
    byPerson[n].forEach(function(t) {
      var s = t.status || '';
      if (s === 'Complete' || s === 'Completed') counts.Complete++;
      else if (s === 'Active' || s === 'In Progress') counts.Active++;
      else if (s === 'Pending' || s === 'Not Started') counts.Pending++;
      else counts.Other++;
    });
  });
  var summaryParts = [taskCount + ' task' + (taskCount === 1 ? '' : 's')];
  if (counts.Complete) summaryParts.push(counts.Complete + ' complete');
  if (counts.Active) summaryParts.push(counts.Active + ' active');
  if (counts.Pending) summaryParts.push(counts.Pending + ' pending');
  if (counts.Other) summaryParts.push(counts.Other + ' other');

  var openCls = (_prTasksOpen[pn] === false) ? '' : ' open';
  html += '<div>';
  html += '<div class="pr-section-label">Work in Progress</div>';
  html += '<div class="pr-tasks-block' + openCls + '" id="pr-tasks-' + esc(pn) + '">';
  if (taskCount === 0) {
    html += '<div class="pr-tbp-empty">No tasks logged for this project yet.</div>';
  } else {
    html += '<div class="pr-tasks-toggle" onclick="prToggleTasks(\'' + esc(pn) + '\')">' +
      '<span class="pr-chev">&#9656;</span> ' + summaryParts.join(' &middot; ') + '</div>';
    html += '<div class="pr-tasks-by-person">';
    // Group: roster people first (in roster order), then anyone else
    var rosterNames = roster.map(function(r) { return r.name; });
    var ordered = rosterNames.slice();
    personNames.forEach(function(n) { if (ordered.indexOf(n) < 0) ordered.push(n); });
    ordered.forEach(function(n) {
      var tasks = byPerson[n] || [];
      if (!tasks.length && rosterNames.indexOf(n) < 0) return; // skip empties for non-roster
      html += '<div class="pr-tbp-person">';
      html += '<div class="pr-tbp-person-name">' + prHighlight(n, _reviewSearchQuery) + ' &mdash; ' + tasks.length + ' task' + (tasks.length === 1 ? '' : 's') + '</div>';
      if (!tasks.length) {
        html += '<div class="pr-tbp-empty">No tasks logged. Speak to the project at the program level.</div>';
      } else {
        var maxShow = 6;
        tasks.slice(0, maxShow).forEach(function(t) {
          var dotCls = 'pr-task-dot ' + prTaskDotClass(t.status);
          var dueLabel = '';
          if (t.actual_end) dueLabel = 'done ' + prFmtDateShort(t.actual_end);
          else if (t.due) dueLabel = 'due ' + prFmtDateShort(t.due);
          else if (t.start) dueLabel = 'start ' + prFmtDateShort(t.start);
          html += '<div class="pr-tbp-task"><span class="' + dotCls + '"></span>' +
            prHighlight(t.title || '(untitled task)', _reviewSearchQuery) +
            (dueLabel ? '<span class="pr-due">' + dueLabel + '</span>' : '') +
            '</div>';
        });
        if (tasks.length > maxShow) {
          html += '<div class="pr-tbp-task" style="color:var(--text-muted);font-style:italic;">+ ' + (tasks.length - maxShow) + ' more&hellip;</div>';
        }
      }
      html += '</div>'; // pr-tbp-person
    });
    html += '</div>'; // pr-tasks-by-person
  }
  html += '</div>'; // pr-tasks-block
  html += '</div>'; // tasks col
  html += '</div>'; // pr-card-body

  // Review log
  var entries = getReviewsForProject(pn, rt.id);
  var defaultShow = 2;
  var showAll = !!_prShowAllLog[pn];
  var visible = showAll ? entries : entries.slice(0, defaultShow);
  var canEdit = function(e) { return Auth.fullName && e.created_by === Auth.fullName; };
  var canDelete = function(e) { return canEdit(e) || isAdmin(); };

  html += '<div class="pr-log-section">';
  html += '<div class="pr-log-header">';
  html += '<div class="pr-section-label" style="margin-bottom:0;">Review Log &middot; ' + esc(rt.name) + '</div>';
  if (Auth.loggedIn && !Auth.previewMode) {
    html += '<button class="pr-btn pr-btn-primary" onclick="prOpenLogModal(\'' + esc(pn) + '\',\'' + esc(rt.id) + '\')">+ Log this cycle&rsquo;s review</button>';
  }
  html += '</div>';
  if (entries.length === 0) {
    html += '<div class="pr-log-empty">No review entries logged yet for this project.</div>';
  } else {
    visible.forEach(function(e, i) {
      var oldCls = i > 0 ? ' pr-log-entry-old' : '';
      html += '<div class="pr-log-entry' + oldCls + '">';
      html += '<div class="pr-log-actions">';
      if (canEdit(e)) html += '<button class="pr-log-action-btn" onclick="prOpenLogModal(\'' + esc(pn) + '\',\'' + esc(rt.id) + '\',' + e.objectId + ')">Edit</button>';
      if (canDelete(e)) html += '<button class="pr-log-action-btn pr-danger" onclick="prDeleteLog(' + e.objectId + ')">Delete</button>';
      html += '</div>';
      html += '<div class="pr-log-entry-head">';
      html += '<span class="pr-log-date">' + esc(prFmtDate(e.meeting_date)) + '</span>';
      if (e.attendees) html += '<span class="pr-log-attendees">' + esc(e.attendees) + '</span>';
      if (e.created_by) html += '<span class="pr-log-attendees" style="margin-left:auto;">logged by ' + esc(e.created_by) + '</span>';
      html += '</div>';
      if (e.notes) {
        html += '<div class="pr-log-block"><div class="pr-log-block-label">Notes</div><div class="pr-log-block-text">' + esc(e.notes) + '</div></div>';
      }
      if (e.decisions) {
        html += '<div class="pr-log-block"><div class="pr-log-block-label">Decisions</div><div class="pr-log-block-text">' + esc(e.decisions) + '</div></div>';
      }
      if (e.action_items) {
        html += '<div class="pr-log-block"><div class="pr-log-block-label">Action Items</div><div class="pr-log-block-text">' + esc(e.action_items) + '</div></div>';
      }
      html += '</div>'; // pr-log-entry
    });
    if (entries.length > defaultShow) {
      html += '<div style="text-align:center;margin-top:6px;">' +
        '<button class="pr-log-action-btn" onclick="prToggleAllLog(\'' + esc(pn) + '\')">' +
        (showAll ? 'Hide older entries' : 'Show ' + (entries.length - defaultShow) + ' older entr' + (entries.length - defaultShow === 1 ? 'y' : 'ies')) +
        '</button></div>';
    }
  }
  html += '</div>'; // pr-log-section

  html += '</article>';
  return html;
}

// ── LOG REVIEW MODAL ─────────────────────────────────────────
function prOpenLogModal(projectNumber, reviewTypeId, editObjectId) {
  var p = PROJECTS.find(function(x) { return x.project_number === projectNumber; });
  var rt = getReviewType(reviewTypeId);
  if (!p || !rt) { showToast('Could not open review form.', 'error'); return; }

  var existing = null;
  if (editObjectId) {
    existing = PROJECT_REVIEWS.find(function(r) { return r.objectId === editObjectId; });
  }

  _prModalState = { projectNumber: projectNumber, reviewTypeId: reviewTypeId, editObjectId: editObjectId || null };

  var meetingDate = existing ? prEpochToInputDate(existing.meeting_date) :
    (function() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
  var attendeesValue = existing ? existing.attendees : (rt.default_attendees ? rt.default_attendees.join(', ') : '');

  // Build suggestion list: union of team_members names + review type defaults
  var suggestionSet = {};
  if (rt.default_attendees) rt.default_attendees.forEach(function(n) { suggestionSet[n] = true; });
  if (RESOURCES_DATA && RESOURCES_DATA.people) {
    Object.keys(RESOURCES_DATA.people).forEach(function(n) {
      if (RESOURCES_DATA.people[n].active !== false) suggestionSet[n] = true;
    });
  }
  var suggestions = Object.keys(suggestionSet).sort();

  var html = '';
  html += '<div class="pr-modal-header">';
  html += '<div class="pr-modal-title">' + (existing ? 'Edit Review Entry' : 'Log Review') + ' &mdash; ' + esc(rt.name) + '<small>' + ((rt.cadence_days === 7) ? 'weekly' : (rt.cadence_days === 14) ? 'biweekly' : ((rt.cadence_days || '?') + 'd')) + ' cadence</small></div>';
  html += '<button class="pr-modal-close" onclick="prCloseLogModal()">&times;</button>';
  html += '</div>';

  html += '<div class="pr-modal-body">';
  html += '<div class="pr-field"><label class="pr-field-label">Project</label>';
  html += '<input type="text" disabled value="' + esc((p.project_number || '') + ' — ' + (p.title || '')) + '"></div>';

  html += '<div class="pr-field"><label class="pr-field-label">Meeting Date</label>';
  html += '<input type="date" id="pr-input-meeting-date" value="' + esc(meetingDate) + '"></div>';

  html += '<div class="pr-field"><label class="pr-field-label">Attendees</label>';
  html += '<input type="text" id="pr-input-attendees" value="' + esc(attendeesValue) + '" placeholder="Comma-separated names">';
  html += '<div class="pr-field-help">Free text. Click a chip to add.</div>';
  html += '<div class="pr-suggestions">';
  suggestions.forEach(function(n) {
    html += '<span class="pr-sug-chip" onclick="prAddAttendeeChip(' + JSON.stringify(n).replace(/"/g, '&quot;') + ')">+ ' + esc(n) + '</span>';
  });
  html += '</div></div>';

  html += '<div class="pr-field"><label class="pr-field-label">Notes</label>';
  html += '<textarea id="pr-input-notes" placeholder="What did the team discuss? Status, blockers, dependencies…">' + esc(existing ? existing.notes : '') + '</textarea></div>';

  html += '<div class="pr-field"><label class="pr-field-label">Decisions</label>';
  html += '<textarea id="pr-input-decisions" placeholder="What was decided in this meeting?">' + esc(existing ? existing.decisions : '') + '</textarea></div>';

  html += '<div class="pr-field"><label class="pr-field-label">Action Items</label>';
  html += '<textarea id="pr-input-action-items" placeholder="One per line. Owner — action — due date if applicable.">' + esc(existing ? existing.action_items : '') + '</textarea></div>';

  html += '</div>'; // pr-modal-body

  html += '<div class="pr-modal-footer">';
  html += '<button class="pr-btn pr-btn-secondary" onclick="prCloseLogModal()">Cancel</button>';
  html += '<button class="pr-btn pr-btn-primary" id="pr-save-btn" onclick="prSaveLog()">' + (existing ? 'Save Changes' : 'Save Review Entry') + '</button>';
  html += '</div>';

  document.getElementById('pr-modal').innerHTML = html;
  document.getElementById('pr-modal-backdrop').classList.add('open');
}

function prCloseLogModal() {
  var bd = document.getElementById('pr-modal-backdrop');
  if (bd) bd.classList.remove('open');
  _prModalState = null;
}

function prAddAttendeeChip(name) {
  var input = document.getElementById('pr-input-attendees');
  if (!input) return;
  var list = input.value.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  if (list.indexOf(name) >= 0) return;
  list.push(name);
  input.value = list.join(', ');
}

async function prSaveLog() {
  if (!_prModalState) return;
  var saveBtn = document.getElementById('pr-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  var meetingDate = (document.getElementById('pr-input-meeting-date') || {}).value || '';
  var attendees = (document.getElementById('pr-input-attendees') || {}).value || '';
  var notes = (document.getElementById('pr-input-notes') || {}).value || '';
  var decisions = (document.getElementById('pr-input-decisions') || {}).value || '';
  var actionItems = (document.getElementById('pr-input-action-items') || {}).value || '';

  if (!meetingDate) {
    showToast('Meeting date is required.', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Review Entry'; }
    return;
  }

  var meetingEpoch = prDateToEpoch(meetingDate);
  var nowEpoch = Date.now();

  try {
    if (_prModalState.editObjectId) {
      // Update
      var existing = PROJECT_REVIEWS.find(function(r) { return r.objectId === _prModalState.editObjectId; });
      var updateAttrs = {
        ObjectId: _prModalState.editObjectId,
        meeting_date: meetingDate,  // DateOnly: send YYYY-MM-DD string
        attendees: attendees,
        notes: notes,
        decisions: decisions,
        action_items: actionItems
      };
      var result = await agolApplyEdits(ARCGIS_CONFIG.projectReviewsUrl, { updates: [{ attributes: updateAttrs }] });
      if (result.updateResults && result.updateResults[0] && !result.updateResults[0].success) {
        var err = result.updateResults[0].error || {};
        throw new Error(err.description || 'Update failed');
      }
      // Update in-memory copy
      if (existing) {
        existing.meeting_date = meetingEpoch;
        existing.attendees = attendees;
        existing.notes = notes;
        existing.decisions = decisions;
        existing.action_items = actionItems;
      }
      showToast('Review entry updated.', 'success');
    } else {
      // Add
      var newReviewId = nextReviewId();
      // review_id was dropped from the schema. Creator/CreationDate
      // auto-populated by AGO via editor tracking.
      var addAttrs = {
        review_type_id: _prModalState.reviewTypeId,
        project_number: _prModalState.projectNumber,
        meeting_date: meetingDate,  // DateOnly: send YYYY-MM-DD string
        attendees: attendees,
        notes: notes,
        decisions: decisions,
        action_items: actionItems,
      };
      var result2 = await agolApplyEdits(ARCGIS_CONFIG.projectReviewsUrl, { adds: [{ attributes: addAttrs }] });
      if (result2.addResults && result2.addResults[0] && !result2.addResults[0].success) {
        var err2 = result2.addResults[0].error || {};
        throw new Error(err2.description || 'Add failed');
      }
      var newOid = result2.addResults && result2.addResults[0] ? result2.addResults[0].objectId : null;
      PROJECT_REVIEWS.push({
        objectId: newOid,
        review_id: newReviewId,  // local-only; field dropped from schema
        review_type_id: addAttrs.review_type_id,
        project_number: addAttrs.project_number,
        meeting_date: meetingEpoch,  // local model uses epoch ms (sort/date math)
        attendees: addAttrs.attendees,
        notes: addAttrs.notes,
        decisions: addAttrs.decisions,
        action_items: addAttrs.action_items,
        created_by: Auth.fullName || (Auth.username || ''),
        created_at: nowEpoch
      });
      showToast('Review entry saved.', 'success');
    }
    prCloseLogModal();
    render();
  } catch (e) {
    console.error('Save review failed:', e);
    showToast('Save failed: ' + e.message, 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = _prModalState && _prModalState.editObjectId ? 'Save Changes' : 'Save Review Entry'; }
  }
}

async function prDeleteLog(objectId) {
  if (!objectId) return;
  if (!confirm('Delete this review entry? This cannot be undone.')) return;
  try {
    var result = await agolApplyEdits(ARCGIS_CONFIG.projectReviewsUrl, { deletes: [objectId] });
    if (result.deleteResults && result.deleteResults[0] && !result.deleteResults[0].success) {
      var err = result.deleteResults[0].error || {};
      throw new Error(err.description || 'Delete failed');
    }
    PROJECT_REVIEWS = PROJECT_REVIEWS.filter(function(r) { return r.objectId !== objectId; });
    showToast('Review entry deleted.', 'success');
    render();
  } catch (e) {
    console.error('Delete review failed:', e);
    showToast('Delete failed: ' + e.message, 'error');
  }
}

// ── Settings: Review Types editor ────────────────────────────
// Tier 2: a non-admin Team Lead manages only their own team's review types.
function _prRtActorLeadTeam() {
  return (typeof isAdmin === 'function' && !isAdmin() && typeof getLeadTeam === 'function') ? getLeadTeam() : null;
}
function _prRtInActorTeam(rt) {
  var lead = _prRtActorLeadTeam();
  if (!lead) return true; // admins (and non-leads) see all
  var teams = prRtScopeTeams(rt) || [];
  return teams.some(function (t) { return (typeof sameTeam === 'function') ? sameTeam(t, lead) : t === lead; });
}

function renderReviewTypesTable() {
  var container = document.getElementById('review-types-table');
  if (!container) return;
  var _visibleRts = (_reviewTypes || []).filter(function(rt) { return _prRtInActorTeam(rt); });
  if (!_visibleRts.length) {
    var _forYour = _prRtActorLeadTeam() ? ' for your team' : '';
    container.innerHTML = '<div style="background:#fff;border:1px dashed var(--border);border-radius:10px;padding:24px;text-align:center;color:var(--text-muted);font-style:italic;font-family:Cardo,serif;">No review types' + _forYour + ' yet. Click &ldquo;Add review type&rdquo; to create one.</div>';
    return;
  }
  var html = '<table class="pr-rt-table">';
  html += '<thead><tr><th>Name</th><th>Cadence</th><th>Teams in scope</th><th>Default attendees</th><th style="text-align:right;">Actions</th></tr></thead><tbody>';
  _reviewTypes.forEach(function(rt, i) {
    if (!_prRtInActorTeam(rt)) return; // team leads see only their own team's lanes (i stays the real index)
    var cadenceLabel = (rt.cadence_days === 7) ? 'Weekly' :
                       (rt.cadence_days === 14) ? 'Biweekly' :
                       (rt.cadence_days ? rt.cadence_days + ' days' : '—');
    var teams = prRtScopeTeams(rt);
    var attendees = rt.default_attendees || [];
    var teamsLabel = teams.length ? teams.length + ' team' + (teams.length === 1 ? '' : 's') : '—';
    var teamsTitle = teams.join('\n');
    var attendeesPreview = attendees.length ? (attendees.slice(0, 3).join(', ') + (attendees.length > 3 ? ' +' + (attendees.length - 3) + ' more' : '')) : '—';
    html += '<tr>';
    html += '<td><div style="font-weight:800;color:var(--navy);">' + esc(rt.name) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;margin-top:2px;">id: ' + esc(rt.id) + '</div>';
    if (rt.description) html += '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">' + esc(rt.description) + '</div>';
    html += '</td>';
    html += '<td>' + cadenceLabel + '</td>';
    html += '<td title="' + esc(teamsTitle) + '">' + teamsLabel + '</td>';
    html += '<td>' + esc(attendeesPreview) + '</td>';
    html += '<td style="text-align:right;white-space:nowrap;">';
    html += '<button class="settings-btn settings-btn-secondary" style="margin-right:4px;" onclick="prRtOpenForm(' + i + ')">✏️ Edit</button>';
    html += '<button class="settings-btn settings-btn-danger" onclick="prRtDelete(' + i + ')">🗑</button>';
    html += '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function prRtOpenForm(index) {
  var isNew = (index == null);
  var existing = isNew ? null : _reviewTypes[index];
  var actorLead = _prRtActorLeadTeam();
  if (!isNew && actorLead && !_prRtInActorTeam(existing)) {
    showToast('You can only edit your own team\'s review types.', 'warn');
    return;
  }
  var data = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: '', name: '', description: '',
    filter: { teams: actorLead ? [actorLead] : [] },
    cadence_days: 14,
    default_attendees: []
  };

  // Team Leads can only scope to their own team; admins choose any.
  var teamsList = actorLead ? [actorLead]
    : ((typeof _customOwningTeams !== 'undefined' && _customOwningTeams.length) ? _customOwningTeams.slice()
      : ((typeof FM_OWNING_TEAMS !== 'undefined') ? FM_OWNING_TEAMS.slice() : []));
  var scopeTeams = actorLead ? [actorLead] : prRtScopeTeams(data);
  var memberNames = (RESOURCES_DATA && RESOURCES_DATA.people) ?
    Object.keys(RESOURCES_DATA.people).filter(function(n) { return RESOURCES_DATA.people[n].active !== false; }).sort() : [];

  var html = '';
  html += '<div class="pr-modal-header">';
  html += '<div class="pr-modal-title">' + (isNew ? 'Add Review Type' : 'Edit Review Type') + '</div>';
  html += '<button class="pr-modal-close" onclick="prRtCloseForm()">&times;</button>';
  html += '</div>';

  html += '<div class="pr-modal-body">';
  html += '<div class="pr-field"><label class="pr-field-label">Name</label>';
  html += '<input type="text" id="pr-rt-input-name" value="' + esc(data.name) + '" placeholder="e.g. Data Team Review"></div>';

  html += '<div class="pr-field"><label class="pr-field-label">ID</label>';
  html += '<input type="text" id="pr-rt-input-id" value="' + esc(data.id) + '" ' + (isNew ? '' : 'disabled ') + 'placeholder="kebab-case slug, e.g. data-team">';
  html += '<div class="pr-field-help">Used as a stable key in stored review entries. Cannot be changed once review entries exist.</div></div>';

  html += '<div class="pr-field"><label class="pr-field-label">Description</label>';
  html += '<textarea id="pr-rt-input-desc" placeholder="Short description shown in the cycle strip on the Project Review tab.">' + esc(data.description || '') + '</textarea></div>';

  html += '<div class="pr-field"><label class="pr-field-label">Cadence (days)</label>';
  html += '<input type="number" id="pr-rt-input-cadence" min="1" max="365" value="' + (data.cadence_days || 14) + '">';
  html += '<div class="pr-field-help">7 = weekly, 14 = biweekly, 30 = monthly.</div></div>';

  html += '<div class="pr-field"><label class="pr-field-label">Teams in scope</label>';
  html += '<div class="pr-itd-checkboxes">';
  if (!teamsList.length) {
    html += '<div style="font-style:italic;color:var(--text-muted);font-family:Cardo,serif;font-size:13px;">No teams defined.</div>';
  } else {
    teamsList.forEach(function(t) {
      var checked = (scopeTeams.indexOf(t) >= 0) ? ' checked' : '';
      var lock = actorLead ? ' disabled title="Team Leads can only scope reviews to their own team"' : '';
      html += '<label><input type="checkbox" class="pr-rt-team-cb" value="' + esc(t) + '"' + checked + lock + '> ' + esc(t) + '</label>';
    });
  }
  html += '</div>';
  html += '<div class="pr-field-help">Projects are matched by their <strong>Team</strong> (owning_team).</div></div>';

  var rdpChecked = (data.filter && data.filter.require_data_program) ? ' checked' : '';
  var gbqChecked = (data.filter && data.filter.group_by_quarter) ? ' checked' : '';
  html += '<div class="pr-field"><label class="pr-field-label">Additional options</label>';
  html += '<label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-bottom:6px;"><input type="checkbox" id="pr-rt-input-require-dp"' + rdpChecked + '> Only include projects flagged as Data Program</label>';
  html += '<label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" id="pr-rt-input-group-quarter"' + gbqChecked + '> Group projects by fiscal quarter (Past · Current · Future)</label>';
  html += '<div class="pr-field-help">FY runs Jul 1 – Jun 30. Projects bucket by their target end date; slipped projects stay in their original quarter.</div></div>';

  html += '<div class="pr-field"><label class="pr-field-label">Default Attendees</label>';
  html += '<input type="text" id="pr-rt-input-attendees" value="' + esc((data.default_attendees || []).join(', ')) + '" placeholder="Comma-separated names">';
  html += '<div class="pr-field-help">Free text. Click a chip to append a team member name.</div>';
  if (memberNames.length) {
    html += '<div class="pr-suggestions">';
    memberNames.forEach(function(n) {
      html += '<span class="pr-sug-chip" onclick="prRtAddAttendee(' + JSON.stringify(n).replace(/"/g, '&quot;') + ')">+ ' + esc(n) + '</span>';
    });
    html += '</div>';
  }
  html += '</div>';

  html += '</div>'; // pr-modal-body

  html += '<div class="pr-modal-footer">';
  html += '<button class="pr-btn pr-btn-secondary" onclick="prRtCloseForm()">Cancel</button>';
  html += '<button class="pr-btn pr-btn-primary" id="pr-rt-save-btn" onclick="prRtSaveForm(' + (isNew ? '-1' : index) + ')">' + (isNew ? 'Add Review Type' : 'Save Changes') + '</button>';
  html += '</div>';

  document.getElementById('pr-rt-modal').innerHTML = html;
  document.getElementById('pr-rt-modal-backdrop').classList.add('open');
}

function prRtCloseForm() {
  var bd = document.getElementById('pr-rt-modal-backdrop');
  if (bd) bd.classList.remove('open');
}

function prRtAddAttendee(name) {
  var input = document.getElementById('pr-rt-input-attendees');
  if (!input) return;
  var list = input.value.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  if (list.indexOf(name) >= 0) return;
  list.push(name);
  input.value = list.join(', ');
}

async function prRtSaveForm(index) {
  var saveBtn = document.getElementById('pr-rt-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  var name = (document.getElementById('pr-rt-input-name') || {}).value || '';
  var id = (document.getElementById('pr-rt-input-id') || {}).value || '';
  var desc = (document.getElementById('pr-rt-input-desc') || {}).value || '';
  var cadenceRaw = (document.getElementById('pr-rt-input-cadence') || {}).value || '14';
  var cadence = parseInt(cadenceRaw, 10);
  if (isNaN(cadence) || cadence < 1) cadence = 14;
  var attendeesStr = (document.getElementById('pr-rt-input-attendees') || {}).value || '';
  var attendees = attendeesStr.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });

  var teamCbs = document.querySelectorAll('.pr-rt-team-cb');
  var teams = [];
  teamCbs.forEach(function(cb) { if (cb.checked) teams.push(cb.value); });
  var requireDp = !!(document.getElementById('pr-rt-input-require-dp') || {}).checked;
  var groupQ = !!(document.getElementById('pr-rt-input-group-quarter') || {}).checked;

  name = name.trim();
  id = id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

  if (!name) { showToast('Name is required.', 'error'); if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = (index < 0 ? 'Add Review Type' : 'Save Changes'); } return; }
  if (!id) { showToast('ID is required.', 'error'); if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = (index < 0 ? 'Add Review Type' : 'Save Changes'); } return; }

  var isNew = (index < 0);
  // Team Lead enforcement: lock scope to their team and block editing others'.
  var actorLead = _prRtActorLeadTeam();
  if (actorLead) {
    if (!isNew) {
      var _ex = _reviewTypes[index];
      if (_ex && !_prRtInActorTeam(_ex)) {
        showToast('You can only edit your own team\'s review types.', 'warn');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
        return;
      }
    }
    teams = [actorLead];
  }
  if (isNew) {
    if (_reviewTypes.some(function(rt) { return rt.id === id; })) {
      showToast('A review type with id "' + id + '" already exists.', 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Add Review Type'; }
      return;
    }
    _reviewTypes.push({ id: id, name: name, description: desc, filter: { teams: teams, require_data_program: requireDp, group_by_quarter: groupQ }, cadence_days: cadence, default_attendees: attendees });
  } else {
    var existing = _reviewTypes[index];
    // Preserve any existing filter fields (default_statuses, review_mode) that aren't surfaced in this form.
    var preservedDefaults = (existing.filter && Array.isArray(existing.filter.default_statuses)) ? existing.filter.default_statuses.slice() : null;
    var preservedMode = (existing.filter && existing.filter.review_mode) || null;
    existing.name = name;
    existing.description = desc;
    // Wholesale reassign drops the legacy itd_teams field, migrating this
    // record from unit-based to team-based scoping.
    existing.filter = { teams: teams, require_data_program: requireDp, group_by_quarter: groupQ };
    if (preservedDefaults) existing.filter.default_statuses = preservedDefaults;
    if (preservedMode) existing.filter.review_mode = preservedMode;
    existing.cadence_days = cadence;
    existing.default_attendees = attendees;
  }

  try {
    var ok = await saveConfigKey('review_types', _reviewTypes);
    if (!ok) throw new Error('Save failed');
    showToast('Review type ' + (isNew ? 'added' : 'updated') + '.', 'success');
    prRtCloseForm();
    renderReviewTypesTable();
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = (isNew ? 'Add Review Type' : 'Save Changes'); }
  }
}

async function prRtDelete(index) {
  var rt = _reviewTypes[index];
  if (!rt) return;
  var actorLead = _prRtActorLeadTeam();
  if (actorLead && !_prRtInActorTeam(rt)) {
    showToast('You can only delete your own team\'s review types.', 'warn');
    return;
  }
  // Check if any reviews exist for this type
  var existingCount = PROJECT_REVIEWS.filter(function(r) { return r.review_type_id === rt.id; }).length;
  var msg = 'Delete review type "' + rt.name + '"?';
  if (existingCount > 0) {
    msg += '\n\n' + existingCount + ' review entr' + (existingCount === 1 ? 'y' : 'ies') + ' use this type. They will remain in the database but will not appear on the Project Review tab.';
  }
  if (!confirm(msg)) return;
  _reviewTypes.splice(index, 1);
  // If the deleted type was selected on the Project Review tab, fall back
  if (_currentReviewTypeId === rt.id) _currentReviewTypeId = null;
  try {
    var ok = await saveConfigKey('review_types', _reviewTypes);
    if (!ok) throw new Error('Save failed');
    showToast('Review type deleted.', 'success');
    renderReviewTypesTable();
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
}
