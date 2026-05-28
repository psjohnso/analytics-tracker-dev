// ─────────────────────────────────────────────────────────────────────
// render.js — router, navigation state, filters, view/sort
//
// Owns the "controller" layer of the app: which tab is showing, what
// detail page is open, current view mode and pagination, sort keys,
// active filter set, and all the navigation/sidebar/tab plumbing that
// drives those state changes.
//
// This file deliberately does NOT include render() itself or any
// per-tab render*() function — those are the "view" layer and live in
// index.html (and will move to src/tabs/* in a future pass). render.js
// is what calls them.
//
// Forward references (resolve at call time): render, the per-tab
// renderers (renderProjectDetail, renderProjectGrid, ...), showToast,
// resolveProjectTitle, Auth, isFeatureOn, Internal, UserPrefs,
// openProject. All defined in the inline script that loads after this.
// ─────────────────────────────────────────────────────────────────────

// ── Router state ────────────────────────────────────────────────────
let currentTab = 'overview';
let currentDetail = null; // {type:'project'|'task', id}

// View / pagination / sort
let currentView = 'list';
let currentPage = 1;
let PAGE_SIZE = 24;
let taskSortKey = 'project';
let taskSortDir = 'asc';
let projListSortKey = 'title';
let projListSortDir = 'asc';

let activeFilters = {
  status: [],
  priority: [],
  category: [],
  member: [],
  taskStatus: [],
  taskCategory: [],
  taskTool: [],
  partnerDept: [],
  itdTeam: [],
  dataProgram: false,
  search: '',
  // Computed dimension (not a value list): items past due and still open.
  // Set only by the "Overdue" preset; honored by filterProjects/filterTasks.
  overdue: false,
};

// ─── STATUS / PRIORITY COLORS ─────────────────────────────────────────
// Mapped to City of Tucson brand palette (COT_Brand_Guide_1.pdf)
const STATUS_COLOR_MAP = {
  'Active': '#83AC16',              // Saguaro Green
  'Complete': '#0088FF',            // Sky Blue
  'Canceled': '#B0B3AE',           // Monsoon Gray (darkened for visibility)
  'Future': '#C24200',              // Sunset Orange
  'On Hold': '#FFDB22',             // Sun Yellow
  'Scheduled': '#9E0059',           // Cactus Fruit
  'Idea': '#E5D086',                // Sonoran Sand
  'Pending': '#C24200',             // Sunset Orange
  'Waiting for Response': '#002669',// Tucson Blue
};
// Okabe-Ito-derived alternates, used when UserPrefs.colorBlindMode is on.
// Picks colors that stay distinguishable for deuteranopia and protanopia
// (the common red-green types). Yellow and gray stay; greens shift to a
// bluish-green; reds/oranges shift to vermillion + Okabe orange; the
// scheduled magenta moves to reddish-purple.
const STATUS_COLOR_MAP_CB = {
  'Active': '#009E73',              // bluish green
  'Complete': '#0072B2',            // deep blue
  'Canceled': '#B0B3AE',            // gray (unchanged)
  'Future': '#E69F00',              // Okabe orange
  'On Hold': '#F0E442',              // Okabe yellow
  'Scheduled': '#CC79A7',            // reddish purple
  'Idea': '#E5D086',                 // sand (unchanged — light)
  'Pending': '#D55E00',              // vermillion
  'Waiting for Response': '#56B4E9'  // sky blue
};
// OE Redesign — subdued Tucson hues (the saturated "dot" colors). Used when an
// "oe" / "oe-dark" theme is active; pairs with the dark-text .status-pill rule
// in theme-oe.css for AA contrast (tinted bg + dark fg + saturated dot).
const STATUS_COLOR_MAP_OE = {
  'Active': '#8aa050',               // saguaro
  'Complete': '#8a4c70',             // cactus plum
  'Canceled': '#b8b9b3',             // monsoon
  'Future': '#4a7fae',               // sky
  'On Hold': '#c89500',              // sun
  'Scheduled': '#1f3b6b',            // innovation
  'Idea': '#d4bc7a',                 // sand
  'Pending': '#b85630',              // sunset
  'Waiting for Response': '#3d5878', // steel
};
// STATUS_COLOR() returns a color for any status, including unknown ones.
// Unknown statuses get a deterministic color derived from the string itself
// so each distinct new status gets its own consistent color rather than
// all collapsing to the same gray.
function STATUS_COLOR(s) {
  if (!s) return '#9CA3AF';
  var cb = (typeof UserPrefs !== 'undefined' && UserPrefs && UserPrefs.colorBlindMode);
  var oe = !cb && typeof document !== 'undefined' && document.body && /^oe/.test(document.body.dataset.theme || '');
  var map = cb ? STATUS_COLOR_MAP_CB : (oe ? STATUS_COLOR_MAP_OE : STATUS_COLOR_MAP);
  if (map[s]) return map[s];
  // Hash the string to pick from a set of brand-adjacent palette colors.
  // CB palette uses the Okabe-Ito 7 (skip yellow to avoid collisions with On Hold).
  const extras = cb
    ? ['#0072B2','#009E73','#E69F00','#56B4E9','#CC79A7','#D55E00']
    : (oe ? ['#1f3b6b','#8aa050','#b85630','#8a4c70','#4a7fae','#3d2e55']
          : ['#0088FF','#83AC16','#C24200','#002669','#9E0059','#E5D086']);
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return extras[Math.abs(hash) % extras.length];
}

// Returns white or dark text color for readability on a status background
function STATUS_TEXT_COLOR(s) {
  var light = { 'On Hold': true, 'Idea': true };
  return light[s] ? '#002669' : '#ffffff';
}

const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };

// ─── INIT ──────────────────────────────────────────────────────────────
function init() {
  buildSidebarFilters();
  render();
}

// ─── SIDEBAR FILTERS ──────────────────────────────────────────────────

function reorderSidebarFilters(tab) {
  const sidebar = document.querySelector('.sidebar');
  const taskGroup = document.getElementById('sidebar-task-filters');
  const projectGroup = document.getElementById('sidebar-project-filters');
  if (!sidebar || !taskGroup || !projectGroup) return;

  if (tab === 'tasks') {
    taskGroup.style.display = '';
    projectGroup.style.display = 'none';
    sidebar.insertBefore(taskGroup, projectGroup);
  } else if (tab === 'projects') {
    projectGroup.style.display = '';
    taskGroup.style.display = 'none';
    sidebar.insertBefore(projectGroup, taskGroup);
  } else {
    // Overview and other tabs: show both
    projectGroup.style.display = '';
    taskGroup.style.display = '';
    sidebar.insertBefore(projectGroup, taskGroup);
  }
}

function buildSidebarFilters() {
  // Each badge is a *live preview*: the count you'd see if you ADDED that
  // filter on top of the currently-active filter set. So we compute counts
  // by re-applying every active filter EXCEPT the one whose badges we're
  // about to render — that way toggling unrelated filters updates the
  // numbers as the user expects.
  const tab = (typeof currentTab !== 'undefined') ? currentTab : 'overview';
  const showProjects = tab !== 'tasks';
  const showTasks = tab !== 'projects';

  const showFormer = document.getElementById('show-former-members');
  const showContribs = document.getElementById('show-contributors');
  const includeInactive = showFormer && showFormer.checked;
  const includeContributors = showContribs && showContribs.checked;
  const isActiveMember = function(name) {
    if (includeInactive) return true;
    if (!RESOURCES_DATA || !RESOURCES_DATA.people[name]) return true;
    return RESOURCES_DATA.people[name].active !== false;
  };
  const isVisibleMember = function(name) {
    // No team gate here: the member list is built from the team's own scoped
    // projects/tasks (below), so anyone appearing in the team's work — including
    // cross-team contributors — is filterable. Still honors the active/affiliated toggles.
    if (!isActiveMember(name)) return false;
    if (includeContributors) return true;
    if (!RESOURCES_DATA || !RESOURCES_DATA.people[name]) return true;
    return RESOURCES_DATA.people[name].member_group !== 'Affiliated';
  };

  // Mirror filterProjects() but skip one named filter so we can group/count by it.
  function projectsExcluding(skip) {
    let data = PROJECTS;
    if (typeof inCurrentTeamProject === 'function') data = data.filter(inCurrentTeamProject);
    if (skip !== 'status' && activeFilters.status.length)
      data = data.filter(p => activeFilters.status.includes(p.status));
    if (skip !== 'priority' && activeFilters.priority.length)
      data = data.filter(p => activeFilters.priority.includes(p.priority || 'Unset'));
    if (skip !== 'category' && activeFilters.category.length)
      data = data.filter(p => activeFilters.category.includes(p.category));
    if (skip !== 'member' && activeFilters.member.length)
      data = data.filter(p => activeFilters.member.includes(p.contact) ||
        (p.other_members && activeFilters.member.some(m => p.other_members.includes(m))));
    if (skip !== 'partnerDept' && activeFilters.partnerDept.length)
      data = data.filter(p => activeFilters.partnerDept.includes(p.partner_dept));
    if (skip !== 'itdTeam' && activeFilters.itdTeam.length)
      data = data.filter(p => activeFilters.itdTeam.includes(p.itd_team));
    if (skip !== 'dataProgram' && activeFilters.dataProgram)
      data = data.filter(p => p.is_data_program);
    if (activeFilters.search) data = data.filter(p =>
      (p.title || '').toLowerCase().includes(activeFilters.search) ||
      (p.description || '').toLowerCase().includes(activeFilters.search) ||
      (p.contact || '').toLowerCase().includes(activeFilters.search) ||
      (p.other_members || '').toLowerCase().includes(activeFilters.search) ||
      (p.partner_dept || '').toLowerCase().includes(activeFilters.search) ||
      (p.project_number || '').toLowerCase().includes(activeFilters.search)
    );
    return data;
  }

  // Mirror filterTasks() but skip one named filter.
  function tasksExcluding(skip) {
    let data = TASKS;
    if (typeof inCurrentTeamTask === 'function') data = data.filter(inCurrentTeamTask);
    if (skip !== 'taskStatus' && activeFilters.taskStatus.length)
      data = data.filter(t => activeFilters.taskStatus.includes(t.status));
    if (skip !== 'priority' && activeFilters.priority.length)
      data = data.filter(t => activeFilters.priority.includes(t.priority || 'Unset'));
    if (skip !== 'taskCategory' && activeFilters.taskCategory.length)
      data = data.filter(t => activeFilters.taskCategory.includes(t.category));
    if (skip !== 'taskTool' && activeFilters.taskTool.length)
      data = data.filter(t => activeFilters.taskTool.includes(t.tool));
    if (skip !== 'member' && activeFilters.member.length)
      data = data.filter(t => activeFilters.member.includes(t.assignee));
    if (activeFilters.search) data = data.filter(t =>
      (t.title || '').toLowerCase().includes(activeFilters.search) ||
      resolveProjectTitle(t).toLowerCase().includes(activeFilters.search) ||
      (t.assignee || '').toLowerCase().includes(activeFilters.search) ||
      (t.task_number || '').toLowerCase().includes(activeFilters.search)
    );
    return data;
  }

  // ── Project filter counts ──
  const statuses = {};
  const priorities = {};
  const categories = {};
  const depts = {};
  const teams = {};
  if (showProjects) {
    projectsExcluding('status').forEach(p => { const k = p.status || 'Unknown'; statuses[k] = (statuses[k] || 0) + 1; });
    projectsExcluding('priority').forEach(p => { const k = p.priority || 'Unset'; priorities[k] = (priorities[k] || 0) + 1; });
    projectsExcluding('category').forEach(p => { if (p.category) categories[p.category] = (categories[p.category] || 0) + 1; });
    projectsExcluding('partnerDept').forEach(p => { if (p.partner_dept) depts[p.partner_dept] = (depts[p.partner_dept] || 0) + 1; });
    projectsExcluding('itdTeam').forEach(p => { if (p.itd_team) teams[p.itd_team] = (teams[p.itd_team] || 0) + 1; });
  }

  // ── Task filter counts ──
  const taskStatuses = {};
  const taskCats = {};
  const taskTools = {};
  if (showTasks) {
    tasksExcluding('taskStatus').forEach(t => { const k = t.status || 'Unknown'; taskStatuses[k] = (taskStatuses[k] || 0) + 1; });
    tasksExcluding('taskCategory').forEach(t => { if (t.category) taskCats[t.category] = (taskCats[t.category] || 0) + 1; });
    tasksExcluding('taskTool').forEach(t => { if (t.tool) taskTools[t.tool] = (taskTools[t.tool] || 0) + 1; });
  }

  // ── Member counts ── Scope to whichever entity types are currently
  // visible: assigned-tasks on Tasks tab; contact/contributor projects on
  // Projects tab; sum of both on Overview-style tabs.
  const members = {};
  function bump(name) { if (name && isVisibleMember(name)) members[name] = (members[name] || 0) + 1; }
  if (showTasks) {
    tasksExcluding('member').forEach(t => bump(t.assignee));
  }
  if (showProjects) {
    projectsExcluding('member').forEach(p => {
      bump(p.contact);
      if (p.other_members) {
        String(p.other_members).split(',').forEach(n => bump(n.trim()));
      }
    });
  }
  // Show people in the team's work at 0 so they stay selectable even when other
  // active filters currently exclude their items. Scoped to the team's own
  // projects/tasks so other teams' people never leak into the list.
  var _scopedT = (typeof inCurrentTeamTask === 'function') ? TASKS.filter(inCurrentTeamTask) : TASKS;
  var _scopedP = (typeof inCurrentTeamProject === 'function') ? PROJECTS.filter(inCurrentTeamProject) : PROJECTS;
  if (showTasks) {
    _scopedT.forEach(t => { if (t.assignee && !(t.assignee in members) && isVisibleMember(t.assignee)) members[t.assignee] = 0; });
  }
  if (showProjects) {
    _scopedP.forEach(p => {
      if (p.contact && !(p.contact in members) && isVisibleMember(p.contact)) members[p.contact] = 0;
      if (p.other_members) String(p.other_members).split(',').forEach(function(n) { n = n.trim(); if (n && !(n in members) && isVisibleMember(n)) members[n] = 0; });
    });
  }

  // Update affiliated toggle label with count
  var contribCount = 0;
  if (RESOURCES_DATA && RESOURCES_DATA.people) {
    contribCount = Object.keys(RESOURCES_DATA.people).filter(function(n) {
      if (typeof inCurrentTeamPerson === 'function' && !inCurrentTeamPerson(n)) return false;
      var p = RESOURCES_DATA.people[n];
      return p.active !== false && p.member_group === 'Affiliated';
    }).length;
  }
  var contribLabel = document.getElementById('show-contributors-label');
  if (contribLabel) contribLabel.textContent = contribCount > 0 ? 'Show ' + contribCount + ' affiliated member' + (contribCount !== 1 ? 's' : '') : 'Show affiliated members';

  renderFilterGroup('status-filters', statuses, 'status');
  renderFilterGroup('priority-filters', priorities, 'priority');
  renderFilterGroup('category-filters', Object.fromEntries(Object.entries(categories).sort((a,b) => a[0].localeCompare(b[0]))), 'category');
  renderFilterGroup('member-filters', Object.fromEntries(Object.entries(members).sort((a,b) => a[0].localeCompare(b[0]))), 'member');
  renderFilterGroup('task-status-filters', taskStatuses, 'taskStatus');
  renderFilterGroup('task-category-filters', Object.fromEntries(Object.entries(taskCats).sort((a,b) => a[0].localeCompare(b[0]))), 'taskCategory');
  renderFilterGroup('task-tool-filters', Object.fromEntries(Object.entries(taskTools).sort((a,b) => a[0].localeCompare(b[0]))), 'taskTool');
  renderFilterGroup('dept-filters', Object.fromEntries(Object.entries(depts).sort((a,b) => a[0].localeCompare(b[0]))), 'partnerDept');
  renderFilterGroup('team-filters', Object.fromEntries(Object.entries(teams).sort((a,b) => a[0].localeCompare(b[0]))), 'itdTeam');

  // Saved views now live in the preset bar above the results (renderPresetBar,
  // called from updateFilterIndicator on every render). Here we just sync the
  // collapsible-section open states + selection counts.
  applyAccordionState();

  // Data Program toggle filter — count projects that would remain if this
  // toggle were ON, given other active filters.
  // Data Program filter is only relevant to DP teams — hide it (and clear it)
  // when scoped to a non-DP team.
  var _dpTeamOk = (typeof isDataProgramTeam !== 'function') || isDataProgramTeam();
  const dpSection = document.getElementById('dp-filter-section');
  if (dpSection) dpSection.style.display = _dpTeamOk ? '' : 'none';
  if (!_dpTeamOk && activeFilters.dataProgram) activeFilters.dataProgram = false;
  const dpCount = projectsExcluding('dataProgram').filter(p => p.is_data_program).length;
  const dpEl = document.getElementById('dp-filter');
  if (dpEl) {
    dpEl.innerHTML = '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:2px 0;color:var(--text-body);">' +
      '<input type="checkbox" id="dp-filter-cb" ' + (activeFilters.dataProgram ? 'checked' : '') +
      ' onchange="activeFilters.dataProgram=this.checked;render();" style="width:14px;height:14px;cursor:pointer;accent-color:var(--navy);">' +
      ' Data Program only <span style="font-size:10px;color:var(--text-muted);">(' + dpCount + ')</span></label>';
  }
}

// Collapsible-sidebar support: remember per-facet search text, the last items
// rendered (so a search keystroke can re-filter without recomputing counts),
// and which accordion sections the user has explicitly opened/closed.
var facetSearch = {};
var lastFacetItems = {};
var sectionOpenState = {};
var FACET_GROUP_IDS = {
  status: 'status-filters', priority: 'priority-filters', category: 'category-filters',
  member: 'member-filters', taskStatus: 'task-status-filters', taskCategory: 'task-category-filters',
  taskTool: 'task-tool-filters', partnerDept: 'dept-filters', itdTeam: 'team-filters'
};

function renderFilterGroup(id, items, filterType) {
  const el = document.getElementById(id);
  if (!el) return;
  lastFacetItems[filterType] = items;
  const arr = activeFilters[filterType];
  const noneSelected = arr.length === 0;
  const total = Object.values(items).reduce((a,b) => a+b, 0);
  const q = (facetSearch[filterType] || '').toLowerCase();
  const allBtn = `<button class="filter-btn ${noneSelected ? 'active' : ''}" onclick="setFilter('${filterType}', null)">
    <span>All</span><span class="badge">${total}</span>
  </button>`;
  const entries = Object.entries(items).filter(([k]) => !q || k.toLowerCase().includes(q));
  var _oeOn = typeof document !== 'undefined' && document.body && /^oe/.test(document.body.dataset.theme || '');
  const btns = entries.map(([k,v], i) => {
    const isActive = arr.includes(k);
    var dotColor = STATUS_COLOR(k);
    // OE: give member rows a colored dot (Laura's sidebar), cycling the data palette.
    if (!dotColor && _oeOn && filterType === 'member') dotColor = 'var(--data-' + ((i % 8) + 1) + ')';
    const dot = dotColor ? `<span class="status-dot" style="background:${dotColor}"></span>` : '';
    return `<button class="filter-btn ${isActive ? 'active' : ''}" onclick="setFilter('${filterType}', '${k.replace(/'/g, "\\'")}')">
      <span style="display:flex;align-items:center;">${dot}${k}</span>
      <span class="badge">${v}</span>
    </button>`;
  }).join('');
  el.innerHTML = allBtn + btns + (q && !entries.length ? '<div class="facet-empty">No matches</div>' : '');
  updateAccordionCount(filterType);
}

// Live filter inside one facet's value list (the per-facet search box).
function setFacetSearch(type, val) {
  facetSearch[type] = val;
  renderFilterGroup(FACET_GROUP_IDS[type], lastFacetItems[type] || {}, type);
}

// Show the count of selected values in a facet's accordion header.
function updateAccordionCount(type) {
  var c = document.getElementById('cnt-' + type);
  if (!c) return;
  var n = activeFilters[type] ? activeFilters[type].length : 0;
  c.textContent = n ? n : '';
  c.style.display = n ? 'inline-block' : 'none';
}

// Expand a section if the user opened it, else auto-open when it has a selection.
function applyAccordionState() {
  Object.keys(FACET_GROUP_IDS).forEach(function(type) {
    var secId = 'sec-' + type;
    var el = document.getElementById(secId);
    if (!el) return;
    var open = (secId in sectionOpenState) ? sectionOpenState[secId] : (activeFilters[type].length > 0);
    el.classList.toggle('open', open);
  });
}

function toggleFilterSection(secId) {
  var el = document.getElementById(secId);
  if (!el) return;
  var open = !el.classList.contains('open');
  el.classList.toggle('open', open);
  sectionOpenState[secId] = open;
}

const OPEN_PROJECT_STATUSES = ['Active', 'Scheduled', 'On Hold', 'Future', 'Idea', 'Waiting for Response'];
const OPEN_TASK_STATUSES = ['Active', 'On Hold', 'Pending', 'Waiting for Response'];

function toggleOpenProjectsFilter() {
  if (currentTab !== 'projects') {
    switchTab('projects');
  }
  const btn = document.getElementById('open-projects-btn');
  const isActive = btn.classList.contains('weekly-active');
  if (isActive) {
    activeFilters.status = [];
    btn.classList.remove('weekly-active');
  } else {
    activeFilters.status = [...OPEN_PROJECT_STATUSES];
    btn.classList.add('weekly-active');
  }
  currentPage = 1;
  buildSidebarFilters();
  render();
}

function toggleOpenTasksFilter() {
  if (currentTab !== 'tasks') {
    switchTab('tasks');
  }
  const btn = document.getElementById('open-tasks-btn');
  const isActive = btn.classList.contains('weekly-active');
  if (isActive) {
    activeFilters.taskStatus = [];
    btn.classList.remove('weekly-active');
  } else {
    activeFilters.taskStatus = [...OPEN_TASK_STATUSES];
    btn.classList.add('weekly-active');
  }
  currentPage = 1;
  buildSidebarFilters();
  render();
}

function resetQuickFilterBtn(id, _defaultColor) {
  // Active state is now driven by the .weekly-active class (CSS .btn-accent),
  // so clearing it is just removing the class. _defaultColor kept for callers.
  const btn = document.getElementById(id);
  if (btn) btn.classList.remove('weekly-active');
}

// ─── FILTER STATE ────────────────────────────────────────────────────
function setFilter(type, val) {
  if (val === null) {
    activeFilters[type] = [];
  } else {
    const arr = activeFilters[type];
    const idx = arr.indexOf(val);
    if (idx === -1) arr.push(val);
    else arr.splice(idx, 1);
  }
  currentPage = 1;
  buildSidebarFilters();
  render();
  updateFilterIndicator();
}

// ─── SEARCH ───────────────────────────────────────────────────────────
function onSearch() {
  clearTimeout(Internal.searchDebounce);
  Internal.searchDebounce = setTimeout(function() {
    activeFilters.search = document.getElementById('search-input').value.toLowerCase();
    currentPage = 1;
    render();
    updateFilterIndicator();
  }, 200);
}

function clearAllFilters() {
  activeFilters.status = [];
  activeFilters.priority = [];
  activeFilters.category = [];
  activeFilters.member = [];
  activeFilters.taskStatus = [];
  activeFilters.taskCategory = [];
  activeFilters.taskTool = [];
  activeFilters.partnerDept = [];
  activeFilters.itdTeam = [];
  activeFilters.dataProgram = false;
  activeFilters.overdue = false;
  activeFilters.search = '';
  var searchEl = document.getElementById('search-input');
  if (searchEl) searchEl.value = '';
  var dpCb = document.getElementById('dp-filter-cb');
  if (dpCb) dpCb.checked = false;
  resetQuickFilterBtn('open-projects-btn', '#83AC16');
  resetQuickFilterBtn('open-tasks-btn', '#C24200');
  if (typeof svLastAppliedId !== 'undefined') svLastAppliedId = null;
  buildSidebarFilters();
  currentPage = 1;
  render();
  updateFilterIndicator();
  showToast('All filters cleared.', 'success');
}

function getActiveFilterCount() {
  var count = 0;
  if (activeFilters.status.length) count += activeFilters.status.length;
  if (activeFilters.priority.length) count += activeFilters.priority.length;
  if (activeFilters.category.length) count += activeFilters.category.length;
  if (activeFilters.member.length) count += activeFilters.member.length;
  if (activeFilters.taskStatus.length) count += activeFilters.taskStatus.length;
  if (activeFilters.taskCategory.length) count += activeFilters.taskCategory.length;
  if (activeFilters.taskTool.length) count += activeFilters.taskTool.length;
  if (activeFilters.partnerDept.length) count += activeFilters.partnerDept.length;
  if (activeFilters.itdTeam.length) count += activeFilters.itdTeam.length;
  if (activeFilters.dataProgram) count++;
  if (activeFilters.overdue) count++;
  if (activeFilters.search) count++;
  return count;
}

function updateFilterIndicator() {
  // The preset bar lives outside the dataDirty fast-path, so refresh it on
  // every render (covers tab switches, preset clicks, manual filter edits).
  if (typeof renderPresetBar === 'function') renderPresetBar();
  var count = getActiveFilterCount();
  var isFilterTab = currentTab === 'projects' || currentTab === 'tasks';
  var indicator = document.getElementById('sidebar-active-indicator');
  var chipsEl = document.getElementById('active-filter-chips');
  if (!indicator || !chipsEl) return;

  if (count === 0 || !isFilterTab) {
    indicator.style.display = 'none';
    return;
  }
  indicator.style.display = '';

  var chipStyle = 'display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:var(--pill-amber-bg);border:1px solid #FED7AA;color:var(--pill-amber-fg);white-space:nowrap;';
  var xStyle = 'cursor:pointer;font-weight:700;opacity:0.6;margin-left:2px;';
  var chips = '';

  function addChips(label, values, filterKey) {
    if (!values.length) return;
    var display = values.length <= 2 ? values.join(', ') : values.slice(0, 2).join(', ') + ' +' + (values.length - 2);
    chips += '<span class="afc-chip" style="' + chipStyle + '">' + label + ': ' + esc(display) +
      '<span style="' + xStyle + '" onclick="activeFilters.' + filterKey + '=[];buildSidebarFilters();render();updateFilterIndicator();">&times;</span></span>';
  }

  addChips('Status', activeFilters.status, 'status');
  addChips('Priority', activeFilters.priority, 'priority');
  addChips('Category', activeFilters.category, 'category');
  addChips('Member', activeFilters.member, 'member');
  addChips('Task status', activeFilters.taskStatus, 'taskStatus');
  addChips('Task category', activeFilters.taskCategory, 'taskCategory');
  addChips('Tool', activeFilters.taskTool, 'taskTool');
  addChips('Dept', activeFilters.partnerDept, 'partnerDept');
  addChips('Team', activeFilters.itdTeam, 'itdTeam');
  if (activeFilters.dataProgram) {
    chips += '<span style="' + chipStyle + '">Data Program' +
      '<span style="' + xStyle + '" onclick="activeFilters.dataProgram=false;buildSidebarFilters();render();updateFilterIndicator();">&times;</span></span>';
  }
  if (activeFilters.overdue) {
    chips += '<span style="' + chipStyle + '">Overdue' +
      '<span style="' + xStyle + '" onclick="activeFilters.overdue=false;buildSidebarFilters();render();updateFilterIndicator();">&times;</span></span>';
  }
  if (activeFilters.search) {
    chips += '<span style="' + chipStyle + '">Search: ' + esc(activeFilters.search.length > 15 ? activeFilters.search.slice(0, 15) + '…' : activeFilters.search) +
      '<span style="' + xStyle + '" onclick="activeFilters.search=\'\';var si=document.getElementById(\'search-input\');if(si)si.value=\'\';render();updateFilterIndicator();">&times;</span></span>';
  }

  if (count > 1) {
    chips += '<span class="afc-clear" style="font-size:10px;font-weight:600;color:var(--pill-amber-fg);cursor:pointer;padding:2px 4px;text-decoration:underline;" onclick="clearAllFilters()">Clear all</span>';
  }

  chipsEl.innerHTML = chips;
}

// ─── TAB SWITCH ───────────────────────────────────────────────────────
// ── Tab grouping ──────────────────────────────────────────────────
// Two-level navigation: primary tabs collapse 10 flat tabs into 5 groups.
// Sub-tabs preserve original tab IDs (`tab-mywork`, `tab-resources`, etc.) so
// existing visibility / read-only / beta gating CSS and JS continue to work.
const TAB_GROUPS = {
  overview:  { label: 'Overview',   subs: ['overview'] },                                  // single-destination
  mywork:    { label: 'My Work',    subs: ['mywork'] },                                    // single-destination, auth-only
  portfolio: { label: 'Portfolio',  subs: ['projects', 'tasks', 'initiatives', 'projectReview'] },
  capacity:  { label: 'Capacity',   subs: ['resources', 'forecast', 'insights'] },
  analytics: { label: 'Analytics',  subs: ['teamload', 'effortshape'] },                    // retrospective analytics over allocation data
  slideshow: { label: 'Slideshow',  subs: ['slideshow'] },                                // single-destination, opt-in
  issues:    { label: 'Issues',     subs: ['issues'] },                                    // single-destination
  achievements: { label: 'Achievements', subs: ['achievements'] },                       // single-destination, auth-only
  settings:  { label: 'Settings',   subs: ['settings'] }                                  // single-destination, auth-only
};
const TAB_TO_GROUP = {};
Object.keys(TAB_GROUPS).forEach(function(g) { TAB_GROUPS[g].subs.forEach(function(t) { TAB_TO_GROUP[t] = g; }); });

// Per-group memory of last-visited sub-tab so returning to a primary lands on the same place.
// Only multi-sub groups need entries; single-destination groups route directly via switchTab.
var _groupLastSub = { portfolio: 'projects', capacity: 'resources', analytics: 'teamload' };

function tabIdToElementId(tab) {
  // Sub-tab buttons use lowercase ids (tab-projectreview, not tab-projectReview).
  return 'tab-' + String(tab).toLowerCase();
}

// Hide a primary tab button when all of its sub-tabs are hidden by other visibility logic.
function applyPrimaryTabVisibility() {
  Object.keys(TAB_GROUPS).forEach(function(g) {
    var anyVisible = TAB_GROUPS[g].subs.some(function(tab) {
      var el = document.getElementById(tabIdToElementId(tab));
      if (!el) return false;
      // Element is visible if its computed display is not 'none'. We only set display:none for hidden, so checking inline style + offsetParent covers both inline and class-based hides.
      return el.style.display !== 'none' && (el.offsetParent !== null || el.style.display === 'flex' || el.style.display === '');
    });
    var primary = document.querySelector('.primary-tab[data-group="' + g + '"]');
    if (primary) primary.style.display = anyVisible ? '' : 'none';
    var subBar = document.querySelector('.sub-bar-group[data-group="' + g + '"]');
    if (subBar && !anyVisible) subBar.style.display = 'none';
  });
  // Hide the "More" overflow trigger when none of its dropdown items are visible.
  // Items live inside .more-menu which uses visibility (not display:none), so
  // getComputedStyle on each item reports its own display state regardless of
  // dropdown open/closed.
  var moreTrigger = document.getElementById('tab-more');
  if (moreTrigger) {
    var moreGroups = ['issues', 'achievements', 'settings'];
    var anyMoreVisible = moreGroups.some(function(g) {
      return TAB_GROUPS[g] && TAB_GROUPS[g].subs.some(function(tab) {
        var el = document.getElementById(tabIdToElementId(tab));
        if (!el || el.style.display === 'none') return false;
        return window.getComputedStyle(el).display !== 'none';
      });
    });
    moreTrigger.style.display = anyMoreVisible ? '' : 'none';
  }
  // Sub-bar wrapper visibility: hide entirely on single-destination groups (Issues, Settings).
  var wrapper = document.getElementById('sub-bar');
  if (wrapper) {
    var curGroup = TAB_TO_GROUP[currentTab];
    var hasSubBar = curGroup && TAB_GROUPS[curGroup] && (TAB_GROUPS[curGroup].subs.length > 1 || TAB_GROUPS[curGroup].alwaysShowSubBar);
    wrapper.style.display = hasSubBar ? '' : 'none';
  }
}

// "More" overflow menu — open/close and click-outside handling.
function toggleMoreMenu(ev) {
  if (ev) ev.stopPropagation();
  var menu = document.getElementById('more-menu');
  var trigger = document.getElementById('tab-more');
  if (!menu || !trigger) return;
  var willOpen = !menu.classList.contains('open');
  menu.classList.toggle('open', willOpen);
  trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  if (willOpen) {
    setTimeout(function() { document.addEventListener('click', _closeMoreMenuOnOutside); }, 0);
  }
}
function closeMoreMenu() {
  var menu = document.getElementById('more-menu');
  var trigger = document.getElementById('tab-more');
  if (menu) menu.classList.remove('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', _closeMoreMenuOnOutside);
}
function _closeMoreMenuOnOutside(ev) {
  var wrapper = document.getElementById('more-menu-wrapper');
  if (wrapper && !wrapper.contains(ev.target)) closeMoreMenu();
}

// Toggle tabs that are gated behind a beta feature flag.
function applyBetaTabVisibility() {
  var prTab = document.getElementById('tab-projectreview');
  if (prTab) prTab.style.display = (Auth.loggedIn && isFeatureOn('projectReview')) ? '' : 'none';
  if (typeof applyPrimaryTabVisibility === 'function') applyPrimaryTabVisibility();
}

// OE editorial page title: under the OE theme, show an eyebrow + section heading
// above the toolbar (Laura's Portfolio layout). Populated per primary group;
// inert (hidden) for every non-OE theme via CSS, and shown only for groups we've
// given an editorial title. Currently scoped to Portfolio (Projects/Tasks).
function updateOePageHead() {
  var el = document.getElementById('oe-page-head');
  if (!el) return;
  var groupId = TAB_TO_GROUP[currentTab];

  // Shared helpers reused by every group branch. Counts come from the
  // live sub-tab badges so they stay in sync with updateTabCounts().
  function _cnt(id) { var s = document.getElementById(id); return s ? s.textContent : ''; }
  function _ptab(tab, label, count, iconUse) {
    var active = currentTab === tab;
    var icon = iconUse ? '<svg class="icon" aria-hidden="true"><use href="#' + iconUse + '"></use></svg>' : '';
    return '<button class="oe-pagetab' + (active ? ' active' : '') + '" onclick="switchTab(\'' + tab + '\')">' +
      icon + label + (count !== '' && count != null ? ' <span class="oe-pagetab-count">' + esc(count) + '</span>' : '') + '</button>';
  }
  function _visible(sectionId) {
    var sec = document.getElementById(sectionId);
    return sec && sec.style.display !== 'none';
  }

  var headHtml = '';

  if (groupId === 'portfolio') {
    var prVisible = _visible('tab-projectreview');
    var initVisible = _visible('tab-initiatives');
    var tabs = '<div class="oe-pagetabs">' +
      _ptab('projects', 'Projects', _cnt('proj-tab-count')) +
      _ptab('tasks', 'Tasks', _cnt('task-tab-count')) +
      (initVisible ? _ptab('initiatives', 'Initiatives', _cnt('init-tab-count'), 'ph-flag-banner') : '') +
      (prVisible ? _ptab('projectReview', 'Project Review', '', 'ph-repeat') : '') +
    '</div>';
    headHtml =
      '<div class="oe-page-head-left">' +
        '<div class="oe-page-eyebrow">All teams · City of Tucson</div>' +
        '<h1 class="oe-page-title">Portfolio</h1>' +
      '</div>' + tabs;
  } else if (groupId === 'capacity') {
    var tabsCap = '<div class="oe-pagetabs">' +
      _ptab('resources', 'Resources', '') +
      _ptab('forecast', 'Forecast', '', 'ph-chart-bar') +
      _ptab('insights', 'Insights', '', 'ph-lightbulb') +
    '</div>';
    headHtml =
      '<div class="oe-page-head-left">' +
        '<div class="oe-page-eyebrow">All teams · City of Tucson</div>' +
        '<h1 class="oe-page-title">Capacity</h1>' +
      '</div>' + tabsCap;
  } else if (groupId === 'analytics') {
    var tabsAn = '<div class="oe-pagetabs">' +
      _ptab('teamload', 'Team Load', '', 'ph-users-three') +
      _ptab('effortshape', 'Effort Shape', '', 'ph-ruler') +
    '</div>';
    headHtml =
      '<div class="oe-page-head-left">' +
        '<div class="oe-page-eyebrow">All teams · City of Tucson</div>' +
        '<h1 class="oe-page-title">Analytics</h1>' +
      '</div>' + tabsAn;
  }

  if (headHtml) {
    el.innerHTML = headHtml;
    el.classList.add('show');
  } else {
    el.classList.remove('show');
    el.innerHTML = '';
  }
}

// Click handler for primary tabs: route to the last-visited (or first visible) sub-tab in the group.
function switchPrimaryGroup(groupId) {
  closeMoreMenu();
  var group = TAB_GROUPS[groupId];
  if (!group) return;
  if (group.subs.length === 1) {
    switchTab(group.subs[0]);
    return;
  }
  var preferred = _groupLastSub[groupId];
  // Pick first visible sub-tab as fallback
  var visibleSubs = group.subs.filter(function(t) {
    var el = document.getElementById(tabIdToElementId(t));
    return el && el.style.display !== 'none';
  });
  var target = (preferred && visibleSubs.indexOf(preferred) >= 0) ? preferred : visibleSubs[0];
  if (target) switchTab(target);
}

function switchTab(tab, preserveFilters) {
  // Guard: auth-only tabs require sign-in
  // Slideshow is intentionally NOT in this list — it's designed to run on
  // unattended lobby displays without an authenticated session.
  var authOnlyTabs = ['mywork', 'resources', 'forecast', 'insights', 'issues', 'achievements', 'settings', 'projectReview', 'teamload', 'effortshape'];
  if (!Auth.loggedIn && authOnlyTabs.indexOf(tab) >= 0) {
    showToast('Sign in to access ' + tab + '.', 'warn');
    return;
  }
  // Slideshow while signed in: confirm sign-out before switching. Running
  // the slideshow with an active session keeps the TV bound to a user's
  // identity and means their token expires mid-display. Force a clean
  // public-mode reload instead.
  if (tab === 'slideshow' && Auth.loggedIn) {
    // confirmDialog is async; defer the sign-out + navigation to its resolution
    // so switchTab can stay synchronous for its many callers.
    confirmDialog('This will sign you out of the application so the display can run as a public lobby view. You can sign back in any time.',
      { title: 'Switch to Slideshow?', confirmLabel: 'Switch & sign out' }).then(function (ok) {
        if (!ok) return;
        if (typeof clearAgolToken === 'function') clearAgolToken();
        var base = window.location.origin + window.location.pathname;
        window.location.replace(base + '?slideshow=1');
      });
    return;
  }
  currentDetail = null;
  currentTab = tab;
  currentPage = 1;
  if (typeof bulkClear === 'function') bulkClear(); // selection is per-(Projects)-tab
  // Highlight active sub-tab (ID-based — robust to DOM reordering).
  document.querySelectorAll('.sub-tab').forEach(function(b) {
    b.classList.toggle('active', b.id === tabIdToElementId(tab));
  });
  // Highlight the primary tab whose group contains this sub-tab; show that group's sub-bar, hide others.
  var groupId = TAB_TO_GROUP[tab];
  // Expose the active group on <body> so theme CSS can adapt (OE hides the real
  // sub-bar on Portfolio, where the Projects/Tasks tabs move into the title band).
  document.body.dataset.activeGroup = groupId || '';
  document.querySelectorAll('.primary-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.group === groupId);
  });
  // Overflow "More" menu: highlight the trigger when the active group lives inside it,
  // and mark the matching menu item as active too.
  var moreGroups = ['issues', 'achievements', 'settings'];
  var moreTriggerEl = document.getElementById('tab-more');
  if (moreTriggerEl) moreTriggerEl.classList.toggle('active', moreGroups.indexOf(groupId) >= 0);
  document.querySelectorAll('.more-menu-item').forEach(function(b) {
    b.classList.toggle('active', b.dataset.group === groupId);
  });
  document.querySelectorAll('.sub-bar-group').forEach(function(g) {
    g.style.display = (g.dataset.group === groupId) ? '' : 'none';
  });
  if (groupId && TAB_GROUPS[groupId].subs.length > 1) _groupLastSub[groupId] = tab;
  applyPrimaryTabVisibility();
  document.getElementById('view-toggle').style.display = (tab === 'overview' || tab === 'mywork' || tab === 'resources' || tab === 'settings' || tab === 'forecast' || tab === 'insights' || tab === 'issues' || tab === 'projectReview' || tab === 'teamload' || tab === 'effortshape') ? 'none' : 'flex';
  // Sync toggle button highlight with current view preference
  // Board view is Projects-only — fall back to List on other tabs.
  if (tab !== 'projects' && currentView === 'board') currentView = 'list';
  document.getElementById('view-grid').classList.toggle('active', currentView === 'grid');
  document.getElementById('view-list').classList.toggle('active', currentView === 'list');
  var _vboard = document.getElementById('view-board');
  if (_vboard) { _vboard.style.display = (tab === 'projects') ? '' : 'none'; _vboard.classList.toggle('active', currentView === 'board'); }
  var _vcal = document.getElementById('view-calendar');
  if (_vcal) _vcal.classList.toggle('active', currentView === 'calendar');
  document.getElementById('sort-select').style.display = (tab === 'projects' || tab === 'tasks') ? '' : 'none';
  // Hide entire toolbar on tabs that don't need it (sort/view toggle/result
  // count are list-view chrome — Resources, Forecast, Initiatives, etc. own
  // their own UI).
  document.querySelector('.toolbar').style.display = (tab === 'mywork' || tab === 'settings' || tab === 'insights' || tab === 'issues' || tab === 'achievements' || tab === 'projectReview' || tab === 'teamload' || tab === 'effortshape' || tab === 'resources' || tab === 'forecast' || tab === 'initiatives') ? 'none' : '';
  if (typeof updateOePageHead === 'function') updateOePageHead();
  const addBtn = document.getElementById('btn-add-new');
  // Projects are created from the persistent header button (Submit Idea / New
  // Project). The toolbar button is only the "＋ New Task" entry on the Tasks tab.
  if (tab === 'tasks') { addBtn.style.display='flex'; addBtn.textContent='＋ New Task'; }
  else { addBtn.style.display='none'; }
  document.getElementById('open-projects-btn').style.display = (tab === 'projects') ? 'flex' : 'none';
  document.getElementById('open-tasks-btn').style.display = (tab === 'tasks') ? 'flex' : 'none';
  const ideaCount = PROJECTS.filter(p => p.status === 'Idea').length;
  const reviewBtn = document.getElementById('btn-review-ideas');
  if (reviewBtn) {
    reviewBtn.style.display = tab === 'projects' ? 'flex' : 'none';
    const badge = document.getElementById('idea-count-badge');
    if (badge) badge.textContent = ideaCount > 0 ? ideaCount : '';
  }
  if (tab === 'forecast' || tab === 'settings' || tab === 'mywork' || tab === 'insights' || tab === 'issues' || tab === 'projectReview' || tab === 'teamload' || tab === 'effortshape') {
    document.getElementById('view-toggle').style.display = 'none';
    document.getElementById('btn-add-new').style.display = 'none';
  }
  // Hide sidebar on tabs that don't use filters; show toggle button on Projects/Tasks
  const sidebar = document.querySelector('.sidebar');
  const filterBtn = document.getElementById('btn-toggle-filters');
  const filterTabs = ['projects', 'tasks'];
  if (filterTabs.includes(tab)) {
    if (sidebar) {
      sidebar.classList.remove('tab-hidden');
      // Restore user's collapsed preference (session override, then UserPrefs default).
      // On phone-sized viewports, default to collapsed so the sidebar starts as an
      // off-screen overlay rather than covering content.
      var sessionSidebar = sessionStorage.getItem('sidebar_collapsed');
      var isMobile = window.innerWidth <= 768;
      const wasCollapsed = sessionSidebar !== null
        ? sessionSidebar === '1'
        : (isMobile ? true : !!(typeof UserPrefs !== 'undefined' && UserPrefs && UserPrefs.sidebarCollapsed));
      sidebar.classList.toggle('collapsed', wasCollapsed);
      updateFilterToggleIcon(!wasCollapsed);
    }
    if (filterBtn) filterBtn.style.display = 'flex';
  } else {
    if (sidebar) sidebar.classList.add('tab-hidden');
    if (filterBtn) filterBtn.style.display = 'none';
  }
  const isTask = tab === 'tasks';
  reorderSidebarFilters(tab);
  buildSidebarFilters();
  window.scrollTo(0, 0);
  render();
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('collapsed');
  sessionStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
  updateFilterToggleIcon(!isCollapsed);
}

function updateFilterToggleIcon(isOpen) {
  const icon = document.getElementById('filter-toggle-icon');
  if (icon) icon.textContent = isOpen ? '◀' : '▶';
}

function setView(v) {
  currentView = v;
  document.getElementById('view-grid').classList.toggle('active', v==='grid');
  document.getElementById('view-list').classList.toggle('active', v==='list');
  var vb = document.getElementById('view-board');
  if (vb) vb.classList.toggle('active', v==='board');
  var vc = document.getElementById('view-calendar');
  if (vc) vc.classList.toggle('active', v==='calendar');
  render();
}

// ─── FILTER DATA ──────────────────────────────────────────────────────
function filterProjects() {
  let data = PROJECTS;
  if (typeof inCurrentTeamProject === 'function') data = data.filter(inCurrentTeamProject);
  if (activeFilters.status.length)   data = data.filter(p => activeFilters.status.includes(p.status));
  if (activeFilters.priority.length) data = data.filter(p => activeFilters.priority.includes(p.priority || 'Unset'));
  if (activeFilters.category.length) data = data.filter(p => activeFilters.category.includes(p.category));
  if (activeFilters.member.length)   data = data.filter(p => activeFilters.member.includes(p.contact) || (p.other_members && activeFilters.member.some(m => p.other_members.includes(m))));
  if (activeFilters.partnerDept.length) data = data.filter(p => activeFilters.partnerDept.includes(p.partner_dept));
  if (activeFilters.itdTeam.length)  data = data.filter(p => activeFilters.itdTeam.includes(p.itd_team));
  if (activeFilters.dataProgram) data = data.filter(p => p.is_data_program);
  if (activeFilters.overdue) {
    var _ovT = new Date().toISOString().slice(0, 10);
    data = data.filter(p => { var d = p.working_due || p.end; return d && d < _ovT && OPEN_PROJECT_STATUSES.includes(p.status); });
  }
  if (activeFilters.search) data = data.filter(p =>
    (p.title || '').toLowerCase().includes(activeFilters.search) ||
    (p.description || '').toLowerCase().includes(activeFilters.search) ||
    (p.contact || '').toLowerCase().includes(activeFilters.search) ||
    (p.other_members || '').toLowerCase().includes(activeFilters.search) ||
    (p.partner_dept || '').toLowerCase().includes(activeFilters.search) ||
    (p.project_number || '').toLowerCase().includes(activeFilters.search)
  );
  return data;
}

function filterTasks() {
  let data = TASKS;
  if (typeof inCurrentTeamTask === 'function') data = data.filter(inCurrentTeamTask);
  if (activeFilters.taskStatus.length) data = data.filter(t => activeFilters.taskStatus.includes(t.status));
  if (activeFilters.priority.length)   data = data.filter(t => activeFilters.priority.includes(t.priority || 'Unset'));
  if (activeFilters.taskCategory.length) data = data.filter(t => activeFilters.taskCategory.includes(t.category));
  if (activeFilters.taskTool.length)   data = data.filter(t => activeFilters.taskTool.includes(t.tool));
  if (activeFilters.member.length) {
    data = data.filter(function(t) {
      return activeFilters.member.includes(t.assignee);
    });
  }
  if (activeFilters.overdue) {
    var _ovT = new Date().toISOString().slice(0, 10);
    data = data.filter(t => { var d = t.working_due || t.due; return d && d < _ovT && OPEN_TASK_STATUSES.includes(t.status); });
  }
  if (activeFilters.search) data = data.filter(t =>
    (t.title || '').toLowerCase().includes(activeFilters.search) ||
    resolveProjectTitle(t).toLowerCase().includes(activeFilters.search) ||
    (t.assignee || '').toLowerCase().includes(activeFilters.search) ||
    (t.task_number || '').toLowerCase().includes(activeFilters.search)
  );
  return data;
}
function sortData(data, key, dir) {
  const d = dir === 'desc' ? -1 : 1;
  return [...data].sort((a,b) => {
    if (key === 'title')    return d * (a.title || '').localeCompare(b.title || '');
    if (key === 'project')  return d * resolveProjectTitle(a).localeCompare(resolveProjectTitle(b));
    if (key === 'status')   return d * (a.status || '').localeCompare(b.status || '');
    if (key === 'priority') return d * ((PRIORITY_ORDER[a.priority]??9) - (PRIORITY_ORDER[b.priority]??9));
    if (key === 'start')    return d * (a.start||'0').localeCompare(b.start||'0');
    if (key === 'end')      return d * (a.end||a.due||'9').localeCompare(b.end||b.due||'9');
    if (key === 'assignee') return d * (a.assignee||'').localeCompare(b.assignee||'');
    if (key === 'contact')  return d * (a.contact||'').localeCompare(b.contact||'');
    if (key === 'project_number') return d * (a.project_number||'').localeCompare(b.project_number||'');
    if (key === 'category') return d * (a.category||'').localeCompare(b.category||'');
    if (key === 'tasks') {
      var aNum = a.project_number != null ? String(a.project_number) : null;
      var bNum = b.project_number != null ? String(b.project_number) : null;
      var ac = aNum ? TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === aNum; }).length : 0;
      var bc = bNum ? TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === bNum; }).length : 0;
      return d * (ac - bc);
    }
    return 0;
  });
}

// ─── HEADER STATS / TAB COUNTS ──────────────────────────────────────
function updateHeaderStats() {
  const _P = (typeof teamProjects === 'function') ? teamProjects() : PROJECTS;
  const _T = (typeof teamTasks === 'function') ? teamTasks() : TASKS;
  const active = _P.filter(p => p.status === 'Active').length;
  const complete = _P.filter(p => p.status === 'Complete').length;
  const openTasks = _T.filter(t => ['Active','Pending','Waiting for Response'].includes(t.status)).length;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-tasks-open').textContent = openTasks;
  document.getElementById('stat-complete').textContent = complete;
  document.getElementById('stat-total').textContent = _P.length;
  const _ideaBadge = document.getElementById('idea-count-badge');
  if (_ideaBadge) {
    const _ic = _P.filter(p => p.status === 'Idea').length;
    _ideaBadge.textContent = _ic > 0 ? _ic : '';
  }
  if (typeof renderTeamSwitcher === 'function') renderTeamSwitcher();
  if (typeof refreshIntakeButton === 'function') refreshIntakeButton();
  if (typeof refreshHeaderTitle === 'function') refreshHeaderTitle();
  if (typeof renderInbox === 'function') renderInbox();
}

// Header title/subtitle reflect the signed-in user's team and its department.
// Admins follow the team switcher ("All Teams" when unscoped); everyone else uses
// their own team — independent of the team_scoping flag (this is labeling, not
// scoping). Generic before login.
function refreshHeaderTitle() {
  var titleEl = document.getElementById('header-app-title');
  var subEl = document.getElementById('header-app-subtitle');
  if (!titleEl || !subEl) return;
  var loggedIn = (typeof Auth !== 'undefined' && Auth && Auth.loggedIn);
  var isRealAdmin = loggedIn && Auth.isTeamLead;
  var team = null, allTeams = false;
  if (loggedIn) {
    var cur = (typeof CURRENT_TEAM !== 'undefined') ? CURRENT_TEAM : null;
    if (isRealAdmin) {
      if (cur) team = cur; else allTeams = true; // admin viewing "All teams"
    } else {
      team = cur || ((typeof personTeam === 'function') ? personTeam(Auth.fullName) : null);
    }
  }
  var title, subtitle;
  if (!loggedIn) {
    title = 'Project Tracker';
    subtitle = 'City of Tucson · Information Technology';
  } else if (allTeams) {
    title = 'All Teams';
    subtitle = 'Project & Task Tracker · City of Tucson';
  } else if (team) {
    title = team;
    var dep = (typeof departmentOfTeam === 'function') ? departmentOfTeam(team) : null;
    subtitle = 'Project & Task Tracker · ' + (dep && dep.name ? dep.name : 'City of Tucson');
  } else {
    title = 'Project Tracker';
    subtitle = 'City of Tucson · Information Technology';
  }
  titleEl.textContent = title;
  subEl.textContent = subtitle;
}

// The header intake button is "<svg class="icon" aria-hidden="true"><use href="#ph-lightbulb"></use></svg> Submit Idea" by default, but becomes
// "＋ New Project" (full editor) for users whose team opted out of the idea
// review flow (Settings → Project intake).
function refreshIntakeButton() {
  var btn = document.getElementById('btn-submit-idea');
  if (!btn) return;
  var direct = (typeof teamCreatesDirectly === 'function' && teamCreatesDirectly()) &&
               (typeof canCreateProject === 'function' && canCreateProject());
  if (direct) {
    btn.innerHTML = '＋ New Project';
    btn.onclick = function() { if (typeof openFormModal === 'function') openFormModal('new-project'); };
    btn.title = 'Your team creates projects directly (Submit Idea review is skipped)';
  } else {
    btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#ph-lightbulb"></use></svg> Submit Idea';
    btn.onclick = function() { if (typeof openIdeaForm === 'function') openIdeaForm(); };
    btn.title = '';
  }
}

function updateTabCounts() {
  document.getElementById('proj-tab-count').textContent = filterProjects().length;
  document.getElementById('task-tab-count').textContent = filterTasks().length;
  if (typeof updateInitiativeTabCount === 'function') updateInitiativeTabCount();
  // Keep the OE title-band tabs (which mirror these counts) in sync.
  if (typeof updateOePageHead === 'function') updateOePageHead();
}

// ─── DEEP LINK ────────────────────────────────────────────────────────
// ?project=P-001 (or numeric objectId) → open that project on load.
function handleDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('project');
  if (!requested) return;

  // Find the project by project_number (preferred) or objectId (fallback).
  let target = PROJECTS.find(function(p) {
    return p.project_number === requested;
  });
  if (!target) {
    target = PROJECTS.find(function(p) {
      return String(p.objectId) === requested;
    });
  }

  if (target) {
    openProject(target.objectId);
  } else {
    showToast('Project ' + requested + ' not found', 'error');
  }

  // Clean up the URL so refreshing the page doesn't re-open the modal
  // and so the URL doesn't leak into other navigation.
  const cleanUrl = window.location.pathname + window.location.hash;
  history.replaceState(history.state, '', cleanUrl);
}

// ─── BACK FROM DETAIL ─────────────────────────────────────────────────
function goBackFromDetail() {
  const prevDetail = currentDetail;
  currentDetail = null;
  // From project opened via idea review → go back to review
  if (prevDetail && prevDetail.type === 'project' && prevDetail._returnToReview) {
    currentDetail = { type: 'idea-review' };
    render();
    return;
  }
  // From task inside a project detail → go back to project
  if (prevDetail && prevDetail.type === 'task' && prevDetail._fromProject) {
    currentDetail = { type: 'project', id: prevDetail._fromProject, _returnTab: prevDetail._returnTab };
    render();
    return;
  }
  // Return to the tab we came from — preserve filters since we're just going "back"
  const tab = (prevDetail && prevDetail._returnTab) ? prevDetail._returnTab
    : (prevDetail && prevDetail.type === 'task') ? 'tasks' : 'projects';
  switchTab(tab, true);
}
