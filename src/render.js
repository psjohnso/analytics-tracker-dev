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
// STATUS_COLOR() returns a color for any status, including unknown ones.
// Unknown statuses get a deterministic color derived from the string itself
// so each distinct new status gets its own consistent color rather than
// all collapsing to the same gray.
function STATUS_COLOR(s) {
  if (!s) return '#9CA3AF';
  if (STATUS_COLOR_MAP[s]) return STATUS_COLOR_MAP[s];
  // Hash the string to pick from a set of brand-adjacent palette colors
  const extras = ['#0088FF','#83AC16','#C24200','#002669','#9E0059','#E5D086'];
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
  const statuses = {};
  PROJECTS.forEach(p => { statuses[p.status || 'Unknown'] = (statuses[p.status || 'Unknown'] || 0) + 1; });

  const priorities = {};
  PROJECTS.forEach(p => { priorities[p.priority || 'Unset'] = (priorities[p.priority || 'Unset'] || 0) + 1; });

  const categories = {};
  PROJECTS.forEach(p => { if(p.category) categories[p.category] = (categories[p.category] || 0) + 1; });

  const members = {};
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
    if (!isActiveMember(name)) return false;
    if (includeContributors) return true;
    if (!RESOURCES_DATA || !RESOURCES_DATA.people[name]) return true;
    return RESOURCES_DATA.people[name].member_group !== 'Affiliated';
  };
  TASKS.forEach(t => { if(t.assignee && isVisibleMember(t.assignee)) members[t.assignee] = (members[t.assignee] || 0) + 1; });
  PROJECTS.forEach(p => { if(p.contact && !members[p.contact] && isVisibleMember(p.contact)) members[p.contact] = 0; });

  // Update affiliated toggle label with count
  var contribCount = 0;
  if (RESOURCES_DATA && RESOURCES_DATA.people) {
    contribCount = Object.keys(RESOURCES_DATA.people).filter(function(n) {
      var p = RESOURCES_DATA.people[n];
      return p.active !== false && p.member_group === 'Affiliated';
    }).length;
  }
  var contribLabel = document.getElementById('show-contributors-label');
  if (contribLabel) contribLabel.textContent = contribCount > 0 ? 'Show ' + contribCount + ' affiliated member' + (contribCount !== 1 ? 's' : '') : 'Show affiliated members';

  const taskStatuses = {};
  TASKS.forEach(t => { taskStatuses[t.status || 'Unknown'] = (taskStatuses[t.status || 'Unknown'] || 0) + 1; });

  const depts = {};
  PROJECTS.forEach(p => { if(p.partner_dept) depts[p.partner_dept] = (depts[p.partner_dept] || 0) + 1; });

  const teams = {};
  PROJECTS.forEach(p => { if(p.itd_team) teams[p.itd_team] = (teams[p.itd_team] || 0) + 1; });

  renderFilterGroup('status-filters', statuses, 'status');
  renderFilterGroup('priority-filters', priorities, 'priority');
  renderFilterGroup('category-filters', Object.fromEntries(Object.entries(categories).sort((a,b) => a[0].localeCompare(b[0]))), 'category');
  renderFilterGroup('member-filters', Object.fromEntries(Object.entries(members).sort((a,b) => a[0].localeCompare(b[0]))), 'member');
  renderFilterGroup('task-status-filters', taskStatuses, 'taskStatus');

  const taskCats = {};
  TASKS.forEach(t => { if(t.category) taskCats[t.category] = (taskCats[t.category] || 0) + 1; });
  renderFilterGroup('task-category-filters', Object.fromEntries(Object.entries(taskCats).sort((a,b) => a[0].localeCompare(b[0]))), 'taskCategory');

  const taskTools = {};
  TASKS.forEach(t => { if(t.tool) taskTools[t.tool] = (taskTools[t.tool] || 0) + 1; });
  renderFilterGroup('task-tool-filters', Object.fromEntries(Object.entries(taskTools).sort((a,b) => a[0].localeCompare(b[0]))), 'taskTool');

  renderFilterGroup('dept-filters', Object.fromEntries(Object.entries(depts).sort((a,b) => a[0].localeCompare(b[0]))), 'partnerDept');
  renderFilterGroup('team-filters', Object.fromEntries(Object.entries(teams).sort((a,b) => a[0].localeCompare(b[0]))), 'itdTeam');

  // Data Program toggle filter
  const dpCount = PROJECTS.filter(p => p.is_data_program).length;
  const dpEl = document.getElementById('dp-filter');
  if (dpEl) {
    dpEl.innerHTML = '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:2px 0;color:var(--text-body);">' +
      '<input type="checkbox" id="dp-filter-cb" ' + (activeFilters.dataProgram ? 'checked' : '') +
      ' onchange="activeFilters.dataProgram=this.checked;render();" style="width:14px;height:14px;cursor:pointer;accent-color:var(--navy);">' +
      ' Data Program only <span style="font-size:10px;color:var(--text-muted);">(' + dpCount + ')</span></label>';
  }
}

function renderFilterGroup(id, items, filterType) {
  const el = document.getElementById(id);
  const arr = activeFilters[filterType];
  const noneSelected = arr.length === 0;
  const total = Object.values(items).reduce((a,b) => a+b, 0);
  const allBtn = `<button class="filter-btn ${noneSelected ? 'active' : ''}" onclick="setFilter('${filterType}', null)">
    <span>All</span><span class="badge">${total}</span>
  </button>`;
  const btns = Object.entries(items).map(([k,v]) => {
    const isActive = arr.includes(k);
    const dot = STATUS_COLOR(k) ? `<span class="status-dot" style="background:${STATUS_COLOR(k)}"></span>` : '';
    return `<button class="filter-btn ${isActive ? 'active' : ''}" onclick="setFilter('${filterType}', '${k.replace(/'/g, "\\'")}')">
      <span style="display:flex;align-items:center;">${dot}${k}</span>
      <span class="badge">${v}</span>
    </button>`;
  }).join('');
  el.innerHTML = allBtn + btns;
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
    btn.style.background = 'transparent';
    btn.style.color = '#83AC16';
  } else {
    activeFilters.status = [...OPEN_PROJECT_STATUSES];
    btn.classList.add('weekly-active');
    btn.style.background = '#83AC16';
    btn.style.color = 'white';
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
    btn.style.background = 'transparent';
    btn.style.color = '#C24200';
  } else {
    activeFilters.taskStatus = [...OPEN_TASK_STATUSES];
    btn.classList.add('weekly-active');
    btn.style.background = '#C24200';
    btn.style.color = 'white';
  }
  currentPage = 1;
  buildSidebarFilters();
  render();
}

function resetQuickFilterBtn(id, defaultColor) {
  const btn = document.getElementById(id);
  if (btn && btn.classList.contains('weekly-active')) {
    btn.classList.remove('weekly-active');
    btn.style.background = 'transparent';
    btn.style.color = defaultColor;
  }
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
  activeFilters.search = '';
  var searchEl = document.getElementById('search-input');
  if (searchEl) searchEl.value = '';
  var dpCb = document.getElementById('dp-filter-cb');
  if (dpCb) dpCb.checked = false;
  resetQuickFilterBtn('open-projects-btn', '#83AC16');
  resetQuickFilterBtn('open-tasks-btn', '#C24200');
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
  if (activeFilters.search) count++;
  return count;
}

function updateFilterIndicator() {
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

  var chipStyle = 'display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:#fff;border:1px solid #FED7AA;color:#9A3412;white-space:nowrap;';
  var xStyle = 'cursor:pointer;font-weight:700;opacity:0.6;margin-left:2px;';
  var chips = '';

  function addChips(label, values, filterKey) {
    if (!values.length) return;
    var display = values.length <= 2 ? values.join(', ') : values.slice(0, 2).join(', ') + ' +' + (values.length - 2);
    chips += '<span style="' + chipStyle + '">' + label + ': ' + esc(display) +
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
  if (activeFilters.search) {
    chips += '<span style="' + chipStyle + '">Search: ' + esc(activeFilters.search.length > 15 ? activeFilters.search.slice(0, 15) + '…' : activeFilters.search) +
      '<span style="' + xStyle + '" onclick="activeFilters.search=\'\';var si=document.getElementById(\'search-input\');if(si)si.value=\'\';render();updateFilterIndicator();">&times;</span></span>';
  }

  if (count > 1) {
    chips += '<span style="font-size:10px;font-weight:600;color:#9A3412;cursor:pointer;padding:2px 4px;text-decoration:underline;" onclick="clearAllFilters()">Clear all</span>';
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
  mywork:    { label: '👤 My Work', subs: ['mywork'] },                                    // single-destination, auth-only
  portfolio: { label: 'Portfolio',  subs: ['projects', 'tasks', 'projectReview'] },
  capacity:  { label: 'Capacity',   subs: ['resources', 'forecast', 'insights'] },
  slideshow: { label: '📺 Slideshow', subs: ['slideshow'] },                                // single-destination, opt-in
  issues:    { label: '🐛 Issues',  subs: ['issues'] },                                    // single-destination
  settings:  { label: '⚙️ Settings', subs: ['settings'] }                                  // single-destination, auth-only
};
const TAB_TO_GROUP = {};
Object.keys(TAB_GROUPS).forEach(function(g) { TAB_GROUPS[g].subs.forEach(function(t) { TAB_TO_GROUP[t] = g; }); });

// Per-group memory of last-visited sub-tab so returning to a primary lands on the same place.
// Only multi-sub groups need entries; single-destination groups route directly via switchTab.
var _groupLastSub = { portfolio: 'projects', capacity: 'resources' };

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
  // Sub-bar wrapper visibility: hide entirely on single-destination groups (Issues, Settings).
  var wrapper = document.getElementById('sub-bar');
  if (wrapper) {
    var curGroup = TAB_TO_GROUP[currentTab];
    var hasSubBar = curGroup && TAB_GROUPS[curGroup] && TAB_GROUPS[curGroup].subs.length > 1;
    wrapper.style.display = hasSubBar ? '' : 'none';
  }
}

// Toggle tabs that are gated behind a beta feature flag.
function applyBetaTabVisibility() {
  var prTab = document.getElementById('tab-projectreview');
  if (prTab) prTab.style.display = (Auth.loggedIn && isFeatureOn('projectReview')) ? '' : 'none';
  if (typeof applyPrimaryTabVisibility === 'function') applyPrimaryTabVisibility();
}

// Click handler for primary tabs: route to the last-visited (or first visible) sub-tab in the group.
function switchPrimaryGroup(groupId) {
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
  var authOnlyTabs = ['mywork', 'resources', 'forecast', 'insights', 'issues', 'settings', 'projectReview'];
  if (!Auth.loggedIn && authOnlyTabs.indexOf(tab) >= 0) {
    showToast('Sign in to access ' + tab + '.', 'warn');
    return;
  }
  // Slideshow while signed in: confirm sign-out before switching. Running
  // the slideshow with an active session keeps the TV bound to a user's
  // identity and means their token expires mid-display. Force a clean
  // public-mode reload instead.
  if (tab === 'slideshow' && Auth.loggedIn) {
    if (!confirm('Switch to Slideshow?\n\nThis will sign you out of the application so the display can run as a public lobby view. You can sign back in any time.')) {
      return;
    }
    if (typeof clearAgolToken === 'function') clearAgolToken();
    var base = window.location.origin + window.location.pathname;
    window.location.replace(base + '?slideshow=1');
    return;
  }
  currentDetail = null;
  currentTab = tab;
  currentPage = 1;
  // Highlight active sub-tab (ID-based — robust to DOM reordering).
  document.querySelectorAll('.sub-tab').forEach(function(b) {
    b.classList.toggle('active', b.id === tabIdToElementId(tab));
  });
  // Highlight the primary tab whose group contains this sub-tab; show that group's sub-bar, hide others.
  var groupId = TAB_TO_GROUP[tab];
  document.querySelectorAll('.primary-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.group === groupId);
  });
  document.querySelectorAll('.sub-bar-group').forEach(function(g) {
    g.style.display = (g.dataset.group === groupId) ? '' : 'none';
  });
  if (groupId && TAB_GROUPS[groupId].subs.length > 1) _groupLastSub[groupId] = tab;
  applyPrimaryTabVisibility();
  document.getElementById('view-toggle').style.display = (tab === 'overview' || tab === 'mywork' || tab === 'resources' || tab === 'settings' || tab === 'forecast' || tab === 'insights' || tab === 'issues' || tab === 'projectReview') ? 'none' : 'flex';
  // Sync toggle button highlight with current view preference
  document.getElementById('view-grid').classList.toggle('active', currentView === 'grid');
  document.getElementById('view-list').classList.toggle('active', currentView === 'list');
  document.getElementById('sort-select').style.display = (tab === 'projects' || tab === 'tasks') ? '' : 'none';
  // Hide entire toolbar on tabs that don't need it
  document.querySelector('.toolbar').style.display = (tab === 'mywork' || tab === 'settings' || tab === 'insights' || tab === 'issues' || tab === 'projectReview') ? 'none' : '';
  const addBtn = document.getElementById('btn-add-new');
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
  if (tab === 'forecast' || tab === 'settings' || tab === 'mywork' || tab === 'insights' || tab === 'issues' || tab === 'projectReview') {
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
  render();
}

// ─── FILTER DATA ──────────────────────────────────────────────────────
function filterProjects() {
  let data = PROJECTS;
  if (activeFilters.status.length)   data = data.filter(p => activeFilters.status.includes(p.status));
  if (activeFilters.priority.length) data = data.filter(p => activeFilters.priority.includes(p.priority || 'Unset'));
  if (activeFilters.category.length) data = data.filter(p => activeFilters.category.includes(p.category));
  if (activeFilters.member.length)   data = data.filter(p => activeFilters.member.includes(p.contact) || (p.other_members && activeFilters.member.some(m => p.other_members.includes(m))));
  if (activeFilters.partnerDept.length) data = data.filter(p => activeFilters.partnerDept.includes(p.partner_dept));
  if (activeFilters.itdTeam.length)  data = data.filter(p => activeFilters.itdTeam.includes(p.itd_team));
  if (activeFilters.dataProgram) data = data.filter(p => p.is_data_program);
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
  if (activeFilters.taskStatus.length) data = data.filter(t => activeFilters.taskStatus.includes(t.status));
  if (activeFilters.priority.length)   data = data.filter(t => activeFilters.priority.includes(t.priority || 'Unset'));
  if (activeFilters.taskCategory.length) data = data.filter(t => activeFilters.taskCategory.includes(t.category));
  if (activeFilters.taskTool.length)   data = data.filter(t => activeFilters.taskTool.includes(t.tool));
  if (activeFilters.member.length) {
    data = data.filter(function(t) {
      return activeFilters.member.includes(t.assignee);
    });
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
      var ac = TASKS.filter(function(t) { return t.project === a.title; }).length;
      var bc = TASKS.filter(function(t) { return t.project === b.title; }).length;
      return d * (ac - bc);
    }
    return 0;
  });
}

// ─── HEADER STATS / TAB COUNTS ──────────────────────────────────────
function updateHeaderStats() {
  const active = PROJECTS.filter(p => p.status === 'Active').length;
  const complete = PROJECTS.filter(p => p.status === 'Complete').length;
  const openTasks = TASKS.filter(t => ['Active','Pending','Waiting for Response'].includes(t.status)).length;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-tasks-open').textContent = openTasks;
  document.getElementById('stat-complete').textContent = complete;
  document.getElementById('stat-total').textContent = PROJECTS.length;
  const _ideaBadge = document.getElementById('idea-count-badge');
  if (_ideaBadge) {
    const _ic = PROJECTS.filter(p => p.status === 'Idea').length;
    _ideaBadge.textContent = _ic > 0 ? _ic : '';
  }
}

function updateTabCounts() {
  document.getElementById('proj-tab-count').textContent = filterProjects().length;
  document.getElementById('task-tab-count').textContent = filterTasks().length;
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
