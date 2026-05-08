// ─────────────────────────────────────────────────────────────────────
// tabs/overview.js — Overview / dashboard tab
//
// _buildOverviewSlides() — computes data + builds 7 panel HTML chunks,
// returns them as { id, title, html } objects. Both the regular
// dashboard view AND the Slideshow tab consume this single function so
// the data and rendering stay in sync.
//
// renderOverview(area) — assembles the slides into the 4-row dashboard.
// getOverviewSlides() — public alias used by the Slideshow tab.
//
// Forward references: PROJECTS, TASKS, RESOURCES_DATA, isAdmin,
// resolveProjectTitle. Backward references: STATUS_COLOR, esc.
// ─────────────────────────────────────────────────────────────────────

function _buildOverviewSlides() {
  var today = new Date();
  var todayStr = today.toISOString().slice(0, 10);
  var msPerDay = 86400000;

  // ── Metric card data ──────────────────────────────────────
  var activeProjects = PROJECTS.filter(function(p) { return p.status === 'Active'; }).length;
  var openTasks = TASKS.filter(function(t) { return ['Active', 'Pending', 'On Hold', 'Waiting for Response'].indexOf(t.status) >= 0; }).length;
  var overdueProjects = PROJECTS.filter(function(p) {
    var d = p.working_due || p.end;
    return d && d < todayStr && ['Active', 'Scheduled'].indexOf(p.status) >= 0;
  });
  var overdueTasks = TASKS.filter(function(t) {
    var d = t.working_due || t.due;
    return d && d < todayStr && ['Active', 'Waiting for Response', 'On Hold'].indexOf(t.status) >= 0;
  });
  var overdueCount = overdueProjects.length + overdueTasks.length;
  var dueThisWeek = TASKS.filter(function(t) {
    var d = t.working_due || t.due;
    if (!d || d < todayStr) return false;
    var daysLeft = Math.ceil((new Date(d + 'T00:00:00') - today) / msPerDay);
    return daysLeft >= 0 && daysLeft <= 7 && ['Active', 'Waiting for Response'].indexOf(t.status) >= 0;
  }).length;

  // Quarter start (current fiscal quarter)
  var qMonth = Math.floor(today.getMonth() / 3) * 3;
  var qStart = new Date(today.getFullYear(), qMonth, 1).toISOString().slice(0, 10);
  var completedProjects = PROJECTS.filter(function(p) { return p.status === 'Complete' && p.actual_end && p.actual_end >= qStart; }).length;
  var completedTasks = TASKS.filter(function(t) { return t.status === 'Complete' && t.actual_end && t.actual_end >= qStart; }).length;

  var snapshotHtml = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">';
  snapshotHtml += '<div style="background:var(--bg-surface, #F3F1EB);border-radius:8px;padding:12px 14px;"><div class="slideshow-kpi-label" style="font-size:13px;color:var(--text-muted);margin-bottom:2px;">Active projects</div><div class="slideshow-kpi-value" style="font-size:28px;font-weight:900;color:var(--text-body);">' + activeProjects + '</div><div class="slideshow-kpi-meta" style="font-size:12px;color:#0F6E56;margin-top:2px;">of ' + PROJECTS.length + ' total</div></div>';
  snapshotHtml += '<div style="background:var(--bg-surface, #F3F1EB);border-radius:8px;padding:12px 14px;"><div class="slideshow-kpi-label" style="font-size:13px;color:var(--text-muted);margin-bottom:2px;">Open tasks</div><div class="slideshow-kpi-value" style="font-size:28px;font-weight:900;color:var(--text-body);">' + openTasks + '</div><div class="slideshow-kpi-meta" style="font-size:12px;color:#854F0B;margin-top:2px;">' + dueThisWeek + ' due this week</div></div>';
  snapshotHtml += '<div style="background:var(--bg-surface, #F3F1EB);border-radius:8px;padding:12px 14px;"><div class="slideshow-kpi-label" style="font-size:13px;color:var(--text-muted);margin-bottom:2px;">Overdue items</div><div class="slideshow-kpi-value" style="font-size:28px;font-weight:900;color:' + (overdueCount > 0 ? '#A32D2D' : 'var(--text-body)') + ';">' + overdueCount + '</div><div class="slideshow-kpi-meta" style="font-size:12px;color:#A32D2D;margin-top:2px;">' + overdueProjects.length + ' projects · ' + overdueTasks.length + ' tasks</div></div>';
  snapshotHtml += '<div style="background:var(--bg-surface, #F3F1EB);border-radius:8px;padding:12px 14px;"><div class="slideshow-kpi-label" style="font-size:13px;color:var(--text-muted);margin-bottom:2px;">Completed this quarter</div><div class="slideshow-kpi-value" style="font-size:28px;font-weight:900;color:var(--text-body);">' + (completedProjects + completedTasks) + '</div><div class="slideshow-kpi-meta" style="font-size:12px;color:var(--text-muted);margin-top:2px;">' + completedProjects + ' projects · ' + completedTasks + ' tasks</div></div>';
  snapshotHtml += '</div>';

  // ── Project throughput: weekly completions over the last 16 weeks ─
  // Bars = projects completed that week (by p.actual_end). Overlaid line
  // is the trailing 4-week rolling average, which gives the chart a
  // readable shape on small samples (e.g. 0–3 completions/week).
  var WEEKS_BACK = 16;
  // Find the Monday that starts the current week, in local time.
  var nowLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var dow = nowLocal.getDay(); // 0=Sun ... 6=Sat
  var daysFromMonday = (dow + 6) % 7;
  var thisMonday = new Date(nowLocal); thisMonday.setDate(nowLocal.getDate() - daysFromMonday);
  // Build weekly buckets [start, end) — earliest first.
  var weekBuckets = [];
  for (var w = WEEKS_BACK - 1; w >= 0; w--) {
    var ws = new Date(thisMonday); ws.setDate(thisMonday.getDate() - w * 7);
    var we = new Date(ws); we.setDate(ws.getDate() + 7);
    weekBuckets.push({ start: ws, end: we, count: 0 });
  }
  var firstStart = weekBuckets[0].start;
  var msPerWeek = msPerDay * 7;
  PROJECTS.forEach(function(p) {
    if (p.status !== 'Complete' || !p.actual_end) return;
    var d = new Date(p.actual_end + 'T12:00:00');
    var idx = Math.floor((d - firstStart) / msPerWeek);
    if (idx >= 0 && idx < weekBuckets.length) weekBuckets[idx].count++;
  });
  var rollingAvg = weekBuckets.map(function(_, i) {
    var sum = 0, n = 0;
    for (var j = Math.max(0, i - 3); j <= i; j++) { sum += weekBuckets[j].count; n++; }
    return sum / n;
  });
  var last4 = weekBuckets.slice(-4).reduce(function(s, b) { return s + b.count; }, 0);
  var totalWindow = weekBuckets.reduce(function(s, b) { return s + b.count; }, 0);
  var completedCount = PROJECTS.filter(function(p) { return p.status === 'Complete'; }).length;

  // SVG geometry — designed to fit the 1600px slide auto-fit container.
  var svgW = 1400, svgH = 360;
  var padL = 50, padR = 30, padT = 30, padB = 40;
  var chartW = svgW - padL - padR;
  var chartH = svgH - padT - padB;
  var maxVal = Math.max.apply(null, weekBuckets.map(function(b) { return b.count; }).concat(rollingAvg));
  if (maxVal < 3) maxVal = 3;
  maxVal = Math.ceil(maxVal);
  var barSlot = chartW / weekBuckets.length;
  var barInner = barSlot * 0.6;
  var barOff = (barSlot - barInner) / 2;
  var bars = weekBuckets.map(function(b, i) {
    var h = (b.count / maxVal) * chartH;
    var x = padL + i * barSlot + barOff;
    var y = padT + chartH - h;
    return '<rect x="' + x + '" y="' + y + '" width="' + barInner + '" height="' + h + '" rx="4" fill="#0F2366" opacity="0.85"></rect>';
  }).join('');
  var linePts = rollingAvg.map(function(v, i) {
    var x = padL + i * barSlot + barSlot / 2;
    var y = padT + chartH - (v / maxVal) * chartH;
    return x + ',' + y;
  }).join(' ');
  var yTicks = '';
  [0, Math.round(maxVal / 2), maxVal].forEach(function(t) {
    var y = padT + chartH - (t / maxVal) * chartH;
    yTicks += '<line x1="' + padL + '" y1="' + y + '" x2="' + (padL + chartW) + '" y2="' + y + '" stroke="#E5E1D6" stroke-width="1"></line>';
    yTicks += '<text x="' + (padL - 8) + '" y="' + (y + 5) + '" text-anchor="end" font-size="14" fill="#6B6B6B">' + t + '</text>';
  });
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var prevMonth = -1, xLabels = '';
  weekBuckets.forEach(function(b, i) {
    var m = b.start.getMonth();
    if (m !== prevMonth) {
      var x = padL + i * barSlot + barSlot / 2;
      xLabels += '<text x="' + x + '" y="' + (padT + chartH + 22) + '" text-anchor="middle" font-size="14" fill="#6B6B6B">' + monthNames[m] + '</text>';
      prevMonth = m;
    }
  });

  var pipelineHtml = '';
  pipelineHtml += '<div class="slideshow-throughput-card">';
  pipelineHtml += '<div class="slideshow-throughput-hero">';
  pipelineHtml +=   '<div class="slideshow-throughput-hero-value">' + last4 + '</div>';
  pipelineHtml +=   '<div class="slideshow-throughput-hero-caption">Projects completed in the last 4 weeks</div>';
  pipelineHtml += '</div>';
  pipelineHtml += '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" preserveAspectRatio="xMidYMid meet" class="slideshow-throughput-svg" role="img" aria-label="Weekly project completions over the last ' + WEEKS_BACK + ' weeks">';
  pipelineHtml +=   yTicks + bars;
  pipelineHtml +=   '<polyline points="' + linePts + '" fill="none" stroke="#83AC16" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>';
  pipelineHtml +=   xLabels;
  pipelineHtml += '</svg>';
  pipelineHtml += '<div class="slideshow-throughput-legend">';
  pipelineHtml +=   '<span><span class="slideshow-throughput-key bars"></span>Projects completed per week</span>';
  pipelineHtml +=   '<span><span class="slideshow-throughput-key line"></span>4-week rolling average</span>';
  pipelineHtml += '</div>';
  pipelineHtml += '<div class="slideshow-throughput-footer">' + totalWindow + ' completed in the last ' + WEEKS_BACK + ' weeks · ' + completedCount + ' completed all-time</div>';
  pipelineHtml += '</div>';

  // ── Upcoming deadlines ────────────────────────────────────
  var deadlineItems = [];
  PROJECTS.filter(function(p) { return ['Active', 'Scheduled', 'On Hold', 'Waiting for Response'].indexOf(p.status) >= 0 && (p.working_due || p.end); }).forEach(function(p) {
    deadlineItems.push({ title: p.title, date: p.working_due || p.end, type: 'Proj', objectId: p.objectId, isProject: true });
  });
  TASKS.filter(function(t) { return ['Active', 'Waiting for Response', 'On Hold'].indexOf(t.status) >= 0 && (t.working_due || t.due); }).forEach(function(t) {
    deadlineItems.push({ title: t.title, date: t.working_due || t.due, type: 'Task', objectId: t.objectId, isProject: false });
  });
  deadlineItems.sort(function(a, b) { return a.date.localeCompare(b.date); });
  var overdueItems = deadlineItems.filter(function(d) { return d.date < todayStr; });
  var futureItems = deadlineItems.filter(function(d) { return d.date >= todayStr; });
  var sortedDeadlines = overdueItems.concat(futureItems).slice(0, 8);

  var deadlineHtml = '';
  sortedDeadlines.forEach(function(d) {
    var dDate = new Date(d.date + 'T00:00:00');
    var daysDiff = Math.ceil((dDate - today) / msPerDay);
    var isOverdue = daysDiff < 0;
    var isDueSoon = daysDiff >= 0 && daysDiff <= 7;
    var dateColor = isOverdue ? '#A32D2D' : isDueSoon ? '#854F0B' : 'var(--text-muted)';
    var pillBg = isOverdue ? '#FCEBEB' : isDueSoon ? '#FAEEDA' : 'var(--bg-surface, #F3F1EB)';
    var pillColor = isOverdue ? '#791F1F' : isDueSoon ? '#633806' : 'var(--text-muted)';
    var pillText = isOverdue ? Math.abs(daysDiff) + 'd late' : daysDiff + 'd';
    var onclick = d.isProject ? 'openProject(' + d.objectId + ')' : 'openTask(' + d.objectId + ')';
    var dateLabel = d.date.slice(5).replace('-', '/');
    deadlineHtml += '<div style="display:flex;align-items:center;gap:6px;padding:6px 0;font-size:13px;border-bottom:0.5px solid #F3F1EB;cursor:pointer;" onclick="' + onclick + '">';
    deadlineHtml += '<div style="width:50px;font-weight:700;flex-shrink:0;color:' + dateColor + ';">' + dateLabel + '</div>';
    deadlineHtml += '<div style="flex:1;color:var(--text-body);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(d.title) + '</div>';
    deadlineHtml += '<span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px;background:' + pillBg + ';color:' + pillColor + ';flex-shrink:0;">' + pillText + '</span>';
    deadlineHtml += '<span style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:3px;background:var(--bg-surface, #F3F1EB);color:var(--text-muted);flex-shrink:0;">' + d.type + '</span>';
    deadlineHtml += '</div>';
  });
  if (!deadlineHtml) deadlineHtml = '<div style="font-size:12px;color:var(--text-muted);padding:10px 0;">No upcoming deadlines.</div>';

  // ── Open task priority breakdown ─────────────────────────────
  var priCounts = { High: 0, Medium: 0, Low: 0, None: 0 };
  var priTotal = 0;
  TASKS.forEach(function(t) {
    if (['Active', 'Pending', 'On Hold', 'Waiting for Response'].indexOf(t.status) < 0) return;
    priTotal++;
    if (t.priority === 'High') priCounts.High++;
    else if (t.priority === 'Medium') priCounts.Medium++;
    else if (t.priority === 'Low') priCounts.Low++;
    else priCounts.None++;
  });

  var priHtml = '';
  if (priTotal > 0) {
    var hPct = Math.round(priCounts.High / priTotal * 100);
    var mPct = Math.round(priCounts.Medium / priTotal * 100);
    var lPct = Math.round(priCounts.Low / priTotal * 100);
    var nPct = 100 - hPct - mPct - lPct;
    priHtml += '<div style="height:34px;display:flex;border-radius:4px;overflow:hidden;margin-bottom:14px;">';
    if (priCounts.High) priHtml += '<div style="width:' + hPct + '%;background:#E24B4A;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:500;">High</div>';
    if (priCounts.Medium) priHtml += '<div style="width:' + mPct + '%;background:#EF9F27;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:500;">Medium</div>';
    if (priCounts.Low) priHtml += '<div style="width:' + lPct + '%;background:#83AC16;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:500;">Low</div>';
    if (priCounts.None) priHtml += '<div style="width:' + nPct + '%;background:#B4B2A9;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:500;">—</div>';
    priHtml += '</div>';
  }
  priHtml += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;">';
  priHtml += '<div style="text-align:center;padding:10px;background:var(--bg-surface, #F3F1EB);border-radius:8px;"><div style="font-size:22px;font-weight:900;color:#A32D2D;">' + priCounts.High + '</div><div style="font-size:12px;color:var(--text-muted);">High (' + (priTotal > 0 ? Math.round(priCounts.High / priTotal * 100) : 0) + '%)</div></div>';
  priHtml += '<div style="text-align:center;padding:10px;background:var(--bg-surface, #F3F1EB);border-radius:8px;"><div style="font-size:22px;font-weight:900;color:#854F0B;">' + priCounts.Medium + '</div><div style="font-size:12px;color:var(--text-muted);">Medium (' + (priTotal > 0 ? Math.round(priCounts.Medium / priTotal * 100) : 0) + '%)</div></div>';
  priHtml += '<div style="text-align:center;padding:10px;background:var(--bg-surface, #F3F1EB);border-radius:8px;"><div style="font-size:22px;font-weight:900;color:#3B6D11;">' + priCounts.Low + '</div><div style="font-size:12px;color:var(--text-muted);">Low (' + (priTotal > 0 ? Math.round(priCounts.Low / priTotal * 100) : 0) + '%)</div></div>';
  priHtml += '<div style="text-align:center;padding:10px;background:var(--bg-surface, #F3F1EB);border-radius:8px;"><div style="font-size:22px;font-weight:900;color:#5F5E5A;">' + priCounts.None + '</div><div style="font-size:12px;color:var(--text-muted);">None (' + (priTotal > 0 ? Math.round(priCounts.None / priTotal * 100) : 0) + '%)</div></div>';
  priHtml += '</div>';
  priHtml += '<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">' + priTotal + ' open tasks total</div>';

  // ── Work by category ──────────────────────────────────────
  var categories = {};
  PROJECTS.forEach(function(p) {
    if (!p.category) return;
    if (p.status === 'Complete' || p.status === 'Canceled') return;
    if (!categories[p.category]) categories[p.category] = { active: 0, onHold: 0, waiting: 0, futureScheduled: 0, total: 0 };
    var c = categories[p.category];
    c.total++;
    if (p.status === 'Active') c.active++;
    else if (p.status === 'On Hold') c.onHold++;
    else if (p.status === 'Waiting for Response') c.waiting++;
    else if (['Future', 'Scheduled'].indexOf(p.status) >= 0) c.futureScheduled++;
  });
  var catEntries = Object.entries(categories).sort(function(a, b) { return b[1].total - a[1].total; });
  var maxCat = catEntries.length > 0 ? catEntries[0][1].total : 1;
  var catHtml = '<div class="slideshow-categories-wrapper">';
  catHtml += '<div class="slideshow-categories-legend">';
  catHtml += '<span><span class="slideshow-cat-key active"></span>Active</span>';
  catHtml += '<span><span class="slideshow-cat-key hold"></span>On hold</span>';
  catHtml += '<span><span class="slideshow-cat-key waiting"></span>Waiting</span>';
  catHtml += '<span><span class="slideshow-cat-key future"></span>Future / Scheduled</span>';
  catHtml += '</div>';
  catHtml += '<div class="slideshow-categories-list">';
  catEntries.forEach(function(e) {
    var cat = e[0], d = e[1];
    var aPct = Math.round(d.active / maxCat * 100);
    var hPct = Math.round(d.onHold / maxCat * 100);
    var wPct = Math.round(d.waiting / maxCat * 100);
    var fPct = Math.round(d.futureScheduled / maxCat * 100);
    catHtml += '<div class="slideshow-category-row">';
    catHtml += '<div class="slideshow-category-name">' + esc(cat) + '</div>';
    catHtml += '<div class="slideshow-category-bar">';
    if (d.active) catHtml += '<span class="slideshow-category-segment active" style="width:' + aPct + '%;"></span>';
    if (d.onHold) catHtml += '<span class="slideshow-category-segment hold" style="width:' + hPct + '%;"></span>';
    if (d.waiting) catHtml += '<span class="slideshow-category-segment waiting" style="width:' + wPct + '%;"></span>';
    if (d.futureScheduled) catHtml += '<span class="slideshow-category-segment future" style="width:' + fPct + '%;"></span>';
    catHtml += '</div>';
    catHtml += '<div class="slideshow-category-count">' + d.total + '</div>';
    catHtml += '</div>';
  });
  catHtml += '</div>';
  catHtml += '</div>';

  // ── Created vs completed (9 weeks) ────────────────────────
  var cvcWeeks = [];
  for (var cw = 8; cw >= 0; cw--) {
    var cwEnd = new Date(today.getTime() - cw * 7 * msPerDay);
    var cwStart = new Date(cwEnd.getTime() - 7 * msPerDay);
    var cwStartStr = cwStart.toISOString().slice(0, 10);
    var cwEndStr = cwEnd.toISOString().slice(0, 10);
    var created = TASKS.filter(function(t) { return t.start && t.start >= cwStartStr && t.start < cwEndStr; }).length;
    var completed = TASKS.filter(function(t) { return t.status === 'Complete' && t.actual_end && t.actual_end >= cwStartStr && t.actual_end < cwEndStr; }).length;
    cvcWeeks.push({ created: created, completed: completed, label: (cwStart.getMonth() + 1) + '/' + cwStart.getDate() });
  }
  var maxCvc = Math.max.apply(null, cvcWeeks.map(function(w) { return Math.max(w.created, w.completed); })) || 1;
  var totalCreated = cvcWeeks.reduce(function(s, w) { return s + w.created; }, 0);
  var totalCompleted = cvcWeeks.reduce(function(s, w) { return s + w.completed; }, 0);

  var cvcSvg = '<svg viewBox="0 0 100 26" preserveAspectRatio="none" style="width:100%;height:140px;display:block;">';
  cvcSvg += '<line x1="5" y1="22" x2="99" y2="22" stroke="#E8E6DF" stroke-width="0.1"/>';
  cvcSvg += '<line x1="5" y1="14" x2="99" y2="14" stroke="#E8E6DF" stroke-width="0.1" stroke-dasharray="0.4,0.4"/>';
  cvcSvg += '<line x1="5" y1="6" x2="99" y2="6" stroke="#E8E6DF" stroke-width="0.1" stroke-dasharray="0.4,0.4"/>';
  var yLabels = [0, Math.round(maxCvc / 2), maxCvc];
  cvcSvg += '<text x="4.5" y="22.5" text-anchor="end" font-size="1.6" fill="#888">' + yLabels[0] + '</text>';
  cvcSvg += '<text x="4.5" y="14.5" text-anchor="end" font-size="1.6" fill="#888">' + yLabels[1] + '</text>';
  cvcSvg += '<text x="4.5" y="6.5" text-anchor="end" font-size="1.6" fill="#888">' + yLabels[2] + '</text>';
  function cvcX(i) { return 7 + i * (91 / (cvcWeeks.length - 1)); }
  function cvcY(val) { return 22 - (val / maxCvc * 16); }
  var createdPts = cvcWeeks.map(function(w, i) { return cvcX(i) + ',' + cvcY(w.created); }).join(' ');
  cvcSvg += '<polyline points="' + createdPts + '" fill="none" stroke="#E24B4A" stroke-width="0.35"/>';
  cvcWeeks.forEach(function(w, i) { cvcSvg += '<circle cx="' + cvcX(i) + '" cy="' + cvcY(w.created) + '" r="0.5" fill="#E24B4A"/>'; });
  var completedPts = cvcWeeks.map(function(w, i) { return cvcX(i) + ',' + cvcY(w.completed); }).join(' ');
  cvcSvg += '<polyline points="' + completedPts + '" fill="none" stroke="#185FA5" stroke-width="0.35"/>';
  cvcWeeks.forEach(function(w, i) { cvcSvg += '<circle cx="' + cvcX(i) + '" cy="' + cvcY(w.completed) + '" r="0.5" fill="#185FA5"/>'; });
  cvcWeeks.forEach(function(w, i) {
    if (i % 2 === 0) cvcSvg += '<text x="' + cvcX(i) + '" y="24.5" text-anchor="middle" font-size="1.6" fill="#888">' + w.label + '</text>';
  });
  cvcSvg += '</svg>';
  var intakeHtml =
    '<div style="display:flex;gap:14px;font-size:12px;color:var(--text-muted);margin-bottom:8px;">' +
    '<span><span style="width:16px;height:2px;background:#E24B4A;display:inline-block;margin-right:4px;vertical-align:middle;border-radius:1px;"></span>Created</span>' +
    '<span><span style="width:16px;height:2px;background:#185FA5;display:inline-block;margin-right:4px;vertical-align:middle;border-radius:1px;"></span>Completed</span>' +
    '</div>' + cvcSvg +
    '<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">Net: +' + totalCreated + ' created, -' + totalCompleted + ' completed = ' + (totalCreated > totalCompleted ? '+' : '') + (totalCreated - totalCompleted) + ' backlog change</div>';

  // ── Overdue trend (10 weeks) ──────────────────────────────
  var odWeeks = [];
  for (var ow = 9; ow >= 0; ow--) {
    var owDate = new Date(today.getTime() - ow * 7 * msPerDay);
    var owStr = owDate.toISOString().slice(0, 10);
    var odCount = PROJECTS.filter(function(p) {
      var d = p.working_due || p.end;
      return d && d < owStr && ['Active', 'Scheduled'].indexOf(p.status) >= 0;
    }).length + TASKS.filter(function(t) {
      var d = t.working_due || t.due;
      return d && d < owStr && ['Active', 'Waiting for Response', 'On Hold'].indexOf(t.status) >= 0;
    }).length;
    odWeeks.push({ count: odCount, label: (owDate.getMonth() + 1) + '/' + owDate.getDate() });
  }
  var maxOd = Math.max.apply(null, odWeeks.map(function(w) { return w.count; })) || 1;
  var peakOd = Math.max.apply(null, odWeeks.map(function(w) { return w.count; }));
  var currentOd = odWeeks[odWeeks.length - 1].count;

  var odSvg = '<svg viewBox="0 0 100 26" preserveAspectRatio="none" style="width:100%;height:140px;display:block;">';
  odSvg += '<line x1="5" y1="22" x2="99" y2="22" stroke="#E8E6DF" stroke-width="0.1"/>';
  odSvg += '<line x1="5" y1="14" x2="99" y2="14" stroke="#E8E6DF" stroke-width="0.1" stroke-dasharray="0.4,0.4"/>';
  odSvg += '<line x1="5" y1="6" x2="99" y2="6" stroke="#E8E6DF" stroke-width="0.1" stroke-dasharray="0.4,0.4"/>';
  odSvg += '<text x="4.5" y="22.5" text-anchor="end" font-size="1.6" fill="#888">0</text>';
  odSvg += '<text x="4.5" y="14.5" text-anchor="end" font-size="1.6" fill="#888">' + Math.round(maxOd / 2) + '</text>';
  odSvg += '<text x="4.5" y="6.5" text-anchor="end" font-size="1.6" fill="#888">' + maxOd + '</text>';
  odSvg += '<line x1="5" y1="22" x2="99" y2="22" stroke="#0F6E56" stroke-width="0.15" stroke-dasharray="0.5,0.5" opacity="0.5"/>';
  function odX(i) { return 7 + i * (91 / (odWeeks.length - 1)); }
  function odY(val) { return 22 - (val / maxOd * 16); }
  var odPoly = odWeeks.map(function(w, i) { return odX(i) + ',' + odY(w.count); }).join(' ');
  odPoly += ' ' + odX(odWeeks.length - 1) + ',22 ' + odX(0) + ',22';
  odSvg += '<polygon points="' + odPoly + '" fill="#E24B4A" opacity="0.06"/>';
  var odLine = odWeeks.map(function(w, i) { return odX(i) + ',' + odY(w.count); }).join(' ');
  odSvg += '<polyline points="' + odLine + '" fill="none" stroke="#E24B4A" stroke-width="0.35"/>';
  odWeeks.forEach(function(w, i) { odSvg += '<circle cx="' + odX(i) + '" cy="' + odY(w.count) + '" r="0.5" fill="#E24B4A"/>'; });
  odWeeks.forEach(function(w, i) { if (i % 3 === 0) odSvg += '<text x="' + odX(i) + '" y="24.5" text-anchor="middle" font-size="1.6" fill="#888">' + w.label + '</text>'; });
  odSvg += '</svg>';

  var trendDir = currentOd < peakOd ? 'improving' : currentOd === peakOd ? 'flat' : 'worsening';

  var overdueTrendHtml =
    '<div style="display:flex;gap:14px;font-size:12px;color:var(--text-muted);margin-bottom:8px;">' +
    '<span><span style="width:16px;height:2px;background:#E24B4A;display:inline-block;margin-right:4px;vertical-align:middle;border-radius:1px;"></span>Overdue count</span>' +
    '<span style="color:#0F6E56;">- - - Target (zero)</span>' +
    '</div>' + odSvg +
    '<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">Current: ' + currentOd + ' overdue · Peak: ' + peakOd + ' · Trend: ' + trendDir + '</div>';

  return [
    { id: 'snapshot',  title: 'Portfolio snapshot',                              html: snapshotHtml },
    { id: 'pipeline',  title: 'Project throughput — last 16 weeks',              html: pipelineHtml },
    { id: 'deadlines', title: 'Upcoming project and task deadlines',             html: deadlineHtml },
    { id: 'priority',  title: 'Open task priority breakdown',                    html: priHtml },
    { id: 'category',  title: 'Projects by category',                            html: catHtml },
    { id: 'intake',    title: 'Tasks created vs. completed — intake balance',   html: intakeHtml },
    { id: 'overdue',   title: 'Overdue projects and tasks — last 10 weeks',     html: overdueTrendHtml },
  ];
}

// Public alias used by the Slideshow tab.
function getOverviewSlides() {
  return _buildOverviewSlides();
}

// ─── OVERVIEW — team introduction page ───────────────────────────────
// The Overview tab introduces the Data Intelligence team: mission,
// services, current-year goals, roster, partner departments, and a
// short "about this app" section. The dashboard-style panel grid
// previously rendered here is now exclusive to the Slideshow tab,
// which serves the public-facing summary view.
//
// Live data (computed on each render): team headcount from
// RESOURCES_DATA, project / task counts, completions in the last 16
// weeks, and active-project counts per top partner department.
// Roster, services, goals, and the partner list are hardcoded — they
// don't drift fast enough to need config-driven storage.

function renderOverview(area) {
  // ── Live counts ─────────────────────────────────────────────────
  var totalProjects = PROJECTS.length;
  var totalTasks = TASKS.length;

  // Core team headcount: active members, excluding "Affiliated" group.
  var teamCount = 0;
  if (typeof RESOURCES_DATA !== 'undefined' && RESOURCES_DATA && RESOURCES_DATA.people) {
    Object.keys(RESOURCES_DATA.people).forEach(function(n) {
      var pp = RESOURCES_DATA.people[n];
      if (pp && pp.active !== false && pp.member_group !== 'Affiliated') teamCount++;
    });
  }
  if (!teamCount) teamCount = 10; // fallback when RESOURCES_DATA hasn't loaded

  // Completions in the last 16 weeks (matches the Slideshow throughput slide window).
  var todayMs = Date.now();
  var sixteenStr = new Date(todayMs - 16 * 7 * 86400000).toISOString().slice(0, 10);
  var completed16w = PROJECTS.filter(function(p) {
    return p.status === 'Complete' && p.actual_end && p.actual_end >= sixteenStr;
  }).length;

  // Top partner departments — substring-match on partner_dept (lowercased)
  // so variations like "Tucson Water" / "Water Department" all collapse.
  var partners = [
    { name: 'Water',                            icon: '💧', match: ['water'] },
    { name: 'Transportation',                   icon: '🛣️', match: ['transportation'] },
    { name: 'Police',                           icon: '🛡️', match: ['police'] },
    { name: 'Housing',                          icon: '🏠', match: ['housing'] },
    { name: 'Planning & Development Services',  icon: '📐', match: ['planning'] },
  ];
  partners.forEach(function(pt) {
    pt.count = PROJECTS.filter(function(p) {
      if (p.status !== 'Active') return false;
      var dept = (p.partner_dept || '').toLowerCase();
      return pt.match.some(function(m) { return dept.indexOf(m) >= 0; });
    }).length;
  });

  // ── Static content ──────────────────────────────────────────────
  var services = [
    { icon: '📊', title: 'Analytics & Dashboards',    desc: 'We turn city data into reports, dashboards, and analyses leaders and managers can act on.' },
    { icon: '🗺️', title: 'GIS & Mapping',             desc: 'We provide mapping and spatial analysis for departments that work with location data.' },
    { icon: '⚖️', title: 'Data Governance',           desc: 'We set the policies and standards for how the city manages, shares, and protects its data.' },
    { icon: '🛠️', title: 'Data Tools & Applications', desc: 'We build the custom applications and integrations that move data where it needs to go.' },
    { icon: '✅', title: 'Data Quality & Trust',       desc: 'We build the methodology that helps departments measure and improve the quality of their data.' },
    { icon: '🎓', title: 'Data Literacy & Training',   desc: 'We help city staff find, understand, and use data confidently.' }
  ];

  var goals = [
    { num: '1', title: 'The Data Trust Scorecard moves from methodology to practice.',
      body: 'We finalize the framework (<code>DP109</code>) and apply it to the Safe City datasets (<code>DP175</code>), giving the program a defensible measure of data quality the rest of the city can adopt.' },
    { num: '2', title: 'Safe City data is in active use across departments.',
      body: 'Department leaders are using the datasets we&rsquo;ve prepared with them to drive program and operational decisions.' },
    { num: '3', title: 'We advance on at least one foundational maturity area.',
      body: 'The city moves from <strong>Gap</strong> to <strong>In Progress</strong> in data strategy, open data, or program performance measurement, and the WWC criteria reflect it.' },
    { num: '4', title: 'The roadmap operates in the open.',
      body: 'Any department can see where their work fits, what&rsquo;s coming next, and how the pieces connect.' }
  ];

  var roster = [
    { initials: 'PJ', name: 'Peter Johnson',           role: 'Data Intelligence Manager',          lead: true },
    { initials: 'JF', name: 'Jessica Fraver',          role: 'Lead GIS Analyst',                   lead: true },
    { initials: 'JM', name: 'James McGinnis',          role: 'Lead Data Analyst',                  lead: true },
    { initials: 'KC', name: 'Kate Carter',             role: 'AI Program Manager',                 lead: true },
    { initials: 'LW', name: 'Liz Wilshin',             role: 'GIS Enterprise Analyst',             lead: false },
    { initials: 'AS', name: 'Andrew Sutton',           role: 'Data Analyst II<br>IT Data Officer', lead: false },
    { initials: 'DJ', name: 'Daniel Jackson-Reeves',   role: 'Data Analyst II',                    lead: false },
    { initials: 'JP', name: 'Jean Paul Nduwayo Ntore', role: 'Data Analyst II',                    lead: false },
    { initials: 'VB', name: 'Vladimir Berg',           role: 'GIS Analyst II',                     lead: false },
    { initials: 'JA', name: 'Joey Ahumada',            role: 'IT Analyst',                         lead: false }
  ];

  // ── HTML build ──────────────────────────────────────────────────
  var html = '<div class="ov-page">';

  // Hero
  html += '<section class="ov-hero">';
  html +=   '<div class="ov-hero-eyebrow"><span class="ov-accent">CITY OF TUCSON</span> &middot; DATA INTELLIGENCE TEAM &middot; INFORMATION TECHNOLOGY</div>';
  html +=   '<h1 class="ov-hero-mission">We build the foundation that lets the city run on data its leaders and departments can act on.</h1>';
  html +=   '<div class="ov-hero-stats">';
  html +=     '<div class="ov-stat"><span class="ov-stat-num">' + teamCount + '</span><span class="ov-stat-lbl">team members</span></div>';
  html +=     '<div class="ov-stat"><span class="ov-stat-num">' + partners.length + '</span><span class="ov-stat-lbl">top partner departments</span></div>';
  html +=     '<div class="ov-stat"><span class="ov-stat-num">' + totalProjects.toLocaleString() + '</span><span class="ov-stat-lbl">projects tracked</span></div>';
  html +=     '<div class="ov-stat"><span class="ov-stat-num">' + totalTasks.toLocaleString() + '</span><span class="ov-stat-lbl">tasks tracked</span></div>';
  html +=     '<div class="ov-stat"><span class="ov-stat-num">' + completed16w + '</span><span class="ov-stat-lbl">completed in last 16 weeks</span></div>';
  html +=   '</div>';
  html += '</section>';

  // Services
  html += '<section class="ov-section">';
  html +=   '<h2>What we do</h2>';
  html +=   '<p class="ov-lede">Six service areas spanning the data lifecycle &mdash; from policy and standards to the products partner departments use every day.</p>';
  html +=   '<div class="ov-services">';
  services.forEach(function(s) {
    html += '<div class="ov-service">';
    html +=   '<span class="ov-service-icon">' + s.icon + '</span>';
    html +=   '<div class="ov-service-title">' + esc(s.title) + '</div>';
    html +=   '<div class="ov-service-desc">' + esc(s.desc) + '</div>';
    html += '</div>';
  });
  html +=   '</div>';
  html += '</section>';

  // Goals
  html += '<section class="ov-section">';
  html +=   '<h2>Where we&rsquo;re going &middot; 2026</h2>';
  html +=   '<p class="ov-lede">Four bets that define a successful year.</p>';
  html +=   '<div class="ov-goals">';
  goals.forEach(function(g) {
    html += '<div class="ov-goal">';
    html +=   '<div class="ov-goal-num">' + g.num + '</div>';
    html +=   '<div>';
    html +=     '<div class="ov-goal-title">' + esc(g.title) + '</div>';
    html +=     '<div class="ov-goal-body">' + g.body + '</div>'; // intentional HTML
    html +=   '</div>';
    html += '</div>';
  });
  html +=   '</div>';
  html += '</section>';

  // Team
  html += '<section class="ov-section">';
  html +=   '<h2>The team</h2>';
  html +=   '<p class="ov-lede">Ten people doing analytics, GIS, governance, and AI work for the city.</p>';
  html +=   '<div class="ov-team">';
  roster.forEach(function(p) {
    html += '<div class="ov-person' + (p.lead ? ' lead' : '') + '">';
    html +=   '<div class="ov-avatar">' + esc(p.initials) + '</div>';
    html +=   '<div class="ov-person-name">' + esc(p.name) + '</div>';
    html +=   '<div class="ov-person-role">' + p.role + '</div>'; // role contains <br> for one row
    html += '</div>';
  });
  html +=   '</div>';
  html += '</section>';

  // Partners
  html += '<section class="ov-section">';
  html +=   '<h2>Departments we partner with</h2>';
  html +=   '<p class="ov-lede">Where most of our active work happens &mdash; though we serve every department in the city.</p>';
  html +=   '<div class="ov-partners">';
  partners.forEach(function(pt) {
    html += '<div class="ov-partner">';
    html +=   '<span class="ov-partner-icon">' + pt.icon + '</span>';
    html +=   '<div class="ov-partner-name">' + esc(pt.name) + '</div>';
    html +=   '<div class="ov-partner-meta">' + pt.count + ' active project' + (pt.count === 1 ? '' : 's') + '</div>';
    html += '</div>';
  });
  html +=   '</div>';
  html += '</section>';

  // About this app
  html += '<section class="ov-about">';
  html +=   '<div>';
  html +=     '<div class="ov-about-title">About this app</div>';
  html +=     '<p class="ov-about-body">The <strong>Analytics Project Tracker</strong> is how we run the team&rsquo;s portfolio. Every active project, task, time entry, capacity allocation, and submitted idea lives here. The public <strong>Slideshow</strong> tab makes a slice of it visible to the rest of the city in real time. The <strong>User Guide</strong> covers how each tab works for team members, leads, and admins.</p>';
  html +=   '</div>';
  html +=   '<a href="javascript:void(0)" onclick="window.open(\'guide.html\',\'_blank\')" class="ov-about-cta">Open the User Guide &rarr;</a>';
  html += '</section>';

  html += '</div>';

  area.innerHTML = html;
  var rc = document.getElementById('result-count');
  if (rc) rc.textContent = PROJECTS.length + ' projects · ' + TASKS.length + ' tasks';
}
