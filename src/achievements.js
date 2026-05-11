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

function _achTile(icon, num, label, sub) {
  return '<div class="achievement-tile">' +
    '<div class="ach-icon">' + icon + '</div>' +
    '<div class="ach-num">' + num + '</div>' +
    '<div class="ach-label">' + esc(label) + '</div>' +
    (sub ? '<div class="ach-sub">' + esc(sub) + '</div>' : '') +
  '</div>';
}

function renderAchievementsPanel(name, opts) {
  if (typeof UserPrefs !== 'undefined' && UserPrefs && UserPrefs.showAchievements === false) return '';
  if (!name) return '';
  opts = opts || {};

  var streak = computeTimeLoggingStreak(name);
  var tAll = tasksCompletedAllTime(name);
  var tMon = tasksCompletedThisMonth(name);
  var proj = projectsShipped(name);
  var wkHrs = hoursThisWeek(name);

  // Don't take up real estate for fresh accounts with nothing to show.
  if (!streak && !tAll && !proj && !wkHrs) return '';

  var isSelf = (typeof Auth !== 'undefined' && Auth.fullName === name);
  var title = isSelf ? '✨ Your achievements' : '✨ ' + esc(name.split(' ')[0]) + '\'s achievements';

  var streakSub = streak === 0 ? 'Log time to start one' : (streak >= 7 ? 'Keep it up!' : null);
  var taskSub = tMon > 0 ? tMon + ' this month' : null;

  var html = '<div class="achievements-panel">';
  html += '<div class="achievements-header">';
  html += '<span class="achievements-title">' + title + '</span>';
  html += '</div>';
  html += '<div class="achievements-grid">';
  html += _achTile(streakFlame(streak), streak, streak === 1 ? 'day streak' : 'day streak', streakSub);
  html += _achTile('🎯', tAll, tAll === 1 ? 'task done' : 'tasks done', taskSub);
  html += _achTile('🏆', proj, proj === 1 ? 'project shipped' : 'projects shipped', null);
  html += _achTile('⏱', wkHrs, 'h this week', null);
  html += '</div>';
  html += '</div>';
  return html;
}
