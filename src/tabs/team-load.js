// ─────────────────────────────────────────────────────────────────────
// team-load.js — Team Load Analytics page
//
// First sub-tab under the Analytics primary tab. Three retrospective
// views of where the team's allocated hours went year-to-date:
//
//   A — Hours by Partner Department
//   B — Lead vs Contributor share by Category
//   C — Per-person workload concentration
//
// Data source: allocation data from RESOURCES_DATA.people[name].allocations.
// Each allocation has a weekly hours[] array (fraction × proj_cap) tied to
// RESOURCES_DATA.weeks. We sum across the past weeks of the current year
// (index 0 through window.currentWeekIdx) and treat that as a proxy for
// where the team's time actually went.
//
// This is a planned-allocation proxy, not a true time entry — once granular
// task time tracking has team-wide coverage, this page can swap back to
// summing TASK_HOURS by project.
//
// Visibility for Section C: team leads see all names; non-leads see only
// their own name unmasked, others appear as "Member A/B/C…".
// ─────────────────────────────────────────────────────────────────────

// Persistent filter state — survives re-renders triggered by changing a
// filter dropdown. Cleared via the "Clear filters" button. Filters operate
// on people in the org hierarchy Team → Unit → Member: any of the three
// can be set and they stack. Unit lives in person.role (per the IT-org
// schema where team_members.role stores the unit name within a team).
var _tlFilterTeam = '';
var _tlFilterUnit = '';
var _tlFilterMember = '';

function setTeamLoadFilter(key, value) {
  var rd = (typeof RESOURCES_DATA !== 'undefined') ? RESOURCES_DATA : null;
  if (key === 'clear') {
    _tlFilterTeam = '';
    _tlFilterUnit = '';
    _tlFilterMember = '';
  } else if (key === 'team') {
    _tlFilterTeam = value || '';
    // Drop unit / member if they no longer belong to the new team.
    if (_tlFilterUnit && _tlFilterTeam) {
      var unitStillValid = false;
      Object.keys((rd && rd.people) || {}).forEach(function(n) {
        var p = rd.people[n];
        if (p && p.team === _tlFilterTeam && p.role === _tlFilterUnit) unitStillValid = true;
      });
      if (!unitStillValid) _tlFilterUnit = '';
    }
    if (_tlFilterMember && _tlFilterTeam) {
      var pm = rd && rd.people ? rd.people[_tlFilterMember] : null;
      if (!pm || pm.team !== _tlFilterTeam) _tlFilterMember = '';
    }
  } else if (key === 'unit') {
    _tlFilterUnit = value || '';
    if (_tlFilterMember && _tlFilterUnit) {
      var pm2 = rd && rd.people ? rd.people[_tlFilterMember] : null;
      if (!pm2 || pm2.role !== _tlFilterUnit) _tlFilterMember = '';
    }
  } else if (key === 'member') {
    _tlFilterMember = value || '';
  }
  var area = document.getElementById('content-area');
  if (area) area.innerHTML = buildTeamLoadPage();
}

function buildTeamLoadPage() {
  var model = _tlBuildModel();
  var filterRow = _tlRenderFilters(model);
  var scopeChip = _tlRenderScopeChip(model);

  if (model.totalProjects === 0) {
    var d = model.diag || {};
    var diagHtml = '<h1 class="tl-title">Team Load Analytics</h1>' + filterRow + scopeChip +
      '<div class="tl-empty">' +
      '<div style="font-weight:700;color:var(--navy);font-size:14px;margin-bottom:8px;">Team Load: no data to show</div>' +
      (model.filters && model.filters.active
        ? 'No projects match the current filters. Try clearing or broadening them.<br>'
        : 'No project allocations with hours found in the year-to-date window.<br>') +
      '<div style="margin-top:14px;text-align:left;display:inline-block;font-size:12px;">' +
      '<div><code>RESOURCES_DATA</code> loaded: <strong>' + (d.resourcesLoaded ? 'yes' : 'no') + '</strong></div>' +
      '<div>Weeks available: <strong>' + d.weeksAvailable + '</strong> (current week idx: ' + d.currentWeekIdx + ')</div>' +
      '<div>People in <code>RESOURCES_DATA</code>: <strong>' + d.peopleInData + '</strong></div>' +
      '<div>… countable (active, full tracking): <strong>' + d.countableMembers + '</strong></div>' +
      '<div>Total allocation rows scanned: <strong>' + d.allocations + '</strong></div>' +
      '<div>… with any hours in window: <strong>' + d.allocationsWithHours + '</strong></div>' +
      '<div>… after status filter (excludes Idea, Canceled): <strong>' + d.allocationsAfterStatus + '</strong></div>' +
      '<div>Resulting distinct projects: <strong>' + d.projects + '</strong></div>' +
      '</div></div>';
    return _tlShell(diagHtml);
  }

  var html = '';
  html += '<h1 class="tl-title">Team Load Analytics</h1>';
  html += '<p class="tl-lead">Where the team\'s allocated hours were directed year-to-date. ' +
          model.totalProjects + ' project' + (model.totalProjects === 1 ? '' : 's') + ' · ' +
          _tlFmt(model.totalHours) + ' allocated. ' +
          'Window: ' + model.windowFromStr + ' → ' + model.windowToStr + '. ' +
          '<em>Allocated hours used as a proxy for actual time spent.</em></p>';

  html += filterRow;
  html += scopeChip;

  html += '<div class="tl-privacy">';
  html += '<strong>Visibility:</strong> Section C (per-person concentration) shows by name only to team leads ' +
          'and to each person\'s own row. Sections A and B aggregate across the team and are visible to everyone.';
  html += '</div>';

  html += _tlRenderKpis(model);
  html += _tlRenderPartners(model);
  html += _tlRenderCategories(model);
  html += _tlRenderMembers(model);
  html += _tlRenderCallout();

  return _tlShell(html);
}

function _tlShell(inner) {
  return '<div class="team-load-page">' + inner + '</div>';
}

// ─── Model ─────────────────────────────────────────────────────────────
function _tlBuildModel() {
  var rd     = (typeof RESOURCES_DATA !== 'undefined') ? RESOURCES_DATA : null;
  var weeks  = (rd && rd.weeks)  ? rd.weeks  : [];
  var people = (rd && rd.people) ? rd.people : {};
  var hasWeeks = weeks.length > 0;

  // Window end = "today" (or the closest past week-start) within the loaded weeks array.
  // RESOURCES_DATA.weeks is currently only the 52 Sunday week-starts of the calendar year,
  // so the "12-month rolling" framing collapses to "year-to-date" with this data source.
  var curIdx = (typeof window !== 'undefined' && window.currentWeekIdx != null)
    ? window.currentWeekIdx
    : _tlComputeCurrentWeekIdx(weeks);
  if (!hasWeeks) curIdx = -1;

  var windowFromStr = hasWeeks ? _tlWeekLabel(weeks[0]) : '—';
  var windowToStr   = (hasWeeks && curIdx >= 0) ? _tlWeekLabel(weeks[Math.min(curIdx, weeks.length - 1)]) : '—';

  // ─── Build per-project aggregation from allocations ───
  // projAgg[title] = { title, partner, category, contact, status, totalHours, personHours: {name: hours} }
  var projAgg = {};
  var allocCount = 0;
  var allocNonzero = 0;
  var allocAfterStatus = 0;

  Object.keys(people).forEach(function(name) {
    if (!_tlIsCountableMember(name)) return;
    if (typeof inCurrentTeamPerson === 'function' && !inCurrentTeamPerson(name)) return;
    var person = people[name];
    if (!person || !person.allocations) return;
    // Org-hierarchy filters (Team → Unit → Member). When set, restrict
    // which people's allocations contribute to the aggregates.
    if (_tlFilterMember && name !== _tlFilterMember) return;
    if (_tlFilterTeam && (person.team || '') !== _tlFilterTeam) return;
    if (_tlFilterUnit && (person.role || '') !== _tlFilterUnit) return;
    person.allocations.forEach(function(a) {
      allocCount++;

      // Sum the allocation's weekly hours from week 0 through the current week.
      var sum = 0;
      var hoursArr = a.hours || [];
      var stop = Math.min(curIdx, hoursArr.length - 1);
      for (var i = 0; i <= stop; i++) sum += hoursArr[i] || 0;
      if (sum <= 0) return;
      allocNonzero++;

      // Skip work that wasn't real: Idea-stage submissions and Canceled projects.
      var status = a.status || '';
      if (status === 'Idea' || status === 'Canceled') return;
      allocAfterStatus++;

      var projTitle = a.project || '(unknown project)';
      if (!projAgg[projTitle]) {
        var proj = _tlLookupProject(a, projTitle);
        projAgg[projTitle] = {
          title:       projTitle,
          category:    (proj && proj.category)     || 'Uncategorized',
          partner:     (proj && proj.partner_dept) || 'Internal',
          contact:     (proj && proj.contact)      || null,
          status:      (proj && proj.status)       || status,
          totalHours:  0,
          personHours: {}
        };
      }
      projAgg[projTitle].totalHours += sum;
      projAgg[projTitle].personHours[name] = (projAgg[projTitle].personHours[name] || 0) + sum;
    });
  });

  var projData = Object.keys(projAgg).map(function(t) {
    var p = projAgg[t];
    var personHoursArr = Object.keys(p.personHours).map(function(n) {
      return { name: n, hours: p.personHours[n] };
    }).sort(function(a, b) { return b.hours - a.hours; });
    return {
      title:       p.title,
      category:    p.category,
      partner:     p.partner,
      contact:     p.contact,
      status:      p.status,
      hours:       p.totalHours,
      personHours: personHoursArr
    };
  });

  var totalHours = projData.reduce(function(s, p) { return s + p.hours; }, 0);

  var diag = {
    resourcesLoaded:        hasWeeks,
    weeksAvailable:         weeks.length,
    currentWeekIdx:         curIdx,
    peopleInData:           Object.keys(people).length,
    countableMembers:       Object.keys(people).filter(_tlIsCountableMember).length,
    allocations:            allocCount,
    allocationsWithHours:   allocNonzero,
    allocationsAfterStatus: allocAfterStatus,
    projects:               projData.length
  };

  // ─── Section A: hours by partner department ───
  var partnerMap = {};
  projData.forEach(function(p) {
    if (!partnerMap[p.partner]) partnerMap[p.partner] = { projects: 0, hours: 0 };
    partnerMap[p.partner].projects++;
    partnerMap[p.partner].hours += p.hours;
  });
  var partners = Object.keys(partnerMap).map(function(k) {
    return {
      dept: k,
      projects: partnerMap[k].projects,
      hours: partnerMap[k].hours,
      avgPerProject: partnerMap[k].hours / partnerMap[k].projects,
      share: totalHours > 0 ? partnerMap[k].hours / totalHours : 0
    };
  }).sort(function(a, b) { return b.hours - a.hours; });

  // Collapse small departments (< 3 projects) into a single "Other" tail row.
  var primaryDepts = partners.filter(function(d) { return d.projects >= 3; });
  var smallDepts   = partners.filter(function(d) { return d.projects < 3; });
  if (smallDepts.length >= 2) {
    var other = {
      dept: 'Other (' + smallDepts.length + ' depts, n < 3 each)',
      projects: smallDepts.reduce(function(s, d) { return s + d.projects; }, 0),
      hours:    smallDepts.reduce(function(s, d) { return s + d.hours;    }, 0),
      isOther: true
    };
    other.avgPerProject = other.projects > 0 ? other.hours / other.projects : 0;
    other.share = totalHours > 0 ? other.hours / totalHours : 0;
    partners = primaryDepts.concat([other]);
  }
  var topHours = partners.length > 0 ? partners[0].hours : 1;
  partners.forEach(function(d) { d.barPct = topHours > 0 ? Math.round(d.hours / topHours * 100) : 0; });

  // ─── Section B: lead vs contributor by category ───
  var catMap = {};
  projData.forEach(function(p) {
    if (!catMap[p.category]) catMap[p.category] = { projects: 0, hours: 0, leadHours: 0 };
    catMap[p.category].projects++;
    catMap[p.category].hours += p.hours;
    if (p.contact) {
      var leadEntry = (p.personHours || []).find(function(x) { return x.name === p.contact; });
      if (leadEntry) catMap[p.category].leadHours += leadEntry.hours;
    }
  });
  var categories = Object.keys(catMap).map(function(k) {
    var c = catMap[k];
    var leadShare = c.hours > 0 ? c.leadHours / c.hours : 0;
    return {
      category:  k,
      projects:  c.projects,
      hours:     c.hours,
      leadHours: c.leadHours,
      leadShare: leadShare,
      band:      _tlLeadBand(leadShare)
    };
  }).sort(function(a, b) { return b.hours - a.hours; });

  // ─── Section C: per-person concentration ───
  var personMap = {};
  projData.forEach(function(p) {
    (p.personHours || []).forEach(function(ph) {
      if (ph.hours <= 0) return;
      if (!personMap[ph.name]) personMap[ph.name] = { hours: 0, perProject: {} };
      personMap[ph.name].hours += ph.hours;
      personMap[ph.name].perProject[p.title] = (personMap[ph.name].perProject[p.title] || 0) + ph.hours;
    });
  });
  var members = Object.keys(personMap).map(function(name) {
    var m = personMap[name];
    var projCount = Object.keys(m.perProject).length;
    var hoursList = Object.keys(m.perProject).map(function(t) { return m.perProject[t]; });
    var topHrs = hoursList.length > 0 ? Math.max.apply(Math, hoursList) : 0;
    var topShare = m.hours > 0 ? topHrs / m.hours : 0;
    return {
      name: name,
      projects: projCount,
      hours: m.hours,
      hoursPerProject: projCount > 0 ? m.hours / projCount : 0,
      topShare: topShare,
      profile: _tlProfileBand(topShare)
    };
  }).sort(function(a, b) { return b.hours - a.hours; });

  // ─── KPIs derived from the three sections ───
  var topPartner = partners.find(function(d) { return !d.isOther; }) || null;
  var mostLeadHeavy = categories.filter(function(c) { return c.projects >= 3; })
    .slice().sort(function(a, b) { return b.leadShare - a.leadShare; })[0] || null;
  var mostConcentrated = members.slice().sort(function(a, b) { return b.topShare - a.topShare; })[0] || null;
  var mostSpread = members.slice().sort(function(a, b) {
    if (b.projects !== a.projects) return b.projects - a.projects;
    return a.topShare - b.topShare;
  })[0] || null;

  return {
    totalProjects: projData.length,
    totalHours: totalHours,
    windowFromStr: windowFromStr,
    windowToStr: windowToStr,
    partners: partners,
    categories: categories,
    members: members,
    kpis: {
      topPartner: topPartner,
      mostLeadHeavy: mostLeadHeavy,
      mostConcentrated: mostConcentrated,
      mostSpread: mostSpread
    },
    diag: diag,
    filters: {
      team:   _tlFilterTeam,
      unit:   _tlFilterUnit,
      member: _tlFilterMember,
      active: !!(_tlFilterTeam || _tlFilterUnit || _tlFilterMember)
    }
  };
}

// ─── Filter UI + options ─────────────────────────────────────────────
function _tlRenderFilters(model) {
  var opts = _tlBuildFilterOptions();
  var html = '<div class="tl-filter-row">';

  html += '<label class="tl-filter-label">Team';
  html += '<select class="tl-filter-select" onchange="setTeamLoadFilter(\'team\', this.value)">';
  html += '<option value="">All teams</option>';
  opts.teams.forEach(function(t) {
    html += '<option value="' + _tlEsc(t) + '"' + (t === _tlFilterTeam ? ' selected' : '') + '>' + _tlEsc(t) + '</option>';
  });
  html += '</select></label>';

  html += '<label class="tl-filter-label">Unit';
  html += '<select class="tl-filter-select" onchange="setTeamLoadFilter(\'unit\', this.value)">';
  html += '<option value="">All units</option>';
  opts.units.forEach(function(u) {
    html += '<option value="' + _tlEsc(u) + '"' + (u === _tlFilterUnit ? ' selected' : '') + '>' + _tlEsc(u) + '</option>';
  });
  html += '</select></label>';

  html += '<label class="tl-filter-label">Member';
  html += '<select class="tl-filter-select" onchange="setTeamLoadFilter(\'member\', this.value)">';
  html += '<option value="">All members</option>';
  opts.members.forEach(function(m) {
    html += '<option value="' + _tlEsc(m) + '"' + (m === _tlFilterMember ? ' selected' : '') + '>' + _tlEsc(m) + '</option>';
  });
  html += '</select></label>';

  if (model.filters && model.filters.active) {
    html += '<button type="button" class="tl-filter-clear" onclick="setTeamLoadFilter(\'clear\')">Clear filters</button>';
  }
  html += '</div>';
  return html;
}

function _tlRenderScopeChip(model) {
  if (!model.filters || !model.filters.active) return '';
  var chips = [];
  if (model.filters.team)   chips.push('Team: <strong>' + _tlEsc(model.filters.team) + '</strong>');
  if (model.filters.unit)   chips.push('Unit: <strong>' + _tlEsc(model.filters.unit) + '</strong>');
  if (model.filters.member) chips.push('Member: <strong>' + _tlEsc(model.filters.member) + '</strong>');
  return '<div class="tl-scope-chip">Filtered to ' + chips.join(' · ') + '. Aggregates reflect only the included people\'s allocations.</div>';
}

function _tlBuildFilterOptions() {
  var rd = (typeof RESOURCES_DATA !== 'undefined') ? RESOURCES_DATA : null;
  var people = rd && rd.people ? rd.people : {};
  var teamSet = {};
  Object.keys(people).forEach(function(name) {
    if (!_tlIsCountableMember(name)) return;
    if (typeof inCurrentTeamPerson === 'function' && !inCurrentTeamPerson(name)) return;
    teamSet[people[name].team || '(no team)'] = true;
  });
  var teams = Object.keys(teamSet).sort();

  var unitSet = {};
  Object.keys(people).forEach(function(name) {
    if (!_tlIsCountableMember(name)) return;
    if (typeof inCurrentTeamPerson === 'function' && !inCurrentTeamPerson(name)) return;
    var p = people[name];
    if (_tlFilterTeam && (p.team || '') !== _tlFilterTeam) return;
    var u = p.role || '';
    if (u) unitSet[u] = true;
  });
  var units = Object.keys(unitSet).sort();

  var members = Object.keys(people).filter(function(name) {
    if (!_tlIsCountableMember(name)) return false;
    if (typeof inCurrentTeamPerson === 'function' && !inCurrentTeamPerson(name)) return false;
    var p = people[name];
    if (_tlFilterTeam && (p.team || '') !== _tlFilterTeam) return false;
    if (_tlFilterUnit && (p.role || '') !== _tlFilterUnit) return false;
    return true;
  }).sort();

  return { teams: teams, units: units, members: members };
}

// Try the project_number FK first, then a title-keyed lookup, so allocations
// to deleted projects still pick up their last-known metadata if available.
function _tlLookupProject(alloc, projTitle) {
  var projects = (typeof PROJECTS !== 'undefined') ? PROJECTS : [];
  if (alloc.analytics_id != null) {
    var byId = projects.find(function(p) {
      return p.project_number === alloc.analytics_id ||
             String(p.project_number) === String(alloc.analytics_id);
    });
    if (byId) return byId;
  }
  if (projTitle && typeof _PROJECTS_BY_TITLE !== 'undefined') {
    var byTitle = _PROJECTS_BY_TITLE[String(projTitle).toLowerCase()];
    if (byTitle) return byTitle;
  }
  return null;
}

function _tlIsCountableMember(name) {
  if (typeof isFullMember === 'function') return isFullMember(name);
  if (typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people[name]) return false;
  var p = RESOURCES_DATA.people[name];
  return p.active !== false && p.tracking_level !== 'light';
}

function _tlComputeCurrentWeekIdx(weeks) {
  if (!weeks || weeks.length === 0) return 0;
  var todayStr = new Date().toISOString().slice(0, 10);
  for (var i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i] <= todayStr) return i;
  }
  return 0;
}

// ─── KPI band helpers ─────────────────────────────────────────────────
function _tlLeadBand(share) {
  if (share >= 0.75) return { label: 'Specialist single-handed — may indicate succession risk', color: '#9A3412' };
  if (share >= 0.60) return { label: 'Lead-led; some contributor handoff',                       color: 'var(--text-muted)' };
  if (share >= 0.45) return { label: 'Balanced',                                                  color: '#166534' };
  if (share >= 0.30) return { label: 'Contributor-led; lead in coordinator role',                 color: 'var(--text-muted)' };
  return                  { label: 'Mostly contributors — lead is administrative',               color: '#1E3A8A' };
}

function _tlProfileBand(topShare) {
  if (topShare > 0.60) return 'Focused';
  if (topShare >= 0.30) return 'Balanced';
  return 'Spread';
}

// ─── Renderers ────────────────────────────────────────────────────────
function _tlRenderKpis(model) {
  var k = model.kpis;
  var html = '<div class="kpi-row">';

  if (k.topPartner) {
    html += _tlKpi('Top consuming partner',
      _tlEsc(k.topPartner.dept),
      _tlFmt(k.topPartner.hours) + ' · ' + _tlPct(k.topPartner.share) + ' of team time');
  } else {
    html += _tlKpi('Top consuming partner', '—', 'No partner data');
  }

  if (k.mostLeadHeavy) {
    html += _tlKpi('Most lead-heavy category',
      _tlEsc(k.mostLeadHeavy.category),
      _tlPct(k.mostLeadHeavy.leadShare) + ' of hours from the lead');
  } else {
    html += _tlKpi('Most lead-heavy category', '—', 'Need ≥ 3 projects per category');
  }

  if (k.mostConcentrated) {
    html += _tlKpi('Most concentrated',
      _tlMemberDisplay(k.mostConcentrated.name, model.members),
      _tlPct(k.mostConcentrated.topShare) + ' of hours on one project');
  } else {
    html += _tlKpi('Most concentrated', '—', 'No per-person data');
  }

  if (k.mostSpread) {
    html += _tlKpi('Most spread',
      _tlMemberDisplay(k.mostSpread.name, model.members),
      k.mostSpread.projects + ' active projects · ' + _tlPct(k.mostSpread.topShare) + ' top share');
  } else {
    html += _tlKpi('Most spread', '—', 'No per-person data');
  }

  html += '</div>';
  return html;
}

function _tlKpi(label, value, sub) {
  return '<div class="res-kpi">' +
    '<div class="kpi-label">' + label + '</div>' +
    '<div class="kpi-value" style="font-size:16px;line-height:1.4;">' + value +
    '<br><span style="font-weight:600;font-size:12px;color:var(--text-muted);">' + _tlEsc(sub) + '</span></div>' +
    '</div>';
}

function _tlRenderPartners(model) {
  var html = '<div class="tl-section">';
  html += '<div class="tl-section-head"><h2>A · Hours by Partner Department</h2>';
  html += '<span class="tl-desc">Total team hours invested per department year-to-date.</span></div>';
  html += '<div class="tl-tbl-wrap"><table class="tl-table">';
  html += '<thead><tr>' +
    '<th>Department</th>' +
    '<th class="num">Projects</th>' +
    '<th class="num">Total hours</th>' +
    '<th class="num">Avg hrs/project</th>' +
    '<th>Share of team time</th>' +
    '</tr></thead><tbody>';
  model.partners.forEach(function(d) {
    var dim = d.isOther ? ' style="opacity:0.65;"' : '';
    html += '<tr' + dim + '>';
    html += '<td class="tl-cat">' + _tlEsc(d.dept) + '</td>';
    html += '<td class="num">' + d.projects + '</td>';
    html += '<td class="num">' + _tlFmt(d.hours) + '</td>';
    html += '<td class="num">' + _tlFmt(d.avgPerProject) + '</td>';
    html += '<td><span class="tl-share-bar"><div style="width:' + d.barPct + '%"></div></span> ' + _tlPct(d.share) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  return html;
}

function _tlRenderCategories(model) {
  var html = '<div class="tl-section">';
  html += '<div class="tl-section-head"><h2>B · Lead vs Contributor by Category</h2>';
  html += '<span class="tl-desc">Share of category hours allocated to the project\'s lead (contact) vs everyone else.</span></div>';
  html += '<div class="tl-stack-key"><span class="lead">Lead</span><span class="contrib">Contributors</span></div>';
  html += '<div class="tl-tbl-wrap"><table class="tl-table">';
  html += '<thead><tr>' +
    '<th>Category</th>' +
    '<th class="num">Projects</th>' +
    '<th class="num">Total hours</th>' +
    '<th>Lead / Contributor split</th>' +
    '<th class="num">Lead share</th>' +
    '<th>Read</th>' +
    '</tr></thead><tbody>';
  model.categories.forEach(function(c) {
    var leadPct = Math.round(c.leadShare * 100);
    html += '<tr>';
    html += '<td class="tl-cat">' + _tlEsc(c.category) + '</td>';
    html += '<td class="num">' + c.projects + '</td>';
    html += '<td class="num">' + _tlFmt(c.hours) + '</td>';
    html += '<td><span class="tl-stack-bar">' +
      '<div class="seg-lead" style="width:' + leadPct + '%"></div>' +
      '<div class="seg-contrib" style="width:' + (100 - leadPct) + '%"></div>' +
      '</span></td>';
    html += '<td class="num">' + leadPct + '%</td>';
    html += '<td style="font-size:11px;color:' + c.band.color + ';">' + _tlEsc(c.band.label) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  return html;
}

function _tlRenderMembers(model) {
  var html = '<div class="tl-section">';
  html += '<div class="tl-section-head"><h2>C · Workload Concentration</h2>';
  html += '<span class="tl-desc">For each person: how focused (one big project) vs spread (many small projects) was their year. Visible by name to leads &amp; self only.</span></div>';
  html += '<div class="tl-tbl-wrap"><table class="tl-table">';
  html += '<thead><tr>' +
    '<th>Member</th>' +
    '<th class="num">Active projects</th>' +
    '<th class="num">Total hours</th>' +
    '<th class="num">Hours / project</th>' +
    '<th class="num">Top project share</th>' +
    '<th class="ctr">Profile</th>' +
    '</tr></thead><tbody>';
  model.members.forEach(function(m, idx) {
    var profileClass = 'tl-conc-' + m.profile.toLowerCase();
    var displayName = _tlMaskedName(m.name, idx);
    html += '<tr>';
    html += '<td class="tl-cat">' + _tlEsc(displayName) + '</td>';
    html += '<td class="num">' + m.projects + '</td>';
    html += '<td class="num">' + _tlFmt(m.hours) + '</td>';
    html += '<td class="num">' + _tlFmt(m.hoursPerProject) + '</td>';
    html += '<td class="num">' + _tlPct(m.topShare) + '</td>';
    html += '<td class="ctr"><span class="tl-conc ' + profileClass + '">' + m.profile + '</span></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  html += '<div class="tl-section-note">Focused = &gt;60% of hours on one project · Balanced = 30–60% · Spread = &lt;30%. ' +
          '"Top project share" is the % of this person\'s allocated hours that went to their single largest project. ' +
          'Helps identify who would benefit from consolidation, and who\'s likely a single-thread risk.</div>';
  html += '</div>';
  return html;
}

function _tlRenderCallout() {
  var html = '<div class="tl-callout"><strong>Questions this section helps answer:</strong><ul>';
  html += '<li>"Are we over-invested in any one partner department?" — Section A.</li>';
  html += '<li>"Which categories have lone specialists carrying the load?" — Section B\'s lead share and the "Read" column flag where the lead is the only person who knows the work — a succession-planning signal.</li>';
  html += '<li>"Who\'s spread too thin? Who has concentration risk?" — Section C: both directions matter.</li>';
  html += '<li>"What\'s the team-load shape we should reproduce next year, and what\'s the shape we should avoid?" — All three together give the retro narrative.</li>';
  html += '</ul></div>';
  return html;
}

// ─── Privacy helpers ──────────────────────────────────────────────────
function _tlIsLead() {
  return typeof Auth !== 'undefined' && (Auth.isTeamLead || Auth.canPromote);
}

function _tlOwnName() {
  return (typeof Auth !== 'undefined' && Auth.fullName) ? Auth.fullName : '';
}

function _tlMaskedName(name, idx) {
  if (_tlIsLead() || name === _tlOwnName()) return name;
  var letter = String.fromCharCode(65 + (idx % 26));
  return 'Member ' + letter;
}

function _tlMemberDisplay(name, membersSortedByHours) {
  if (_tlIsLead() || name === _tlOwnName()) return _tlEsc(name);
  var idx = membersSortedByHours.findIndex(function(m) { return m.name === name; });
  if (idx < 0) return 'Team member';
  return 'Member ' + String.fromCharCode(65 + (idx % 26));
}

// ─── Formatting helpers ───────────────────────────────────────────────
function _tlFmt(h) {
  if (h == null || !isFinite(h)) return '—';
  var n = Math.round(h);
  return n.toLocaleString() + 'h';
}

function _tlPct(frac) {
  if (frac == null || !isFinite(frac)) return '—';
  return Math.round(frac * 100) + '%';
}

function _tlWeekLabel(weekStr) {
  if (!weekStr) return '—';
  var d = new Date(weekStr + 'T00:00:00');
  if (!isFinite(d.getTime())) return weekStr;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

function _tlEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
