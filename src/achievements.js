// ─────────────────────────────────────────────────────────────────────
// achievements.js — quiet gamification of personal productivity.
//
// Derives a small set of stats from existing TASKS / PROJECTS /
// TIME_ENTRIES arrays for the given person, and renders a 4-tile panel
// (streak, tasks done, projects shipped, hours this week). No new AGO
// fields — everything's computed on the client at render time.
//
// Surfaced on the My Work tab above the operational KPIs. Hidden if
// UserPrefs.showAchievements === false.
// ─────────────────────────────────────────────────────────────────────

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Consecutive workdays (Mon–Fri) ending today or the most recent workday
// where the user logged at least one time entry. Weekends are skipped (not
// required, not broken). Returns 0 if the most recent weekday had no entry.
function computeTimeLoggingStreak(name) {
  if (typeof TIME_ENTRIES === 'undefined' || !name) return 0;
  var dates = {};
  for (var i = 0; i < TIME_ENTRIES.length; i++) {
    var e = TIME_ENTRIES[i];
    if (e.name === name && e.work_date) dates[e.work_date] = true;
  }
  if (!Object.keys(dates).length) return 0;

  var d = new Date();
  // Roll back from a weekend so we start counting on the most recent workday.
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);

  // Grace: if today (a workday) has no entry yet, allow the streak to be
  // "alive" if yesterday's workday had one. Otherwise streak = 0.
  if (!dates[ymd(d)]) {
    d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    if (!dates[ymd(d)]) return 0;
  }

  var streak = 0;
  for (var safety = 0; safety < 400; safety++) {
    var dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      if (!dates[ymd(d)]) break;
      streak++;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function tasksCompletedAllTime(name) {
  if (typeof TASKS === 'undefined' || !name) return 0;
  var c = 0;
  for (var i = 0; i < TASKS.length; i++) {
    var t = TASKS[i];
    if (t.assignee === name && t.status === 'Complete') c++;
  }
  return c;
}

function tasksCompletedThisMonth(name) {
  if (typeof TASKS === 'undefined' || !name) return 0;
  var now = new Date();
  var prefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var c = 0;
  for (var i = 0; i < TASKS.length; i++) {
    var t = TASKS[i];
    if (t.assignee === name && t.status === 'Complete' && t.actual_end && String(t.actual_end).indexOf(prefix) === 0) c++;
  }
  return c;
}

function projectsShipped(name) {
  if (typeof PROJECTS === 'undefined' || !name) return 0;
  var c = 0;
  for (var i = 0; i < PROJECTS.length; i++) {
    var p = PROJECTS[i];
    if (p.contact === name && p.status === 'Complete') c++;
  }
  return c;
}

function hoursThisWeek(name) {
  if (typeof getWeekEntries !== 'function') return 0;
  var entries = getWeekEntries();
  var total = 0;
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.name === name && e.end_time) total += (e.hours || 0);
  }
  return Math.round(total * 10) / 10;
}

// Flame tier — keeps the streak number consistent but escalates the glyph.
function streakFlame(n) {
  if (n >= 30) return '🔥🔥🔥';
  if (n >= 14) return '🔥🔥';
  if (n >= 1) return '🔥';
  return '✨';
}

function _achTile(icon, num, label) {
  return '<div class="achievement-tile">' +
    '<div class="ach-icon">' + icon + '</div>' +
    '<div>' +
      '<div class="ach-num">' + num + '</div>' +
      '<div class="ach-label">' + esc(label) + '</div>' +
    '</div>' +
  '</div>';
}

// ── Extended stats for the full Achievements tab ──────────────────────

// Walk every work_date the user has logged and find the longest run of
// consecutive workdays. Returns { length, start, end } or { length:0 }.
function longestStreakEver(name) {
  if (typeof TIME_ENTRIES === 'undefined' || !name) return { length: 0, start: null, end: null };
  var dates = [];
  var seen = {};
  for (var i = 0; i < TIME_ENTRIES.length; i++) {
    var e = TIME_ENTRIES[i];
    if (e.name === name && e.work_date && !seen[e.work_date]) {
      seen[e.work_date] = true;
      dates.push(e.work_date);
    }
  }
  if (!dates.length) return { length: 0, start: null, end: null };
  dates.sort();

  // For each unique workday in our set, count forward consecutive workdays
  // (skipping weekends). Track the longest run.
  var best = { length: 0, start: null, end: null };
  for (var di = 0; di < dates.length; di++) {
    if (di > 0) {
      // Skip starts that aren't the first day of a run.
      var prev = new Date(dates[di - 1] + 'T00:00:00');
      var curr = new Date(dates[di] + 'T00:00:00');
      // If prev → curr is one workday step (i.e. curr is the next workday
      // after prev), then this date is a continuation, not a start.
      var stepDate = new Date(prev);
      do {
        stepDate.setDate(stepDate.getDate() + 1);
      } while (stepDate.getDay() === 0 || stepDate.getDay() === 6);
      if (ymd(stepDate) === dates[di]) continue;
    }
    // Count run starting at dates[di]
    var run = 1;
    var startStr = dates[di];
    var d = new Date(startStr + 'T00:00:00');
    while (true) {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      if (!seen[ymd(d)]) break;
      run++;
      if (run > 1000) break;
    }
    // Find the end date (last day of the run)
    var endDate = new Date(startStr + 'T00:00:00');
    var added = 0;
    while (added < run - 1) {
      endDate.setDate(endDate.getDate() + 1);
      if (endDate.getDay() !== 0 && endDate.getDay() !== 6) added++;
    }
    if (run > best.length) best = { length: run, start: startStr, end: ymd(endDate) };
  }
  return best;
}

function lifetimeHours(name) {
  if (typeof TIME_ENTRIES === 'undefined' || !name) return 0;
  var total = 0;
  for (var i = 0; i < TIME_ENTRIES.length; i++) {
    var e = TIME_ENTRIES[i];
    if (e.name === name && e.end_time) total += (e.hours || 0);
  }
  return Math.round(total * 10) / 10;
}

function daysActive(name) {
  if (typeof TIME_ENTRIES === 'undefined' || !name) return 0;
  var seen = {};
  for (var i = 0; i < TIME_ENTRIES.length; i++) {
    var e = TIME_ENTRIES[i];
    if (e.name === name && e.work_date) seen[e.work_date] = true;
  }
  return Object.keys(seen).length;
}

function memberSinceDate(name) {
  if (typeof TIME_ENTRIES === 'undefined' || !name) return null;
  var earliest = null;
  for (var i = 0; i < TIME_ENTRIES.length; i++) {
    var e = TIME_ENTRIES[i];
    if (e.name === name && e.work_date) {
      if (!earliest || e.work_date < earliest) earliest = e.work_date;
    }
  }
  return earliest;
}

function monthsBetween(startDateStr) {
  if (!startDateStr) return 0;
  var s = new Date(startDateStr + 'T00:00:00');
  var n = new Date();
  return (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth());
}

function tasksThisYear(name) {
  if (typeof TASKS === 'undefined' || !name) return 0;
  var y = String(new Date().getFullYear());
  var c = 0;
  for (var i = 0; i < TASKS.length; i++) {
    var t = TASKS[i];
    if (t.assignee === name && t.status === 'Complete' && t.actual_end && String(t.actual_end).indexOf(y) === 0) c++;
  }
  return c;
}

function projectsThisYear(name) {
  if (typeof PROJECTS === 'undefined' || !name) return 0;
  var y = String(new Date().getFullYear());
  var c = 0;
  for (var i = 0; i < PROJECTS.length; i++) {
    var p = PROJECTS[i];
    if (p.contact === name && p.status === 'Complete' && p.actual_end && String(p.actual_end).indexOf(y) === 0) c++;
  }
  return c;
}

function hoursThisYear(name) {
  if (typeof TIME_ENTRIES === 'undefined' || !name) return 0;
  var y = String(new Date().getFullYear());
  var total = 0;
  for (var i = 0; i < TIME_ENTRIES.length; i++) {
    var e = TIME_ENTRIES[i];
    if (e.name === name && e.end_time && e.work_date && String(e.work_date).indexOf(y) === 0) total += (e.hours || 0);
  }
  return Math.round(total * 10) / 10;
}

function weeksActiveThisYear(name) {
  if (typeof TIME_ENTRIES === 'undefined' || !name) return 0;
  var y = String(new Date().getFullYear());
  var weeks = {};
  for (var i = 0; i < TIME_ENTRIES.length; i++) {
    var e = TIME_ENTRIES[i];
    if (e.name === name && e.work_date && String(e.work_date).indexOf(y) === 0) {
      var d = new Date(e.work_date + 'T00:00:00');
      // ISO-style: year + week-of-year (rough — Monday-anchored)
      var jan1 = new Date(d.getFullYear(), 0, 1);
      var dayOfYear = Math.floor((d - jan1) / 86400000);
      var weekNum = Math.floor((dayOfYear + jan1.getDay()) / 7);
      weeks[d.getFullYear() + '-' + weekNum] = true;
    }
  }
  return Object.keys(weeks).length;
}

// Best week: most tasks closed in a single ISO-ish week. Returns
// { count, label } or null.
function bestWeek(name) {
  if (typeof TASKS === 'undefined' || !name) return null;
  var weeks = {};
  for (var i = 0; i < TASKS.length; i++) {
    var t = TASKS[i];
    if (t.assignee !== name || t.status !== 'Complete' || !t.actual_end) continue;
    var d = new Date(t.actual_end + 'T00:00:00');
    // Monday-anchored week: shift to Monday of that week
    var dow = d.getDay() || 7; // Sun=7
    var monday = new Date(d);
    monday.setDate(d.getDate() - (dow - 1));
    var key = ymd(monday);
    weeks[key] = (weeks[key] || 0) + 1;
  }
  var bestKey = null, bestCount = 0;
  Object.keys(weeks).forEach(function(k) {
    if (weeks[k] > bestCount) { bestCount = weeks[k]; bestKey = k; }
  });
  if (!bestKey) return null;
  var start = new Date(bestKey + 'T00:00:00');
  var end = new Date(start); end.setDate(start.getDate() + 4); // Mon..Fri
  var fmt = function(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  return { count: bestCount, label: fmt(start) + ' – ' + fmt(end) + ', ' + start.getFullYear() };
}

function longestDay(name) {
  if (typeof TIME_ENTRIES === 'undefined' || !name) return null;
  var byDate = {};
  for (var i = 0; i < TIME_ENTRIES.length; i++) {
    var e = TIME_ENTRIES[i];
    if (e.name === name && e.end_time && e.work_date) {
      byDate[e.work_date] = (byDate[e.work_date] || 0) + (e.hours || 0);
    }
  }
  var bestKey = null, bestHrs = 0;
  Object.keys(byDate).forEach(function(k) {
    if (byDate[k] > bestHrs) { bestHrs = byDate[k]; bestKey = k; }
  });
  if (!bestKey) return null;
  var d = new Date(bestKey + 'T00:00:00');
  return { hours: Math.round(bestHrs * 10) / 10, date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) };
}

function biggestProject(name) {
  if (typeof TIME_ENTRIES === 'undefined' || typeof TASKS === 'undefined' || !name) return null;
  // Sum hours per project_id for tasks the user logged time on.
  var byProj = {};
  var taskIdxToProj = {};
  for (var i = 0; i < TASKS.length; i++) {
    var t = TASKS[i];
    if (!t || t.idx == null) continue;
    var key = t.project || (t.project_id != null ? String(t.project_id) : 'Unassigned');
    taskIdxToProj[t.idx] = key;
  }
  for (var j = 0; j < TIME_ENTRIES.length; j++) {
    var e = TIME_ENTRIES[j];
    if (e.name !== name || !e.end_time) continue;
    var proj = taskIdxToProj[e.task_idx];
    if (!proj) continue;
    byProj[proj] = (byProj[proj] || 0) + (e.hours || 0);
  }
  var bestProj = null, bestHrs = 0;
  Object.keys(byProj).forEach(function(p) {
    if (byProj[p] > bestHrs) { bestHrs = byProj[p]; bestProj = p; }
  });
  if (!bestProj) return null;
  return { name: bestProj, hours: Math.round(bestHrs * 10) / 10 };
}

function categoriesExplored(name) {
  if (typeof TASKS === 'undefined' || !name) return { count: 0, total: 0 };
  var seen = {};
  for (var i = 0; i < TASKS.length; i++) {
    var t = TASKS[i];
    if (t.assignee === name && t.category) seen[t.category] = true;
  }
  var totalEnum = (typeof FM_TASK_CATEGORIES !== 'undefined' && FM_TASK_CATEGORIES) ? FM_TASK_CATEGORIES.length : Object.keys(seen).length;
  return { count: Object.keys(seen).length, total: totalEnum };
}

function toolsUsed(name) {
  if (typeof TASKS === 'undefined' || !name) return { count: 0, total: 0 };
  var seen = {};
  for (var i = 0; i < TASKS.length; i++) {
    var t = TASKS[i];
    if (t.assignee === name && t.tool) seen[t.tool] = true;
  }
  var totalEnum = (typeof FM_TASK_TOOLS !== 'undefined' && FM_TASK_TOOLS) ? FM_TASK_TOOLS.length : Object.keys(seen).length;
  return { count: Object.keys(seen).length, total: totalEnum };
}

function projectsContributedTo(name) {
  if (typeof PROJECTS === 'undefined' || typeof TASKS === 'undefined' || !name) return 0;
  var seen = {};
  for (var i = 0; i < PROJECTS.length; i++) {
    var p = PROJECTS[i];
    if (p.contact === name) seen[p.id] = true;
    if (p.other_members && p.other_members.indexOf(name) >= 0) seen[p.id] = true;
  }
  for (var j = 0; j < TASKS.length; j++) {
    var t = TASKS[j];
    if (t.assignee === name && t.project_id != null) seen[t.project_id] = true;
  }
  return Object.keys(seen).length;
}

function teammatesWorkedWith(name) {
  if (typeof PROJECTS === 'undefined' || !name) return 0;
  var others = {};
  // Find all projects where user is involved, then collect other contacts
  // and other_members from those projects.
  for (var i = 0; i < PROJECTS.length; i++) {
    var p = PROJECTS[i];
    var userIn = (p.contact === name) || (p.other_members && p.other_members.indexOf(name) >= 0);
    if (!userIn) continue;
    if (p.contact && p.contact !== name) others[p.contact] = true;
    if (p.other_members) {
      String(p.other_members).split(',').forEach(function(n) {
        var nm = n.trim();
        if (nm && nm !== name) others[nm] = true;
      });
    }
  }
  return Object.keys(others).length;
}

// Milestone definitions: tier label, glyph, threshold, current-value
// extractor, and friendly format for the "current / threshold" subtitle.
function _milestonesFor(name) {
  var lh = lifetimeHours(name);
  var tAll = tasksCompletedAllTime(name);
  var pAll = projectsShipped(name);
  var longest = longestStreakEver(name).length;
  return [
    { group: 'Hours logged', glyph: '🥇', name: '100 hours logged',  threshold: 100,  current: lh },
    { group: 'Hours logged', glyph: '🥈', name: '500 hours logged',  threshold: 500,  current: lh },
    { group: 'Hours logged', glyph: '🥉', name: '1,000 hours logged',threshold: 1000, current: lh },
    { group: 'Hours logged', glyph: '🏆', name: '2,500 hours logged',threshold: 2500, current: lh },
    { group: 'Tasks',        glyph: '🥇', name: '10 tasks closed',   threshold: 10,   current: tAll },
    { group: 'Tasks',        glyph: '🥈', name: '50 tasks closed',   threshold: 50,   current: tAll },
    { group: 'Tasks',        glyph: '🥉', name: '100 tasks closed',  threshold: 100,  current: tAll },
    { group: 'Tasks',        glyph: '🏆', name: '250 tasks closed',  threshold: 250,  current: tAll },
    { group: 'Projects',     glyph: '🚀', name: 'First project shipped', threshold: 1, current: pAll },
    { group: 'Projects',     glyph: '🥈', name: '5 projects shipped',    threshold: 5, current: pAll },
    { group: 'Projects',     glyph: '🥇', name: '10 projects shipped',   threshold: 10, current: pAll },
    { group: 'Streaks',      glyph: '🔥', name: '7-day streak',     threshold: 7,  current: longest },
    { group: 'Streaks',      glyph: '🔥🔥',name: '14-day streak',    threshold: 14, current: longest },
    { group: 'Streaks',      glyph: '🔥🔥🔥', name: '30-day streak', threshold: 30, current: longest }
  ];
}

function renderAchievementsPanel(name, opts) {
  if (typeof UserPrefs !== 'undefined' && UserPrefs && UserPrefs.showAchievements === false) return '';
  if (!name) return '';
  opts = opts || {};

  var streak = computeTimeLoggingStreak(name);
  var tMon = tasksCompletedThisMonth(name);
  var proj = projectsShipped(name);
  var wkHrs = hoursThisWeek(name);

  // Don't take up real estate for fresh accounts with nothing to show.
  if (!streak && !tasksCompletedAllTime(name) && !proj && !wkHrs) return '';

  var isSelf = (typeof Auth !== 'undefined' && Auth.fullName === name);
  var title = isSelf ? '✨ Your achievements' : '✨ ' + esc(name.split(' ')[0]) + '\'s achievements';

  var html = '<div class="achievements-panel">';
  html += '<div class="achievements-header">';
  html += '<span class="achievements-title">' + title + '</span>';
  // Link to full breakdown — placeholder for now; switches to the
  // Achievements tab once that's built.
  html += '<a class="achievements-link" href="javascript:void(0)" onclick="switchTab(\'achievements\')">View all →</a>';
  html += '</div>';
  html += '<div class="achievements-grid">';
  html += _achTile(streakFlame(streak), streak, 'day streak');
  html += _achTile('🎯', tMon, 'tasks · month');
  html += _achTile('⏱', wkHrs + 'h', 'this week');
  html += _achTile('🏆', proj, proj === 1 ? 'project shipped' : 'projects shipped');
  html += '</div>';
  html += '</div>';
  return html;
}

// ── Full Achievements tab ─────────────────────────────────────────────

function _atTile(icon, num, label, sub, featured) {
  return '<div class="at-tile' + (featured ? ' featured' : '') + '">' +
    '<div class="at-tile-icon">' + icon + '</div>' +
    '<div class="at-tile-num">' + num + '</div>' +
    '<div class="at-tile-label">' + esc(label) + '</div>' +
    (sub ? '<div class="at-tile-sub">' + esc(sub) + '</div>' : '<div class="at-tile-sub">&nbsp;</div>') +
  '</div>';
}

function _atRecordRow(icon, label, value, when) {
  return '<div class="at-record">' +
    '<span><span class="at-record-icon">' + icon + '</span> <strong>' + esc(label) + '</strong> — ' + esc(value) + '</span>' +
    (when ? '<span class="at-record-when">' + esc(when) + '</span>' : '') +
  '</div>';
}

function _atBreadthRow(label, current, total) {
  var pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 100;
  var hasTotal = total > 0 && total !== current;
  return '<div class="at-breadth">' +
    '<span class="at-breadth-label">' + esc(label) + '</span>' +
    '<span class="at-breadth-bar"><span class="at-breadth-fill" style="width:' + pct + '%;' + (hasTotal ? '' : 'background:var(--navy);') + '"></span></span>' +
    '<span class="at-breadth-count">' + current + (hasTotal ? ' / ' + total : '') + '</span>' +
  '</div>';
}

function _atMedal(m) {
  var unlocked = m.current >= m.threshold;
  if (unlocked) {
    return '<div class="at-medal unlocked">' +
      '<div class="at-medal-glyph">' + m.glyph + '</div>' +
      '<div class="at-medal-body">' +
        '<div class="at-medal-name">' + esc(m.name) + '</div>' +
        '<div class="at-medal-status">Unlocked</div>' +
      '</div>' +
    '</div>';
  }
  var pct = Math.min(100, Math.round((m.current / m.threshold) * 100));
  return '<div class="at-medal locked">' +
    '<div class="at-medal-glyph">🔒</div>' +
    '<div class="at-medal-body">' +
      '<div class="at-medal-name">' + esc(m.name) + '</div>' +
      '<div class="at-medal-progress"><div class="at-medal-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="at-medal-status">' + m.current + ' / ' + m.threshold + '</div>' +
    '</div>' +
  '</div>';
}

function buildAchievementsPage() {
  if (typeof Auth === 'undefined' || !Auth.loggedIn || !Auth.fullName) {
    return '<div class="empty-state">Sign in to view your achievements.</div>';
  }
  var name = Auth.fullName;
  var isSelf = true;

  // ── Compute everything once ─────────────────────────────────
  var streak = computeTimeLoggingStreak(name);
  var tMon = tasksCompletedThisMonth(name);
  var wkHrs = hoursThisWeek(name);
  var proj = projectsShipped(name);
  var lh = lifetimeHours(name);
  var days = daysActive(name);
  var longest = longestStreakEver(name);
  var memberSince = memberSinceDate(name);
  var months = monthsBetween(memberSince);
  var tYr = tasksThisYear(name);
  var pYr = projectsThisYear(name);
  var hYr = hoursThisYear(name);
  var wYr = weeksActiveThisYear(name);
  var tAll = tasksCompletedAllTime(name);
  var best = bestWeek(name);
  var lDay = longestDay(name);
  var bigProj = biggestProject(name);
  var cats = categoriesExplored(name);
  var tools = toolsUsed(name);
  var pCount = projectsContributedTo(name);
  var teammates = teammatesWorkedWith(name);
  var medals = _milestonesFor(name);

  // ── Hero ────────────────────────────────────────────────────
  var initials = name.split(' ').map(function(w) { return (w[0] || '').toUpperCase(); }).slice(0, 2).join('');
  var avEmoji = getMemberAvatarEmoji ? getMemberAvatarEmoji(name) : '';
  var memberSinceLabel = memberSince
    ? new Date(memberSince + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—';
  var monthsLabel = months > 0 ? months + ' month' + (months !== 1 ? 's' : '') + ' strong · ' : '';
  var heroMeta = 'Tracker member since ' + memberSinceLabel + (memberSince ? ' · ' + monthsLabel : ' · ') + days + ' active day' + (days !== 1 ? 's' : '');

  var html = '<div class="at-page">';
  html += '<div class="at-hero">';
  html += '<div class="at-avatar' + (avEmoji ? ' user-emoji-av' : '') + '">' + (avEmoji || esc(initials)) + '</div>';
  html += '<div class="at-hero-info">';
  html += '<h1>' + esc(isSelf ? 'Your achievements' : name.split(' ')[0] + '\'s achievements') + '</h1>';
  html += '<div class="at-hero-meta">' + esc(heroMeta) + '</div>';
  html += '</div>';
  html += '</div>';

  // ── Right now ───────────────────────────────────────────────
  html += '<div class="at-section">';
  html += '<div class="at-section-title">Right now</div>';
  html += '<div class="at-grid">';
  html += _atTile(streakFlame(streak), streak, 'Day streak', streak > 0 ? 'Best ever: ' + longest.length : 'Log time to start', true);
  html += _atTile('🎯', tMon, 'Tasks this month', tAll + ' all-time');
  html += _atTile('⏱', wkHrs, 'Hours this week', wkHrs >= 30 ? 'Strong week!' : null);
  html += _atTile('🏆', proj, proj === 1 ? 'Project shipped' : 'Projects shipped', 'All-time');
  html += '</div></div>';

  // ── Lifetime ────────────────────────────────────────────────
  html += '<div class="at-section">';
  html += '<div class="at-section-title">Lifetime</div>';
  html += '<div class="at-grid">';
  html += _atTile('📅', days, 'Active days', 'Distinct days logged');
  html += _atTile('⌛', lh.toLocaleString(), 'Hours logged', 'Never resets');
  html += _atTile('🏅', longest.length, 'Longest streak',
    longest.start ? new Date(longest.start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' – ' + new Date(longest.end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null);
  html += _atTile('🎂', months, 'Months strong', 'Member since ' + memberSinceLabel);
  html += '</div></div>';

  // ── This year ───────────────────────────────────────────────
  html += '<div class="at-section">';
  html += '<div class="at-section-title">This year</div>';
  html += '<div class="at-grid">';
  html += _atTile('✓', tYr, 'Tasks closed', tAll > 0 ? Math.round((tYr / tAll) * 100) + '% of all-time' : null);
  html += _atTile('🏆', pYr, pYr === 1 ? 'Project shipped' : 'Projects shipped', null);
  html += _atTile('⌛', hYr, 'Hours logged', wYr > 0 ? Math.round(hYr / wYr) + 'h/wk avg' : null);
  html += _atTile('📅', wYr, 'Weeks active', null);
  html += '</div></div>';

  // ── Records ─────────────────────────────────────────────────
  html += '<div class="at-section">';
  html += '<div class="at-section-title">Records</div>';
  if (best) html += _atRecordRow('🏆', 'Best week', best.count + ' task' + (best.count !== 1 ? 's' : '') + ' closed', best.label);
  if (lDay) html += _atRecordRow('⚡', 'Longest day', lDay.hours + ' hours logged', lDay.date);
  if (longest.length > 0) html += _atRecordRow('🔥', 'Longest streak', longest.length + ' workdays',
    new Date(longest.start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' – ' + new Date(longest.end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  if (bigProj) html += _atRecordRow('🚀', 'Biggest project', bigProj.name, bigProj.hours + ' hours logged');
  if (!best && !lDay && !longest.length && !bigProj) html += '<div class="at-empty">No records yet — keep working!</div>';
  html += '</div>';

  // ── Breadth ─────────────────────────────────────────────────
  html += '<div class="at-section">';
  html += '<div class="at-section-title">Breadth</div>';
  html += _atBreadthRow('Categories', cats.count, cats.total);
  html += _atBreadthRow('Tools', tools.count, tools.total);
  html += _atBreadthRow('Projects', pCount, 0);
  html += _atBreadthRow('Teammates', teammates, 0);
  html += '</div>';

  // ── Milestones ──────────────────────────────────────────────
  html += '<div class="at-section">';
  html += '<div class="at-section-title">Milestones</div>';
  html += '<div class="at-medals">';
  medals.forEach(function(m) { html += _atMedal(m); });
  html += '</div></div>';

  html += '</div>'; // .at-page
  return html;
}
