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
  _resEnsureSelected();
}

// Ensure selectedPerson is an active full member of the currently-scoped team;
// otherwise pick the first such member. Called on data load AND on every
// Resources render, so opening the tab (or switching teams) always lands on a
// member of the currently selected team.
function _resEnsureSelected() {
  if (!RESOURCES_DATA || !RESOURCES_DATA.people) return;
  var people = RESOURCES_DATA.people;
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
      <div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);"><svg width="20" height="12"><line x1="0" y1="6" x2="20" y2="6" stroke="${capLineColor}" stroke-width="2" stroke-dasharray="4,3" opacity="0.6"/></svg>Project capacity (after role ratio &amp; absences)</div>
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
  chartWindowStart = 0;
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
