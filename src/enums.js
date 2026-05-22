// Enum / dropdown-options layer — extracted from index.html on 2026-05-22.
// Classic script: functions and the FM_* alias globals below are shared with the
// rest of the app. mergeEnums merges the hardcoded preferred list with live data;
// refreshEnums() recomputes the FM_* aliases (read by the form builders) after
// config/resources load. Relies on globals defined elsewhere (PROJECTS, TASKS,
// RESOURCES_DATA, _custom* config lists, buildDescMap, TASK_TOOL_DESCRIPTIONS…).

// ── Dynamic enum helpers ──────────────────────────────────────────────
// mergeEnums(preferred, fromData) returns the preferred list with any
// unknown values found in actual data appended (sorted) at the end.
// This means form dropdowns always reflect the live data, not just the
// hardcoded list, so adding a new assignee / category / tool in the
// source spreadsheet will automatically appear without a code change.
function mergeEnums(preferred, fromData) {
  const extras = [...new Set(fromData)].filter(v => v && !preferred.includes(v)).sort();
  return [...preferred, ...extras];
}
function getEnums() {
  const projStatuses   = mergeEnums(
    ['Active','Scheduled','On Hold','Future','Idea','Complete','Canceled'],
    PROJECTS.map(p => p.status)
  );
  const projPriorities = mergeEnums(
    ['High','Medium','Low'],
    PROJECTS.map(p => p.priority)
  );
  const projCategories = mergeEnums(
    _customProjCategories.map(function(c) { return c.name; }),
    PROJECTS.map(p => p.category)
  );
  const taskStatuses   = mergeEnums(
    ['Active','On Hold','Pending','Waiting for Response','Complete','Canceled'],
    TASKS.map(t => t.status)
  );
  const taskPriorities = mergeEnums(
    ['High','Medium','Low'],
    TASKS.map(t => t.priority)
  );
  const activeMembers = RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return isFullMember(n); }).sort() : [];
  const taskAssignees  = mergeEnums(
    activeMembers,
    []
  );
  const taskTools      = mergeEnums(
    _customTaskTools.map(function(c) { return c.name; }),
    TASKS.map(t => t.tool)
  );
  const taskCategories = mergeEnums(
    _customTaskCategories.map(function(c) { return c.name; }),
    TASKS.map(t => t.category)
  );
  const partnerDepts = mergeEnums(
    _customPartnerDepts,
    PROJECTS.map(p => p.partner_dept)
  );
  const itdTeams = mergeEnums(
    _customItdTeams,
    PROJECTS.map(p => p.itd_team)
  );
  return { projStatuses, projPriorities, projCategories,
           taskStatuses, taskPriorities, taskAssignees, taskTools, taskCategories,
           partnerDepts, itdTeams };
}
// Aliases used throughout the form builders — re-evaluated each time
// a form opens via buildProjectForm / buildTaskForm so they pick up
// any new values created since the page loaded.
let FM_PROJ_STATUSES, FM_PROJ_PRIORITIES, FM_PROJ_CATEGORIES,
    FM_TASK_STATUSES, FM_TASK_PRIORITIES, FM_TASK_ASSIGNEES, FM_TASK_TOOLS, FM_TASK_TOOLS_ACTIVE, FM_TASK_CATEGORIES,
    FM_ACTIVE_MEMBERS, FM_FULL_MEMBERS,
    FM_PARTNER_DEPTS, FM_ITD_TEAMS;

// Helper: returns true for active members with full workload tracking (excludes light-tracking collaborators)
function isFullMember(name) {
  if (!RESOURCES_DATA || !RESOURCES_DATA.people[name]) return false;
  var p = RESOURCES_DATA.people[name];
  return p.active !== false && p.tracking_level !== 'light';
}

function refreshEnums() {
  const e = getEnums();
  FM_PROJ_STATUSES   = e.projStatuses;
  FM_PROJ_PRIORITIES = e.projPriorities;
  FM_PROJ_CATEGORIES = e.projCategories;
  FM_TASK_STATUSES   = e.taskStatuses;
  FM_TASK_PRIORITIES = e.taskPriorities;
  FM_TASK_ASSIGNEES  = e.taskAssignees;
  FM_TASK_TOOLS      = e.taskTools;
  FM_TASK_TOOLS_ACTIVE = _customTaskTools.filter(function(t) { return t.active !== false; }).map(function(t) { return t.name; }).sort();
  FM_ACTIVE_MEMBERS = RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return RESOURCES_DATA.people[n].active !== false; }).sort() : [];
  FM_FULL_MEMBERS = RESOURCES_DATA ? Object.keys(RESOURCES_DATA.people).filter(function(n) { return isFullMember(n); }).sort() : [];
  FM_TASK_CATEGORIES = e.taskCategories;
  FM_PARTNER_DEPTS   = e.partnerDepts;
  FM_ITD_TEAMS       = e.itdTeams;
  // Rebuild description maps from custom arrays
  CATEGORY_DESCRIPTIONS = buildDescMap(_customProjCategories);
  TASK_CATEGORY_DESCRIPTIONS = buildDescMap(_customTaskCategories);
  TASK_TOOL_DESCRIPTIONS = buildDescMap(_customTaskTools);
}

// Short descriptions for each project category — shown in the searchable dropdown
// Description maps — initialized empty, populated by refreshEnums() after custom arrays load
let CATEGORY_DESCRIPTIONS = {};

let TASK_CATEGORY_DESCRIPTIONS = {};
