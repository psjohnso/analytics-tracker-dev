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
// Median schedule multiplier (actual ÷ planned weeks) per completion calendar
// quarter, oldest → newest. Used by the "are we learning to estimate?" trend tile.
function _calibQuarterlyTrend(projStats, plannedField, maxQuarters) {
  var buckets = {};
  (projStats || []).forEach(function(p) {
    if (!p.actualEndStr) return;
    var pl = p[plannedField];
    if (pl == null || pl <= 0 || p.actualWeeks == null) return;
    var d = new Date(p.actualEndStr + 'T12:00:00');
    if (isNaN(d)) return;
    var q = d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
    (buckets[q] = buckets[q] || []).push(p.actualWeeks / pl);
  });
  var series = Object.keys(buckets).sort().map(function(k) {
    return { q: k, mult: _calibMedian(buckets[k]), n: buckets[k].length };
  });
  if (maxQuarters && series.length > maxQuarters) series = series.slice(series.length - maxQuarters);
  return series;
}
function _calibQLabel(q) { var parts = String(q).split('-Q'); return 'Q' + parts[1] + " '" + parts[0].slice(2); }
// "Are we learning to estimate?" — sparkline of the quarterly median multiplier
// trending toward 1.0×. Uses the same planned-mode toggle as the rest of the section.
function _calibTrendTile(projStats, plannedField) {
  var series = _calibQuarterlyTrend(projStats, plannedField, 8).filter(function(s) { return s.n >= 2; });
  if (series.length < 2) {
    return '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:12px;color:var(--text-muted);">Estimate-accuracy trend needs at least two completion quarters with data — it will appear as more projects complete.</div>';
  }
  var latest = series[series.length - 1];
  var earlier = series.slice(0, series.length - 1);
  var avgEarlierDev = earlier.reduce(function(s, p) { return s + Math.abs(p.mult - 1); }, 0) / earlier.length;
  var lastDev = Math.abs(latest.mult - 1);
  var eps = 0.05;
  var trend = (lastDev < avgEarlierDev - eps) ? 'improving' : (lastDev > avgEarlierDev + eps) ? 'worsening' : 'flat';
  var trendColor = trend === 'improving' ? '#166534' : trend === 'worsening' ? '#991B1B' : '#6B7280';
  var trendLabel = trend === 'improving' ? '↘ converging on 1.0×' : trend === 'worsening' ? '↗ drifting from 1.0×' : '→ holding steady';

  var W = 280, H = 70, padL = 8, padR = 26, padT = 12, padB = 18;
  var vals = series.map(function(s) { return s.mult; }).concat([1]);
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (hi === lo) { hi += 0.5; lo -= 0.5; }
  var cw = W - padL - padR, ch = H - padT - padB;
  var x = function(i) { return padL + (series.length === 1 ? cw / 2 : (i / (series.length - 1)) * cw); };
  var y = function(v) { return padT + ch - ((v - lo) / (hi - lo)) * ch; };
  var y1 = y(1);
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:' + W + 'px;display:block;">';
  svg += '<line x1="' + padL + '" y1="' + y1 + '" x2="' + (W - padR) + '" y2="' + y1 + '" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="3,3"/>';
  svg += '<text x="' + (W - padR + 3) + '" y="' + (y1 + 3) + '" font-size="8" fill="#9CA3AF" font-family="Lato,sans-serif">1.0×</text>';
  svg += '<polyline points="' + series.map(function(s, i) { return x(i) + ',' + y(s.mult); }).join(' ') + '" fill="none" stroke="#002669" stroke-width="1.5"/>';
  series.forEach(function(s, i) {
    var c = _calibMultColor(s.mult);
    svg += '<circle cx="' + x(i) + '" cy="' + y(s.mult) + '" r="' + (i === series.length - 1 ? 4 : 3) + '" fill="' + c.fg + '"><title>' + _calibQLabel(s.q) + ': ' + s.mult.toFixed(2) + '× (n=' + s.n + ')</title></circle>';
  });
  svg += '<text x="' + x(0) + '" y="' + (H - 4) + '" text-anchor="start" font-size="8" fill="#9CA3AF" font-family="Lato,sans-serif">' + _calibQLabel(series[0].q) + '</text>';
  svg += '<text x="' + x(series.length - 1) + '" y="' + (H - 4) + '" text-anchor="end" font-size="8" fill="#9CA3AF" font-family="Lato,sans-serif">' + _calibQLabel(latest.q) + '</text>';
  svg += '</svg>';

  var html = '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:14px 18px;margin-bottom:16px;">';
  html += '<div style="font-size:13px;font-weight:800;color:var(--navy);margin-bottom:8px;">Are we learning to estimate?</div>';
  html += '<div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap;">';
  html += '<div style="flex:0 0 auto;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);">Latest quarter</div>';
  html += '<div style="font-size:26px;font-weight:800;color:var(--navy);line-height:1.1;">' + latest.mult.toFixed(2) + '×</div>';
  html += '<div style="font-size:11px;font-weight:700;color:' + trendColor + ';">' + trendLabel + '</div></div>';
  html += '<div style="flex:1;min-width:220px;">' + svg + '</div>';
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;margin-top:6px;">Median actual ÷ planned weeks by completion quarter (last ' + series.length + '). Closer to 1.0× = estimates matching reality. Quarters with fewer than 2 completed projects are omitted.</div>';
  html += '</div>';
  return html;
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
  var html = '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
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
  var html = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:var(--white);"><table class="member-table" style="margin:0;">';
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
  // Scope to the current team's projects (no-op when team scoping is off).
  var completed = (typeof teamProjects === 'function' ? teamProjects() : PROJECTS).filter(function(p) { return p.status === 'Complete'; });

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
      '<div style="text-align:center;padding:60px;color:var(--text-muted);font-size:14px;background:var(--white);border:1px solid #E8E6DF;border-radius:12px;"><div style="font-size:48px;margin-bottom:12px;">📊</div><div style="font-weight:700;font-size:16px;margin-bottom:6px;color:var(--navy);">No completed projects yet</div><div>As projects are completed and time is logged, charts and retrospective data will appear here.</div></div></div>';
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
  calibSection += _calibTrendTile(projStats, plannedField);
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
  var byCatTable = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:var(--white);"><table class="member-table" style="margin:0;"><thead><tr><th>Category</th><th style="text-align:center;">Projects</th><th style="text-align:right;">Total Hours</th><th style="text-align:right;">Avg Hours</th></tr></thead><tbody>' +
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
  var projTable = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:var(--white);"><table class="member-table" style="margin:0;"><thead><tr><th>Project</th><th style="text-align:center;">Size</th><th>Category</th><th style="text-align:right;">Hours</th><th style="text-align:center;">Team</th><th style="text-align:right;">Duration</th><th style="text-align:center;">Delivery</th></tr></thead><tbody>' + projRows + '</tbody></table></div>';

  // === CHART 4: Team donut ===
  var teamMap = {};
  projStats.forEach(function(p) { p.personData.forEach(function(pd) { teamMap[pd.name] = (teamMap[pd.name] || 0) + pd.hours; }); });
  var teamEntries = Object.keys(teamMap).map(function(n) { return { name: n, hours: Math.round(teamMap[n] * 10) / 10 }; }).sort(function(a, b) { return b.hours - a.hours; });
  var teamTotal = teamEntries.reduce(function(s, t) { return s + t.hours; }, 0);
  var donutSvg = '', teamTable = '';
  if (teamEntries.length > 0 && teamTotal > 0) {
    var donutR = 70, donutHole = 45, donutCx = 100, donutCy = 100;
    var _insDark = (typeof document !== 'undefined' && document.body && document.body.dataset.theme === 'dark');
    var donutCenterFill = _insDark ? '#A9C8F0' : '#002669';
    var donutHoleFill = _insDark ? '#20242C' : '#fff';
    var legendNameColor = _insDark ? '#E6E9ED' : '#374151';
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
      if (pct >= 0.999) { donutSvg += '<circle cx="' + donutCx + '" cy="' + donutCy + '" r="' + donutR + '" fill="' + col + '"/><circle cx="' + donutCx + '" cy="' + donutCy + '" r="' + donutHole + '" fill="' + donutHoleFill + '"/>'; }
      else { donutSvg += '<path d="M' + x1 + ',' + y1 + ' A' + donutR + ',' + donutR + ' 0 ' + largeArc + ',1 ' + x2 + ',' + y2 + ' L' + ix1 + ',' + iy1 + ' A' + donutHole + ',' + donutHole + ' 0 ' + largeArc + ',0 ' + ix2 + ',' + iy2 + 'Z" fill="' + col + '"><title>' + esc(t.name) + ': ' + t.hours + 'h (' + Math.round(pct * 100) + '%)</title></path>'; }
      startAngle = endAngle;
    });
    donutSvg += '<text x="' + donutCx + '" y="' + (donutCy - 4) + '" text-anchor="middle" font-size="18" font-weight="800" fill="' + donutCenterFill + '" font-family="Lato,sans-serif">' + Math.round(teamTotal) + 'h</text>';
    donutSvg += '<text x="' + donutCx + '" y="' + (donutCy + 12) + '" text-anchor="middle" font-size="9" fill="#9CA3AF" font-family="Lato,sans-serif">total</text></svg>';
    donutSvg += '<div style="flex:1;min-width:160px;">';
    teamEntries.forEach(function(t, i) {
      var col = donutColors[i % donutColors.length];
      donutSvg += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;"><div style="width:10px;height:10px;border-radius:2px;background:' + col + ';flex-shrink:0;"></div><span style="flex:1;color:' + legendNameColor + ';font-weight:600;">' + esc(t.name) + '</span><span style="font-weight:700;color:var(--navy);">' + t.hours + 'h</span><span style="font-size:10px;color:#9CA3AF;min-width:30px;text-align:right;">' + Math.round(t.hours / teamTotal * 100) + '%</span></div>';
    });
    donutSvg += '</div></div>';
    teamTable = '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:var(--white);"><table class="member-table" style="margin:0;"><thead><tr><th>Team Member</th><th style="text-align:right;">Hours</th><th style="text-align:right;">% of Total</th></tr></thead><tbody>' +
      teamEntries.map(function(t) { return '<tr><td style="font-weight:700;color:var(--navy);">' + esc(t.name) + '</td><td style="text-align:right;">' + t.hours + 'h</td><td style="text-align:right;">' + Math.round(t.hours / teamTotal * 100) + '%</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  // === ASSEMBLE PAGE ===
  var html = '<div style="padding:28px 32px;">';
  html += '<div style="margin-bottom:24px;"><div style="font-size:22px;font-weight:800;color:var(--navy);margin-bottom:4px;">💡 Project Insights</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);">Retrospective data from completed projects. As you log more time, this becomes your reference library for future estimation.</div></div>';
  html += kpis;
  html += calibSection;
  html += (typeof buildRiskSection === 'function' ? buildRiskSection() : '');
  html += buildPlannedActualSection();
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;">';
  html += '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Effort by project size <span style="font-size:11px;font-weight:600;color:var(--text-muted);margin-left:6px;">B · Size calibration in Table view</span></div>' + insToggleBtns('size') + '</div><div id="ins-size-chart" style="padding:8px 0;">' + sizeSvg + '</div><div id="ins-size-table" style="display:none;">' + bySizeTable + '</div></div>';
  html += '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Effort by category</div>' + insToggleBtns('cat') + '</div><div id="ins-cat-chart" style="padding:8px 0;">' + catSvg + '</div><div id="ins-cat-table" style="display:none;">' + byCatTable + '</div></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;">';
  html += '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Completion timeline</div>' + insToggleBtns('timeline') + '</div><div id="ins-timeline-chart" style="padding:8px 0;">' + (tlSvg || '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:12px;">Not enough date data yet</div>') + '</div><div id="ins-timeline-table" style="display:none;">' + projTable + '</div></div>';
  html += '<div style="background:var(--white);border:1px solid #E8E6DF;border-radius:16px;padding:16px 20px;"><div style="display:flex;align-items:center;margin-bottom:12px;"><div style="font-size:15px;font-weight:800;color:var(--navy);">Hours by team member</div>' + insToggleBtns('team') + '</div><div id="ins-team-chart" style="padding:8px 0;">' + (donutSvg || '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:12px;">No time entries recorded yet</div>') + '</div><div id="ins-team-table" style="display:none;">' + (teamTable || '') + '</div></div>';
  html += '</div></div>';
  return html;
}

// ═══════════════════════════════════════════════════════════════════════
//  PLANNED vs ACTUAL — by Employee × Category (admin-only)
//  ─────────────────────────────────────────────────────────────────────
//  Planned = the weekly allocation FRACTION captured by the snapshot
//  pipeline while that week was current (the estimate). Actual = the same
//  week's fraction in the live table now (updated to reflect reality).
//  Both are converted to hours with the person's per-week project capacity,
//  which cancels in the variance ratio. Only past (reflected) weeks count.
// ═══════════════════════════════════════════════════════════════════════
var _paState = { loading: false, loaded: false, error: null, rows: null };

// Discover the allocations_snapshots table URL by name (the layer index isn't
// hardcoded — we only know the service root).
async function _paDiscoverAllocTableUrl() {
  var base = (typeof ARCGIS_CONFIG !== 'undefined') ? ARCGIS_CONFIG.snapshotsServiceUrl : null;
  if (!base) return null;
  var token = (typeof ensureAgolToken === 'function') ? await ensureAgolToken() : (typeof Auth !== 'undefined' ? Auth.token : null);
  var url = base + '?f=json' + (token ? '&token=' + encodeURIComponent(token) : '');
  var resp = await fetch(url);
  if (!resp.ok) throw new Error('snapshot service metadata ' + resp.status);
  var meta = await resp.json();
  if (meta.error) throw new Error(meta.error.message || 'snapshot service error');
  var all = (meta.layers || []).concat(meta.tables || []);
  var t = all.find(function(x) { return x.name === 'allocations_snapshots'; });
  return t ? (base + '/' + t.id) : null;
}

// Query the snapshot table WITHOUT resultOffset/resultRecordCount. The table
// is created programmatically (add_to_definition) and doesn't advertise
// pagination, so the shared agolQuery — which always sends those params —
// fails with "Invalid query parameters." returnGeometry:false because it's a
// table. Single request relying on the service maxRecordCount (4000); warns if
// the snapshot history ever outgrows that so we can add OID-based paging later.
async function _paQuerySnapshots(tableUrl) {
  var token = (typeof ensureAgolToken === 'function') ? await ensureAgolToken() : (typeof Auth !== 'undefined' ? Auth.token : null);
  if (!token) return [];
  var params = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'false', f: 'json', token: token });
  var resp = await fetch(tableUrl + '/query?' + params.toString());
  if (!resp.ok) throw new Error('ArcGIS query failed: ' + resp.status + ' ' + resp.statusText);
  var data = await resp.json();
  if (data.error) throw new Error('ArcGIS query error: ' + (data.error.message || JSON.stringify(data.error)));
  if (data.exceededTransferLimit) console.warn('[PlannedActual] snapshot query hit the transfer limit — history has outgrown a single request; add pagination.');
  return data.features || [];
}

async function loadPlannedActualSnapshots() {
  if (_paState.loading || _paState.loaded) return;
  _paState.loading = true;
  try {
    var tableUrl = await _paDiscoverAllocTableUrl();
    if (!tableUrl) {
      _paState.error = 'allocations_snapshots table not found in the snapshot service.';
    } else {
      console.log('[PlannedActual] querying snapshot table:', tableUrl);
      _paState.rows = await _paQuerySnapshots(tableUrl);
    }
  } catch (e) {
    _paState.error = (e && e.message) ? e.message : String(e);
  }
  _paState.loaded = true;
  _paState.loading = false;
  // Re-render the page now that data (or an error) is available.
  if (typeof currentTab !== 'undefined' && currentTab === 'insights') {
    var area = document.getElementById('content-area');
    if (area) area.innerHTML = buildInsightsPage();
  }
}

// Build the category → employee → project aggregation from the loaded
// snapshot rows (planned) compared against live allocations (actual).
function _paComputeAggregation() {
  if (_paState.error) return { error: _paState.error };
  var rows = _paState.rows || [];
  if (typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.weeks) {
    return { categories: [], hasData: false, weeksCovered: 0 };
  }
  var weeks = RESOURCES_DATA.weeks;
  var weekIdxMap = {};
  weeks.forEach(function(w, i) { weekIdxMap[w] = i; });
  var curIdx = (typeof window !== 'undefined' && typeof window.currentWeekIdx === 'number') ? window.currentWeekIdx : (weeks.length - 1);
  var DAY = 86400000;

  // planned fraction per "name|projNum|weekDateStr", taken from the snapshot
  // captured contemporaneously with that week (snapshot_week within its 7-day span).
  var planned = {};
  rows.forEach(function(f) {
    var a = f.attributes || {};
    var snapStr = (typeof epochToDateStr === 'function') ? epochToDateStr(a.snapshot_week) : a.snapshot_week;
    var wkStr = (typeof epochToDateStr === 'function') ? epochToDateStr(a.week_date) : a.week_date;
    if (!snapStr || !wkStr) return;
    var diff = new Date(snapStr + 'T00:00:00') - new Date(wkStr + 'T00:00:00');
    if (diff < 0 || diff >= 7 * DAY) return; // keep only the contemporaneous (estimate-state) snapshot
    var projNum = (a.project_number != null) ? a.project_number : a.analytics_id;
    if (projNum == null) return;
    planned[a.name + '|' + projNum + '|' + wkStr] = (a.fraction || 0);
  });

  var byCat = {};
  var weeksSet = {};
  Object.keys(planned).forEach(function(key) {
    var parts = key.split('|');
    var name = parts[0], projNum = parts[1], wkStr = parts[2];
    var wi = weekIdxMap[wkStr];
    if (wi === undefined || wi >= curIdx) return; // past (reflected) weeks only
    var person = RESOURCES_DATA.people[name];
    if (!person) return;
    if (typeof inCurrentTeamPerson === 'function' && !inCurrentTeamPerson(name)) return; // team scope (no-op off)
    var projCap = (person.proj_cap && person.proj_cap[wi]) || 0;
    var liveAlloc = (person.allocations || []).find(function(al) { return String(al.analytics_id) === String(projNum); });
    var plannedHrs = (planned[key] || 0) * projCap;
    var actualHrs = (liveAlloc ? (liveAlloc.fracs[wi] || 0) : 0) * projCap;
    if (plannedHrs === 0 && actualHrs === 0) return;
    weeksSet[wkStr] = true;
    var proj = (typeof PROJECTS !== 'undefined') ? PROJECTS.find(function(p) { return String(p.project_number) === String(projNum); }) : null;
    var cat = (proj && proj.category) || 'Uncategorized';
    var projTitle = (proj && proj.title) || (liveAlloc && liveAlloc.project) || ('Project #' + projNum);
    var unit = person.role || '';
    if (!byCat[cat]) byCat[cat] = { planned: 0, actual: 0, emps: {} };
    var c = byCat[cat]; c.planned += plannedHrs; c.actual += actualHrs;
    if (!c.emps[name]) c.emps[name] = { unit: unit, planned: 0, actual: 0, projects: {} };
    var e = c.emps[name]; e.planned += plannedHrs; e.actual += actualHrs;
    if (!e.projects[projTitle]) e.projects[projTitle] = { planned: 0, actual: 0 };
    e.projects[projTitle].planned += plannedHrs;
    e.projects[projTitle].actual += actualHrs;
  });

  var categories = Object.keys(byCat).map(function(cat) {
    var c = byCat[cat];
    var emps = Object.keys(c.emps).map(function(nm) {
      var e = c.emps[nm];
      var projects = Object.keys(e.projects).map(function(t) {
        return { title: t, planned: e.projects[t].planned, actual: e.projects[t].actual };
      }).sort(function(a, b) { return b.actual - a.actual; });
      return { name: nm, unit: e.unit, planned: e.planned, actual: e.actual, projects: projects };
    }).sort(function(a, b) { return b.actual - a.actual; });
    return { category: cat, planned: c.planned, actual: c.actual, employees: emps };
  }).sort(function(a, b) { return b.actual - a.actual; });

  return { categories: categories, hasData: categories.length > 0, weeksCovered: Object.keys(weeksSet).length };
}

function _paHrs(h) { return Math.round(h) + 'h'; }
function _paNote(msg) {
  return '<div style="background:var(--white);border:1px dashed #E8E6DF;border-radius:10px;padding:24px;text-align:center;color:var(--text-muted);font-size:13px;line-height:1.5;">' + msg + '</div>';
}
function _paVarChip(planned, actual) {
  if (!planned || planned <= 0) {
    if (actual > 0) return '<span style="display:inline-block;background:var(--surface-2);color:#6B7280;padding:2px 8px;border-radius:10px;font-weight:700;font-size:11px;">unplanned</span>';
    return '<span style="color:var(--text-muted);">—</span>';
  }
  var r = actual / planned;
  var c = _calibMultColor(r); // reuse Duration Calibration's color scale
  var v = Math.round((actual - planned) / planned * 100);
  return '<span style="display:inline-block;background:' + c.bg + ';color:' + c.fg + ';padding:2px 8px;border-radius:10px;font-weight:800;font-variant-numeric:tabular-nums;font-size:12px;min-width:46px;text-align:center;">' + (v > 0 ? '+' : '') + v + '%</span>';
}

// Pure-DOM collapse toggle (no page re-render, so it survives independently).
function paToggleEmp(id) {
  var rows = document.querySelectorAll('[data-pa-parent="' + id + '"]');
  var caret = document.getElementById('pa-caret-' + id);
  var anyHidden = false;
  rows.forEach(function(r) { if (r.style.display === 'none') anyHidden = true; });
  rows.forEach(function(r) { r.style.display = anyHidden ? '' : 'none'; });
  if (caret) caret.textContent = anyHidden ? '▾' : '▸';
}

function buildPlannedActualSection() {
  // Admin-only: render nothing for non-admins.
  if (typeof isAdmin !== 'function' || !isAdmin()) return '';

  var html = '<div style="margin-bottom:28px;">';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;">';
  html += '<div style="font-size:18px;font-weight:800;color:var(--navy);">Planned vs Actual — by Employee × Category</div>';
  html += '<span style="font-size:10px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:8px;">🔒 Admin only</span>';
  html += '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">Planned = the weekly allocation estimate captured by the snapshot pipeline when each week was current. Actual = that week\'s value after it was updated to reflect what happened. Variance = actual ÷ planned. <strong>Visible to admins only.</strong></div>';

  if (!_paState.loaded) {
    if (!_paState.loading) setTimeout(loadPlannedActualSnapshots, 0);
    html += _paNote('Loading snapshot history…');
    return html + '</div>';
  }
  if (_paState.error) {
    html += _paNote('Couldn\'t load snapshot data: ' + esc(_paState.error));
    return html + '</div>';
  }

  var agg = _paComputeAggregation();
  if (!agg.hasData) {
    html += _paNote('<strong>Building history.</strong><br>Planned vs actual needs at least one past week that was snapshotted while current and has since been updated to reflect actuals. The weekly snapshot pipeline started recently, so this table will populate automatically as snapshots accrue and past weeks are reflected.');
    return html + '</div>';
  }

  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">Across ' + agg.weeksCovered + ' reflected week' + (agg.weeksCovered === 1 ? '' : 's') + ' (current and future weeks are excluded — not yet reflected). Click an employee to expand their projects in that category.</div>';
  html += '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:var(--white);"><table class="member-table" style="margin:0;"><thead><tr>';
  html += '<th>Category / Employee</th><th style="text-align:right;">Planned</th><th style="text-align:right;">Actual</th><th style="text-align:center;">Variance</th></tr></thead><tbody>';

  var rowSeq = 0;
  agg.categories.forEach(function(cat) {
    html += '<tr style="background:var(--surface-2);"><td style="font-weight:800;color:var(--navy);">' + esc(cat.category) + '</td>'
      + '<td style="text-align:right;font-weight:700;">' + _paHrs(cat.planned) + '</td>'
      + '<td style="text-align:right;font-weight:700;">' + _paHrs(cat.actual) + '</td>'
      + '<td style="text-align:center;">' + _paVarChip(cat.planned, cat.actual) + '</td></tr>';
    cat.employees.forEach(function(emp) {
      var id = 'pa' + (rowSeq++);
      var unitTag = emp.unit ? ' <span style="font-size:10px;color:var(--text-muted);">' + esc(emp.unit) + '</span>' : '';
      html += '<tr style="cursor:pointer;" onclick="paToggleEmp(\'' + id + '\')">'
        + '<td style="padding-left:24px;"><span id="pa-caret-' + id + '" style="display:inline-block;width:12px;color:var(--text-muted);">▸</span> ' + esc(emp.name) + unitTag + '</td>'
        + '<td style="text-align:right;">' + _paHrs(emp.planned) + '</td>'
        + '<td style="text-align:right;">' + _paHrs(emp.actual) + '</td>'
        + '<td style="text-align:center;">' + _paVarChip(emp.planned, emp.actual) + '</td></tr>';
      emp.projects.forEach(function(pr) {
        html += '<tr data-pa-parent="' + id + '" style="display:none;background:var(--surface-2);">'
          + '<td style="padding-left:48px;font-size:12px;color:var(--text-body);">' + esc(pr.title) + '</td>'
          + '<td style="text-align:right;font-size:12px;">' + _paHrs(pr.planned) + '</td>'
          + '<td style="text-align:right;font-size:12px;">' + _paHrs(pr.actual) + '</td>'
          + '<td style="text-align:center;">' + _paVarChip(pr.planned, pr.actual) + '</td></tr>';
      });
    });
  });
  html += '</tbody></table></div>';
  html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;margin-top:8px;">Variance color matches Duration Calibration: blue = under plan, green = on plan (±15%), yellow/orange/red = increasing overrun.</div>';
  return html + '</div>';
}
