// ─────────────────────────────────────────────────────────────────────
// tabs/insights.js — Insights / Analytics tab
//
// Project retrospectives for completed work. Builds a reference
// library of actual effort by category and size over time.
//
// Includes Duration Calibration (Phase 1): per-project planned weeks
// (end_date or working_due) vs actual weeks (actual_end − start_date),
// rolled up by category, size, and partner department, for projects
// completed in the last 12 months.
//
// Forward references: PROJECTS, SIZE_DURATIONS, getProjectHours,
// getProjectHoursByPerson, calcInfoIcon — defined in inline script.
// Backward references: esc.
// ─────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════
//  INSIGHTS / ANALYTICS TAB
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

// ── Duration Calibration toggle state ─────────────────────────────────
// 'end_date'    = compare against the original commitment (locked at creation).
// 'working_due' = compare against the latest team forecast (edited over time).
let _durCalibMode = 'end_date';
function durCalibToggle(mode) {
  _durCalibMode = mode;
  document.getElementById('content-area').innerHTML = buildInsightsPage();
}

// ── Calibration helpers ───────────────────────────────────────────────
function _calibMedian(arr) {
  if (!arr || arr.length === 0) return null;
  var sorted = arr.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function _calibConf(n) {
  if (n >= 10) return { label: 'High',         bg: '#DCFCE7', fg: '#166534' };
  if (n >=  5) return { label: 'Medium',       bg: '#FEF9C3', fg: '#854D0E' };
  if (n >=  3) return { label: 'Low',          bg: '#F3F4F6', fg: '#6B7280' };
  return            { label: 'Insufficient', bg: '#F3F4F6', fg: '#9CA3AF' };
}
function _calibMultColor(m) {
  if (m == null) return { bg: '#F3F4F6', fg: '#9CA3AF' };
  if (m < 0.85)  return { bg: '#DBEAFE', fg: '#1E3A8A' };
  if (m <= 1.15) return { bg: '#DCFCE7', fg: '#166534' };
  if (m <= 1.50) return { bg: '#FEF9C3', fg: '#854D0E' };
  if (m <= 2.00) return { bg: '#FED7AA', fg: '#9A3412' };
  return              { bg: '#FECACA', fg: '#991B1B' };
}
function _calibMultChip(m) {
  if (m == null) return '<span style="color:var(--text-muted);">—</span>';
  var c = _calibMultColor(m);
  return '<span style="display:inline-block;background:' + c.bg + ';color:' + c.fg +
    ';padding:2px 8px;border-radius:10px;font-weight:800;font-variant-numeric:tabular-nums;font-size:12px;">' +
    m.toFixed(2) + '×</span>';
}
function _calibConfChip(conf) {
  return '<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;text-transform:uppercase;letter-spacing:0.04em;background:' +
    conf.bg + ';color:' + conf.fg + ';">' + conf.label + '</span>';
}

// Aggregate calibration projects by a key function.
// Returns array of { key, n, nMult, medianPlanned, medianActual, mult, onTimePct, conf }.
function _calibAggregate(items, keyFn) {
  var groups = {};
  items.forEach(function(p) {
    var k = keyFn(p) || 'Uncategorized';
    if (!groups[k]) groups[k] = [];
    groups[k].push(p);
  });
  var plannedField = _durCalibMode === 'end_date' ? 'plannedEndWeeks' : 'plannedWdWeeks';
  return Object.keys(groups).map(function(k) {
    var members = groups[k];
    var multValues = [];
    var plannedValues = [];
    var actualValues = [];
    members.forEach(function(p) {
      var planned = p[plannedField];
      if (planned != null) plannedValues.push(planned);
      if (p.actualWeeks != null) actualValues.push(p.actualWeeks);
      if (planned != null && planned > 0 && p.actualWeeks != null) {
        multValues.push(p.actualWeeks / planned);
      }
    });
    var onTimeMembers = members.filter(function(p) { return p.onTime !== null; });
    var onTimeCount   = onTimeMembers.filter(function(p) { return p.onTime === true; }).length;
    return {
      key: k,
      n: members.length,
      nMult: multValues.length,
      medianPlanned: _calibMedian(plannedValues),
      medianActual:  _calibMedian(actualValues),
      mult:          _calibMedian(multValues),
      onTimePct:     onTimeMembers.length > 0 ? Math.round(onTimeCount / onTimeMembers.length * 100) : null,
      conf:          _calibConf(multValues.length)
    };
  });
}

function _calibRenderTable(title, keyColLabel, data) {
  var html = '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
  html += '<div style="font-size:14px;font-weight:800;color:var(--navy);margin-bottom:12px;">' + esc(title) + '</div>';
  if (data.length === 0) {
    html += '<div style="color:var(--text-muted);font-size:12px;font-style:italic;">No projects completed in this window with planned & actual dates set.</div></div>';
    return html;
  }
  html += '<div style="overflow-x:auto;"><table class="member-table" style="margin:0;">';
  html += '<thead><tr>';
  html += '<th>' + esc(keyColLabel) + '</th>';
  html += '<th style="text-align:right;">Projects</th>';
  html += '<th style="text-align:right;">Median planned</th>';
  html += '<th style="text-align:right;">Median actual</th>';
  html += '<th style="text-align:right;">Multiplier' + calcInfoIcon('calibMultiplier') + '</th>';
  html += '<th style="text-align:center;">On-time %</th>';
  html += '<th style="text-align:center;">Confidence</th>';
  html += '</tr></thead><tbody>';
  data.forEach(function(g) {
    var dim = g.nMult < 3 ? 'opacity:0.6;' : '';
    html += '<tr style="' + dim + '">';
    html += '<td style="font-weight:700;color:var(--navy);max-width:240px;overflow:hidden;text-overflow:ellipsis;" title="' + esc(g.key) + '">' + esc(g.key) + '</td>';
    html += '<td style="text-align:right;">' + g.n + '</td>';
    html += '<td style="text-align:right;">' + (g.medianPlanned != null ? g.medianPlanned.toFixed(1) + ' wk' : '—') + '</td>';
    html += '<td style="text-align:right;">' + (g.medianActual != null ? g.medianActual.toFixed(1) + ' wk' : '—') + '</td>';
    html += '<td style="text-align:right;">' + _calibMultChip(g.mult) + '</td>';
    html += '<td style="text-align:center;">' + (g.onTimePct != null ? g.onTimePct + '%' : '—') + '</td>';
    html += '<td style="text-align:center;">' + _calibConfChip(g.conf) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  return html;
}

function _calibRenderSizeTable(data) {
  var sizes = ['S', 'M', 'L', 'XL'];
  var byKey = {};
  data.forEach(function(g) { byKey[g.key] = g; });
  var html = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:#fff;"><table class="member-table" style="margin:0;">';
  html += '<thead><tr><th>Size</th>';
  html += '<th style="text-align:right;">Projects</th>';
  html += '<th style="text-align:right;">Default</th>';
  html += '<th style="text-align:right;">Median actual</th>';
  html += '<th style="text-align:right;">Multiplier' + calcInfoIcon('calibMultiplier') + '</th>';
  html += '<th>Recommendation</th>';
  html += '</tr></thead><tbody>';
  sizes.forEach(function(sz) {
    var g = byKey[sz];
    var defaultWk = SIZE_DURATIONS[sz];
    var n = g ? g.nMult : 0;
    var rec;
    if (n < 3) {
      rec = '<span style="color:var(--text-muted);font-style:italic;font-size:11px;">Need more completed ' + sz + ' projects (n=' + n + ')</span>';
    } else if (g.mult >= 1.20) {
      var newUp = Math.round(defaultWk * g.mult);
      rec = '<span style="color:#B91C1C;font-style:italic;font-size:11px;">↑ Consider raising default to ' + newUp + ' wk</span>';
    } else if (g.mult <= 0.85) {
      var newDn = Math.max(1, Math.round(defaultWk * g.mult));
      rec = '<span style="color:#166534;font-style:italic;font-size:11px;">↓ Consider lowering default to ' + newDn + ' wk</span>';
    } else {
      rec = '<span style="color:var(--text-muted);font-style:italic;font-size:11px;">→ Default is close; hold</span>';
    }
    html += '<tr><td style="font-weight:700;color:var(--navy);">' + sz + '</td>';
    html += '<td style="text-align:right;">' + (g ? g.n : 0) + '</td>';
    html += '<td style="text-align:right;color:var(--text-muted);">' + defaultWk + ' wk</td>';
    html += '<td style="text-align:right;">' + (g && g.medianActual != null ? g.medianActual.toFixed(1) + ' wk' : '—') + '</td>';
    html += '<td style="text-align:right;">' + (g ? _calibMultChip(g.mult) : '—') + '</td>';
    html += '<td>' + rec + '</td></tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function buildInsightsPage() {
  var completed = PROJECTS.filter(function(p) { return p.status === 'Complete'; });

  // Weeks between two YYYY-MM-DD date strings; null if either missing or non-positive.
  function _weeksBetween(startStr, endStr) {
    if (!startStr || !endStr) return null;
    var s = new Date(startStr + 'T12:00:00');
    var e = new Date(endStr + 'T12:00:00');
    var w = (e - s) / (7 * 86400000);
    return w > 0 ? w : null;
  }

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
    return {
      title: p.title,
      category: p.category || 'Uncategorized',
      size: p.project_size || '—',
      partner: p.partner_dept || 'Internal',
      hours: hrs,
      teamSize: personData.length,
      durWeeks: durWeeks,
      start: p.start || '',
      end: p.actual_end || p.end || '',
      actualEndStr: p.actual_end || '',
      onTime: onTime,
      personData: personData,
      plannedEndWeeks: _weeksBetween(p.start, p.end),
      plannedWdWeeks: _weeksBetween(p.start, p.working_due),
      actualWeeks:    _weeksBetween(p.start, p.actual_end)
    };
  });
  projStats.sort(function(a, b) { return b.end > a.end ? 1 : b.end < a.end ? -1 : 0; });

  // 12-month window for calibration: completed (actual_end set) in the last 365 days.
  var nowMs = Date.now();
  var twelveMoAgoMs = nowMs - 365 * 86400000;
  var calibProjects = projStats.filter(function(p) {
    if (!p.actualEndStr) return false;
    return new Date(p.actualEndStr + 'T12:00:00').getTime() >= twelveMoAgoMs;
  });

  // Calibration aggregations
  var calibByCategory = _calibAggregate(calibProjects, function(p) { return p.category; })
    .sort(function(a, b) { return b.n - a.n; });
  var calibBySize = _calibAggregate(calibProjects, function(p) { return p.size; });

  // Per partner: bucket departments with n<5 into "Other" to avoid misleading small-sample numbers.
  var partnerRaw = _calibAggregate(calibProjects, function(p) { return p.partner; });
  var partnerKept = partnerRaw.filter(function(g) { return g.n >= 5; })
    .sort(function(a, b) { return b.n - a.n; });
  var smallPartnerKeys = partnerRaw.filter(function(g) { return g.n < 5; }).map(function(g) { return g.key; });
  var smallPartnerProjects = calibProjects.filter(function(p) { return smallPartnerKeys.indexOf(p.partner) >= 0; });
  var calibByPartner = partnerKept.slice();
  if (smallPartnerProjects.length > 0) {
    var otherLabel = 'Other (' + smallPartnerKeys.length + ' dept' + (smallPartnerKeys.length !== 1 ? 's' : '') + ' with n<5)';
    var otherAgg = _calibAggregate(smallPartnerProjects, function() { return otherLabel; });
    calibByPartner = calibByPartner.concat(otherAgg);
  }

  // Team-wide multiplier (for KPI strip)
  var plannedField = _durCalibMode === 'end_date' ? 'plannedEndWeeks' : 'plannedWdWeeks';
  var allMults = [];
  calibProjects.forEach(function(p) {
    var pl = p[plannedField];
    if (pl != null && pl > 0 && p.actualWeeks != null) allMults.push(p.actualWeeks / pl);
  });
  var teamMult = _calibMedian(allMults);

  // Most-divergent category (only if it has enough samples to be meaningful)
  var mostDivergent = calibByCategory.filter(function(g) { return g.mult != null && g.nMult >= 3; })
    .sort(function(a, b) { return Math.abs(b.mult - 1) - Math.abs(a.mult - 1); })[0];

  var totalHrs = projStats.reduce(function(s, p) { return s + p.hours; }, 0);
  var avgHrs = completed.length > 0 ? totalHrs / completed.length : 0;
  var withHours = projStats.filter(function(p) { return p.hours > 0; });
  var onTimeCount = projStats.filter(function(p) { return p.onTime === true; }).length;
  var lateCount = projStats.filter(function(p) { return p.onTime === false; }).length;
  var trackedCount = onTimeCount + lateCount;

  var kpis = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:28px;">';
  kpis += '<div class="res-kpi"><div class="kpi-label">Completed Projects</div><div class="kpi-value">' + completed.length + '</div></div>';
  kpis += '<div class="res-kpi"><div class="kpi-label">Total Hours Logged</div><div class="kpi-value">' + Math.round(totalHrs) + 'h</div></div>';
  kpis += '<div class="res-kpi"><div class="kpi-label">Avg Hours / Project' + calcInfoIcon('ytdHours') + '</div><div class="kpi-value">' + Math.round(avgHrs) + 'h</div></div>';
  kpis += '<div class="res-kpi"><div class="kpi-label">Projects with Time Data</div><div class="kpi-value">' + withHours.length + '</div></div>';
  if (trackedCount > 0) kpis += '<div class="res-kpi"><div class="kpi-label">On-Time Delivery</div><div class="kpi-value" style="color:' + (onTimeCount / trackedCount >= 0.7 ? '#22C55E' : '#F59E0B') + ';">' + Math.round(onTimeCount / trackedCount * 100) + '%</div></div>';
  if (teamMult != null) kpis += '<div class="res-kpi"><div class="kpi-label">Schedule Multiplier (12mo)</div><div class="kpi-value">' + teamMult.toFixed(2) + '×</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px;">actual ÷ planned weeks</div></div>';
  if (mostDivergent) kpis += '<div class="res-kpi"><div class="kpi-label">Most Divergent Category</div><div class="kpi-value" style="font-size:14px;line-height:1.4;">' + esc(mostDivergent.key) + '<br><span style="font-weight:600;font-size:12px;color:var(--text-muted);">' + mostDivergent.mult.toFixed(2) + '× (n=' + mostDivergent.nMult + ')</span></div></div>';
  kpis += '</div>';

  if (completed.length === 0) {
    return '<div style="padding:28px 32px;"><div style="margin-bottom:24px;"><div style="font-size:22px;font-weight:800;color:var(--navy);margin-bottom:4px;">💡 Project Insights</div><div style="font-size:13px;color:var(--text-muted);">Retrospective data from completed projects.</div></div>' +
      '<div style="text-align:center;padding:60px;color:var(--text-muted);font-size:14px;background:#fff;border:1px solid #E8E6DF;border-radius:12px;"><div style="font-size:48px;margin-bottom:12px;">📊</div><div style="font-weight:700;font-size:16px;margin-bottom:6px;color:var(--navy);">No completed projects yet</div><div>As projects are completed and time is logged, charts and retrospective data will appear here.</div></div></div>';
  }

  // === DURATION CALIBRATION SECTION ===
  var calibSection = '<div style="margin-bottom:28px;">';
  calibSection += '<div style="font-size:18px;font-weight:800;color:var(--navy);margin-bottom:4px;">Duration Calibration</div>';
  calibSection += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">Planned weeks vs actual weeks for projects completed in the last 12 months (' + calibProjects.length + ' usable). Median actual ÷ median planned, sliced by category, size, and partner department.</div>';
  // Toggle
  function _toggleBtn(mode, label) {
    var active = (_durCalibMode === mode);
    return '<button onclick="durCalibToggle(\'' + mode + '\')" style="padding:4px 12px;border:0;background:' +
      (active ? 'var(--navy)' : 'transparent') + ';color:' + (active ? '#fff' : 'var(--navy)') +
      ';font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;text-transform:uppercase;letter-spacing:0.04em;">' + label + '</button>';
  }
  calibSection += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">';
  calibSection += '<span style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Planned =</span>';
  calibSection += '<div style="display:inline-flex;border:1px solid var(--navy);border-radius:6px;overflow:hidden;">' + _toggleBtn('end_date', 'vs end_date') + _toggleBtn('working_due', 'vs working_due') + '</div>';
  calibSection += '<span style="font-size:11px;color:var(--text-muted);">' +
    (_durCalibMode === 'end_date' ? 'Original commitment, locked at project creation.' : 'Latest team forecast (working_due).') + '</span>';
  calibSection += '</div>';
  calibSection += _calibRenderTable('A · By Category', 'Category', calibByCategory);
  calibSection += _calibRenderTable('C · By Partner Department', 'Partner', calibByPartner);
  calibSection += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;margin-top:-8px;margin-bottom:0;">Departments with fewer than 5 completed projects are grouped into "Other" to avoid misleading small-sample numbers. Rows with fewer than 3 multipliers are dimmed.</div>';
  calibSection += '</div>';

  // === CHART 1: By Size — hours-bar chart unchanged; table replaced with calibration version ===
  var sizes = ['S', 'M', 'L', 'XL'];
  var sizeData = sizes.map(function(sz) {
    var items = projStats.filter(function(p) { return p.size === sz; });
    var withH = items.filter(function(p) { return p.hours > 0; });
    var totalH = items.reduce(function(s, p) { return s + p.hours; }, 0);
    var avgH = withH.length > 0 ? totalH / withH.length : 0;
    return { size: sz, count: items.length, avgH: Math.round(avgH) };
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
  // Replace the old hours-focused size table with the new B-section calibration table.
  var bySizeTable = _calibRenderSizeTable(calibBySize);

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
    var label = c.category.length > 22 ? c.category.slice(0, 20) + '…' : c.category;
    catSvg += '<text x="' + (catLabelW - 4) + '" y="' + (y + catBarH / 2 + 4) + '" text-anchor="end" font-size="10" fill="#374151" font-family="Lato,sans-serif">' + esc(label) + '</text>';
    catSvg += '<rect x="' + catLabelW + '" y="' + y + '" width="' + Math.max(2, bw) + '" height="' + catBarH + '" fill="' + fill + '" rx="4"/>';
    catSvg += '<text x="' + (catLabelW + bw + 6) + '" y="' + (y + catBarH / 2 + 4) + '" font-size="10" font-weight="700" fill="#374151" font-family="Lato,sans-serif">' + c.hours + 'h</text>';
  });
  catSvg += '</svg>';
  var byCatTable = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:#fff;"><table class="member-table" style="margin:0;"><thead><tr><th>Category</th><th style="text-align:center;">Projects</th><th style="text-align:right;">Total Hours</th><th style="text-align:right;">Avg Hours</th></tr></thead><tbody>' +
    catEntries.map(function(c) { return '<tr><td style="font-weight:700;color:var(--navy);max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + esc(c.category) + '</td><td style="text-align:center;">' + c.count + '</td><td style="text-align:right;">' + c.hours + 'h</td><td style="text-align:right;">' + (c.avg > 0 ? c.avg + 'h' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>';

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
    var sizeColors = { S: '#22C55E', M: '#3B82F6', L: '#F59E0B', XL: '#EF4444', '—': '#9CA3AF' };
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
      tlSvg += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '" opacity="0.7" stroke="#fff" stroke-width="1.5"><title>' + esc(p.title) + ' · ' + p.hours + 'h · ' + p.end + '</title></circle>';
    });
    var tlMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (var tmi = 0; tmi <= 4; tmi++) {
      var tmDate = new Date(minDate + (maxDate - minDate) * tmi / 4);
      var tmX = tlPadL + tmi / 4 * tlCW;
      tlSvg += '<text x="' + tmX + '" y="' + (tlH - 6) + '" text-anchor="middle" font-size="9" fill="#9CA3AF" font-family="Lato,sans-serif">' + tlMonths[tmDate.getMonth()] + ' ' + tmDate.getFullYear() + '</text>';
    }
    tlSvg += '<text x="' + (tlPadL + tlCW) + '" y="' + (tlPadT - 4) + '" text-anchor="end" font-size="8" fill="#9CA3AF" font-family="Lato,sans-serif">Dot size = team · Color: ';
    ['S','M','L','XL'].forEach(function(sz) { tlSvg += '<tspan fill="' + sizeColors[sz] + '">●</tspan><tspan fill="#9CA3AF"> ' + sz + ' </tspan>'; });
    tlSvg += '</text></svg>';
  }

  // Projects table
  var projRows = projStats.map(function(p) {
    var sizeBadge = p.size !== '—' ? '<span style="display:inline-block;background:#F0E6FF;color:#6B21A8;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;">' + p.size + '</span>' : '';
    var onTimeBadge = '';
    if (p.onTime === true) onTimeBadge = '<span style="font-size:10px;color:#22C55E;font-weight:700;">On time</span>';
    if (p.onTime === false) onTimeBadge = '<span style="font-size:10px;color:#EF4444;font-weight:700;">Late</span>';
    return '<tr><td style="font-weight:700;color:var(--navy);max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="' + esc(p.title) + '">' + esc(p.title) + '</td><td style="text-align:center;">' + sizeBadge + '</td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--text-muted);">' + esc(p.category) + '</td><td style="text-align:right;font-weight:700;">' + (p.hours > 0 ? p.hours + 'h' : '—') + '</td><td style="text-align:center;">' + (p.teamSize > 0 ? p.teamSize : '—') + '</td><td style="text-align:right;">' + (p.durWeeks ? p.durWeeks + ' wks' : '—') + '</td><td style="text-align:center;">' + onTimeBadge + '</td></tr>';
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
  html += '<div style="margin-bottom:24px;"><div style="font-size:22px;font-weight:800;color:var(--navy);margin-bottom:4px;">💡 Project Insights</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);">Retrospective data from completed projects. As you log more time, this becomes your reference library for future estimation.</div></div>';
  html += kpis;
  html += calibSection;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;">';
  html += '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Effort by project size <span style="font-size:11px;font-weight:600;color:var(--text-muted);margin-left:6px;">B · Size calibration in Table view</span></div>' + insToggleBtns('size') + '</div><div id="ins-size-chart" style="padding:8px 0;">' + sizeSvg + '</div><div id="ins-size-table" style="display:none;">' + bySizeTable + '</div></div>';
  html += '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Effort by category</div>' + insToggleBtns('cat') + '</div><div id="ins-cat-chart" style="padding:8px 0;">' + catSvg + '</div><div id="ins-cat-table" style="display:none;">' + byCatTable + '</div></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;">';
  html += '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Completion timeline</div>' + insToggleBtns('timeline') + '</div><div id="ins-timeline-chart" style="padding:8px 0;">' + (tlSvg || '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:12px;">Not enough date data yet</div>') + '</div><div id="ins-timeline-table" style="display:none;">' + projTable + '</div></div>';
  html += '<div style="background:#fff;border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Hours by team member</div>' + insToggleBtns('team') + '</div><div id="ins-team-chart" style="padding:8px 0;">' + (donutSvg || '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:12px;">No time entries recorded yet</div>') + '</div><div id="ins-team-table" style="display:none;">' + (teamTable || '') + '</div></div>';
  html += '</div></div>';
  return html;
}
