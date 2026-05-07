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

  // ── Project pipeline data ───────────────────────────────────
  var pipelineStatuses = ['Active', 'On Hold', 'Waiting for Response', 'Scheduled', 'Future', 'Idea'];
  var pipelineCounts = {};
  var pipelineTotal = 0;
  pipelineStatuses.forEach(function(s) { pipelineCounts[s] = 0; });
  PROJECTS.forEach(function(p) {
    if (pipelineCounts.hasOwnProperty(p.status)) { pipelineCounts[p.status]++; pipelineTotal++; }
  });
  var maxPipeline = Math.max.apply(null, pipelineStatuses.map(function(s) { return pipelineCounts[s]; })) || 1;
  var completedCount = PROJECTS.filter(function(p) { return p.status === 'Complete'; }).length;
  var pipelineHtml = '';
  pipelineHtml += '<div class="slideshow-pipeline-card">';
  pipelineHtml += '<div class="slideshow-pipeline-visual">';
  pipelineHtml += '<div class="slideshow-pipeline-head">Pipeline momentum</div>';
  pipelineHtml += '<div class="slideshow-pipeline-main">';
  pipelineHtml += '<div class="slideshow-pipeline-hero">';
  pipelineHtml += '<div class="slideshow-pipeline-hero-value">' + pipelineTotal + '</div>';
  pipelineHtml += '<div class="slideshow-pipeline-hero-caption">Open projects</div>';
  pipelineHtml += '</div>';
  pipelineHtml += '<div class="slideshow-pipeline-stages">';
  pipelineStatuses.forEach(function(s) {
    var cnt = pipelineCounts[s];
    if (cnt === 0) return;
    var sc = STATUS_COLOR(s) || '#9CA3AF';
    var title = s === 'Waiting for Response' ? 'Waiting' : s;
    pipelineHtml += '<div class="slideshow-pipeline-node" style="background:' + sc + ';">';
    pipelineHtml += '<div class="slideshow-pipeline-node-label">' + esc(title) + '</div>';
    pipelineHtml += '<div class="slideshow-pipeline-node-value">' + cnt + '</div>';
    pipelineHtml += '</div>';
  });
  pipelineHtml += '</div>';
  pipelineHtml += '</div>';
  pipelineHtml += '<div class="slideshow-pipeline-metrics">';
  pipelineHtml += '<div class="slideshow-pipeline-chip"><strong>' + pipelineTotal + '</strong><span>Open pipeline</span></div>';
  pipelineHtml += '<div class="slideshow-pipeline-chip"><strong>' + completedCount + '</strong><span>Completed projects</span></div>';
  pipelineHtml += '<div class="slideshow-pipeline-chip"><strong>' + PROJECTS.length + '</strong><span>Total tracked</span></div>';
  pipelineHtml += '</div>';
  pipelineHtml += '<div class="slideshow-pipeline-footer">' + pipelineTotal + ' open · ' + completedCount + ' completed · ' + PROJECTS.length + ' total</div>';
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
  var catHtml = '<div style="display:flex;gap:12px;font-size:12px;color:var(--text-muted);margin-bottom:10px;flex-wrap:wrap;">';
  catHtml += '<span><span style="width:8px;height:8px;border-radius:2px;background:#83AC16;display:inline-block;margin-right:3px;vertical-align:middle;"></span>Active</span>';
  catHtml += '<span><span style="width:8px;height:8px;border-radius:2px;background:#FFDB22;display:inline-block;margin-right:3px;vertical-align:middle;"></span>On hold</span>';
  catHtml += '<span><span style="width:8px;height:8px;border-radius:2px;background:#002669;display:inline-block;margin-right:3px;vertical-align:middle;"></span>Waiting</span>';
  catHtml += '<span><span style="width:8px;height:8px;border-radius:2px;background:#9E0059;display:inline-block;margin-right:3px;vertical-align:middle;"></span>Future / Scheduled</span>';
  catHtml += '</div>';
  catEntries.forEach(function(e) {
    var cat = e[0], d = e[1];
    var aPct = Math.round(d.active / maxCat * 100);
    var hPct = Math.round(d.onHold / maxCat * 100);
    var wPct = Math.round(d.waiting / maxCat * 100);
    var fPct = Math.round(d.futureScheduled / maxCat * 100);
    catHtml += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:13px;">';
    catHtml += '<div style="width:200px;text-align:right;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">' + esc(cat) + '</div>';
    catHtml += '<div style="flex:1;height:18px;background:var(--bg-surface, #F3F1EB);border-radius:2px;overflow:hidden;display:flex;">';
    if (d.active) catHtml += '<span style="width:' + aPct + '%;height:100%;background:#83AC16;"></span>';
    if (d.onHold) catHtml += '<span style="width:' + hPct + '%;height:100%;background:#FFDB22;"></span>';
    if (d.waiting) catHtml += '<span style="width:' + wPct + '%;height:100%;background:#002669;"></span>';
    if (d.futureScheduled) catHtml += '<span style="width:' + fPct + '%;height:100%;background:#9E0059;"></span>';
    catHtml += '</div>';
    catHtml += '<div style="width:22px;font-size:13px;font-weight:700;color:var(--text-muted);flex-shrink:0;text-align:right;">' + d.total + '</div>';
    catHtml += '</div>';
  });

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
    { id: 'pipeline',  title: 'Project pipeline',                                html: pipelineHtml },
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

// ─── OVERVIEW ─────────────────────────────────────────────────────────
function renderOverview(area) {
  var slides = _buildOverviewSlides();
  var byId = {};
  slides.forEach(function(s) { byId[s.id] = s; });

  function secHdr(label) { return '<div style="font-size:15px;font-weight:700;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid var(--border);">' + label + '</div>'; }
  function card(title, content) { return '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px 18px;"><div style="font-size:15px;font-weight:700;color:var(--text-body);margin-bottom:12px;">' + title + '</div>' + content + '</div>'; }

  var html = '';
  // Row 1: Portfolio snapshot — 4 KPI cards in a row, full-width
  html += '<div style="margin-bottom:16px;">';
  html += secHdr(byId.snapshot.title);
  html += byId.snapshot.html;
  html += '</div>';

  // Row 2: pipeline + deadlines
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
  html += card(byId.pipeline.title, byId.pipeline.html);
  html += card(byId.deadlines.title, byId.deadlines.html);
  html += '</div>';

  // Row 3: priority + category
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
  html += card(byId.priority.title, byId.priority.html);
  html += card(byId.category.title, byId.category.html);
  html += '</div>';

  // Row 4: intake balance + overdue trend
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
  html += card(byId.intake.title, byId.intake.html);
  html += card(byId.overdue.title, byId.overdue.html);
  html += '</div>';

  area.innerHTML = html;
  document.getElementById('result-count').textContent = PROJECTS.length + ' projects · ' + TASKS.length + ' tasks';
}
