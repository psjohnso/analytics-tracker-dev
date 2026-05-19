// ─────────────────────────────────────────────────────────────────────
// effort-shape.js — Effort Shape Analytics page
//
// Second sub-tab under Analytics. Looks at how hours are *distributed*
// over each project's life — not just totals.
//
//   A — Project effort profiles (sparkline + shape badge + intensity)
//   B — Shape distribution by Category (sustained vs back-burner)
//   C — Death-march candidates (peak weeks ≥ 2× the average)
//
// Data source: same allocation data as team-load.js. For each project,
// sum every person's allocation.hours[i] across i in [0, currentWeekIdx]
// to build a weekly hours array, then analyze the slice from the first
// non-zero week to the last non-zero week — the project's active span.
// ─────────────────────────────────────────────────────────────────────

function buildEffortShapePage() {
  var model = _esBuildModel();
  var header = '<h1 class="tl-title">Effort Shape Analytics</h1>';
  var filterRow = _esRenderFilters(model);
  var scopeChip = _esRenderScopeChip(model);

  if (model.projects.length === 0) {
    var d = model.diag || {};
    var diagHtml = header + filterRow + scopeChip +
      '<div class="tl-empty">' +
      '<div style="font-weight:700;color:var(--navy);font-size:14px;margin-bottom:8px;">Effort Shape: no data to show</div>' +
      (model.filters.active
        ? 'No projects match the current filters. Try clearing or broadening them.'
        : 'No projects have enough weekly allocation history yet.') +
      '<div style="margin-top:14px;text-align:left;display:inline-block;font-size:12px;">' +
      '<div><code>RESOURCES_DATA</code> loaded: <strong>' + (d.resourcesLoaded ? 'yes' : 'no') + '</strong></div>' +
      '<div>Weeks available: <strong>' + d.weeksAvailable + '</strong> (current week idx: ' + d.currentWeekIdx + ')</div>' +
      '<div>Projects with hours: <strong>' + d.projectsWithHours + '</strong></div>' +
      '<div>… with active span ≥ ' + ES_MIN_SPAN_WEEKS + ' weeks: <strong>' + d.projects + '</strong></div>' +
      '</div></div>';
    return _esShell(diagHtml);
  }

  var html = '';
  html += header;
  html += '<p class="tl-lead">How effort is <em>distributed</em> over a project\'s life — not just total hours. ' +
          model.projects.length + ' project' + (model.projects.length === 1 ? '' : 's') + ' analyzed · ' +
          'Window: ' + model.windowFromStr + ' → ' + model.windowToStr + '. ' +
          '<em>Allocated hours used as a proxy for actual time spent.</em></p>';
  html += filterRow;
  html += scopeChip;

  html += '<div class="tl-privacy">' +
          '<strong>Read shapes carefully on active projects:</strong> their span is observed only up to today, ' +
          'so a project mid-flight will look "front-loaded" simply because its later weeks haven\'t happened yet. ' +
          'Completed projects give the cleanest signal.' +
          '</div>';

  html += _esRenderKpis(model);
  html += _esRenderProjects(model);
  html += _esRenderCategories(model);
  html += _esRenderDeathMarch(model);
  html += _esRenderCallout();

  return _esShell(html);
}

function _esRenderFilters(model) {
  var opts = _esBuildFilterOptions();
  var html = '<div class="es-filter-row">';

  html += '<label class="es-filter-label">Team';
  html += '<select class="es-filter-select" onchange="setEffortShapeFilter(\'team\', this.value)">';
  html += '<option value="">All teams</option>';
  opts.teams.forEach(function(t) {
    html += '<option value="' + _esEsc(t) + '"' + (t === _esFilterTeam ? ' selected' : '') + '>' + _esEsc(t) + '</option>';
  });
  html += '</select></label>';

  html += '<label class="es-filter-label">Unit';
  html += '<select class="es-filter-select" onchange="setEffortShapeFilter(\'unit\', this.value)">';
  html += '<option value="">All units</option>';
  opts.units.forEach(function(u) {
    html += '<option value="' + _esEsc(u) + '"' + (u === _esFilterUnit ? ' selected' : '') + '>' + _esEsc(u) + '</option>';
  });
  html += '</select></label>';

  html += '<label class="es-filter-label">Member';
  html += '<select class="es-filter-select" onchange="setEffortShapeFilter(\'member\', this.value)">';
  html += '<option value="">All members</option>';
  opts.members.forEach(function(m) {
    html += '<option value="' + _esEsc(m) + '"' + (m === _esFilterMember ? ' selected' : '') + '>' + _esEsc(m) + '</option>';
  });
  html += '</select></label>';

  if (model.filters.active) {
    html += '<button type="button" class="es-filter-clear" onclick="setEffortShapeFilter(\'clear\')">Clear filters</button>';
  }

  html += '</div>';
  return html;
}

function _esRenderScopeChip(model) {
  if (!model.filters.active) return '';
  var chips = [];
  if (model.filters.team)   chips.push('Team: <strong>' + _esEsc(model.filters.team) + '</strong>');
  if (model.filters.unit)   chips.push('Unit: <strong>' + _esEsc(model.filters.unit) + '</strong>');
  if (model.filters.member) chips.push('Member: <strong>' + _esEsc(model.filters.member) + '</strong>');
  return '<div class="es-scope-chip">Filtered to ' + chips.join(' · ') + '. Project totals reflect only the included people\'s allocations.</div>';
}

function _esShell(inner) {
  return '<div class="effort-shape-page">' + inner + '</div>';
}

// Persistent filter state — survives re-renders triggered by changing a
// filter dropdown. Cleared when the user clicks "Clear filters". Filters
// operate on people in the org hierarchy Team → Unit → Member: any of the
// three can be set and they stack. Unit lives in person.role (per the
// IT-org schema where team_members.role stores the unit name within a team).
var _esFilterTeam = '';
var _esFilterUnit = '';
var _esFilterMember = '';

function setEffortShapeFilter(key, value) {
  var rd = (typeof RESOURCES_DATA !== 'undefined') ? RESOURCES_DATA : null;
  if (key === 'clear') {
    _esFilterTeam = '';
    _esFilterUnit = '';
    _esFilterMember = '';
  } else if (key === 'team') {
    _esFilterTeam = value || '';
    // Drop unit / member if they no longer belong to the new team.
    if (_esFilterUnit && _esFilterTeam) {
      var unitStillValid = false;
      Object.keys((rd && rd.people) || {}).forEach(function(n) {
        var p = rd.people[n];
        if (p && p.team === _esFilterTeam && p.role === _esFilterUnit) unitStillValid = true;
      });
      if (!unitStillValid) _esFilterUnit = '';
    }
    if (_esFilterMember && _esFilterTeam) {
      var pm = rd && rd.people ? rd.people[_esFilterMember] : null;
      if (!pm || pm.team !== _esFilterTeam) _esFilterMember = '';
    }
  } else if (key === 'unit') {
    _esFilterUnit = value || '';
    // Drop member if they aren't in the new unit.
    if (_esFilterMember && _esFilterUnit) {
      var pm2 = rd && rd.people ? rd.people[_esFilterMember] : null;
      if (!pm2 || pm2.role !== _esFilterUnit) _esFilterMember = '';
    }
  } else if (key === 'member') {
    _esFilterMember = value || '';
  }
  var area = document.getElementById('content-area');
  if (area) area.innerHTML = buildEffortShapePage();
}

// Minimum active span (in weeks) required before a project is included in
// the shape analysis. Anything shorter has too little signal to classify.
var ES_MIN_SPAN_WEEKS = 3;
// Minimum active span before we'll flag a project as death-march. Short
// projects with a single big week are usually just unsmoothed allocation.
var ES_DEATH_MARCH_MIN_SPAN = 6;
// Peak-to-average ratio that triggers the death-march flag, paired with
// requirement that the peak occurred in the last third of the active span.
var ES_DEATH_MARCH_RATIO = 2.0;

// ─── Model ─────────────────────────────────────────────────────────────
function _esBuildModel() {
  var rd     = (typeof RESOURCES_DATA !== 'undefined') ? RESOURCES_DATA : null;
  var weeks  = (rd && rd.weeks)  ? rd.weeks  : [];
  var people = (rd && rd.people) ? rd.people : {};
  var hasWeeks = weeks.length > 0;

  var curIdx = (typeof window !== 'undefined' && window.currentWeekIdx != null)
    ? window.currentWeekIdx
    : _esComputeCurrentWeekIdx(weeks);
  if (!hasWeeks) curIdx = -1;

  var windowFromStr = hasWeeks ? _esWeekLabel(weeks[0]) : '—';
  var windowToStr   = (hasWeeks && curIdx >= 0) ? _esWeekLabel(weeks[Math.min(curIdx, weeks.length - 1)]) : '—';

  // Build per-project weekly hours arrays by summing all people's allocations
  // for the project across weeks [0, curIdx].
  var projWeekly = {}; // title → { hours: number[], meta: {category, partner, contact, status} }
  Object.keys(people).forEach(function(name) {
    if (!_esIsCountableMember(name)) return;
    var person = people[name];
    if (!person || !person.allocations) return;
    // Filters: when set, restrict whose allocations contribute to project totals.
    if (_esFilterMember && name !== _esFilterMember) return;
    if (_esFilterTeam && (person.team || '') !== _esFilterTeam) return;
    if (_esFilterUnit && (person.role || '') !== _esFilterUnit) return;
    person.allocations.forEach(function(a) {
      var status = a.status || '';
      if (status === 'Idea' || status === 'Canceled') return;
      var title = a.project || '(unknown project)';

      if (!projWeekly[title]) {
        var proj = _esLookupProject(a, title);
        projWeekly[title] = {
          hours:    new Array(curIdx + 1).fill(0),
          category: (proj && proj.category)     || 'Uncategorized',
          partner:  (proj && proj.partner_dept) || 'Internal',
          contact:  (proj && proj.contact)      || null,
          status:   (proj && proj.status)       || status,
          objectId: proj ? proj.objectId : null
        };
      }
      var hoursArr = a.hours || [];
      var stop = Math.min(curIdx, hoursArr.length - 1);
      for (var i = 0; i <= stop; i++) {
        projWeekly[title].hours[i] += hoursArr[i] || 0;
      }
    });
  });

  // For each project: find active span, run shape analysis.
  var projects = [];
  var projectsWithHours = 0;
  Object.keys(projWeekly).forEach(function(title) {
    var rec = projWeekly[title];
    var arr = rec.hours;
    var first = -1, last = -1;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] > 0) { if (first < 0) first = i; last = i; }
    }
    if (first < 0) return;
    projectsWithHours++;

    var span = last - first + 1;
    if (span < ES_MIN_SPAN_WEEKS) return;

    var slice = arr.slice(first, last + 1);
    var totalHours = slice.reduce(function(s, v) { return s + v; }, 0);
    var nonZero = slice.filter(function(v) { return v > 0; });
    // Average per *active* week — counting only weeks with non-zero allocation.
    // Sparser projects (work-then-pause-then-work) read more honestly this way.
    var avgPerWeek = nonZero.length > 0 ? totalHours / nonZero.length : 0;
    var peakHours  = slice.length > 0 ? Math.max.apply(Math, slice) : 0;
    var peakRatio  = avgPerWeek > 0 ? peakHours / avgPerWeek : 0;
    var peakIdx    = slice.indexOf(peakHours); // first index of peak within slice

    // Thirds-based shape classification on the active span.
    var t1End = Math.floor(span / 3);
    var t2End = Math.floor(span * 2 / 3);
    var firstHours  = 0, midHours = 0, lastHours = 0;
    for (var j = 0; j < span; j++) {
      if (j < t1End)      firstHours += slice[j];
      else if (j < t2End) midHours   += slice[j];
      else                lastHours  += slice[j];
    }
    var firstShare = totalHours > 0 ? firstHours / totalHours : 0;
    var lastShare  = totalHours > 0 ? lastHours  / totalHours : 0;
    var shape = _esShapeBand(firstShare, lastShare);

    var deathMarch =
      span >= ES_DEATH_MARCH_MIN_SPAN &&
      peakRatio >= ES_DEATH_MARCH_RATIO &&
      peakIdx >= Math.floor(span * 2 / 3);

    projects.push({
      title:       title,
      status:      rec.status,
      category:    rec.category,
      partner:     rec.partner,
      objectId:    rec.objectId,
      weeklySlice: slice,
      spanWeeks:   span,
      activeWeeks: nonZero.length,
      totalHours:  totalHours,
      avgPerWeek:  avgPerWeek,
      peakHours:   peakHours,
      peakRatio:   peakRatio,
      peakIdx:     peakIdx,
      firstShare:  firstShare,
      lastShare:   lastShare,
      shape:       shape,
      intensity:   _esIntensityBand(avgPerWeek),
      deathMarch:  deathMarch
    });
  });

  projects.sort(function(a, b) { return b.totalHours - a.totalHours; });

  // ─── Section B: shape & intensity by category ───
  var catMap = {};
  projects.forEach(function(p) {
    if (!catMap[p.category]) catMap[p.category] = { projects: 0, avgList: [], shapes: {Frontloaded:0, Even:0, Backloaded:0} };
    catMap[p.category].projects++;
    catMap[p.category].avgList.push(p.avgPerWeek);
    catMap[p.category].shapes[p.shape.key]++;
  });
  var categories = Object.keys(catMap).map(function(k) {
    var c = catMap[k];
    var medAvg = _esMedian(c.avgList);
    return {
      category: k,
      projects: c.projects,
      medianAvg: medAvg,
      intensity: _esIntensityBand(medAvg),
      shapes: c.shapes,
      // dominant shape
      dominantShape: _esDominantShape(c.shapes)
    };
  }).sort(function(a, b) { return b.projects - a.projects; });

  // ─── Death-march candidates ───
  var deathMarchers = projects.filter(function(p) { return p.deathMarch; })
    .sort(function(a, b) { return b.peakRatio - a.peakRatio; });

  // ─── KPIs ───
  var avgList = projects.map(function(p) { return p.avgPerWeek; });
  var spanList = projects.map(function(p) { return p.spanWeeks; });
  var medianIntensity = _esMedian(avgList);
  var medianDuration  = _esMedian(spanList);
  var mostFrontloadedCat = categories.filter(function(c) { return c.projects >= 3 && c.dominantShape.key === 'Frontloaded'; })
    .sort(function(a, b) {
      return (b.shapes.Frontloaded / b.projects) - (a.shapes.Frontloaded / a.projects);
    })[0] || null;
  var mostBackloadedCat = categories.filter(function(c) { return c.projects >= 3 && c.dominantShape.key === 'Backloaded'; })
    .sort(function(a, b) {
      return (b.shapes.Backloaded / b.projects) - (a.shapes.Backloaded / a.projects);
    })[0] || null;

  return {
    projects: projects,
    categories: categories,
    deathMarchers: deathMarchers,
    windowFromStr: windowFromStr,
    windowToStr: windowToStr,
    kpis: {
      projectsAnalyzed: projects.length,
      medianIntensity: medianIntensity,
      medianDuration: medianDuration,
      mostFrontloadedCat: mostFrontloadedCat,
      mostBackloadedCat: mostBackloadedCat,
      deathMarchCount: deathMarchers.length
    },
    diag: {
      resourcesLoaded:   hasWeeks,
      weeksAvailable:    weeks.length,
      currentWeekIdx:    curIdx,
      projectsWithHours: projectsWithHours,
      projects:          projects.length
    },
    filters: {
      team:   _esFilterTeam,
      unit:   _esFilterUnit,
      member: _esFilterMember,
      active: !!(_esFilterTeam || _esFilterUnit || _esFilterMember)
    }
  };
}

// Build the choices for the Team / Unit / Member dropdowns. Unit options
// narrow to the selected Team (if any); Member options narrow to the
// selected Team and/or Unit. The change handler in setEffortShapeFilter
// also clears any orphaned selections when an upstream filter changes.
function _esBuildFilterOptions() {
  var rd = (typeof RESOURCES_DATA !== 'undefined') ? RESOURCES_DATA : null;
  var people = rd && rd.people ? rd.people : {};
  var teamSet = {};
  Object.keys(people).forEach(function(name) {
    if (!_esIsCountableMember(name)) return;
    var p = people[name];
    teamSet[p.team || '(no team)'] = true;
  });
  var teams = Object.keys(teamSet).sort();

  // Units narrow to the selected team (if set). When no team is selected,
  // show all units across all teams.
  var unitSet = {};
  Object.keys(people).forEach(function(name) {
    if (!_esIsCountableMember(name)) return;
    var p = people[name];
    if (_esFilterTeam && (p.team || '') !== _esFilterTeam) return;
    var u = p.role || '';
    if (u) unitSet[u] = true;
  });
  var units = Object.keys(unitSet).sort();

  // Members narrow to the selected team AND unit (if either is set).
  var members = Object.keys(people).filter(function(name) {
    if (!_esIsCountableMember(name)) return false;
    var p = people[name];
    if (_esFilterTeam && (p.team || '') !== _esFilterTeam) return false;
    if (_esFilterUnit && (p.role || '') !== _esFilterUnit) return false;
    return true;
  }).sort();

  return { teams: teams, units: units, members: members };
}

function _esLookupProject(alloc, projTitle) {
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

function _esIsCountableMember(name) {
  if (typeof isFullMember === 'function') return isFullMember(name);
  if (typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people[name]) return false;
  var p = RESOURCES_DATA.people[name];
  return p.active !== false && p.tracking_level !== 'light';
}

function _esComputeCurrentWeekIdx(weeks) {
  if (!weeks || weeks.length === 0) return 0;
  var todayStr = new Date().toISOString().slice(0, 10);
  for (var i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i] <= todayStr) return i;
  }
  return 0;
}

// ─── Band helpers ─────────────────────────────────────────────────────
function _esShapeBand(firstShare, lastShare) {
  if (firstShare > 0.40 && firstShare > lastShare + 0.10) return { key: 'Frontloaded', label: 'Front-loaded' };
  if (lastShare  > 0.40 && lastShare  > firstShare + 0.10) return { key: 'Backloaded',  label: 'Back-loaded'  };
  return { key: 'Even', label: 'Even' };
}

function _esIntensityBand(avg) {
  if (!isFinite(avg) || avg <= 0) return { key: 'None',       label: '—'         };
  if (avg >= 20)                  return { key: 'Heavy',      label: 'Heavy'     };
  if (avg >= 8)                   return { key: 'Moderate',   label: 'Moderate'  };
  if (avg >= 2)                   return { key: 'Light',      label: 'Light'     };
  return                                 { key: 'Background', label: 'Background' };
}

function _esDominantShape(shapes) {
  var pairs = [
    { key: 'Frontloaded', label: 'Front-loaded', n: shapes.Frontloaded },
    { key: 'Even',        label: 'Even',         n: shapes.Even        },
    { key: 'Backloaded',  label: 'Back-loaded',  n: shapes.Backloaded  }
  ];
  pairs.sort(function(a, b) { return b.n - a.n; });
  return pairs[0];
}

function _esMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  var s = arr.slice().sort(function(a, b) { return a - b; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ─── Renderers ────────────────────────────────────────────────────────
function _esRenderKpis(model) {
  var k = model.kpis;
  var html = '<div class="kpi-row">';
  html += _esKpi('Projects analyzed',
    String(k.projectsAnalyzed),
    'Active span ≥ ' + ES_MIN_SPAN_WEEKS + ' weeks');
  html += _esKpi('Median intensity',
    _esFmt(k.medianIntensity) + '/wk',
    _esIntensityBand(k.medianIntensity).label + ' band');
  html += _esKpi('Median duration',
    Math.round(k.medianDuration) + ' wk',
    'Across all analyzed projects');
  if (k.deathMarchCount > 0) {
    html += _esKpi('Death-march flags',
      '<span style="color:#9A1212;">' + k.deathMarchCount + '</span>',
      'Peak weeks ≥ ' + ES_DEATH_MARCH_RATIO + '× the average');
  } else {
    html += _esKpi('Death-march flags', '0',
      'No projects with late-stage spikes ≥ ' + ES_DEATH_MARCH_RATIO + '×');
  }
  html += '</div>';
  return html;
}

function _esKpi(label, value, sub) {
  return '<div class="res-kpi">' +
    '<div class="kpi-label">' + label + '</div>' +
    '<div class="kpi-value" style="font-size:18px;line-height:1.4;">' + value +
    '<br><span style="font-weight:600;font-size:12px;color:var(--text-muted);">' + sub + '</span></div>' +
    '</div>';
}

function _esRenderProjects(model) {
  var html = '<div class="tl-section">';
  html += '<div class="tl-section-head"><h2>A · Project Effort Profiles</h2>';
  html += '<span class="tl-desc">Each row\'s sparkline shows weekly allocated hours over the project\'s active span, normalized to its own peak.</span></div>';
  html += '<div class="tl-tbl-wrap"><table class="tl-table es-projects">';
  html += '<thead><tr>' +
    '<th>Project</th>' +
    '<th class="num">Span</th>' +
    '<th class="num">Total hrs</th>' +
    '<th class="num">Avg / wk</th>' +
    '<th class="num">Peak / wk</th>' +
    '<th>Shape</th>' +
    '<th class="ctr">Intensity</th>' +
    '<th class="ctr">Death-march?</th>' +
    '</tr></thead><tbody>';
  model.projects.forEach(function(p) {
    html += '<tr>';
    html += '<td class="tl-cat" style="max-width:300px;">' + _esEsc(p.title) +
      ' <span class="es-status-pill">' + _esEsc(p.status || '—') + '</span></td>';
    html += '<td class="num">' + p.spanWeeks + ' wk</td>';
    html += '<td class="num">' + _esFmt(p.totalHours) + '</td>';
    html += '<td class="num">' + _esFmt(p.avgPerWeek) + '</td>';
    html += '<td class="num">' + _esFmt(p.peakHours) + '</td>';
    html += '<td>' + _esSparkline(p) + ' <span class="es-shape es-shape-' + p.shape.key.toLowerCase() + '">' + p.shape.label + '</span></td>';
    html += '<td class="ctr"><span class="es-intensity es-intensity-' + p.intensity.key.toLowerCase() + '">' + p.intensity.label + '</span></td>';
    html += '<td class="ctr">' + (p.deathMarch
      ? '<span class="es-deathmarch">⚠ ' + p.peakRatio.toFixed(1) + '×</span>'
      : '<span style="color:var(--text-muted);">—</span>') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  return html;
}

// Inline SVG bar chart, one bar per week of the active span. Bar height
// normalized to the project's own peak so shape reads regardless of intensity.
function _esSparkline(p) {
  var W = 140, H = 26;
  var n = p.weeklySlice.length;
  if (n === 0) return '';
  var barW = W / n;
  var peak = p.peakHours > 0 ? p.peakHours : 1;
  var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" class="es-spark" aria-hidden="true">';
  svg += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#F3F4F6" rx="3"/>';
  for (var i = 0; i < n; i++) {
    var h = (p.weeklySlice[i] / peak) * (H - 2);
    var x = i * barW;
    var y = H - h - 1;
    var w = Math.max(1, barW - 0.5);
    var isPeak = (i === p.peakIdx);
    var fill = isPeak ? '#C24200' : '#002669';
    svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
           '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) +
           '" fill="' + fill + '"/>';
  }
  svg += '</svg>';
  return svg;
}

function _esRenderCategories(model) {
  var html = '<div class="tl-section">';
  html += '<div class="tl-section-head"><h2>B · Shape &amp; Intensity by Category</h2>';
  html += '<span class="tl-desc">Median intensity (avg hrs/week) plus the dominant shape across each category\'s projects.</span></div>';
  html += '<div class="tl-tbl-wrap"><table class="tl-table">';
  html += '<thead><tr>' +
    '<th>Category</th>' +
    '<th class="num">Projects</th>' +
    '<th class="num">Median hrs/wk</th>' +
    '<th class="ctr">Intensity</th>' +
    '<th>Shape mix</th>' +
    '<th class="ctr">Dominant</th>' +
    '</tr></thead><tbody>';
  model.categories.forEach(function(c) {
    html += '<tr>';
    html += '<td class="tl-cat">' + _esEsc(c.category) + '</td>';
    html += '<td class="num">' + c.projects + '</td>';
    html += '<td class="num">' + _esFmt(c.medianAvg) + '</td>';
    html += '<td class="ctr"><span class="es-intensity es-intensity-' + c.intensity.key.toLowerCase() + '">' + c.intensity.label + '</span></td>';
    html += '<td>' + _esShapeMixBar(c.shapes, c.projects) + '</td>';
    html += '<td class="ctr"><span class="es-shape es-shape-' + c.dominantShape.key.toLowerCase() + '">' + c.dominantShape.label + '</span></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  return html;
}

function _esShapeMixBar(shapes, total) {
  if (total <= 0) return '<span style="color:var(--text-muted);">—</span>';
  var fr = Math.round(shapes.Frontloaded / total * 100);
  var ev = Math.round(shapes.Even        / total * 100);
  var bk = Math.round(shapes.Backloaded  / total * 100);
  // Render proportional segments. Use the same width as Section B's stack-bar.
  return '<span class="es-mix-bar" title="Front ' + fr + '% · Even ' + ev + '% · Back ' + bk + '%">' +
    '<div class="seg-frontloaded" style="width:' + fr + '%"></div>' +
    '<div class="seg-even"        style="width:' + ev + '%"></div>' +
    '<div class="seg-backloaded"  style="width:' + bk + '%"></div>' +
    '</span>';
}

function _esRenderDeathMarch(model) {
  var html = '<div class="tl-section">';
  html += '<div class="tl-section-head"><h2>C · Death-march candidates</h2>';
  html += '<span class="tl-desc">Projects where the late weeks had ≥ ' + ES_DEATH_MARCH_RATIO + '× the average — worth retrospecting on.</span></div>';
  if (model.deathMarchers.length === 0) {
    html += '<div class="tl-tbl-wrap" style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">' +
      '✓ No death-march projects detected. Peaks are within ' + ES_DEATH_MARCH_RATIO + '× of project averages across the board.' +
      '</div></div>';
    return html;
  }
  html += '<div class="tl-tbl-wrap"><table class="tl-table">';
  html += '<thead><tr>' +
    '<th>Project</th>' +
    '<th class="num">Span</th>' +
    '<th class="num">Avg / wk</th>' +
    '<th class="num">Peak / wk</th>' +
    '<th class="num">Peak ÷ avg</th>' +
    '<th class="num">Peak position</th>' +
    '<th>Shape</th>' +
    '</tr></thead><tbody>';
  model.deathMarchers.forEach(function(p) {
    var posPct = Math.round((p.peakIdx + 1) / p.spanWeeks * 100);
    html += '<tr>';
    html += '<td class="tl-cat" style="max-width:300px;">' + _esEsc(p.title) +
      ' <span class="es-status-pill">' + _esEsc(p.status || '—') + '</span></td>';
    html += '<td class="num">' + p.spanWeeks + ' wk</td>';
    html += '<td class="num">' + _esFmt(p.avgPerWeek) + '</td>';
    html += '<td class="num">' + _esFmt(p.peakHours) + '</td>';
    html += '<td class="num"><strong style="color:#9A1212;">' + p.peakRatio.toFixed(2) + '×</strong></td>';
    html += '<td class="num">week ' + (p.peakIdx + 1) + ' / ' + p.spanWeeks + ' (' + posPct + '%)</td>';
    html += '<td><span class="es-shape es-shape-' + p.shape.key.toLowerCase() + '">' + p.shape.label + '</span></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  return html;
}

function _esRenderCallout() {
  var html = '<div class="tl-callout"><strong>How to read this page:</strong><ul>';
  html += '<li>Section A is the raw data — sort the table mentally by whatever question you have. The sparkline\'s orange bar marks each project\'s peak week.</li>';
  html += '<li>A "Heavy" intensity category means each project needs sustained attention; "Background" intensity means the category is back-burner. Useful when slotting new work next year.</li>';
  html += '<li>A category dominated by "Front-loaded" projects suggests discovery is the bulk of the work; "Back-loaded" suggests launch crunch — different cushions belong in the schedule.</li>';
  html += '<li>Section C is a retro list. Each entry deserves a quick "what happened in the final weeks that we should plan around next time?" conversation.</li>';
  html += '</ul></div>';
  return html;
}

// ─── Formatting helpers ───────────────────────────────────────────────
function _esFmt(h) {
  if (h == null || !isFinite(h)) return '—';
  if (h >= 100) return Math.round(h).toLocaleString() + 'h';
  return h.toFixed(1).replace(/\.0$/, '') + 'h';
}

function _esWeekLabel(weekStr) {
  if (!weekStr) return '—';
  var d = new Date(weekStr + 'T00:00:00');
  if (!isFinite(d.getTime())) return weekStr;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

function _esEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
