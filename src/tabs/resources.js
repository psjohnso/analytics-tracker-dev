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
  // Default selected person to first active person if current selection not in data or inactive
  if (!people[selectedPerson] || people[selectedPerson].active === false) {
    const activeNames = Object.keys(people).filter(function(n) { return isFullMember(n); });
    if (activeNames.length > 0) selectedPerson = activeNames[0];
    else {
      const names = Object.keys(people);
      if (names.length > 0) selectedPerson = names[0];
    }
  }
}

function buildResourcePersonCards(people, currentWeekIdx) {
  return Object.entries(people).filter(([name, p]) => isFullMember(name)).map(([name, p]) => {
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
      <span class="person-util-badge" style="background:${utilColor}22;color:${utilColor};">${curUtil.toFixed(0)}%</span>
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

  // Build color map for projects
  const projColorMap = {};
  allocs.forEach((a, i) => { projColorMap[a.project] = PROJECT_COLORS[i % PROJECT_COLORS.length]; });

  // Build SVG bars
  let bars = '';
  let xLabels = '';
  let yLines = '';

  // Y gridlines
  for (let h = 0; h <= maxCap; h += Math.ceil(maxCap/4)) {
    const y = chartH - padB - (h/maxCap)*(chartH-padB);
    yLines += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${chartW}" y2="${y.toFixed(1)}" stroke="#F3F1EB" stroke-width="1"/>`;
    yLines += `<text x="${padL-6}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="#9CA3AF">${h.toFixed(0)}</text>`;
  }

  for (let wi = wStart; wi < wEnd; wi++) {
    const x = padL + (wi - wStart) * (barW + gap);
    const cap = p.proj_cap[wi] || 0;
    const capY = chartH - padB - (cap/maxCap)*(chartH-padB);

    // Stacked bars per project
    let stackY = chartH - padB;
    allocs.forEach(a => {
      const hrs = a.hours[wi] || 0;
      if (hrs <= 0) return;
      const barH = (hrs/maxCap)*(chartH-padB);
      stackY -= barH;
      const col = projColorMap[a.project];
      bars += `<rect x="${x.toFixed(1)}" y="${stackY.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" fill="${col}" opacity="0.85" rx="2">
        <title>${esc(a.project)}: ${hrs.toFixed(1)}h</title></rect>`;
    });

    // Capacity line segment
    const nextWi = wi + 1 < wEnd ? wi + 1 : wi;
    const nextCap = p.proj_cap[nextWi] || cap;
    const nextCapY = chartH - padB - (nextCap/maxCap)*(chartH-padB);
    const x2 = padL + (nextWi - wStart) * (barW + gap) + barW/2;
    bars += `<circle cx="${(x+barW/2).toFixed(1)}" cy="${capY.toFixed(1)}" r="3" fill="#002669"/>`;

    // Current week indicator
    if (wi === calWeekIdx) {
      bars += `<rect x="${x.toFixed(1)}" y="0" width="${barW}" height="${chartH-padB}" fill="#002669" opacity="0.05" rx="2"/>`;
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

  const svgChart = `<svg width="${chartW}" height="${chartH}" style="overflow:visible;display:block;">
    ${yLines}
    <line x1="${padL}" y1="0" x2="${padL}" y2="${chartH-padB}" stroke="#E8E6DF" stroke-width="1"/>
    <line x1="${padL}" y1="${chartH-padB}" x2="${chartW}" y2="${chartH-padB}" stroke="#E8E6DF" stroke-width="1"/>
    ${bars}
    <path d="${capPath}" fill="none" stroke="#002669" stroke-width="2" stroke-dasharray="4,3" opacity="0.6"/>
    ${xLabels}
  </svg>`;

  // Legend
  const legend = Object.entries(projColorMap).map(([proj, col]) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:11px;color:var(--text-muted);">
      <span style="width:10px;height:10px;border-radius:2px;background:${col};flex-shrink:0;"></span>${esc(proj.length>35?proj.slice(0,35)+'…':proj)}
    </span>`
  ).join('');

  // ── Project allocation table ──────────────────────────────────
  const tableRows = buildResourceAllocTableRows(allocs, projColorMap, calWeekIdx);

  const periodLabel = (() => {
    const s = new Date(weeks[wStart]+'T00:00:00'); s.setDate(s.getDate()+1); // Sun→Mon
    const e = new Date(weeks[wEnd-1]+'T00:00:00'); e.setDate(e.getDate()+7); // Mon→Sun end
    return `${s.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
  })();

  area.innerHTML = `
    <div style="padding:20px 0;">
      <div style="font-size:20px;font-weight:800;color:var(--navy);margin-bottom:10px;margin-top:-4px;">Current Week Project Allocations</div>
      <div class="person-grid" style="margin-bottom:0;">${personCards}</div>

      <hr style="border:none;border-top:1px solid #E8E6DF;margin:20px 0;">

      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <span style="font-size:18px;font-weight:800;color:var(--navy);">${esc(selectedPerson)}</span>
          <span style="margin-left:10px;font-size:13px;color:var(--text-muted);">${esc(p.role)} · ${esc(p.team)} team · ${(p.proj_pct*100).toFixed(0)}% project-available${calcInfoIcon('projCapacity')}</span>
        </div>
        <button data-person="${esc(selectedPerson)}" onclick="openAllocEditor(this.dataset.person)" style="padding:8px 18px;background:var(--navy);color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;" onmouseover="this.style.background='#1a3a7c'" onmouseout="this.style.background='var(--navy)'">✏️ Edit Allocations</button>
      </div>

      <div class="res-kpi-row">
        <div class="res-kpi">
          <div class="kpi-label">Most Recent Week Utilization${calcInfoIcon('utilization')}</div>
          <div class="kpi-value" style="color:${kpiColor};">${cwUtil.toFixed(0)}%</div>
          <div class="kpi-sub">${cwAlloc.toFixed(1)}h of ${cwCap.toFixed(1)}h capacity</div>
        </div>
        <div class="res-kpi">
          <div class="kpi-label">Available (Most Recent Week)${calcInfoIcon('availableHours')}</div>
          <div class="kpi-value">${Math.max(0,cwCap-cwAlloc).toFixed(1)}h</div>
          <div class="kpi-sub">unallocated project hours</div>
        </div>
        <div class="res-kpi">
          <div class="kpi-label">Active Projects</div>
          <div class="kpi-value">${activeProjects}</div>
          <div class="kpi-sub">with allocations</div>
        </div>
        <div class="res-kpi">
          <div class="kpi-label">Hours Logged YTD${calcInfoIcon('ytdHours')}</div>
          <div class="kpi-value">${totalAllocYTD.toFixed(0)}h</div>
          <div class="kpi-sub">through current week</div>
        </div>
      </div>

      <div class="chart-container">
        <div class="chart-header">
          <h3>Weekly Project Allocation</h3>
          <div class="chart-nav">
            <button onclick="shiftChart(-20)">◀ Prev</button>
            <span class="period-label">${periodLabel}</span>
            <button onclick="shiftChart(20)">Next ▶</button>
          </div>
        </div>
        <div style="overflow-x:auto;">${svgChart}</div>
        <div style="margin-top:12px;line-height:2;">${legend}</div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);">
          <svg width="20" height="12"><line x1="0" y1="6" x2="20" y2="6" stroke="#002669" stroke-width="2" stroke-dasharray="4,3" opacity="0.6"/></svg>
          Project capacity (after role ratio &amp; absences)
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:700;color:var(--navy);">Active Project Allocations</span>
          <span class="text-muted-sm">Showing Active &amp; On Hold only</span>
        </div>
        <div class="proj-alloc-table">
        <table>
          <thead><tr>
            <th>Project</th><th>Status</th><th>Type</th>
            <th>This Week %</th><th>Recent Trend</th><th>Total Hours</th>
          </tr></thead>
          <tbody>${tableRows || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No allocations found</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function selectPerson(name) {
  selectedPerson = name;
  chartWindowStart = 0;
  render();
}

function shiftChart(delta) {
  const weeks = RESOURCES_DATA.weeks;
  chartWindowStart = Math.max(0, Math.min(chartWindowStart + delta, weeks.length - 20));
  render();
}
