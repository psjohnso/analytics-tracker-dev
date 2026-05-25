// ─────────────────────────────────────────────────────────────────────
// tabs/forecast.js — Forecast & Capacity Planner tab
//
// Owns: forecast view state (window size, util/hours mode), the
// capacity-planner state (size, role), the availability data builder,
// findEarliestStart math, and the page render (capacity summary +
// utilization grid + capacity planner section).
//
// Forward references: RESOURCES_DATA, _allocationDefaults, esc,
// PROJECTS, calcInfoIcon, currentWeekIdx (window.*), cpRenderPlanner
// callsite is internal.
// Backward references: SIZE_DURATIONS (still in inline script).
// ─────────────────────────────────────────────────────────────────────

// ── Forecast view state ────────────────────────────────────
let fcPanelOpen = false;
let fcWindow = 13;  // weeks to display in forecast
let fcMode = 'util'; // 'util' | 'hours'

// ── Capacity Planner: find earliest week a person can start a new project ──
// Returns { startWeek: int (-1 if none), blockers: string[] }
function findEarliestStart(avData, personName, projectSize, role) {
  var d = avData[personName];
  if (!d) return { startWeek: -1, blockers: [] };
  var pct = (_allocationDefaults[projectSize] || {})[role] || 0;
  if (pct <= 0) return { startWeek: -1, blockers: [] };
  var dur = SIZE_DURATIONS[projectSize] || 6;
  var fraction = pct / 100;
  var curIdx = window.currentWeekIdx || 9;

  for (var startW = curIdx; startW <= 52 - dur; startW++) {
    var canSustain = true;
    for (var w = startW; w < startW + dur && w < 52; w++) {
      var cap = d.cap[w] || 0;
      if (cap <= 0) { canSustain = false; break; }
      var needed = fraction * cap;
      var currentAlloc = d.alloc[w] || 0;
      if (currentAlloc + needed > cap) { canSustain = false; break; }
    }
    if (canSustain) return { startWeek: startW, blockers: [] };
  }

  // Couldn't find a slot — find blocking projects
  var blockers = [];
  var p = RESOURCES_DATA.people[personName];
  if (p && p.allocations) {
    p.allocations.forEach(function(a) {
      if (a.fracs[curIdx] > 0.01 && blockers.indexOf(a.project) < 0) {
        blockers.push(a.project);
      }
    });
  }
  return { startWeek: -1, blockers: blockers };
}

function cpWeekLabel(wi) {
  if (!RESOURCES_DATA || !RESOURCES_DATA.weeks || !RESOURCES_DATA.weeks[wi]) return 'W' + (wi+1);
  var wDate = RESOURCES_DATA.weeks[wi];
  var d = new Date(wDate + 'T12:00:00');
  d.setDate(d.getDate() + 1); // Show Monday
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

// ─── FORECAST PANEL ───────────────────────────────────────────────────

function fcSetWindow(w) {
  fcWindow = w;
  document.getElementById('content-area').innerHTML = buildForecastPage();
  cpRenderPlanner();
}

function fcSetMode(m) {
  fcMode = m;
  document.getElementById('content-area').innerHTML = buildForecastPage();
  cpRenderPlanner();
}

function fcAvailData() {
  // Returns map: name → { avail[52], cap[52], alloc[52], util[52], role }
  //
  // All weeks: use real allocation hours where they exist.
  // Future weeks with no real data: fall back to snapshot projection —
  //   find the most recent week with allocations entered, then project
  //   those fractions forward, respecting project end dates.

  const curIdx = window.currentWeekIdx || 9;
  const weeks  = RESOURCES_DATA.weeks;

  // Convert a date string to the nearest week index in our 52-week array
  function dateToWeekIdx(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T12:00:00');
    for (let i = 0; i < weeks.length; i++) {
      const wEnd = new Date(weeks[i] + 'T12:00:00');
      wEnd.setDate(wEnd.getDate() + 6);
      if (d <= wEnd) return i;
    }
    return weeks.length - 1;
  }

  // Build project end-date lookup by project id
  const projEndMap = {};
  PROJECTS.forEach(proj => {
    projEndMap[proj.id] = dateToWeekIdx(proj.actual_end || proj.working_due || proj.end);
  });

  const result = {};
  for (const [name, p] of Object.entries(RESOURCES_DATA.people)) {
    if (p.active === false) continue; // skip inactive/former members
    const alloc = new Array(52).fill(0);

    // Step 1: fill ALL weeks with real allocation hours (not just past/present)
    for (const a of p.allocations) {
      for (let i = 0; i < 52; i++) {
        alloc[i] += (a.hours[i] || 0);
      }
    }

    // Step 2: find this person's snapshot week — the most recent week (≤ curIdx)
    // where any allocations were entered (total frac across all projects > 0)
    let snapshotWk = -1;
    for (let i = curIdx; i >= 0; i--) {
      const totalFrac = p.allocations.reduce((s, a) => s + (a.fracs[i] || 0), 0);
      if (totalFrac > 0.01) { snapshotWk = i; break; }
    }

    // Step 3: for future weeks with NO real allocation data, fall back to snapshot
    if (snapshotWk >= 0) {
      for (const a of p.allocations) {
        const snapFrac = a.fracs[snapshotWk] || 0;
        if (snapFrac <= 0) continue;

        const projEndWk = (a.analytics_id != null) ? projEndMap[a.analytics_id] : null;

        for (let i = curIdx + 1; i < 52; i++) {
          if (projEndWk !== null && i > projEndWk) break; // project ended
          // Only fill if this week has no real data for this project
          if ((a.hours[i] || 0) > 0) continue; // real record exists — skip
          alloc[i] += snapFrac * p.proj_cap[i];
        }
      }
    }

    const avail = p.proj_cap.map((c, i) => Math.max(0, c - alloc[i]));
    const util  = p.proj_cap.map((c, i) => c > 0 ? Math.min(1.25, alloc[i] / c) : 0);
    result[name] = { avail, cap: p.proj_cap, alloc, util, role: p.role, team: p.team };
  }
  return result;
}

function fcUtilColor(u) {
  if (u <= 0.01)  return { bg: '#F0FDF4', text: '#15803D', bar: '#22C55E' };
  if (u < 0.40)   return { bg: '#DCFCE7', text: '#166534', bar: '#4ADE80' };
  if (u < 0.65)   return { bg: '#FEF9C3', text: '#854D0E', bar: '#FACC15' };
  if (u < 0.85)   return { bg: '#FED7AA', text: '#9A3412', bar: '#FB923C' };
  if (u < 1.00)   return { bg: '#FECACA', text: '#991B1B', bar: '#F87171' };
  if (u < 1.10)   return { bg: '#EF4444', text: '#fff',    bar: '#EF4444' };
  return             { bg: '#7F1D1D', text: '#fff',    bar: '#7F1D1D' };
}

// ── Capacity Planner State ──
let _cpSize = 'M';
let _cpRole = 'Contributor';
// Team filter — null = not yet initialized; '' = All; or one of the four
// ITD data-team values. Initialized lazily once Auth.fullName + RESOURCES_DATA
// are both available, defaulting to the signed-in user's team. The user
// can then switch to any team or All from the dropdown.
let _cpTeam = null;

// Known data-team values for the planner dropdown.
const CP_TEAMS = ['Data Intelligence', 'Data Architecture', 'Data Librarian', 'Emerging Data Infrastructure'];

// Resolve the default team filter from the signed-in user's team record.
// If they're not on one of the four known teams, fall back to All so they
// aren't accidentally filtered into an empty list.
function cpDefaultTeam() {
  if (typeof isTeamScopingOn === 'function' && isTeamScopingOn() && CURRENT_TEAM) return CURRENT_TEAM;
  if (typeof Auth === 'undefined' || !Auth.fullName) return '';
  if (!RESOURCES_DATA || !RESOURCES_DATA.people) return '';
  var p = RESOURCES_DATA.people[Auth.fullName];
  if (!p || !p.team) return '';
  return CP_TEAMS.indexOf(p.team) >= 0 ? p.team : '';
}

// Lazy init — call before reading _cpTeam in either the controls or the
// planner body. Once initialized, the user's explicit choice wins.
function cpEnsureTeamInit() {
  if (_cpTeam === null) _cpTeam = cpDefaultTeam();
}

function cpSetSize(val) { _cpSize = val; cpRenderPlanner(); }
function cpSetRole(val) { _cpRole = val; cpRenderPlanner(); }
function cpSetTeam(val) { _cpTeam = val || ''; cpRenderPlanner(); }

function cpRenderPlanner() {
  var container = document.getElementById('cp-planner-body');
  if (!container || !RESOURCES_DATA || !RESOURCES_DATA.people) return;
  cpEnsureTeamInit();
  var avData = fcAvailData();
  var people = Object.keys(avData);
  // Hard team-scope first (no-op when scoping is off) so other teams never leak
  // regardless of the planner's own team dropdown.
  if (typeof inCurrentTeamPerson === 'function') people = people.filter(inCurrentTeamPerson);
  // Filter by team if a specific team is selected ('' = All).
  if (_cpTeam) {
    people = people.filter(function(name) {
      var p = RESOURCES_DATA.people[name];
      return p && p.team === _cpTeam;
    });
  }
  var curIdx = window.currentWeekIdx || 9;
  var weeks = RESOURCES_DATA.weeks || [];
  var pct = (_allocationDefaults[_cpSize] || {})[_cpRole] || 0;
  var dur = SIZE_DURATIONS[_cpSize] || 6;

  // Compute earliest start for each person
  var results = people.map(function(name) {
    var r = findEarliestStart(avData, name, _cpSize, _cpRole);
    return { name: name, data: avData[name], earliest: r.startWeek, blockers: r.blockers };
  }).sort(function(a, b) {
    if (a.earliest === -1 && b.earliest === -1) return 0;
    if (a.earliest === -1) return 1;
    if (b.earliest === -1) return -1;
    return a.earliest - b.earliest;
  });

  var showWeeks = Math.min(20, 52 - curIdx);
  var html = '<div class="cp-team-list">';
  results.forEach(function(item) {
    var d = item.data;
    var initials = item.name.split(' ').map(function(w) { return w[0]; }).join('').slice(0,2);
    var badgeClass, badgeText;
    if (item.earliest === -1) { badgeClass = 'cp-avail-full'; badgeText = 'At capacity'; }
    else if (item.earliest <= curIdx) { badgeClass = 'cp-avail-now'; badgeText = 'Available now'; }
    else if (item.earliest <= curIdx + 4) { badgeClass = 'cp-avail-soon'; badgeText = cpWeekLabel(item.earliest); }
    else { badgeClass = 'cp-avail-late'; badgeText = cpWeekLabel(item.earliest); }

    html += '<div class="cp-person-row">';
    html += '<div class="cp-person-top">';
    (function() {
      var emj = getMemberAvatarEmoji(item.name);
      var selfCls = Auth.fullName && item.name === Auth.fullName ? ' user-self-avatar' : '';
      html += '<div class="cp-person-avatar' + selfCls + (emj ? ' user-emoji-av' : '') + '">' + (emj || initials) + '</div>';
    })();
    html += '<div><div class="cp-person-name">' + esc(item.name) + '</div>';
    html += '<div class="cp-person-role">' + esc(d.role || '') + ' | ' + Math.round((d.cap[curIdx] || 0)) + 'h/week</div></div>';
    html += '<div class="cp-avail-badge ' + badgeClass + '">' + badgeText + '</div>';
    html += '</div>';

    // Timeline bars
    html += '<div class="cp-timeline-wrap">';
    for (var w = curIdx; w < curIdx + showWeeks && w < 52; w++) {
      var cap = d.cap[w] || 1;
      var alloc = d.alloc[w] || 0;
      var u = Math.min(1.25, alloc / cap);
      var existH = Math.round(u * 24);
      var newH = 0;
      if (item.earliest >= 0 && w >= item.earliest && w < item.earliest + dur) {
        newH = Math.round((pct / 100) * 24);
      }
      var existColor = u >= 1.0 ? '#EF4444' : u >= 0.80 ? '#FACC15' : '#22C55E';
      var isCur = w === curIdx;
      html += '<div class="cp-timeline-bar" style="' + (isCur ? 'background:rgba(0,38,105,0.06);' : '') + '">';
      html += '<div style="position:absolute;bottom:0;width:100%;height:' + existH + 'px;background:' + existColor + ';border-radius:1px 1px 0 0;"></div>';
      if (newH > 0) {
        html += '<div style="position:absolute;bottom:' + existH + 'px;width:100%;height:' + newH + 'px;background:#002669;border-radius:1px 1px 0 0;opacity:0.6;"></div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // Capacity constraints
    if (item.earliest > curIdx && item.blockers.length > 0) {
      html += '<div class="cp-blockers">Capacity held by: ';
      item.blockers.forEach(function(proj) { html += '<span class="cp-blocker-tag">' + esc(proj) + '</span>'; });
      html += '</div>';
    } else if (item.earliest === -1 && item.blockers.length > 0) {
      html += '<div class="cp-blockers">Current projects: ';
      item.blockers.forEach(function(proj) { html += '<span class="cp-blocker-tag">' + esc(proj) + '</span>'; });
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  html += '<div class="cp-legend-row">';
  html += '<span><span class="cp-legend-dot" style="background:#22C55E;"></span>Available</span>';
  html += '<span><span class="cp-legend-dot" style="background:#FACC15;"></span>Tight (80-100%)</span>';
  html += '<span><span class="cp-legend-dot" style="background:#EF4444;"></span>Over capacity</span>';
  html += '<span><span class="cp-legend-dot" style="background:#002669;"></span>New project allocation</span>';
  html += '</div>';

  container.innerHTML = html;
}

function buildCapacityPlannerSection() {
  cpEnsureTeamInit();
  var sizeOpts = ['S', 'M', 'L', 'XL'].map(function(s) {
    var labels = { S: 'S — Small (2 wks)', M: 'M — Medium (6 wks)', L: 'L — Large (13 wks)', XL: 'XL — Extra large (26 wks)' };
    return '<option value="' + s + '"' + (s === _cpSize ? ' selected' : '') + '>' + labels[s] + '</option>';
  }).join('');
  var roleOpts = ['Lead', 'Contributor', 'Reviewer'].map(function(r) {
    return '<option value="' + r + '"' + (r === _cpRole ? ' selected' : '') + '>' + r + '</option>';
  }).join('');
  var teamOpts;
  if (typeof isTeamScopingOn === 'function' && isTeamScopingOn() && CURRENT_TEAM) {
    // Scoped: lock the planner to the current team (no cross-team option).
    teamOpts = '<option value="' + esc(CURRENT_TEAM) + '" selected>' + esc(CURRENT_TEAM) + '</option>';
  } else {
    teamOpts = '<option value=""' + (_cpTeam === '' ? ' selected' : '') + '>All teams</option>';
    CP_TEAMS.forEach(function(t) {
      teamOpts += '<option value="' + esc(t) + '"' + (t === _cpTeam ? ' selected' : '') + '>' + esc(t) + '</option>';
    });
  }
  var pct = (_allocationDefaults[_cpSize] || {})[_cpRole] || 0;

  return '<div class="cp-section">' +
    '<div class="fc-section-label">Capacity planner' + calcInfoIcon('earliestStart') + ' <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-muted);">When can each person take on a new project?</span></div>' +
    '<div class="cp-controls">' +
      '<div><label>Team</label><select onchange="cpSetTeam(this.value)">' + teamOpts + '</select></div>' +
      '<div><label>Project size</label><select onchange="cpSetSize(this.value)">' + sizeOpts + '</select></div>' +
      '<div><label>Role</label><select onchange="cpSetRole(this.value)">' + roleOpts + '</select></div>' +
      '<div style="font-size:12px;color:var(--text-muted);padding-bottom:6px;">' + pct + '% of project time/week' + calcInfoIcon('autoFillPct') + ' for ' + SIZE_DURATIONS[_cpSize] + ' weeks</div>' +
    '</div>' +
    '<div id="cp-planner-body"></div>' +
  '</div>';
}

function buildForecastPage() {
  if (!RESOURCES_DATA) return '<div class="empty-state">Resources data is loading…</div>';
  const rd = RESOURCES_DATA;
  const weeks = rd.weeks;
  // Forecast is scoped to the current team's people. With team scoping OFF this
  // resolves to HOME_TEAM (Data Intelligence) — the original single-team view;
  // with scoping ON it follows CURRENT_TEAM (admin preview or the global flag).
  // Affiliated collaborators from other teams plan against their own team's
  // capacity. fcAvailData() already excludes inactive/former members.
  const fullAvData = fcAvailData();
  const avData = {};
  var _fcTeam = (typeof isTeamScopingOn === 'function' && isTeamScopingOn() && CURRENT_TEAM)
    ? CURRENT_TEAM
    : (typeof HOME_TEAM !== 'undefined' ? HOME_TEAM : 'Data Intelligence');
  Object.keys(fullAvData).forEach(function(name) {
    var keep = (typeof sameTeam === 'function')
      ? sameTeam((typeof personTeam === 'function' ? personTeam(name) : (rd.people[name] || {}).team), _fcTeam)
      : (rd.people[name] && rd.people[name].team === _fcTeam);
    if (keep) avData[name] = fullAvData[name];
  });
  const people = Object.keys(avData);
  const curIdx = window.currentWeekIdx || 9;

  // Window: from current week
  const wStart = curIdx;
  const wEnd   = Math.min(52, wStart + fcWindow);
  const wSlice = weeks.slice(wStart, wEnd);
  const wLen   = wSlice.length;

  // ── Section 1: Who has capacity (summary cards) ─────────────────
  // Sort by most available (avg free hours descending)
  const sorted = people.slice().sort((a, b) => {
    const aAvg = avData[a].avail.slice(wStart, wEnd).reduce((s,v)=>s+v,0)/wLen;
    const bAvg = avData[b].avail.slice(wStart, wEnd).reduce((s,v)=>s+v,0)/wLen;
    return bAvg - aAvg;
  });

  const whoCards = sorted.map(name => {
    const d = avData[name];
    const sliceAvail = d.avail.slice(wStart, wEnd);
    const sliceCap   = d.cap.slice(wStart, wEnd);
    const avgAvail = sliceAvail.reduce((s,v)=>s+v,0) / wLen;
    const avgCap   = sliceCap.reduce((s,v)=>s+v,0) / wLen || 1;
    const avgUtil  = Math.min(1.25, 1 - avgAvail / avgCap);
    const col = fcUtilColor(avgUtil);
    const pct = Math.round(avgUtil * 100);
    const avHrs = Math.round(avgAvail * 10) / 10;

    // Sparkline: util per week as small bars
    let sparkW = 120, sparkH = 24, bw = Math.max(3, Math.floor(sparkW / wLen) - 1);
    let sparks = '';
    sliceCap.forEach((cap, i) => {
      const u = cap > 0 ? Math.min(1.25, (cap - sliceAvail[i]) / cap) : 0;
      const c2 = fcUtilColor(u);
      const bh = Math.max(2, Math.round(u * sparkH));
      const x = i * (bw + 1);
      const isCur = (wStart + i) === curIdx;
      sparks += `<rect x="${x}" y="${sparkH - bh}" width="${bw}" height="${bh}" fill="${isCur ? '#002669' : c2.bar}" rx="1"/>`;
    });

    return `<div class="fc-who-card" style="border-color:${avgUtil < 0.5 ? '#BBF7D0' : avgUtil < 0.85 ? '#FDE68A' : '#FECACA'};">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${col.bar};"></div>
      <div class="fc-who-name" title="${name}">${name}</div>
      <div class="fc-who-role">${d.role}</div>
      <div class="fc-who-avail" style="color:${col.bar === '#22C55E' || col.bar === '#4ADE80' ? '#15803D' : col.bar};">${avHrs}h</div>
      <div class="fc-who-avail-label">avg free / week${calcInfoIcon('avgFree')}</div>
      <svg width="${sparkW}" height="${sparkH}" style="display:block;margin-bottom:6px;">${sparks}</svg>
      <div class="fc-mini-bar-bg">
        <div class="fc-mini-bar-fill" style="width:${pct}%;background:${col.bar};"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:4px;">
        <span>${pct}% allocated${calcInfoIcon('utilization')}</span>
        <span>${Math.round(avgCap)}h cap</span>
      </div>
    </div>`;
  }).join('');

  // ── Section 2: Team load over time (stacked area SVG) ────────────
  // Sum all people's alloc and cap per week in the window
  const teamAlloc = new Array(wLen).fill(0);
  const teamCap   = new Array(wLen).fill(0);
  for (const d of Object.values(avData)) {
    for (let i = 0; i < wLen; i++) {
      teamAlloc[i] += d.alloc[wStart + i];
      teamCap[i]   += d.cap[wStart + i];
    }
  }

  let svgW = 900, svgH = 120, padL = 48, padB = 28, padT = 10;
  const innerW = svgW - padL - 16;
  const innerH = svgH - padB - padT;
  const maxTeam = Math.max(...teamCap, 1);
  const xStep = innerW / Math.max(wLen - 1, 1);

  // Points for capacity line and alloc area
  const capPts = teamCap.map((v, i) => `${(padL + i * xStep).toFixed(1)},${(padT + innerH - (v / maxTeam) * innerH).toFixed(1)}`);
  const allocPts = teamAlloc.map((v, i) => `${(padL + i * xStep).toFixed(1)},${(padT + innerH - (v / maxTeam) * innerH).toFixed(1)}`);
  const allocArea = allocPts.join(' ') + ` ${(padL + (wLen-1)*xStep).toFixed(1)},${(padT+innerH).toFixed(1)} ${padL.toFixed(1)},${(padT+innerH).toFixed(1)}`;

  // Y grid + labels
  let yGrid = '';
  for (let tick = 0; tick <= 4; tick++) {
    const v = (maxTeam / 4) * tick;
    const y = (padT + innerH - (v / maxTeam) * innerH).toFixed(1);
    yGrid += `<line x1="${padL}" y1="${y}" x2="${svgW-16}" y2="${y}" stroke="#E8E6DF" stroke-width="1"/>
      <text x="${padL-6}" y="${parseFloat(y)+4}" text-anchor="end" font-size="9" fill="#9CA3AF">${Math.round(v)}h</text>`;
  }

  // X labels (month transitions)
  let xLabels = '';
  let prevMonth = null;
  wSlice.forEach((w, i) => {
    const mo = new Date(w + 'T12:00:00').toLocaleString('default', { month: 'short' });
    if (mo !== prevMonth) {
      const x = (padL + i * xStep).toFixed(1);
      xLabels += `<text x="${x}" y="${svgH - 6}" text-anchor="middle" font-size="9" fill="#9CA3AF">${mo}</text>
        <line x1="${x}" y1="${padT}" x2="${x}" y2="${svgH - padB}" stroke="#E8E6DF" stroke-width="1" stroke-dasharray="3,3"/>`;
      prevMonth = mo;
    }
  });

  // Current week marker
  const curX = padL + (curIdx - wStart) * xStep;
  const curLine = `<line x1="${curX.toFixed(1)}" y1="${padT}" x2="${curX.toFixed(1)}" y2="${svgH - padB}" stroke="var(--navy)" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.6"/>
    <text x="${curX.toFixed(1)}" y="${padT - 2}" text-anchor="middle" font-size="9" fill="var(--navy)" font-weight="700">Today</text>`;

  // Avg utilization text
  const avgTeamUtil = teamAlloc.reduce((s,v)=>s+v,0) / Math.max(teamCap.reduce((s,v)=>s+v,0), 1);

  const teamChartSVG = `<svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="display:block;">
    <defs>
      <linearGradient id="allocGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#002669" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#002669" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    ${yGrid}${xLabels}${curLine}
    <polygon points="${allocArea}" fill="url(#allocGrad)"/>
    <polyline points="${allocPts.join(' ')}" fill="none" stroke="#002669" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline points="${capPts.join(' ')}" fill="none" stroke="#C24200" stroke-width="1.5" stroke-dasharray="5,4" stroke-linejoin="round"/>
    <text x="${svgW - 20}" y="${padT + innerH - (teamCap[wLen-1]/maxTeam)*innerH - 6}" text-anchor="end" font-size="9" fill="#C24200" font-weight="700">Capacity</text>
    <text x="${svgW - 20}" y="${padT + innerH - (teamAlloc[wLen-1]/maxTeam)*innerH - 6}" text-anchor="end" font-size="9" fill="#002669" font-weight="700">Allocated</text>
  </svg>`;

  // ── Section 3: Heat map — when is each person available ──────────
  const CELL_W = Math.max(26, Math.min(44, Math.floor(680 / wLen)));

  // Month header row
  let monthCells = `<th class="name-th" rowspan="2">Person</th>`;
  let curMo = null, moSpan = 0, moLabel = '';
  const moGroups = [];
  wSlice.forEach((w, i) => {
    const mo = new Date(w + 'T12:00:00').toLocaleString('default', { month: 'short', year: '2-digit' });
    if (mo !== curMo) {
      if (curMo !== null) moGroups.push({ label: curMo, span: moSpan });
      curMo = mo; moSpan = 1;
    } else { moSpan++; }
  });
  if (curMo) moGroups.push({ label: curMo, span: moSpan });
  monthCells += moGroups.map(g => `<th colspan="${g.span}" style="min-width:${g.span*CELL_W}px;">${g.label}</th>`).join('');

  // Week header row
  const weekThs = wSlice.map((w, i) => {
    const d = new Date(w + 'T12:00:00');
    d.setDate(d.getDate() + 1); // Sun→Mon (consistent with Resources tab)
    const lbl = `${d.getMonth()+1}/${d.getDate()}`;
    const isCur = (wStart + i) === curIdx;
    return `<th style="min-width:${CELL_W}px;${isCur?'color:var(--navy);font-weight:900;':''}">
      ${lbl}${isCur ? '<br><span style="color:var(--navy);font-size:8px;">▼</span>' : ''}
    </th>`;
  }).join('');

  // Person rows
  const hmRows = people.map(name => {
    const d = avData[name];
    const cells = wSlice.map((w, i) => {
      const wi = wStart + i;
      const u = d.util[wi];
      const avail = d.avail[wi];
      const cap   = d.cap[wi];
      const col = fcUtilColor(u);
      const isCur = wi === curIdx;
      const label = fcMode === 'util'
        ? (cap > 0 ? Math.round(u * 100) + '%' : '—')
        : (cap > 0 ? Math.round(avail) + 'h' : '—');
      const tip = `${name} | ${w} | ${Math.round(avail)}h free of ${Math.round(cap)}h (${Math.round(u*100)}% used)`;
      return `<td class="${isCur ? 'fc-hm-cur' : ''}" style="min-width:${CELL_W}px;" title="${tip}">
        <div class="fc-hm-cell-inner" style="background:${col.bg};color:${col.text};height:34px;">${label}</div>
      </td>`;
    }).join('');
    return `<tr>
      <td class="name-td"><div class="td-name">${name}</div><div class="td-role">${d.role}</div></td>
      ${cells}
    </tr>`;
  }).join('');

  // Window buttons
  const winBtns = [4, 8, 13, 26].map(w =>
    `<button class="fc-pill ${fcWindow === w ? 'active' : ''}" onclick="fcSetWindow(${w})">${w} wks</button>`
  ).join('');

  // Mode toggle
  const modeBtns = `<button class="fc-pill ${fcMode === 'util' ? 'active' : ''}" onclick="fcSetMode('util')">% Used</button>
    <button class="fc-pill ${fcMode === 'hours' ? 'active' : ''}" onclick="fcSetMode('hours')">Free hrs</button>`;

  return `<div style="padding:28px 32px;"><div class="fc-panel" style="margin:0;">
    <div class="fc-panel-header">
      <div class="fc-panel-title"><svg class="icon" aria-hidden="true"><use href="#ph-chart-bar"></use></svg> Availability Forecast</div>
      <div class="fc-panel-subtitle">Based on current allocations · ${wLen} weeks from today (${wSlice[0]})</div>
      <div class="fc-panel-controls">
        <span style="font-size:10px;opacity:0.6;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Window:</span>
        ${winBtns}
        <span style="font-size:10px;opacity:0.6;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-left:10px;">Show:</span>
        ${modeBtns}
      </div>
    </div>
    <div class="fc-panel-body">

      ${buildCapacityPlannerSection()}

      <div class="fc-who-section">
        <div class="fc-section-label">Who has capacity? <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-muted);">Sorted most-available first · avg over ${fcWindow}-week window</span></div>
        <div class="fc-who-grid">${whoCards}</div>
      </div>

      <div class="fc-team-section">
        <div class="fc-section-label">How loaded is the team?${calcInfoIcon('teamUtil')} <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--text-muted);">${Math.round(avgTeamUtil * 100)}% avg team utilization over window</span></div>
        <div class="fc-team-chart-wrap">
          ${teamChartSVG}
        </div>
      </div>

      <div class="fc-when-section">
        <div class="fc-section-label">When is each person available?${calcInfoIcon('heatmapCell')}</div>
        <div class="fc-hm-scroll">
          <table class="fc-hm-table">
            <thead>
              <tr class="month-row">${monthCells}</tr>
              <tr>${weekThs}</tr>
            </thead>
            <tbody>${hmRows}</tbody>
          </table>
          <div class="fc-legend-strip">
            <span style="font-weight:700;color:var(--text-dark);">Utilization:</span>
            <div class="fc-ls-item"><div class="fc-ls-swatch" style="background:#DCFCE7;border:1px solid #ccc;"></div>&lt;40% open</div>
            <div class="fc-ls-item"><div class="fc-ls-swatch" style="background:#FEF9C3;"></div>40–65%</div>
            <div class="fc-ls-item"><div class="fc-ls-swatch" style="background:#FED7AA;"></div>65–85%</div>
            <div class="fc-ls-item"><div class="fc-ls-swatch" style="background:#FECACA;"></div>85–100%</div>
            <div class="fc-ls-item"><div class="fc-ls-swatch" style="background:#EF4444;"></div>Overloaded</div>
            <div class="fc-ls-item" style="margin-left:8px;"><div style="width:12px;height:12px;border:2px solid var(--navy);border-radius:2px;display:inline-block;"></div>Current week</div>
          </div>
        </div>
      </div>

    </div>
  </div></div>`;
}
