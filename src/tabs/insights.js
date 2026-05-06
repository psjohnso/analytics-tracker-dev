// ─────────────────────────────────────────────────────────────────────
// tabs/insights.js — Insights / Analytics tab
//
// Project retrospectives for completed work. Builds a reference
// library of actual effort by category and size over time.
//
// Forward references: PROJECTS, SIZE_DURATIONS, getProjectHours,
// getProjectHoursByPerson, calcInfoIcon — defined in inline script.
// Backward references: esc.
// ─────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════
//  INSIGHTS / ANALYTICS TAB
//  Project retrospectives for completed work. Builds a reference
//  library of actual effort by category and size over time.
// ═══════════════════════════════════════════════════════════════════════
function insightsToggle(section) {
  var chart = document.getElementById('ins-' + section + '-chart');
  var table = document.getElementById('ins-' + section + '-table');
  var btnChart = document.getElementById('ins-' + section + '-btn-chart');
  var btnTable = document.getElementById('ins-' + section + '-btn-table');
  if (chart.style.display === 'none') {
    chart.style.display = ''; table.style.display = 'none';
    if (btnChart) { btnChart.style.background = 'var(--navy)'; btnChart.style.color = '#fff'; }
    if (btnTable) { btnTable.style.background = 'transparent'; btnTable.style.color = 'var(--navy)'; }
  } else {
    chart.style.display = 'none'; table.style.display = '';
    if (btnChart) { btnChart.style.background = 'transparent'; btnChart.style.color = 'var(--navy)'; }
    if (btnTable) { btnTable.style.background = 'var(--navy)'; btnTable.style.color = '#fff'; }
  }
}
function insToggleBtns(section) {
  return '<div style="display:flex;gap:2px;margin-left:auto;">' +
    '<button id="ins-' + section + '-btn-chart" onclick="insightsToggle(\'' + section + '\')" style="padding:3px 10px;border:1px solid var(--navy);border-radius:5px 0 0 5px;font-size:10px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;background:var(--navy);color:#fff;">Chart</button>' +
    '<button id="ins-' + section + '-btn-table" onclick="insightsToggle(\'' + section + '\')" style="padding:3px 10px;border:1px solid var(--navy);border-radius:0 5px 5px 0;font-size:10px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;background:transparent;color:var(--navy);">Table</button>' +
  '</div>';
}
function buildInsightsPage() {
  var completed = PROJECTS.filter(function(p) { return p.status === 'Complete'; });
  var projStats = completed.map(function(p) {
    var hrs = getProjectHours(p.title);
    var personData = getProjectHoursByPerson(p.title);
    var durWeeks = null;
    if (p.start && (p.actual_end || p.end)) {
      var s = new Date(p.start + 'T12:00:00');
      var e = new Date((p.actual_end || p.end) + 'T12:00:00');
      durWeeks = Math.max(1, Math.round((e - s) / (7 * 86400000)));
    }
    var onTime = null;
    if (p.end && p.actual_end) { onTime = p.actual_end <= p.end; }
    return { title: p.title, category: p.category || 'Uncategorized', size: p.project_size || '\u2014',
      hours: hrs, teamSize: personData.length, durWeeks: durWeeks, start: p.start || '',
      end: p.actual_end || p.end || '', onTime: onTime, personData: personData };
  });
  projStats.sort(function(a, b) { return b.end > a.end ? 1 : b.end < a.end ? -1 : 0; });
  var totalHrs = projStats.reduce(function(s, p) { return s + p.hours; }, 0);
  var avgHrs = completed.length > 0 ? totalHrs / completed.length : 0;
  var withHours = projStats.filter(function(p) { return p.hours > 0; });
  var onTimeCount = projStats.filter(function(p) { return p.onTime === true; }).length;
  var lateCount = projStats.filter(function(p) { return p.onTime === false; }).length;
  var trackedCount = onTimeCount + lateCount;

  var kpis = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:28px;">';
  kpis += '<div class="res-kpi"><div class="kpi-label">Completed Projects</div><div class="kpi-value">' + completed.length + '</div></div>';
  kpis += '<div class="res-kpi"><div class="kpi-label">Total Hours Logged</div><div class="kpi-value">' + Math.round(totalHrs) + 'h</div></div>';
  kpis += '<div class="res-kpi"><div class="kpi-label">Avg Hours / Project' + calcInfoIcon('ytdHours') + '</div><div class="kpi-value">' + Math.round(avgHrs) + 'h</div></div>';
  kpis += '<div class="res-kpi"><div class="kpi-label">Projects with Time Data</div><div class="kpi-value">' + withHours.length + '</div></div>';
  if (trackedCount > 0) kpis += '<div class="res-kpi"><div class="kpi-label">On-Time Delivery</div><div class="kpi-value" style="color:' + (onTimeCount / trackedCount >= 0.7 ? '#22C55E' : '#F59E0B') + ';">' + Math.round(onTimeCount / trackedCount * 100) + '%</div></div>';
  kpis += '</div>';

  if (completed.length === 0) {
    return '<div style="padding:28px 32px;"><div style="margin-bottom:24px;"><div style="font-size:22px;font-weight:800;color:var(--navy);margin-bottom:4px;">\uD83D\uDCA1 Project Insights</div><div style="font-size:13px;color:var(--text-muted);">Retrospective data from completed projects.</div></div>' +
      '<div style="text-align:center;padding:60px;color:var(--text-muted);font-size:14px;background:#fff;border:1px solid #E8E6DF;border-radius:12px;"><div style="font-size:48px;margin-bottom:12px;">\uD83D\uDCCA</div><div style="font-weight:700;font-size:16px;margin-bottom:6px;color:var(--navy);">No completed projects yet</div><div>As projects are completed and time is logged, charts and retrospective data will appear here.</div></div></div>';
  }

  // === CHART 1: By Size ===
  var sizes = ['S', 'M', 'L', 'XL'];
  var sizeData = sizes.map(function(sz) {
    var items = projStats.filter(function(p) { return p.size === sz; });
    var withH = items.filter(function(p) { return p.hours > 0; });
    var totalH = items.reduce(function(s, p) { return s + p.hours; }, 0);
    var avgH = withH.length > 0 ? totalH / withH.length : 0;
    var durations = items.filter(function(p) { return p.durWeeks; }).map(function(p) { return p.durWeeks; });
    var avgDur = durations.length > 0 ? Math.round(durations.reduce(function(s, d) { return s + d; }, 0) / durations.length) : null;
    return { size: sz, count: items.length, avgH: Math.round(avgH), avgDur: avgDur, expected: SIZE_DURATIONS[sz] };
  });
  var sizeMaxH = Math.max.apply(null, sizeData.map(function(d) { return d.avgH; }).concat([10]));
  var svgW = 500, svgH = 220, padL = 45, padR = 20, padT = 15, padB = 40;
  var chartW = svgW - padL - padR, chartH = svgH - padT - padB;
  var barGroupW = chartW / 4, barW = barGroupW * 0.6;
  var sizeSvg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;display:block;">';
  for (var gi = 0; gi <= 4; gi++) {
    var gy = padT + chartH - (gi / 4 * chartH);
    sizeSvg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (svgW - padR) + '" y2="' + gy + '" stroke="#E8E6DF" stroke-width="0.5"/>';
    sizeSvg += '<text x="' + (padL - 6) + '" y="' + (gy + 3) + '" text-anchor="end" font-size="9" fill="#9CA3AF" font-family="Lato,sans-serif">' + Math.round(sizeMaxH * gi / 4) + 'h</text>';
  }
  sizeData.forEach(function(d, i) {
    var cx = padL + i * barGroupW + barGroupW / 2;
    var bh = sizeMaxH > 0 ? d.avgH / sizeMaxH * chartH : 0;
    var by = padT + chartH - bh;
    if (d.avgH > 0) {
      sizeSvg += '<rect x="' + (cx - barW / 2) + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="#002669" rx="3"/>';
      sizeSvg += '<text x="' + cx + '" y="' + (by - 5) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#002669" font-family="Lato,sans-serif">' + d.avgH + 'h</text>';
    }
    sizeSvg += '<text x="' + cx + '" y="' + (svgH - padB + 14) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#374151" font-family="Lato,sans-serif">' + d.size + '</text>';
    sizeSvg += '<text x="' + cx + '" y="' + (svgH - padB + 26) + '" text-anchor="middle" font-size="8" fill="#9CA3AF" font-family="Lato,sans-serif">' + d.count + ' proj' + (d.count !== 1 ? 's' : '') + '</text>';
  });
  sizeSvg += '</svg>';
  var bySizeTable = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:#fff;"><table class="member-table" style="margin:0;"><thead><tr><th>Size</th><th style="text-align:center;">Projects</th><th style="text-align:right;">Avg Hours</th><th style="text-align:right;">Avg Duration</th><th style="text-align:right;">Expected</th></tr></thead><tbody>' +
    sizeData.map(function(d) { return '<tr><td style="font-weight:700;color:var(--navy);">' + d.size + '</td><td style="text-align:center;">' + d.count + '</td><td style="text-align:right;">' + (d.avgH > 0 ? d.avgH + 'h' : '\u2014') + '</td><td style="text-align:right;">' + (d.avgDur ? d.avgDur + ' wks' : '\u2014') + '</td><td style="text-align:right;color:var(--text-muted);">' + d.expected + ' wks</td></tr>'; }).join('') + '</tbody></table></div>';

  // === CHART 2: By Category ===
  var catMap = {};
  projStats.forEach(function(p) { if (!catMap[p.category]) catMap[p.category] = { count: 0, hours: 0, withHours: 0 }; catMap[p.category].count++; catMap[p.category].hours += p.hours; if (p.hours > 0) catMap[p.category].withHours++; });
  var catEntries = Object.keys(catMap).map(function(cat) { return { category: cat, count: catMap[cat].count, hours: Math.round(catMap[cat].hours), avg: catMap[cat].withHours > 0 ? Math.round(catMap[cat].hours / catMap[cat].withHours) : 0 }; }).sort(function(a, b) { return b.hours - a.hours; });
  var catMaxH = catEntries.length > 0 ? catEntries[0].hours : 1;
  var catBarH = 24, catGap = 6, catSvgH = Math.max(120, catEntries.length * (catBarH + catGap) + 20);
  var catLabelW = 140, catChartW = 260;
  var catSvg = '<svg viewBox="0 0 ' + (catLabelW + catChartW + 50) + ' ' + catSvgH + '" style="width:100%;display:block;">';
  var catColors = ['#002669', '#1E40AF', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE'];
  catEntries.forEach(function(c, i) {
    var y = 10 + i * (catBarH + catGap);
    var bw = catMaxH > 0 ? c.hours / catMaxH * catChartW : 0;
    var fill = catColors[Math.min(i, catColors.length - 1)];
    var label = c.category.length > 22 ? c.category.slice(0, 20) + '\u2026' : c.category;
    catSvg += '<text x="' + (catLabelW - 4) + '" y="' + (y + catBarH / 2 + 4) + '" text-anchor="end" font-size="10" fill="#374151" font-family="Lato,sans-serif">' + esc(label) + '</text>';
    catSvg += '<rect x="' + catLabelW + '" y="' + y + '" width="' + Math.max(2, bw) + '" height="' + catBarH + '" fill="' + fill + '" rx="4"/>';
    catSvg += '<text x="' + (catLabelW + bw + 6) + '" y="' + (y + catBarH / 2 + 4) + '" font-size="10" font-weight="700" fill="#374151" font-family="Lato,sans-serif">' + c.hours + 'h</text>';
  });
  catSvg += '</svg>';
  var byCatTable = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:#fff;"><table class="member-table" style="margin:0;"><thead><tr><th>Category</th><th style="text-align:center;">Projects</th><th style="text-align:right;">Total Hours</th><th style="text-align:right;">Avg Hours</th></tr></thead><tbody>' +
    catEntries.map(function(c) { return '<tr><td style="font-weight:700;color:var(--navy);max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + esc(c.category) + '</td><td style="text-align:center;">' + c.count + '</td><td style="text-align:right;">' + c.hours + 'h</td><td style="text-align:right;">' + (c.avg > 0 ? c.avg + 'h' : '\u2014') + '</td></tr>'; }).join('') + '</tbody></table></div>';

  // === CHART 3: Timeline scatter ===
  var withDates = projStats.filter(function(p) { return p.end; });
  var tlSvg = '', tlTable = '';
  if (withDates.length > 0) {
    var tlW = 600, tlH = 200, tlPadL = 45, tlPadR = 20, tlPadT = 20, tlPadB = 35;
    var dates = withDates.map(function(p) { return new Date(p.end + 'T12:00:00').getTime(); });
    var minDate = Math.min.apply(null, dates), maxDate = Math.max.apply(null, dates);
    if (minDate === maxDate) { minDate -= 86400000 * 30; maxDate += 86400000 * 30; }
    var hrsArr = withDates.map(function(p) { return p.hours; });
    var maxHrs2 = Math.max.apply(null, hrsArr.concat([10]));
    var tlCW = tlW - tlPadL - tlPadR, tlCH = tlH - tlPadT - tlPadB;
    var sizeColors = { S: '#22C55E', M: '#3B82F6', L: '#F59E0B', XL: '#EF4444', '\u2014': '#9CA3AF' };
    tlSvg = '<svg viewBox="0 0 ' + tlW + ' ' + tlH + '" style="width:100%;display:block;">';
    for (var tgi = 0; tgi <= 4; tgi++) {
      var tgy = tlPadT + tlCH - (tgi / 4 * tlCH);
      tlSvg += '<line x1="' + tlPadL + '" y1="' + tgy + '" x2="' + (tlW - tlPadR) + '" y2="' + tgy + '" stroke="#E8E6DF" stroke-width="0.5"/>';
      tlSvg += '<text x="' + (tlPadL - 6) + '" y="' + (tgy + 3) + '" text-anchor="end" font-size="9" fill="#9CA3AF" font-family="Lato,sans-serif">' + Math.round(maxHrs2 * tgi / 4) + 'h</text>';
    }
    withDates.forEach(function(p) {
      var dt = new Date(p.end + 'T12:00:00').getTime();
      var x = tlPadL + (dt - minDate) / (maxDate - minDate) * tlCW;
      var y = tlPadT + tlCH - (p.hours / maxHrs2 * tlCH);
      var r = Math.max(4, Math.min(12, p.teamSize * 3));
      var col = sizeColors[p.size] || '#9CA3AF';
      tlSvg += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '" opacity="0.7" stroke="#fff" stroke-width="1.5"><title>' + esc(p.title) + ' \u00b7 ' + p.hours + 'h \u00b7 ' + p.end + '</title></circle>';
    });
    var tlMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (var tmi = 0; tmi <= 4; tmi++) {
      var tmDate = new Date(minDate + (maxDate - minDate) * tmi / 4);
      var tmX = tlPadL + tmi / 4 * tlCW;
      tlSvg += '<text x="' + tmX + '" y="' + (tlH - 6) + '" text-anchor="middle" font-size="9" fill="#9CA3AF" font-family="Lato,sans-serif">' + tlMonths[tmDate.getMonth()] + ' ' + tmDate.getFullYear() + '</text>';
    }
    tlSvg += '<text x="' + (tlPadL + tlCW) + '" y="' + (tlPadT - 4) + '" text-anchor="end" font-size="8" fill="#9CA3AF" font-family="Lato,sans-serif">Dot size = team \u00b7 Color: ';
    ['S','M','L','XL'].forEach(function(sz) { tlSvg += '<tspan fill="' + sizeColors[sz] + '">\u25CF</tspan><tspan fill="#9CA3AF"> ' + sz + ' </tspan>'; });
    tlSvg += '</text></svg>';
  }

  // Projects table
  var projRows = projStats.map(function(p) {
    var sizeBadge = p.size !== '\u2014' ? '<span style="display:inline-block;background:#F0E6FF;color:#6B21A8;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;">' + p.size + '</span>' : '';
    var onTimeBadge = '';
    if (p.onTime === true) onTimeBadge = '<span style="font-size:10px;color:#22C55E;font-weight:700;">On time</span>';
    if (p.onTime === false) onTimeBadge = '<span style="font-size:10px;color:#EF4444;font-weight:700;">Late</span>';
    return '<tr><td style="font-weight:700;color:var(--navy);max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="' + esc(p.title) + '">' + esc(p.title) + '</td><td style="text-align:center;">' + sizeBadge + '</td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--text-muted);">' + esc(p.category) + '</td><td style="text-align:right;font-weight:700;">' + (p.hours > 0 ? p.hours + 'h' : '\u2014') + '</td><td style="text-align:center;">' + (p.teamSize > 0 ? p.teamSize : '\u2014') + '</td><td style="text-align:right;">' + (p.durWeeks ? p.durWeeks + ' wks' : '\u2014') + '</td><td style="text-align:center;">' + onTimeBadge + '</td></tr>';
  }).join('');
  var projTable = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:#fff;"><table class="member-table" style="margin:0;"><thead><tr><th>Project</th><th style="text-align:center;">Size</th><th>Category</th><th style="text-align:right;">Hours</th><th style="text-align:center;">Team</th><th style="text-align:right;">Duration</th><th style="text-align:center;">Delivery</th></tr></thead><tbody>' + projRows + '</tbody></table></div>';

  // === CHART 4: Team donut ===
  var teamMap = {};
  projStats.forEach(function(p) { p.personData.forEach(function(pd) { teamMap[pd.name] = (teamMap[pd.name] || 0) + pd.hours; }); });
  var teamEntries = Object.keys(teamMap).map(function(n) { return { name: n, hours: Math.round(teamMap[n] * 10) / 10 }; }).sort(function(a, b) { return b.hours - a.hours; });
  var teamTotal = teamEntries.reduce(function(s, t) { return s + t.hours; }, 0);
  var donutSvg = '', teamTable = '';
  if (teamEntries.length > 0 && teamTotal > 0) {
    var donutR = 70, donutHole = 45, donutCx = 100, donutCy = 100;
    var donutColors = ['#002669', '#1E40AF', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#C24200', '#83AC16'];
    var startAngle = -Math.PI / 2;
    donutSvg = '<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">';
    donutSvg += '<svg viewBox="0 0 200 200" style="width:180px;height:180px;flex-shrink:0;">';
    teamEntries.forEach(function(t, i) {
      var pct = t.hours / teamTotal;
      var angle = pct * 2 * Math.PI;
      var endAngle = startAngle + angle;
      var largeArc = angle > Math.PI ? 1 : 0;
      var x1 = donutCx + donutR * Math.cos(startAngle), y1 = donutCy + donutR * Math.sin(startAngle);
      var x2 = donutCx + donutR * Math.cos(endAngle), y2 = donutCy + donutR * Math.sin(endAngle);
      var ix1 = donutCx + donutHole * Math.cos(endAngle), iy1 = donutCy + donutHole * Math.sin(endAngle);
      var ix2 = donutCx + donutHole * Math.cos(startAngle), iy2 = donutCy + donutHole * Math.sin(startAngle);
      var col = donutColors[i % donutColors.length];
      if (pct >= 0.999) { donutSvg += '<circle cx="' + donutCx + '" cy="' + donutCy + '" r="' + donutR + '" fill="' + col + '"/><circle cx="' + donutCx + '" cy="' + donutCy + '" r="' + donutHole + '" fill="#fff"/>'; }
      else { donutSvg += '<path d="M' + x1 + ',' + y1 + ' A' + donutR + ',' + donutR + ' 0 ' + largeArc + ',1 ' + x2 + ',' + y2 + ' L' + ix1 + ',' + iy1 + ' A' + donutHole + ',' + donutHole + ' 0 ' + largeArc + ',0 ' + ix2 + ',' + iy2 + 'Z" fill="' + col + '"><title>' + esc(t.name) + ': ' + t.hours + 'h (' + Math.round(pct * 100) + '%)</title></path>'; }
      startAngle = endAngle;
    });
    donutSvg += '<text x="' + donutCx + '" y="' + (donutCy - 4) + '" text-anchor="middle" font-size="18" font-weight="800" fill="#002669" font-family="Lato,sans-serif">' + Math.round(teamTotal) + 'h</text>';
    donutSvg += '<text x="' + donutCx + '" y="' + (donutCy + 12) + '" text-anchor="middle" font-size="9" fill="#9CA3AF" font-family="Lato,sans-serif">total</text></svg>';
    donutSvg += '<div style="flex:1;min-width:160px;">';
    teamEntries.forEach(function(t, i) {
      var col = donutColors[i % donutColors.length];
      donutSvg += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;"><div style="width:10px;height:10px;border-radius:2px;background:' + col + ';flex-shrink:0;"></div><span style="flex:1;color:#374151;font-weight:600;">' + esc(t.name) + '</span><span style="font-weight:700;color:var(--navy);">' + t.hours + 'h</span><span style="font-size:10px;color:#9CA3AF;min-width:30px;text-align:right;">' + Math.round(t.hours / teamTotal * 100) + '%</span></div>';
    });
    donutSvg += '</div></div>';
    teamTable = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:#fff;"><table class="member-table" style="margin:0;"><thead><tr><th>Team Member</th><th style="text-align:right;">Hours</th><th style="text-align:right;">% of Total</th></tr></thead><tbody>' +
      teamEntries.map(function(t) { return '<tr><td style="font-weight:700;color:var(--navy);">' + esc(t.name) + '</td><td style="text-align:right;">' + t.hours + 'h</td><td style="text-align:right;">' + Math.round(t.hours / teamTotal * 100) + '%</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  // === ASSEMBLE PAGE ===
  var html = '<div style="padding:28px 32px;">';
  html += '<div style="margin-bottom:24px;"><div style="font-size:22px;font-weight:800;color:var(--navy);margin-bottom:4px;">\uD83D\uDCA1 Project Insights</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);">Retrospective data from completed projects. As you log more time, this becomes your reference library for future estimation.</div></div>';
  html += kpis;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;">';
  html += '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Effort by project size</div>' + insToggleBtns('size') + '</div><div id="ins-size-chart" style="padding:8px 0;">' + sizeSvg + '</div><div id="ins-size-table" style="display:none;">' + bySizeTable + '</div></div>';
  html += '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Effort by category</div>' + insToggleBtns('cat') + '</div><div id="ins-cat-chart" style="padding:8px 0;">' + catSvg + '</div><div id="ins-cat-table" style="display:none;">' + byCatTable + '</div></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;">';
  html += '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Completion timeline</div>' + insToggleBtns('timeline') + '</div><div id="ins-timeline-chart" style="padding:8px 0;">' + (tlSvg || '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:12px;">Not enough date data yet</div>') + '</div><div id="ins-timeline-table" style="display:none;">' + projTable + '</div></div>';
  html += '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Hours by team member</div>' + insToggleBtns('team') + '</div><div id="ins-team-chart" style="padding:8px 0;">' + (donutSvg || '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:12px;">No time entries recorded yet</div>') + '</div><div id="ins-team-table" style="display:none;">' + (teamTable || '') + '</div></div>';
  html += '</div></div>';
  return html;
}
