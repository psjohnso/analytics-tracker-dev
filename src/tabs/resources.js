// ─────────────────────────────────────────────────────────────────────
// tabs/resources.js — Resources tab
//
// Owns: selectedPerson, chartWindowStart, week-index init, person
// cards, allocation table rows, the main renderResources page, and
// the chart navigation (selectPerson, shiftChart).
//
// The Allocation Editor itself is a modal — moves with the modals
// extraction.
//
// Forward references: RESOURCES_DATA, render, esc, openAllocEditor,
// PROJECTS, TASKS, isAdmin.
// Backward references: PROJECT_COLORS, STATUS_COLOR.
// ─────────────────────────────────────────────────────────────────────

// ─── RESOURCES TAB ────────────────────────────────────────────────

let selectedPerson = 'James McGinnis';
let chartWindowStart = 0; // week index


// ── Compute current/data week indices — called after RESOURCES_DATA is loaded ──
function initResourcesWeekIndices() {
  if (!RESOURCES_DATA) return;
  const weeks  = RESOURCES_DATA.weeks;
  const people = RESOURCES_DATA.people;
  const today  = new Date().toISOString().slice(0, 10);
  let cwi = 0;
  for (let i = 0; i < weeks.length; i++) {
    const monStart = new Date(weeks[i]+'T00:00:00'); monStart.setDate(monStart.getDate()+1);
    const sunEnd   = new Date(weeks[i]+'T00:00:00'); sunEnd.setDate(sunEnd.getDate()+7);
    const t = new Date(today+'T00:00:00');
    if (t >= monStart && t <= sunEnd) { cwi = i; break; }
    if (t > sunEnd) cwi = i;
  }
  window.currentWeekIdx = cwi;
  const allPeopleVals = Object.values(people);
  let dwi = cwi;
  while (dwi > 0 && allPeopleVals.every(p => p.weekly_allocated[dwi] === 0)) dwi--;
  window.dataWeekIdx = dwi;
  // On first init only, snap the 20-week chart window so the current week is
  // visible. Subsequent calls (e.g. after an allocation write) respect the
  // user's current Prev/Next position. selectPerson() also calls the helper
  // directly so switching people lands the chart on the current week, not Jan.
  if (!window._chartWindowInitialized) {
    window._chartWindowInitialized = true;
    _positionChartOnCurrentWeek();
  }
  _resEnsureSelected();
}

// Position the chart so the current week sits ~16 cells from the left edge of
// the 20-week window — i.e. user sees ~16 weeks of history + current + ~3
// weeks of forecast. Falls back to week 0 if we're early enough in the year
// that the default Jan view already includes the current week.
function _positionChartOnCurrentWeek() {
  if (!RESOURCES_DATA) return;
  var weeks = RESOURCES_DATA.weeks;
  var cwi = window.currentWeekIdx || 0;
  chartWindowStart = cwi >= 16 ? Math.max(0, Math.min(cwi - 16, weeks.length - 20)) : 0;
}

// Ensure selectedPerson is an active full member of the currently-scoped team;
// otherwise pick the first such member. Called on data load AND on every
// Resources render, so opening the tab (or switching teams) always lands on a
// member of the currently selected team.
function _resEnsureSelected() {
  if (!RESOURCES_DATA || !RESOURCES_DATA.people) return;
  var people = RESOURCES_DATA.people;

  // First-init: prefer the logged-in user as the default selection so the
  // Capacity page opens on "my own allocations" instead of the hardcoded
  // module default. Guarded so admins later clicking another person aren't
  // yanked back to themselves on the next render.
  if (!window._selectedPersonInitialized) {
    window._selectedPersonInitialized = true;
    var loginName = (typeof Auth !== 'undefined' && Auth && Auth.fullName) ? Auth.fullName : null;
    if (loginName && people[loginName] && people[loginName].active !== false &&
        (typeof inCurrentTeamPerson !== 'function' || inCurrentTeamPerson(loginName))) {
      selectedPerson = loginName;
      return;
    }
  }

  var cur = people[selectedPerson];
  var ok = cur && cur.active !== false &&
    (typeof inCurrentTeamPerson !== 'function' || inCurrentTeamPerson(selectedPerson));
  if (ok) return;
  var teamFull = Object.keys(people).filter(function(n) {
    return isFullMember(n) && (typeof inCurrentTeamPerson !== 'function' || inCurrentTeamPerson(n));
  });
  if (teamFull.length > 0) { selectedPerson = teamFull[0]; return; }
  var any = Object.keys(people);
  if (any.length > 0) selectedPerson = any[0];
}

function buildResourcePersonCards(people, currentWeekIdx) {
  return Object.entries(people).filter(([name, p]) => isFullMember(name) && (typeof inCurrentTeamPerson !== 'function' || inCurrentTeamPerson(name))).map(([name, p]) => {
    const curUtil = (p.utilization[currentWeekIdx] || 0) * 100;
    const utilColor = curUtil > 90 ? '#EF4444' : curUtil > 70 ? '#F59E0B' : '#83AC16';
    const initials = name.split(' ').map(w => w[0]).join('').slice(0,2);
    const isActive = name === selectedPerson;
    return `<div class="person-card${isActive?' active':''}" onclick="selectPerson('${name.replace(/'/g,"\'")}')">
      ${(function(){
        var emj = getMemberAvatarEmoji(name);
        var selfCls = Auth.fullName && name === Auth.fullName ? ' user-self-avatar' : '';
        return `<div class="person-avatar-lg${selfCls}${emj?' user-emoji-av':''}" style="background:linear-gradient(135deg,${utilColor}cc,${utilColor}88)">${emj || initials}</div>`;
      })()}
      <div class="person-info">
        <div class="name">${esc(name)}</div>
        <div class="role">${esc(p.role)}</div>
      </div>
      <span class="person-util-badge" data-person="${esc(name)}" style="background:${utilColor}22;color:${utilColor};">${curUtil.toFixed(0)}%</span>
    </div>`;
  }).join('');
}

function buildResourceAllocTableRows(allocs, projColorMap, calWeekIdx) {
  return allocs
    .filter(a => a.fracs.some(f=>f>0) && (a.status === 'Active' || a.status === 'On Hold'))
    .sort((a,b) => b.hours.reduce((s,v)=>s+v,0) - a.hours.reduce((s,v)=>s+v,0))
    .map(a => {
      const totalHrs = a.hours.reduce((s,v)=>s+v,0);
      const col = projColorMap[a.project];
      const statusCol = STATUS_COLOR(a.status) || '#9CA3AF';
      const spStart = Math.max(0, calWeekIdx-3);
      const spWeeks = a.fracs.slice(spStart, spStart+8);
      const spMax = Math.max(...spWeeks, 0.01);
      const sparks = spWeeks.map((f, i) => {
        const h = Math.round((f/spMax)*20);
        const isNow = (spStart+i) === calWeekIdx;
        return `<div class="spark-bar" style="height:${h}px;background:${isNow?col:col+'88'};"></div>`;
      }).join('');
      const cwFrac = (a.fracs[calWeekIdx]||0)*100;
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="width:10px;height:10px;border-radius:2px;background:${col};flex-shrink:0;"></span>
            ${a.analytics_id != null
              ? `<span style="font-weight:600;color:var(--navy);cursor:pointer;text-decoration:underline;text-underline-offset:2px;text-decoration-color:rgba(0,38,105,0.3);"
                  onclick="openProject(${(PROJECTS.find(x => x.id == a.analytics_id)||{}).objectId || 0})"
                  onmouseenter="this.style.color='#C24200'"
                  onmouseleave="this.style.color='var(--navy)'"
                  title="View project details">${esc(a.project)}</span>`
              : `<span style="font-weight:600;color:var(--navy);">${esc(a.project)}</span>`
            }
          </div>
        </td>
        <td><span class="status-pill" style="background:${statusCol}22;color:${statusCol};font-size:11px;">${esc(a.status||'—')}</span></td>
        <td style="font-size:12px;color:var(--text-muted);">${esc(a.type||'—')}</td>
        <td>
          <div class="util-bar-wrap">
            <div class="util-bar-bg"><div class="util-bar-fill" style="width:${Math.min(cwFrac,100).toFixed(0)}%;background:${col};"></div></div>
            <span style="font-size:12px;color:var(--navy);font-weight:600;min-width:36px;">${cwFrac.toFixed(0)}%</span>
          </div>
        </td>
        <td>
          <div class="sparkline-cell">${sparks}</div>
        </td>
        <td style="font-size:12px;font-weight:600;color:var(--navy);">${totalHrs.toFixed(1)}h</td>
      </tr>`;
    }).join('');
}

function renderResources(area) {
  if (!RESOURCES_DATA) { area.innerHTML = '<div class="empty-state">Resources data is loading…</div>'; return; }
  const weeks = RESOURCES_DATA.weeks;
  const people = RESOURCES_DATA.people;
  _resEnsureSelected(); // land on a current-team member whenever the tab opens / team switches
  const currentWeekIdx = window.currentWeekIdx;
  const dataWeekIdx    = window.dataWeekIdx;
  // chartWindowStart defaults to 0 (Jan 4) so user sees full year from the start

  // ── Person cards ──────────────────────────────────────────────
  const personCards = buildResourcePersonCards(people, currentWeekIdx);

  // ── Selected person data ──────────────────────────────────────
  const p = people[selectedPerson];
    // Filter allocations to only projects that exist in the main PROJECTS list,
  // then deduplicate by project name (source data sometimes has duplicate rows
  // for the same project with the same or different analytics_id).
  // Normalize allocation project names: strip person suffixes like " - James" or " - James M."
  // so "Safe Cities Dashboard - James" maps to "Safe Cities Dashboard".
  // Keep all allocations — even ones with no matching project — they represent real work.
  // Dedup by canonical (normalized) name, merging hours/fracs across duplicates.
  const projTitleSet = new Set(PROJECTS.map(p => p.title));
  function canonicalAllocTitle(raw) {
    if (projTitleSet.has(raw)) return raw;
    const stripped = raw.replace(/\s*-\s*[A-Z][A-Za-z .]+$/, '').trim();
    return projTitleSet.has(stripped) ? stripped : raw; // fall back to original if no match
  }
  const allocsByName = {};
  p.allocations.forEach(function(a) {
    const key = canonicalAllocTitle(a.project);
    if (!allocsByName[key]) {
      allocsByName[key] = Object.assign({}, a, {
        project: key,   // use the canonical title
        fracs: a.fracs.slice(),
        hours: a.hours.slice()
      });
    } else {
      // Merge: sum fracs and hours across duplicate/person-split rows
      const existing = allocsByName[key];
      a.fracs.forEach((f, i) => { existing.fracs[i] = (existing.fracs[i] || 0) + f; });
      a.hours.forEach((h, i) => { existing.hours[i] = (existing.hours[i] || 0) + h; });
    }
  });
  // Also inject any project where this person is listed as contact or other_members
  // but doesn't already have an allocation entry. This handles projects assigned
  // in the UI before any tasks have been created for this person.
  const N = RESOURCES_DATA.weeks.length;
  PROJECTS.forEach(function(proj) {
    if (allocsByName[proj.title]) return; // already present
    const members = (proj.other_members || '').split(',').map(s => s.trim()).filter(Boolean);
    const isContact = proj.contact === name;
    const isMember  = members.includes(name);
    if (!isContact && !isMember) return;
    allocsByName[proj.title] = {
      project:      proj.title,
      status:       proj.status,
      type:         '',
      fracs:        new Array(N).fill(0),
      hours:        new Array(N).fill(0),
      analytics_id: proj.id,
    };
  });
  // Cross-reference allocation status with live PROJECTS array
  // (allocation records cache project_status from load time, which can be stale)
  Object.keys(allocsByName).forEach(function(projTitle) {
    var liveProj = PROJECTS.find(function(pr) { return pr.title === projTitle; });
    if (liveProj) allocsByName[projTitle].status = liveProj.status;
  });
  const allocs = Object.values(allocsByName).filter(a => a.status === 'Active' || a.status === 'On Hold');
  // chartAllocs adds Complete/Canceled allocations that actually have hours,
  // so every weekly bar reflects all the work that happened that week —
  // including projects that have since closed. allocs (without closed) is
  // still used for the KPI "Active Projects" count and the project table.
  const chartAllocs = Object.values(allocsByName).filter(function(a) {
    if (a.status === 'Active' || a.status === 'On Hold') return true;
    if (a.status === 'Complete' || a.status === 'Canceled') {
      return a.fracs.some(function(f) { return f > 0; });
    }
    return false;
  });

  // KPI: current week (uses dataWeekIdx = latest week with data for KPI numbers)
  const cwIdx = dataWeekIdx;
  // Visual highlight: actual calendar week
  const calWeekIdx = currentWeekIdx;
  const cwCap = p.proj_cap[cwIdx] || 0;
  const cwAlloc = p.weekly_allocated[cwIdx] || 0;
  const cwUtil = cwCap > 0 ? (cwAlloc/cwCap*100) : 0;
  const activeProjects = allocs.filter(a => a.fracs.some(f => f > 0)).length;
  const totalAllocYTD = p.weekly_allocated.slice(0, cwIdx+1).reduce((s,v)=>s+v,0);

  const kpiColor = cwUtil > 90 ? '#EF4444' : cwUtil > 70 ? '#F59E0B' : '#002669';

  // ── Chart: 12-week stacked bar ────────────────────────────────
  let windowSize = 20;
  const wStart = Math.min(chartWindowStart, Math.max(0, weeks.length - windowSize));
  const wEnd   = Math.min(wStart + windowSize, weeks.length);
  const wWeeks = weeks.slice(wStart, wEnd);

  const maxCap = Math.max(...p.proj_cap.slice(wStart, wEnd), 1);
  let chartH = 180;
  let barW   = 48;
  let gap    = 8;
  let padL   = 50;
  let padB   = 40;
  const chartW = padL + (barW + gap) * (wEnd - wStart) + 20;

  // Build color map for projects (chart-wide, so closed projects in the
  // bars get a consistent color too). The project table uses this same
  // map but filters its rows independently, so closed colors are harmless
  // there.
  const projColorMap = {};
  chartAllocs.forEach((a, i) => { projColorMap[a.project] = PROJECT_COLORS[i % PROJECT_COLORS.length]; });

  // Build SVG bars
  let bars = '';
  let xLabels = '';
  let yLines = '';

  // Chart colors flip for the Dark theme: navy capacity line lightens, the
  // light grid/axis strokes become subtle white overlays.
  const _resDark = (typeof document !== 'undefined' && document.body && document.body.dataset.theme === 'dark');
  const capLineColor = _resDark ? '#A9C8F0' : '#002669';
  const gridColor = _resDark ? 'rgba(255,255,255,0.07)' : '#F3F1EB';
  const axisColor = _resDark ? 'rgba(255,255,255,0.18)' : '#E8E6DF';
  const cwIndOpacity = _resDark ? '0.10' : '0.05';

  // Y gridlines
  for (let h = 0; h <= maxCap; h += Math.ceil(maxCap/4)) {
    const y = chartH - padB - (h/maxCap)*(chartH-padB);
    yLines += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${chartW}" y2="${y.toFixed(1)}" stroke="${gridColor}" stroke-width="1"/>`;
    yLines += `<text x="${padL-6}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="#9CA3AF">${h.toFixed(0)}</text>`;
  }

  for (let wi = wStart; wi < wEnd; wi++) {
    const x = padL + (wi - wStart) * (barW + gap);
    const cap = p.proj_cap[wi] || 0;
    const capY = chartH - padB - (cap/maxCap)*(chartH-padB);

    // Stacked bars per project. Closed projects (Complete/Canceled) render
    // at lower opacity so the bar visually signals "this was historical
    // work" without changing the totals.
    let stackY = chartH - padB;
    chartAllocs.forEach(a => {
      const hrs = a.hours[wi] || 0;
      if (hrs <= 0) return;
      const barH = (hrs/maxCap)*(chartH-padB);
      stackY -= barH;
      const col = projColorMap[a.project];
      const isClosed = a.status === 'Complete' || a.status === 'Canceled';
      const op = isClosed ? '0.45' : '0.85';
      const statusSuffix = isClosed ? ' (' + a.status + ')' : '';
      bars += `<rect x="${x.toFixed(1)}" y="${stackY.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" fill="${col}" opacity="${op}" rx="2">
        <title>${esc(a.project + statusSuffix)}: ${hrs.toFixed(1)}h</title></rect>`;
    });

    // Estimate hatch overlay — current + future weeks reflect planned
    // allocation (not settled actuals), so flag them with a diagonal stripe.
    if (wi >= calWeekIdx && stackY < chartH - padB) {
      bars += `<rect x="${x.toFixed(1)}" y="${stackY.toFixed(1)}" width="${barW}" height="${(chartH - padB - stackY).toFixed(1)}" fill="url(#estimateHatch)" rx="2" pointer-events="none"/>`;
    }

    // Capacity line segment
    const nextWi = wi + 1 < wEnd ? wi + 1 : wi;
    const nextCap = p.proj_cap[nextWi] || cap;
    const nextCapY = chartH - padB - (nextCap/maxCap)*(chartH-padB);
    const x2 = padL + (nextWi - wStart) * (barW + gap) + barW/2;
    bars += `<circle cx="${(x+barW/2).toFixed(1)}" cy="${capY.toFixed(1)}" r="3" fill="${capLineColor}"/>`;

    // Current week indicator
    if (wi === calWeekIdx) {
      bars += `<rect x="${x.toFixed(1)}" y="0" width="${barW}" height="${chartH-padB}" fill="${capLineColor}" opacity="${cwIndOpacity}" rx="2"/>`;
    }

    // X label: show month on first week of month
    const wDate = new Date(weeks[wi] + 'T00:00:00');
    const prevDate = wi > 0 ? new Date(weeks[wi-1] + 'T00:00:00') : null;
    // Shift Sunday→Monday for display
    const monDate = new Date(wDate); monDate.setDate(monDate.getDate() + 1);
    const prevMon = prevDate ? new Date(prevDate) : null;
    if (prevMon) prevMon.setDate(prevMon.getDate() + 1);
    const showLabel = !prevMon || prevMon.getMonth() !== monDate.getMonth();
    if (showLabel) {
      xLabels += `<text x="${(x+barW/2).toFixed(1)}" y="${(chartH-padB+16).toFixed(1)}" text-anchor="middle" font-size="10" fill="#6B7280" font-weight="600">
        ${monDate.toLocaleDateString('en-US',{month:'short'})}</text>`;
    }
    xLabels += `<text x="${(x+barW/2).toFixed(1)}" y="${(chartH-padB+28).toFixed(1)}" text-anchor="middle" font-size="9" fill="#9CA3AF">
      ${monDate.getDate()}</text>`;
  }

  // Capacity line (connect dots)
  let capPath = '';
  for (let wi = wStart; wi < wEnd; wi++) {
    const x = padL + (wi - wStart) * (barW + gap) + barW/2;
    const cap = p.proj_cap[wi] || 0;
    const y = chartH - padB - (cap/maxCap)*(chartH-padB);
    capPath += (wi === wStart ? `M${x.toFixed(1)},${y.toFixed(1)}` : ` L${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const svgChart = `<svg width="${chartW}" height="${chartH}" role="img" aria-label="Weekly project allocation for ${esc(selectedPerson)}: stacked hours per project with a project-capacity line." style="overflow:visible;display:block;">
    <defs>
      <pattern id="estimateHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" stroke-width="2" opacity="0.45"/>
      </pattern>
    </defs>
    ${yLines}
    <line x1="${padL}" y1="0" x2="${padL}" y2="${chartH-padB}" stroke="${axisColor}" stroke-width="1"/>
    <line x1="${padL}" y1="${chartH-padB}" x2="${chartW}" y2="${chartH-padB}" stroke="${axisColor}" stroke-width="1"/>
    ${bars}
    <path d="${capPath}" fill="none" stroke="${capLineColor}" stroke-width="2" stroke-dasharray="4,3" opacity="0.6"/>
    ${xLabels}
  </svg>`;

  // Legend — includes closed projects (italicized + status suffix) so the
  // bar segments shown at reduced opacity can still be identified.
  const legend = Object.entries(projColorMap).map(function(entry) {
    const proj = entry[0], col = entry[1];
    const a = chartAllocs.find(function(x) { return x.project === proj; });
    const isClosed = a && (a.status === 'Complete' || a.status === 'Canceled');
    const baseLabel = proj.length > 35 ? proj.slice(0,35)+'…' : proj;
    const label = isClosed ? baseLabel + ' (' + a.status + ')' : baseLabel;
    const swatchStyle = 'width:10px;height:10px;border-radius:2px;background:' + col + ';flex-shrink:0;' + (isClosed ? 'opacity:0.5;' : '');
    const textStyle = 'font-size:11px;color:var(--text-muted);' + (isClosed ? 'font-style:italic;opacity:0.75;' : '');
    return '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;' + textStyle + '">' +
      '<span style="' + swatchStyle + '"></span>' + esc(label) +
      '</span>';
  }).join('');

  // ── Project allocation table ──────────────────────────────────
  const tableRows = buildResourceAllocTableRows(allocs, projColorMap, calWeekIdx);

  const periodLabel = (() => {
    const s = new Date(weeks[wStart]+'T00:00:00'); s.setDate(s.getDate()+1); // Sun→Mon
    const e = new Date(weeks[wEnd-1]+'T00:00:00'); e.setDate(e.getDate()+7); // Mon→Sun end
    return `${s.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
  })();

  // Option 3 rail+pane layout. Member rail stays pinned left; right pane
  // tabs switch between Summary and Edit Allocations for the current
  // selectedPerson. Clicking another member in the rail keeps the active
  // tab so a lead can edit Member A then B then C without leaving.
  const mode = Editor.resourceMode || 'summary';
  const teamCount = Object.keys(people).filter(function(n) { return isFullMember(n) && (typeof inCurrentTeamPerson !== 'function' || inCurrentTeamPerson(n)); }).length;

  const summaryBody = `
    <div class="res-edit-header">
      <div>
        <div class="who-name">${esc(selectedPerson)}</div>
        <div class="who-sub">${esc(p.role)} · ${esc(p.team)} team · ${(p.proj_pct*100).toFixed(0)}% project-available${calcInfoIcon('projCapacity')}</div>
      </div>
    </div>
    <div class="res-kpi-row">
      <div class="res-kpi"><div class="kpi-label">Most Recent Week Utilization${calcInfoIcon('utilization')}</div><div class="kpi-value" style="color:${kpiColor};">${cwUtil.toFixed(0)}%</div><div class="kpi-sub">${cwAlloc.toFixed(1)}h of ${cwCap.toFixed(1)}h capacity</div></div>
      <div class="res-kpi"><div class="kpi-label">Available (Most Recent Week)${calcInfoIcon('availableHours')}</div><div class="kpi-value">${Math.max(0,cwCap-cwAlloc).toFixed(1)}h</div><div class="kpi-sub">unallocated project hours</div></div>
      <div class="res-kpi"><div class="kpi-label">Active Projects</div><div class="kpi-value">${activeProjects}</div><div class="kpi-sub">with allocations</div></div>
      <div class="res-kpi"><div class="kpi-label">Hours Logged YTD${calcInfoIcon('ytdHours')}</div><div class="kpi-value">${totalAllocYTD.toFixed(0)}h</div><div class="kpi-sub">through current week</div></div>
    </div>
    <div class="chart-container">
      <div class="chart-header"><h3>Weekly Project Allocation</h3><div class="chart-nav"><button onclick="shiftChart(-20)">◀ Prev</button><span class="period-label">${periodLabel}</span><button onclick="shiftChart(20)">Next ▶</button></div></div>
      <div style="overflow-x:auto;">${svgChart}</div>
      <div style="margin-top:12px;line-height:2;">${legend}</div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;font-size:11px;color:var(--text-muted);">
        <span style="display:inline-flex;align-items:center;gap:6px;"><svg width="20" height="12"><line x1="0" y1="6" x2="20" y2="6" stroke="${capLineColor}" stroke-width="2" stroke-dasharray="4,3" opacity="0.6"/></svg>Project capacity (after role ratio &amp; absences)</span>
        <span style="display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="12"><defs><pattern id="estimateHatchLegend" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#666" stroke-width="2" opacity="0.7"/></pattern></defs><rect x="0" y="0" width="14" height="12" fill="${(typeof PROJECT_COLORS !== 'undefined' && PROJECT_COLORS[0]) || '#1f3b6b'}" opacity="0.85" rx="2"/><rect x="0" y="0" width="14" height="12" fill="url(#estimateHatchLegend)" rx="2"/></svg>Estimate · current and future weeks (may change as work progresses)</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><span style="font-size:13px;font-weight:700;color:var(--navy);">Active Project Allocations</span><span class="text-muted-sm">Showing Active &amp; On Hold only</span></div>
    <div class="proj-alloc-table"><table><thead><tr><th>Project</th><th>Status</th><th>Type</th><th>This Week %</th><th>Recent Trend</th><th>Total Hours</th></tr></thead><tbody>${tableRows || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No allocations found</td></tr>'}</tbody></table></div>
  `;

  const editBody = `
    <div class="res-edit-header">
      <div>
        <div class="who-name">${esc(selectedPerson)}</div>
        <div class="who-sub">${esc(p.role)} · ${esc(p.team)} team · ${(p.proj_pct*100).toFixed(0)}% project-available</div>
      </div>
      <div class="who-stats">Cap <strong>${cwCap.toFixed(1)}h</strong> · Allocated <strong>${cwAlloc.toFixed(1)}h</strong> · <strong>${cwUtil.toFixed(0)}%</strong></div>
    </div>
    <div class="ae-fp-nav">
      <button class="ae-nav-btn" id="ae-fp-prev-btn" onclick="aeShift(-1)">◀ Prev</button>
      <div class="ae-fp-nav-mid">
        <div class="ae-fp-nav-label" id="ae-fp-range-label">—</div>
        <div class="ae-fp-nav-sub" id="ae-fp-range-sub">—</div>
      </div>
      <div class="ae-fp-nav-right">
        <button class="ae-jump-today" onclick="aeJumpCurrent()">Jump to Current Week</button>
        <button class="ae-nav-btn" id="ae-fp-next-btn" onclick="aeShift(1)">Next ▶</button>
      </div>
    </div>
    <div class="ae-fp-grid-wrap">
      <table class="ae-grid" id="ae-fp-grid-table">
        <thead id="ae-fp-thead"></thead>
        <tbody id="ae-fp-tbody"></tbody>
        <tfoot id="ae-fp-tfoot"></tfoot>
      </table>
    </div>
  `;

  const paneBody = mode === 'edit' ? editBody : summaryBody;
  const actionsHtml = mode === 'edit'
    ? '<div class="res-pane-actions"><button class="btn-discard" onclick="setResourceMode(\'summary\')">Discard</button><button class="btn-apply" onclick="applyEditorChanges()"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg> Apply changes</button></div>'
    : '';

  area.innerHTML = `
    <div class="res-layout">
      <aside class="res-rail">
        <div class="res-rail-title">Team (${teamCount})</div>
        <div class="person-grid">${personCards}</div>
      </aside>
      <div class="res-pane">
        <div class="res-pane-tabs">
          <button class="res-pane-tab ${mode === 'summary' ? 'active' : ''}" onclick="setResourceMode('summary')"><svg class="icon" aria-hidden="true"><use href="#ph-users-three"></use></svg> Summary</button>
          <button class="res-pane-tab ${mode === 'edit' ? 'active' : ''}" onclick="setResourceMode('edit')"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg> Edit Allocations</button>
          ${actionsHtml}
        </div>
        <div class="res-pane-body">${paneBody}</div>
      </div>
    </div>
  `;

  // In edit mode, populate the grid into the just-rendered ae-fp-* DOM.
  if (mode === 'edit' && typeof aeRenderGrid === 'function') {
    aeRenderGrid();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  OE CAPACITY · RESOURCES — Laura's screen-capacity.jsx (mock-first approved)
//  Same data pipeline as Classic renderResources; OE re-shells the layout
//  (editorial title row, 260px team sidebar card, member detail card with
//  display-3 italic accent on last name, 4-up KPI grid, chart card with
//  capacity line + legend, plus the Classic "Active Project Allocations"
//  table kept verbatim under the chart per Peter's spec). Date format keeps
//  the Classic "Jan 5 – May 24, 2026" rather than Laura's italic-year version.
// ═══════════════════════════════════════════════════════════════════════════
function _oeCapUtilColor(v) {
  if (v >= 100) return 'var(--status-overdue-fg)';
  if (v >= 75)  return 'var(--status-hold-fg)';
  if (v > 0)    return 'var(--sage-700)';
  return 'var(--ink-4)';
}
function _oeNameWithItalic(name) {
  if (!name) return '';
  var parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return esc(name);
  var last = parts.pop();
  return esc(parts.join(' ')) + ' <span class="oe-italic-serif">' + esc(last) + '</span>';
}

function buildResourceTeamRowsOE(people, currentWeekIdx) {
  return Object.entries(people)
    .filter(function(entry) {
      var name = entry[0];
      return isFullMember(name) && (typeof inCurrentTeamPerson !== 'function' || inCurrentTeamPerson(name));
    })
    .map(function(entry) {
      var name = entry[0], p = entry[1];
      var curUtil = (p.utilization[currentWeekIdx] || 0) * 100;
      var utilCol = _oeCapUtilColor(curUtil);
      var initials = name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      var isActive = name === selectedPerson;
      var avBg = isActive ? 'var(--navy-500)' : 'var(--ink-1)';
      var avFg = isActive ? 'var(--ink-paper)' : 'var(--ink-6)';
      var cls = 'oe-cap-row' + (isActive ? ' is-active' : '');
      return '<button class="' + cls + '" onclick="selectPerson(\'' + name.replace(/'/g, "\\'") + '\')">' +
        '<span class="oe-avatar oe-avatar--sm" style="background:' + avBg + ';color:' + avFg + ';">' + esc(initials) + '</span>' +
        '<div class="oe-cap-row-name-wrap">' +
          '<div class="oe-cap-row-name">' + esc(name) + '</div>' +
          '<div class="oe-cap-util-bar"><div class="oe-cap-util-fill" style="width:' + Math.min(curUtil, 100) + '%;background:' + utilCol + ';"></div></div>' +
        '</div>' +
        '<span class="oe-cap-row-pct" style="color:' + utilCol + ';">' + curUtil.toFixed(0) + '%</span>' +
      '</button>';
    }).join('');
}

function renderResourcesOE(area) {
  if (!RESOURCES_DATA) { area.innerHTML = '<div class="empty-state">Resources data is loading…</div>'; return; }
  var weeks = RESOURCES_DATA.weeks;
  var people = RESOURCES_DATA.people;
  _resEnsureSelected();
  var currentWeekIdx = window.currentWeekIdx;
  var dataWeekIdx    = window.dataWeekIdx;

  // ── Selected person + alloc dedup (same logic as Classic) ──
  var p = people[selectedPerson];
  var projTitleSet = new Set(PROJECTS.map(function(pr) { return pr.title; }));
  function canonicalAllocTitle(raw) {
    if (projTitleSet.has(raw)) return raw;
    var stripped = raw.replace(/\s*-\s*[A-Z][A-Za-z .]+$/, '').trim();
    return projTitleSet.has(stripped) ? stripped : raw;
  }
  var allocsByName = {};
  p.allocations.forEach(function(a) {
    var key = canonicalAllocTitle(a.project);
    if (!allocsByName[key]) {
      allocsByName[key] = Object.assign({}, a, { project: key, fracs: a.fracs.slice(), hours: a.hours.slice() });
    } else {
      var existing = allocsByName[key];
      a.fracs.forEach(function(f, i) { existing.fracs[i] = (existing.fracs[i] || 0) + f; });
      a.hours.forEach(function(h, i) { existing.hours[i] = (existing.hours[i] || 0) + h; });
    }
  });
  var N = RESOURCES_DATA.weeks.length;
  PROJECTS.forEach(function(proj) {
    if (allocsByName[proj.title]) return;
    var members = (proj.other_members || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    var isContact = proj.contact === selectedPerson;
    var isMember  = members.indexOf(selectedPerson) >= 0;
    if (!isContact && !isMember) return;
    allocsByName[proj.title] = { project: proj.title, status: proj.status, type: '', fracs: new Array(N).fill(0), hours: new Array(N).fill(0), analytics_id: proj.id };
  });
  Object.keys(allocsByName).forEach(function(projTitle) {
    var liveProj = PROJECTS.find(function(pr) { return pr.title === projTitle; });
    if (liveProj) allocsByName[projTitle].status = liveProj.status;
  });
  var allocs = Object.values(allocsByName).filter(function(a) { return a.status === 'Active' || a.status === 'On Hold'; });
  var chartAllocs = Object.values(allocsByName).filter(function(a) {
    if (a.status === 'Active' || a.status === 'On Hold') return true;
    if (a.status === 'Complete' || a.status === 'Canceled') return a.fracs.some(function(f) { return f > 0; });
    return false;
  });

  // ── KPIs (uses dataWeekIdx for numbers, currentWeekIdx for visuals) ──
  var cwIdx = dataWeekIdx;
  var calWeekIdx = currentWeekIdx;
  var cwCap = p.proj_cap[cwIdx] || 0;
  var cwAlloc = p.weekly_allocated[cwIdx] || 0;
  var cwUtil = cwCap > 0 ? (cwAlloc / cwCap * 100) : 0;
  var activeProjects = allocs.filter(function(a) { return a.fracs.some(function(f) { return f > 0; }); }).length;
  var totalAllocYTD = p.weekly_allocated.slice(0, cwIdx + 1).reduce(function(s, v) { return s + v; }, 0);

  // ── Chart geometry (smaller bars than Classic so the 20-week window fits the
  //    OE 1fr main column without horizontal scroll on most viewports). ──
  var windowSize = 20;
  var wStart = Math.min(chartWindowStart, Math.max(0, weeks.length - windowSize));
  var wEnd   = Math.min(wStart + windowSize, weeks.length);

  var maxCap = Math.max.apply(null, p.proj_cap.slice(wStart, wEnd).concat([1]));
  var chartH = 220;
  var barW   = 28;
  var gap    = 6;
  var padL   = 42;
  var padB   = 40;
  var chartW = padL + (barW + gap) * (wEnd - wStart) + 16;

  var projColorMap = {};
  chartAllocs.forEach(function(a, i) { projColorMap[a.project] = PROJECT_COLORS[i % PROJECT_COLORS.length]; });

  // OE chart colors (capacity line = navy; grid/axis pulled from ink tokens).
  var _oeDark = (typeof document !== 'undefined' && document.body && document.body.dataset.theme === 'oe-dark');
  var capLineColor = _oeDark ? '#b3c4e0' : '#1f3b6b';
  var gridColor = _oeDark ? 'rgba(255,255,255,0.06)' : '#e8e2d3';
  var axisColor = _oeDark ? 'rgba(255,255,255,0.18)' : '#d9d1bf';
  var cwIndOpacity = _oeDark ? '0.10' : '0.05';
  var labelTickColor = _oeDark ? '#8ea4c4' : '#a89e88';
  var labelMonthColor = _oeDark ? '#c4d2e5' : '#6b6354';

  var bars = '';
  var xLabels = '';
  var yLines = '';

  for (var h = 0; h <= maxCap; h += Math.ceil(maxCap / 4)) {
    var y = chartH - padB - (h / maxCap) * (chartH - padB);
    yLines += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + chartW + '" y2="' + y.toFixed(1) + '" stroke="' + gridColor + '" stroke-width="1"/>';
    yLines += '<text x="' + (padL - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="10" font-family="JetBrains Mono, monospace" fill="' + labelTickColor + '">' + h.toFixed(0) + '</text>';
  }

  for (var wi = wStart; wi < wEnd; wi++) {
    var x = padL + (wi - wStart) * (barW + gap);
    var cap = p.proj_cap[wi] || 0;
    var capY = chartH - padB - (cap / maxCap) * (chartH - padB);

    var stackY = chartH - padB;
    chartAllocs.forEach(function(a) {
      var hrs = a.hours[wi] || 0;
      if (hrs <= 0) return;
      var barH = (hrs / maxCap) * (chartH - padB);
      stackY -= barH;
      var col = projColorMap[a.project];
      var isClosed = a.status === 'Complete' || a.status === 'Canceled';
      var op = isClosed ? '0.45' : '0.95';
      var statusSuffix = isClosed ? ' (' + a.status + ')' : '';
      bars += '<rect x="' + x.toFixed(1) + '" y="' + stackY.toFixed(1) + '" width="' + barW + '" height="' + barH.toFixed(1) + '" fill="' + col + '" opacity="' + op + '" rx="2"><title>' + esc(a.project + statusSuffix) + ': ' + hrs.toFixed(1) + 'h</title></rect>';
    });

    // Estimate hatch overlay — current + future weeks reflect planned
    // allocation (not settled actuals), so flag them with a diagonal stripe.
    if (wi >= calWeekIdx && stackY < chartH - padB) {
      bars += '<rect x="' + x.toFixed(1) + '" y="' + stackY.toFixed(1) + '" width="' + barW + '" height="' + (chartH - padB - stackY).toFixed(1) + '" fill="url(#oeEstimateHatch)" rx="2" pointer-events="none"/>';
    }

    // Capacity dot per week
    bars += '<circle cx="' + (x + barW / 2).toFixed(1) + '" cy="' + capY.toFixed(1) + '" r="3" fill="' + capLineColor + '"/>';
    // Current week indicator
    if (wi === calWeekIdx) {
      bars += '<rect x="' + x.toFixed(1) + '" y="0" width="' + barW + '" height="' + (chartH - padB) + '" fill="' + capLineColor + '" opacity="' + cwIndOpacity + '" rx="2"/>';
    }

    // X labels (month on first-of-month, day below)
    var wDate = new Date(weeks[wi] + 'T00:00:00');
    var prevDate = wi > 0 ? new Date(weeks[wi - 1] + 'T00:00:00') : null;
    var monDate = new Date(wDate); monDate.setDate(monDate.getDate() + 1);
    var prevMon = prevDate ? new Date(prevDate) : null;
    if (prevMon) prevMon.setDate(prevMon.getDate() + 1);
    var showLabel = !prevMon || prevMon.getMonth() !== monDate.getMonth();
    if (showLabel) {
      xLabels += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (chartH - padB + 16).toFixed(1) + '" text-anchor="middle" font-size="10" font-family="JetBrains Mono, monospace" fill="' + labelMonthColor + '" font-weight="600">' + monDate.toLocaleDateString('en-US', { month: 'short' }) + '</text>';
    }
    xLabels += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (chartH - padB + 28).toFixed(1) + '" text-anchor="middle" font-size="9" font-family="JetBrains Mono, monospace" fill="' + labelTickColor + '">' + monDate.getDate() + '</text>';
  }

  // Capacity line (dashed connecting capacity dots)
  var capPath = '';
  for (var wii = wStart; wii < wEnd; wii++) {
    var xx = padL + (wii - wStart) * (barW + gap) + barW / 2;
    var ccap = p.proj_cap[wii] || 0;
    var yy = chartH - padB - (ccap / maxCap) * (chartH - padB);
    capPath += (wii === wStart ? 'M' : ' L') + xx.toFixed(1) + ',' + yy.toFixed(1);
  }

  var svgChart = '<svg width="' + chartW + '" height="' + chartH + '" role="img" aria-label="Weekly project allocation for ' + esc(selectedPerson) + '" style="overflow:visible;display:block;">' +
    '<defs><pattern id="oeEstimateHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="' + (_oeDark ? '#fff' : '#fff') + '" stroke-width="2" opacity="' + (_oeDark ? '0.30' : '0.45') + '"/></pattern></defs>' +
    yLines +
    '<line x1="' + padL + '" y1="0" x2="' + padL + '" y2="' + (chartH - padB) + '" stroke="' + axisColor + '" stroke-width="1"/>' +
    '<line x1="' + padL + '" y1="' + (chartH - padB) + '" x2="' + chartW + '" y2="' + (chartH - padB) + '" stroke="' + axisColor + '" stroke-width="1"/>' +
    bars +
    '<path d="' + capPath + '" fill="none" stroke="' + capLineColor + '" stroke-width="2" stroke-dasharray="4,3" opacity="0.65"/>' +
    xLabels +
  '</svg>';

  // Legend — same shape as Classic, OE colors
  var legend = Object.entries(projColorMap).map(function(entry) {
    var proj = entry[0], col = entry[1];
    var a = chartAllocs.find(function(x) { return x.project === proj; });
    var isClosed = a && (a.status === 'Complete' || a.status === 'Canceled');
    var baseLabel = proj.length > 35 ? proj.slice(0, 35) + '…' : proj;
    var label = isClosed ? baseLabel + ' (' + a.status + ')' : baseLabel;
    var dotStyle = 'width:10px;height:10px;border-radius:2px;background:' + col + ';flex-shrink:0;' + (isClosed ? 'opacity:0.5;' : '');
    var textStyle = 'font-size:11px;color:var(--ink-6);' + (isClosed ? 'font-style:italic;opacity:0.75;' : '');
    return '<div class="oe-cap-legend-item" style="' + textStyle + '"><span style="' + dotStyle + '"></span>' + esc(label) + '</div>';
  }).join('');

  // Period label — KEEP Classic format per Peter's note (Jan 5 – May 24, 2026)
  var periodLabel = (function() {
    var s = new Date(weeks[wStart] + 'T00:00:00'); s.setDate(s.getDate() + 1);
    var e = new Date(weeks[wEnd - 1] + 'T00:00:00'); e.setDate(e.getDate() + 7);
    return s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  // Reuse the existing Active Project Allocations table builder verbatim.
  var tableRows = buildResourceAllocTableRows(allocs, projColorMap, calWeekIdx);

  // ── Layout assembly ──
  var teamRows = buildResourceTeamRowsOE(people, currentWeekIdx);
  var teamCount = Object.keys(people).filter(function(n) { return isFullMember(n) && (typeof inCurrentTeamPerson !== 'function' || inCurrentTeamPerson(n)); }).length;
  var mode = Editor.resourceMode || 'summary';

  var titleRow = '<div class="oe-cap-head">' +
    '<div>' +
      '<div class="oe-cap-eyebrow">Team capacity · ' + esc(periodLabel) + '</div>' +
      '<h1 class="oe-cap-title">Capacity</h1>' +
    '</div>' +
  '</div>';

  var sidebar = '<div class="oe-card oe-cap-sidecard">' +
    '<div class="oe-cap-team-head">' +
      '<span class="oe-meta">Team</span>' +
      '<span class="oe-mono" style="margin-left:8px;font-size:11px;color:var(--ink-5);">' + teamCount + '</span>' +
    '</div>' +
    '<div class="oe-cap-team-rows">' + teamRows + '</div>' +
  '</div>';

  var memberRoleLine = esc(p.role || '') + (p.team ? ' · ' + esc(p.team) + ' team' : '') + ' · <span style="color:var(--sage-700);">' + (p.proj_pct * 100).toFixed(0) + '% project-available</span>' + (typeof calcInfoIcon === 'function' ? calcInfoIcon('projCapacity') : '');
  var memberInitials = selectedPerson.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  var memberHeader = '<div class="oe-card oe-cap-member">' +
    '<div class="oe-cap-member-top">' +
      '<span class="oe-avatar oe-avatar--lg" style="background:var(--navy-500);color:var(--ink-paper);width:48px;height:48px;font-size:16px;">' + esc(memberInitials) + '</span>' +
      '<div>' +
        '<h2 class="oe-cap-member-name">' + _oeNameWithItalic(selectedPerson) + '</h2>' +
        '<div class="oe-cap-member-role">' + memberRoleLine + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="oe-cap-kpis">' +
      '<div class="oe-cap-kpi">' +
        '<div class="oe-cap-kpi-label">Most-recent-week utilization' + (typeof calcInfoIcon === 'function' ? calcInfoIcon('utilization') : '') + '</div>' +
        '<div class="oe-cap-kpi-value' + (cwUtil >= 100 ? ' overdue' : '') + '">' + cwUtil.toFixed(0) + '%</div>' +
        '<div class="oe-cap-kpi-sub">' + cwAlloc.toFixed(1) + 'h of ' + cwCap.toFixed(1) + 'h capacity</div>' +
      '</div>' +
      '<div class="oe-cap-kpi">' +
        '<div class="oe-cap-kpi-label">Available (most recent week)' + (typeof calcInfoIcon === 'function' ? calcInfoIcon('availableHours') : '') + '</div>' +
        '<div class="oe-cap-kpi-value">' + Math.max(0, cwCap - cwAlloc).toFixed(1) + 'h</div>' +
        '<div class="oe-cap-kpi-sub">unallocated project hours</div>' +
      '</div>' +
      '<div class="oe-cap-kpi">' +
        '<div class="oe-cap-kpi-label">Active projects</div>' +
        '<div class="oe-cap-kpi-value">' + activeProjects + '</div>' +
        '<div class="oe-cap-kpi-sub">with allocations</div>' +
      '</div>' +
      '<div class="oe-cap-kpi">' +
        '<div class="oe-cap-kpi-label">Hours logged YTD' + (typeof calcInfoIcon === 'function' ? calcInfoIcon('ytdHours') : '') + '</div>' +
        '<div class="oe-cap-kpi-value">' + totalAllocYTD.toFixed(0) + 'h</div>' +
        '<div class="oe-cap-kpi-sub">through current week</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  var chartCard = '<div class="oe-card oe-cap-chart-card">' +
    '<div class="oe-cap-chart-head">' +
      '<div>' +
        '<div class="oe-meta">Weekly project allocation</div>' +
        '<div class="oe-cap-chart-period">' + esc(periodLabel) + '</div>' +
      '</div>' +
      '<div class="oe-spacer"></div>' +
      '<div style="display:flex;gap:6px;">' +
        '<button class="oe-btn oe-btn--ghost oe-btn--sm" onclick="shiftChart(-20)"><svg class="icon" aria-hidden="true"><use href="#ph-caret-left"></use></svg>Prev</button>' +
        '<button class="oe-btn oe-btn--ghost oe-btn--sm" onclick="shiftChart(20)">Next<svg class="icon" aria-hidden="true"><use href="#ph-caret-right"></use></svg></button>' +
      '</div>' +
    '</div>' +
    '<div class="oe-cap-chart-body"><div style="overflow-x:auto;">' + svgChart + '</div>' +
      '<div class="oe-cap-capline-key" style="display:flex;flex-wrap:wrap;gap:18px;">' +
        '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="' + capLineColor + '" stroke-width="2" stroke-dasharray="4,3" opacity="0.65"/></svg>Project capacity (after role ratio &amp; absences)</span>' +
        '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="12"><defs><pattern id="oeEstHatchKey" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="' + (_oeDark ? '#fff' : '#3f3a2d') + '" stroke-width="2" opacity="' + (_oeDark ? '0.45' : '0.75') + '"/></pattern></defs><rect x="0" y="0" width="14" height="12" fill="' + (PROJECT_COLORS && PROJECT_COLORS[0] || '#1f3b6b') + '" opacity="0.85" rx="2"/><rect x="0" y="0" width="14" height="12" fill="url(#oeEstHatchKey)" rx="2"/></svg>Estimate · current and future weeks (may change as work progresses)</span>' +
      '</div>' +
    '</div>' +
    '<div class="oe-cap-chart-legend">' + legend + '</div>' +
  '</div>';

  // Active Project Allocations — preserved from Classic per Peter's note.
  // Same table builder, wrapped in OE-styled card chrome.
  var allocSection = '<div class="oe-cap-alloc-section">' +
    '<div class="oe-cap-alloc-head">' +
      '<div class="oe-meta">Active project allocations</div>' +
      '<span class="oe-body-sm" style="color:var(--ink-5);font-size:11px;">Showing Active &amp; On Hold only</span>' +
    '</div>' +
    '<div class="oe-card oe-cap-alloc-card"><table class="oe-cap-alloc-table"><thead><tr>' +
      '<th>Project</th><th>Status</th><th>Type</th><th>This Week %</th><th>Recent Trend</th><th>Total Hours</th>' +
    '</tr></thead><tbody>' +
      (tableRows || '<tr><td colspan="6" style="text-align:center;color:var(--ink-5);padding:24px;">No allocations found</td></tr>') +
    '</tbody></table></div>' +
  '</div>';

  // Edit mode: re-use the existing ae-grid (allocation editor) wrapped in OE chrome.
  var editBody = '<div class="oe-card oe-cap-member">' +
    '<div class="oe-cap-member-top">' +
      '<span class="oe-avatar oe-avatar--lg" style="background:var(--navy-500);color:var(--ink-paper);width:48px;height:48px;font-size:16px;">' + esc(memberInitials) + '</span>' +
      '<div>' +
        '<h2 class="oe-cap-member-name">' + _oeNameWithItalic(selectedPerson) + '</h2>' +
        '<div class="oe-cap-member-role">' + esc(p.role || '') + ' · ' + esc(p.team || '') + ' team · ' + (p.proj_pct * 100).toFixed(0) + '% project-available</div>' +
      '</div>' +
      '<div class="oe-spacer"></div>' +
      '<div class="oe-body-sm" style="text-align:right;">Cap <strong>' + cwCap.toFixed(1) + 'h</strong> · Allocated <strong>' + cwAlloc.toFixed(1) + 'h</strong> · <strong>' + cwUtil.toFixed(0) + '%</strong></div>' +
    '</div>' +
    '<div class="ae-fp-nav" style="margin-top:18px;">' +
      '<button class="ae-nav-btn" id="ae-fp-prev-btn" onclick="aeShift(-1)">◀ Prev</button>' +
      '<div class="ae-fp-nav-mid">' +
        '<div class="ae-fp-nav-label" id="ae-fp-range-label">—</div>' +
        '<div class="ae-fp-nav-sub" id="ae-fp-range-sub">—</div>' +
      '</div>' +
      '<div class="ae-fp-nav-right">' +
        '<button class="ae-jump-today" onclick="aeJumpCurrent()">Jump to Current Week</button>' +
        '<button class="ae-nav-btn" id="ae-fp-next-btn" onclick="aeShift(1)">Next ▶</button>' +
      '</div>' +
    '</div>' +
    '<div class="ae-fp-grid-wrap"><table class="ae-grid" id="ae-fp-grid-table"><thead id="ae-fp-thead"></thead><tbody id="ae-fp-tbody"></tbody><tfoot id="ae-fp-tfoot"></tfoot></table></div>' +
  '</div>';

  var paneBody = (mode === 'edit')
    ? editBody
    : (memberHeader + chartCard + allocSection);

  var actionsHtml = (mode === 'edit')
    ? '<div style="margin-left:auto;display:flex;gap:8px;">' +
        '<button class="oe-btn oe-btn--ghost oe-btn--sm" onclick="setResourceMode(\'summary\')">Discard</button>' +
        '<button class="oe-btn oe-btn--primary oe-btn--sm" onclick="applyEditorChanges()"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg>Apply changes</button>' +
      '</div>'
    : '';

  area.innerHTML =
    '<div class="oe-cap-page">' +
      titleRow +
      '<div class="oe-cap-grid">' +
        sidebar +
        '<div class="oe-cap-main">' +
          '<div class="oe-tabs">' +
            '<button class="oe-tab" aria-selected="' + (mode === 'summary' ? 'true' : 'false') + '" onclick="setResourceMode(\'summary\')"><svg class="icon" aria-hidden="true"><use href="#ph-users-three"></use></svg>Summary</button>' +
            '<button class="oe-tab" aria-selected="' + (mode === 'edit' ? 'true' : 'false') + '" onclick="setResourceMode(\'edit\')"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg>Edit allocations</button>' +
            actionsHtml +
          '</div>' +
          paneBody +
        '</div>' +
      '</div>' +
    '</div>';

  if (mode === 'edit' && typeof aeRenderGrid === 'function') {
    aeRenderGrid();
  }
}

// Switch between Summary and Edit modes inside the Resources pane.
// Entering edit mode rebuilds Editor.draft for the currently-selected
// person via openAllocEditor (which is now mode-aware and skips the
// modal-open step when Editor.fullPageEditPerson is set).
//
// Async because we verify the AGOL token before allowing edits — if the
// session has expired we'd rather redirect to re-auth NOW than let the
// user enter values that get silently lost at save time.
async function setResourceMode(mode) {
  if (mode === 'edit') {
    if (typeof ensureAgolToken === 'function') {
      const token = await ensureAgolToken();
      if (!token) {
        // ensureAgolToken triggers OAuth redirect when the token is
        // missing/expired; if we got here without a token, the redirect
        // is in flight. Don't enter edit mode.
        if (typeof showToast === 'function') {
          showToast('Sign-in expired — reconnecting before you can edit allocations.', 'warn');
        }
        return;
      }
    }
    Editor.resourceMode = 'edit';
    Editor.fullPageEditPerson = selectedPerson;
    Editor.person = selectedPerson;
    if (typeof openAllocEditor === 'function') {
      openAllocEditor(selectedPerson);
    }
  } else {
    Editor.resourceMode = 'summary';
    Editor.fullPageEditPerson = null;
    Editor.person = null;
  }
  if (typeof render === 'function') render();
}

function selectPerson(name) {
  selectedPerson = name;
  // Re-snap the chart to the current week for the new person — used to reset
  // to week 0 (Jan), which hid current-week allocations on any visit past
  // mid-May. The helper keeps "see this person's right-now" the default.
  _positionChartOnCurrentWeek();
  // If we're in edit mode, rebuild the editor draft for the new person so
  // the rail-click flow ("edit member A then B then C") just works without
  // bouncing back to the Summary tab.
  if (Editor.resourceMode === 'edit') {
    Editor.fullPageEditPerson = name;
    Editor.person = name;
    if (typeof openAllocEditor === 'function') {
      openAllocEditor(name);
    }
  }
  render();
}

function shiftChart(delta) {
  const weeks = RESOURCES_DATA.weeks;
  chartWindowStart = Math.max(0, Math.min(chartWindowStart + delta, weeks.length - 20));
  render();
}
