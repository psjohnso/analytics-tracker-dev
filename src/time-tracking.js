// Time-tracking layer — extracted from index.html on 2026-05-22.
// Classic script: all functions/vars below are globals shared with the rest of
// the app via the shared global scope. Relies on globals defined elsewhere
// (TIME_ENTRIES, TASK_HOURS*, TASKS, PROJECTS, RESOURCES_DATA, STATUS_HISTORY,
// Auth, ARCGIS_CONFIG, agolQuery/agolApplyEdits, render, showToast, esc, …).

// ══════════════════════════════════════════════════════════════════════
//  TIME TRACKING
// ══════════════════════════════════════════════════════════════════════

function isTimeTrackingEnabled() {
  if (!Auth.fullName || !RESOURCES_DATA || !RESOURCES_DATA.people[Auth.fullName]) return false;
  return RESOURCES_DATA.people[Auth.fullName].time_tracking === true;
}

async function loadTaskHours() {
  try {
    // Query all completed time entries and aggregate hours by task_idx and by person
    const features = await agolQuery(ARCGIS_CONFIG.timeEntriesUrl, 'hours IS NOT NULL');
    TASK_HOURS = {};        // { task_idx: totalHours } — team total
    TASK_HOURS_BY_PERSON = {}; // { task_idx: { name: hours } }
    TEAM_TIME_STATS = {};   // { name: { totalHours, weekHours, lastDate, entryCount } }

    // Compute current week boundaries for "this week" stats
    var now = new Date();
    var dayOfWeek = now.getDay();
    var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    var weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    var weekStartStr = weekStart.getFullYear() + '-' + String(weekStart.getMonth()+1).padStart(2,'0') + '-' + String(weekStart.getDate()).padStart(2,'0');

    features.forEach(function(f) {
      const a = f.attributes;
      const idx = a.task_number || a.task_idx;
      const hrs = a.hours || 0;
      const who = a.name || '';
      if (idx != null && hrs > 0) {
        TASK_HOURS[idx] = (TASK_HOURS[idx] || 0) + hrs;
        if (!TASK_HOURS_BY_PERSON[idx]) TASK_HOURS_BY_PERSON[idx] = {};
        TASK_HOURS_BY_PERSON[idx][who] = (TASK_HOURS_BY_PERSON[idx][who] || 0) + hrs;
      }

      // Build per-person stats for team dashboard
      if (who && hrs > 0) {
        if (!TEAM_TIME_STATS[who]) TEAM_TIME_STATS[who] = { totalHours: 0, weekHours: 0, lastDate: '', entryCount: 0 };
        var stats = TEAM_TIME_STATS[who];
        stats.totalHours += hrs;
        stats.entryCount++;

        // Parse work_date
        var wd = a.work_date || '';
        if (typeof wd === 'number') {
          var d = new Date(wd);
          wd = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        }
        if (wd && wd > stats.lastDate) stats.lastDate = wd;
        if (wd && wd >= weekStartStr) stats.weekHours += hrs;
      }
    });
    console.log('[TimeTracking] Loaded hours for', Object.keys(TASK_HOURS).length, 'tasks,', Object.keys(TEAM_TIME_STATS).length, 'people');
  } catch (err) {
    console.warn('[TimeTracking] Could not load task hours:', err);
    TASK_HOURS = {};
    TASK_HOURS_BY_PERSON = {};
    TEAM_TIME_STATS = {};
  }
}

async function reloadAllTimeData() {
  await loadTaskHours();
  await loadTimeEntries();
  if (typeof renderTimerChip === 'function') renderTimerChip();
}

// ── STATUS HISTORY ────────────────────────────────────────────────────

async function loadStatusHistory() {
  try {
    const token = await ensureAgolToken();
    if (!token) return;
    const resp = await fetch(ARCGIS_CONFIG.statusHistoryUrl + '/query?' + new URLSearchParams({
      where: '1=1', outFields: '*', orderByFields: 'changed_date ASC', resultRecordCount: 5000, f: 'json', token: token
    }));
    const data = await resp.json();
    if (handleAgolTokenError(data)) return;
    STATUS_HISTORY = (data.features || []).map(function(f) {
      const a = f.attributes;
      return {
        objectId: a.ObjectId || a.OBJECTID || a.objectid,
        project_id: a.project_number || a.project_id,
        project_title: a.project_title,
        status: a.status,
        changed_date: epochToDateStr(a.changed_date || a.CreationDate),
        changed_by: a.changed_by || a.Creator || '',
      };
    });
    console.log('[StatusHistory] Loaded', STATUS_HISTORY.length, 'records');
  } catch (err) {
    console.warn('[StatusHistory] Could not load:', err);
    STATUS_HISTORY = [];
  }
}

async function logStatusChange(projectId, projectTitle, newStatus) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const who = Auth.fullName || 'Unknown';
  const record = {
    project_id: projectId,
    project_title: projectTitle,
    status: newStatus,
    changed_date: todayStr,
    changed_by: who,
  };
  // Add to local array immediately
  STATUS_HISTORY.push(record);
  // Save to ArcGIS Online (record uses alias key project_id; AGO needs project_number).
  // Creator/CreationDate auto-populated by AGO via editor tracking.
  try {
    const result = await agolApplyEdits(ARCGIS_CONFIG.statusHistoryUrl, {
      adds: [{ attributes: {
        project_number: projectId,
        project_title: projectTitle,
        status: newStatus,
      }}]
    });
    if (result && result.addResults && result.addResults[0] && result.addResults[0].objectId) {
      record.objectId = result.addResults[0].objectId;
    }
    console.log('[StatusHistory] Logged:', projectTitle, '→', newStatus);
  } catch (err) {
    console.error('[StatusHistory] Failed to log:', err);
  }
}

function getProjectStatusHistory(projectId) {
  return STATUS_HISTORY.filter(function(h) { return h.project_id == projectId; })
    .sort(function(a, b) { return (a.changed_date || '').localeCompare(b.changed_date || ''); });
}

// ── Status History Editor ──────────────────────────────────────

// ── Task Status History helpers (behind isFeatureOn('taskHistory') flag) ──
function parseTaskHistory(t) {
  if (!isFeatureOn('taskHistory') || !t.task_status_history) return [];
  try { return JSON.parse(t.task_status_history); } catch(e) { return []; }
}

function appendTaskHistory(t, fromStatus, toStatus, reason) {
  if (!isFeatureOn('taskHistory')) return t.task_status_history || null;
  var history = parseTaskHistory(t);
  history.push({
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toISOString().slice(11, 16),
    from: fromStatus || null,
    to: toStatus,
    by: Auth.fullName || 'Unknown',
    reason: reason || null
  });
  // Keep last ~12 entries to stay within field size limits
  if (history.length > 12) history = history.slice(-12);
  return JSON.stringify(history);
}

function parseTaskNotes(t) {
  if (!isFeatureOn('taskHistory') || !t.task_notes) return [];
  try { return JSON.parse(t.task_notes); } catch(e) { return []; }
}

function addTaskNote(taskObjectId, noteText) {
  if (!isFeatureOn('taskHistory') || !noteText.trim()) return;
  var task = TASKS.find(function(t) { return t.objectId == taskObjectId; });
  if (!task) return;
  var notes = parseTaskNotes(task);
  notes.push({
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toISOString().slice(11, 16),
    by: Auth.fullName || 'Unknown',
    text: noteText.trim()
  });
  // Keep last ~15 notes
  if (notes.length > 15) notes = notes.slice(-15);
  var notesJson = JSON.stringify(notes);
  task.task_notes = notesJson;
  agolApplyEdits(ARCGIS_CONFIG.tasksUrl, {
    updates: [{ attributes: { objectid: taskObjectId, task_notes: notesJson } }]
  }).then(function() {
    showToast('Note added.', 'success');
    render();
  }).catch(function(err) {
    showToast('Failed to save note: ' + err.message, 'error');
  });
}

// Prompts for reason when changing to On Hold, Waiting for Response, or Canceled
function needsStatusReason(newStatus) {
  return isFeatureOn('taskHistory') && ['On Hold', 'Waiting for Response', 'Canceled'].indexOf(newStatus) >= 0;
}

// Shows a styled modal to collect a reason for a status change. Returns a Promise.
function promptStatusReason(fromStatus, toStatus) {
  return new Promise(function(resolve) {
    var backdrop = document.getElementById('status-reason-backdrop');
    var fromEl = document.getElementById('sr-from-status');
    var toEl = document.getElementById('sr-to-status');
    var input = document.getElementById('sr-reason-input');
    var confirmBtn = document.getElementById('sr-confirm-btn');
    var cancelBtn = document.getElementById('sr-cancel-btn');
    var closeBtn = document.getElementById('sr-close-btn');

    if (!backdrop) { resolve({ confirmed: true, reason: null }); return; }

    // Populate the transition display
    var fromColor = STATUS_COLOR(fromStatus) || '#9CA3AF';
    var toColor = STATUS_COLOR(toStatus) || '#9CA3AF';
    fromEl.textContent = fromStatus || '(new)';
    fromEl.style.color = fromColor;
    toEl.textContent = toStatus;
    toEl.style.color = toColor;
    toEl.style.fontWeight = '700';
    input.value = '';
    backdrop.style.display = 'flex';
    setTimeout(function() { input.focus(); }, 50);

    function cleanup() {
      backdrop.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      backdrop.removeEventListener('click', onBackdrop);
    }
    function onConfirm() { cleanup(); resolve({ confirmed: true, reason: input.value.trim() || null }); }
    function onCancel() { cleanup(); resolve({ confirmed: false, reason: null }); }
    function onKey(e) { if (e.key === 'Enter') { e.preventDefault(); onConfirm(); } if (e.key === 'Escape') onCancel(); }
    function onBackdrop(e) { if (e.target === backdrop) onCancel(); }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', onBackdrop);
  });
}

function renderTaskHistorySection(t) {
  if (!isFeatureOn('taskHistory')) return '';
  var history = parseTaskHistory(t);
  var notes = parseTaskNotes(t);
  if (!history.length && !notes.length) {
    // Still show the notes input even if empty
    return '<div class="detail-section">' +
      '<div class="detail-section-label">Notes & History</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<input type="text" id="task-note-input-' + t.objectId + '" placeholder="Add a note..." style="flex:1;font-size:13px;padding:7px 10px;border:1px solid #E8E6DF;border-radius:6px;font-family:Lato,sans-serif;">' +
        '<button onclick="var inp=document.getElementById(\'task-note-input-' + t.objectId + '\');addTaskNote(' + t.objectId + ',inp.value);inp.value=\'\';" style="font-size:12px;font-weight:700;padding:7px 14px;border-radius:6px;border:1px solid var(--navy);background:var(--navy);color:#fff;cursor:pointer;font-family:Lato,sans-serif;white-space:nowrap;">Add Note</button>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-muted);font-style:italic;">No history yet.</div>' +
    '</div>';
  }

  var html = '<div class="detail-section">';
  html += '<div class="detail-section-label">Notes & History</div>';

  // Note input
  html += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
  html += '<input type="text" id="task-note-input-' + t.objectId + '" placeholder="Add a note..." style="flex:1;font-size:13px;padding:7px 10px;border:1px solid #E8E6DF;border-radius:6px;font-family:Lato,sans-serif;" onkeydown="if(event.key===\'Enter\'){var inp=this;addTaskNote(' + t.objectId + ',inp.value);inp.value=\'\';}">';
  html += '<button onclick="var inp=document.getElementById(\'task-note-input-' + t.objectId + '\');addTaskNote(' + t.objectId + ',inp.value);inp.value=\'\';" style="font-size:12px;font-weight:700;padding:7px 14px;border-radius:6px;border:1px solid var(--navy);background:var(--navy);color:#fff;cursor:pointer;font-family:Lato,sans-serif;white-space:nowrap;">Add Note</button>';
  html += '</div>';

  // Merge notes and history into one timeline, sorted newest first
  var timeline = [];
  history.forEach(function(h) {
    timeline.push({ type: 'status', date: h.date, time: h.time || '00:00', by: h.by, from: h.from, to: h.to, reason: h.reason });
  });
  notes.forEach(function(n) {
    timeline.push({ type: 'note', date: n.date, time: n.time || '00:00', by: n.by, text: n.text });
  });
  timeline.sort(function(a, b) {
    var da = a.date + 'T' + a.time;
    var db = b.date + 'T' + b.time;
    return db.localeCompare(da); // newest first
  });

  html += '<div style="border-left:2px solid #E8E6DF;padding-left:16px;margin-left:8px;">';
  timeline.forEach(function(item) {
    if (item.type === 'status') {
      var toColor = STATUS_COLOR(item.to) || '#9CA3AF';
      html += '<div style="margin-bottom:12px;position:relative;">';
      html += '<div style="position:absolute;left:-23px;top:2px;width:10px;height:10px;border-radius:50%;background:' + toColor + ';border:2px solid #fff;"></div>';
      html += '<div style="font-size:12px;color:var(--text-muted);">' + item.date + ' · ' + esc(item.by) + '</div>';
      html += '<div style="font-size:13px;margin-top:2px;">';
      if (item.from) {
        html += '<span style="color:var(--text-muted);">' + esc(item.from) + '</span>';
        html += ' <span style="color:var(--text-muted);">→</span> ';
      }
      html += '<span style="font-weight:700;color:' + toColor + ';">' + esc(item.to) + '</span>';
      html += '</div>';
      if (item.reason) {
        html += '<div style="font-size:12px;color:var(--text-body);margin-top:4px;padding:6px 10px;background:var(--surface-2);border-radius:6px;border:1px solid #E8E6DF;font-style:italic;">"' + esc(item.reason) + '"</div>';
      }
      html += '</div>';
    } else {
      html += '<div style="margin-bottom:12px;position:relative;">';
      html += '<div style="position:absolute;left:-23px;top:2px;width:10px;height:10px;border-radius:50%;background:#0088FF;border:2px solid #fff;"></div>';
      html += '<div style="font-size:12px;color:var(--text-muted);">' + item.date + ' · ' + esc(item.by) + '</div>';
      html += '<div style="font-size:13px;margin-top:2px;color:var(--text-body);">' + esc(item.text) + '</div>';
      html += '</div>';
    }
  });
  html += '</div>';

  html += '</div>';
  return html;
}

function getTaskHours(taskIdx) {
  return TASK_HOURS[taskIdx] ? Math.round(TASK_HOURS[taskIdx] * 100) / 100 : 0;
}

// These three helpers accept a project TITLE for backwards compatibility
// with existing callers, but resolve to project_number internally and
// match tasks by that FK — so title changes can't desync the rollup.
function getProjectHours(projectTitle) {
  var p = _PROJECTS_BY_TITLE[String(projectTitle || '').toLowerCase()];
  if (!p || p.project_number == null) return 0;
  var pnum = String(p.project_number);
  let total = 0;
  TASKS.forEach(function(t) {
    if (t.project_number != null && String(t.project_number) === pnum) {
      total += TASK_HOURS[t.idx] || 0;
    }
  });
  return Math.round(total * 100) / 100;
}

function getMyTaskHours(taskIdx, forUser) {
  const who = forUser || Auth.fullName;
  if (!who || !TASK_HOURS_BY_PERSON[taskIdx]) return 0;
  return Math.round((TASK_HOURS_BY_PERSON[taskIdx][who] || 0) * 100) / 100;
}

function getMyProjectHours(projectTitle, forUser) {
  const who = forUser || Auth.fullName;
  if (!who) return 0;
  var p = _PROJECTS_BY_TITLE[String(projectTitle || '').toLowerCase()];
  if (!p || p.project_number == null) return 0;
  var pnum = String(p.project_number);
  let total = 0;
  TASKS.forEach(function(t) {
    if (t.project_number == null || String(t.project_number) !== pnum) return;
    const byPerson = TASK_HOURS_BY_PERSON[t.idx];
    if (byPerson && byPerson[who]) total += byPerson[who];
  });
  return Math.round(total * 100) / 100;
}

function getProjectHoursByPerson(projectTitle) {
  var p = _PROJECTS_BY_TITLE[String(projectTitle || '').toLowerCase()];
  if (!p || p.project_number == null) return [];
  var pnum = String(p.project_number);
  var byPerson = {};
  TASKS.forEach(function(t) {
    if (t.project_number == null || String(t.project_number) !== pnum) return;
    var taskHrs = TASK_HOURS_BY_PERSON[t.idx];
    if (!taskHrs) return;
    for (var name in taskHrs) {
      byPerson[name] = (byPerson[name] || 0) + taskHrs[name];
    }
  });
  var result = [];
  for (var name in byPerson) {
    if (byPerson[name] > 0) {
      result.push({ name: name, hours: Math.round(byPerson[name] * 100) / 100 });
    }
  }
  result.sort(function(a, b) { return b.hours - a.hours; });
  return result;
}

// Build a compact hours label like "12.5h · me: 4.5h"

async function loadTimeEntries() {
  if (!Auth.fullName || !isTimeTrackingEnabled()) { TIME_ENTRIES = []; return; }
  try {
    const features = await agolQuery(ARCGIS_CONFIG.timeEntriesUrl, "name='" + Auth.fullName.replace(/'/g, "''") + "'");
    TIME_ENTRIES = features.map(function(f) {
      const a = f.attributes;
      // work_date is esriFieldTypeDateOnly — comes as "YYYY-MM-DD" string
      let wd = a.work_date || '';
      // If it came as epoch ms (some ArcGIS versions), convert to string
      if (typeof wd === 'number') {
        const d = new Date(wd);
        wd = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      }
      return {
        oid: a.OBJECTID || a.ObjectId || a.objectid,
        name: a.name,
        task_idx: a.task_number || a.task_idx,
        project_id: a.project_number || a.project_id,
        start_time: a.start_time, // epoch ms
        end_time: a.end_time,     // epoch ms or null
        hours: a.hours,
        work_date: wd,            // "YYYY-MM-DD" string
        notes: a.notes || '',
      };
    });
    console.log('[TimeTracking] Loaded', TIME_ENTRIES.length, 'entries for', Auth.fullName);
  } catch (err) {
    console.error('[TimeTracking] Load failed:', err);
    TIME_ENTRIES = [];
  }
}

function getActiveTimers() {
  return TIME_ENTRIES.filter(function(e) { return !e.end_time; });
}

function getTodayEntries() {
  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  return TIME_ENTRIES.filter(function(e) {
    return e.work_date === todayStr;
  });
}

function getWeekEntries() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'));
  }
  return TIME_ENTRIES.filter(function(e) {
    return dates.indexOf(e.work_date) >= 0;
  });
}

var _timerStartInFlight = {}; // task key -> true; blocks duplicate/rapid starts on the same task

async function startTimer(taskIdx) {
  if (!Auth.fullName) return;
  const task = TASKS.find(function(t) { return t.idx === taskIdx; });
  if (!task) { showToast('Task not found.', 'warn'); return; }
  // One active timer per task: refuse if a timer is already running for this
  // task, or one is mid-start (covers rapid double-clicks, the resume button,
  // and the start dropdown). task_idx may load from AGOL as a number, so
  // compare as strings.
  var taskKey = String(taskIdx);
  if (_timerStartInFlight[taskKey] || getActiveTimers().some(function(e) { return String(e.task_idx) === taskKey; })) {
    showToast('A timer is already running for this task.', 'warn');
    return;
  }
  _timerStartInFlight[taskKey] = true;
  const now = new Date();
  const workDateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  try {
    const result = await agolApplyEdits(ARCGIS_CONFIG.timeEntriesUrl, {
      adds: [{ attributes: {
        name: Auth.fullName,
        task_number: taskIdx,
        project_number: task.project_id || null,
        start_time: now.getTime(),
        end_time: null,
        hours: null,
        work_date: workDateStr,
        notes: '',
      }}]
    });
    console.log('[TimeTracking] Started timer for task', taskIdx, result);
    var newOid = (result && result.addResults && result.addResults[0]) ? result.addResults[0].objectId : null;
    await reloadAllTimeData();
    // Read-after-write guard: the feature service sometimes hasn't made the
    // new row queryable by the time reloadAllTimeData re-queries, which would
    // make the just-started timer invisible until a later refresh. Re-insert
    // our known copy so the UI reflects the action immediately.
    if (newOid != null && !TIME_ENTRIES.some(function(e) { return e.oid === newOid; })) {
      TIME_ENTRIES.push({
        oid: newOid, name: Auth.fullName, task_idx: taskIdx,
        project_id: task.project_id || null, start_time: now.getTime(),
        end_time: null, hours: null, work_date: workDateStr, notes: '',
      });
      if (typeof renderTimerChip === 'function') renderTimerChip();
    }
    renderMyWork(document.getElementById('content-area'));
  } catch (err) {
    console.error('[TimeTracking] Start timer failed:', err);
    showToast('Failed to start timer: ' + err.message, 'error');
  } finally {
    delete _timerStartInFlight[taskKey];
  }
}

async function stopTimer(oid) {
  const entry = TIME_ENTRIES.find(function(e) { return e.oid === oid; });
  if (!entry) return;
  const now = new Date();
  const hours = calculateWorkHours(entry.start_time, now.getTime());
  const rawHours = Math.round((now.getTime() - entry.start_time) / 3600000 * 100) / 100;
  if (hours !== rawHours) {
    console.log('[TimeTracking] Capped hours from', rawHours, 'to', hours, '(schedule-aware)');
  }
  try {
    await agolApplyEdits(ARCGIS_CONFIG.timeEntriesUrl, {
      updates: [{ attributes: {
        ObjectId: oid,
        end_time: now.getTime(),
        hours: hours,
      }}]
    });
    console.log('[TimeTracking] Stopped timer', oid, hours, 'hours');
    await reloadAllTimeData();
    // Read-after-write guard: if the re-query still shows this entry as
    // running (end_time null), apply the stop we just persisted so the timer
    // doesn't keep ticking in the UI until a later refresh.
    var reloaded = TIME_ENTRIES.find(function(e) { return e.oid === oid; });
    if (reloaded && !reloaded.end_time) {
      reloaded.end_time = now.getTime();
      reloaded.hours = hours;
      if (typeof renderTimerChip === 'function') renderTimerChip();
    }
    renderMyWork(document.getElementById('content-area'));
  } catch (err) {
    console.error('[TimeTracking] Stop timer failed:', err);
    showToast('Failed to stop timer: ' + err.message, 'error');
  }
}

/**
 * Calculate actual work hours between startMs and endMs,
 * using the logged-in employee's daily schedule.
 * Only counts hours within the work window each day, minus lunch.
 */
function calculateWorkHours(startMs, endMs) {
  if (!Auth.fullName || !RESOURCES_DATA || !RESOURCES_DATA.people[Auth.fullName]) {
    // No schedule data — fall back to raw calculation
    return Math.round((endMs - startMs) / 3600000 * 100) / 100;
  }
  const person = RESOURCES_DATA.people[Auth.fullName];
  const lunchHrs = (person.lunch_minutes || 60) / 60;
  const PAY_REF = new Date('2025-12-28T00:00:00');
  const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];

  let totalHours = 0;
  const current = new Date(startMs);
  const end = new Date(endMs);

  // Iterate through each calendar day the timer spans
  while (current <= end) {
    const dow = current.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    if (dow >= 1 && dow <= 5) { // Weekdays only
      const dayKey = dayNames[dow]; // mon, tue, etc.

      // Determine pay period week (A or B) for this day's week start (Sunday)
      const dayCopy = new Date(current);
      dayCopy.setDate(dayCopy.getDate() - dow); // back to Sunday
      const diffDays = Math.round((dayCopy - PAY_REF) / (1000 * 60 * 60 * 24));
      const weekPrefix = (Math.floor(diffDays / 7) % 2 === 0) ? 'wk1_' : 'wk2_';

      // Get work start/end for this day
      const schedStart = person.schedule ? person.schedule[weekPrefix + dayKey + '_start'] : null;
      const schedEnd = person.schedule ? person.schedule[weekPrefix + dayKey + '_end'] : null;

      if (schedStart && schedEnd) {
        // Parse schedule times to minutes since midnight
        const sp = schedStart.split(':');
        const ep = schedEnd.split(':');
        const workStartMin = parseInt(sp[0]) * 60 + parseInt(sp[1]);
        const workEndMin = parseInt(ep[0]) * 60 + parseInt(ep[1]);

        // Timer window for this day (clamp to day boundaries)
        const dayStart = new Date(current);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const timerStartOnDay = Math.max(startMs, dayStart.getTime());
        const timerEndOnDay = Math.min(endMs, dayEnd.getTime());

        // Convert timer window to minutes since midnight
        const tStartDate = new Date(timerStartOnDay);
        const timerStartMin = tStartDate.getHours() * 60 + tStartDate.getMinutes();
        const tEndDate = new Date(timerEndOnDay);
        let timerEndMin = tEndDate.getHours() * 60 + tEndDate.getMinutes();
        // If timer ends at midnight (next day), treat as end of day
        if (timerEndOnDay >= dayEnd.getTime()) timerEndMin = 24 * 60;

        // Calculate overlap between timer window and work window
        const overlapStart = Math.max(timerStartMin, workStartMin);
        const overlapEnd = Math.min(timerEndMin, workEndMin);

        if (overlapEnd > overlapStart) {
          let dayHours = (overlapEnd - overlapStart) / 60;
          // Only subtract lunch if the work overlap spans across the midday break.
          // If you started before noon and ended after 1 PM, you presumably took lunch.
          // Afternoon-only or morning-only sessions don't get lunch deducted.
          const lunchStart = 12 * 60; // noon
          const lunchEnd = lunchStart + (person.lunch_minutes || 60);
          if (overlapStart < lunchStart && overlapEnd > lunchEnd) {
            dayHours = Math.max(0, dayHours - lunchHrs);
          }
          totalHours += dayHours;
        }
      }
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return Math.round(totalHours * 100) / 100;
}

async function pauseTimer(oid, taskIdx) {
  // Pause = stop the timer. The task will show a Resume button in the log.
  await stopTimer(oid);
}

async function deleteTimeEntry(oid) {
  if (!confirm('Delete this time entry?')) return;
  try {
    await agolApplyEdits(ARCGIS_CONFIG.timeEntriesUrl, { deletes: [oid] });
    console.log('[TimeTracking] Deleted entry', oid);
    await reloadAllTimeData();
    // Read-after-write guard: if the re-query still returns the just-deleted
    // row (service lag), drop it locally so it disappears immediately instead
    // of lingering until the next refresh.
    var dIdx = TIME_ENTRIES.findIndex(function(e) { return e.oid === oid; });
    if (dIdx >= 0) {
      TIME_ENTRIES.splice(dIdx, 1);
      if (typeof renderTimerChip === 'function') renderTimerChip();
    }
    renderMyWork(document.getElementById('content-area'));
  } catch (err) {
    console.error('[TimeTracking] Delete failed:', err);
    showToast('Failed to delete entry: ' + err.message, 'error');
  }
}

async function saveTimeEntryEdit(oid) {
  const startEl = document.getElementById('te-start-' + oid);
  const endEl = document.getElementById('te-end-' + oid);
  const notesEl = document.getElementById('te-notes-' + oid);
  if (!startEl) return;
  const startVal = startEl.value; // datetime-local string
  if (!startVal) { showToast('Start time is required.', 'warn'); return; }
  const startMs = new Date(startVal).getTime();
  const endMs = endEl && endEl.value ? new Date(endEl.value).getTime() : null;
  const hours = endMs ? calculateWorkHours(startMs, endMs) : null;
  if (hours !== null && hours < 0) { showToast('End time must be after start time.', 'warn'); return; }
  const startD = new Date(startVal);
  const workDateStr = startD.getFullYear() + '-' + String(startD.getMonth()+1).padStart(2,'0') + '-' + String(startD.getDate()).padStart(2,'0');
  const attrs = {
    ObjectId: oid,
    start_time: startMs,
    end_time: endMs,
    hours: hours,
    work_date: workDateStr,
  };
  if (notesEl) attrs.notes = notesEl.value || '';
  try {
    await agolApplyEdits(ARCGIS_CONFIG.timeEntriesUrl, { updates: [{ attributes: attrs }] });
    console.log('[TimeTracking] Updated entry', oid);
    await reloadAllTimeData();
    // Read-after-write guard: re-apply the values we just persisted in case
    // the re-query came back stale, so the edit shows immediately.
    var reEntry = TIME_ENTRIES.find(function(e) { return e.oid === oid; });
    if (reEntry) {
      reEntry.start_time = startMs;
      reEntry.end_time = endMs;
      reEntry.hours = hours;
      reEntry.work_date = workDateStr;
      if ('notes' in attrs) reEntry.notes = attrs.notes;
      if (typeof renderTimerChip === 'function') renderTimerChip();
    }
    renderMyWork(document.getElementById('content-area'));
  } catch (err) {
    console.error('[TimeTracking] Edit failed:', err);
    showToast('Failed to save: ' + err.message, 'error');
  }
}

// Build (or rebuild) the header timer chip based on current active timers.
// 0 timers → chip hidden. 1 → full chip. 2–3 → most-recent + "+N more" badge. 4+ → summary pill.
function renderTimerChip() {
  var wrap = document.getElementById('timer-chip-wrap');
  var chip = document.getElementById('timer-chip');
  if (!wrap || !chip) return;
  if (!Auth || !Auth.fullName) { wrap.style.display = 'none'; return; }
  var timers = (typeof getActiveTimers === 'function') ? getActiveTimers() : [];
  if (!timers.length) {
    wrap.style.display = 'none';
    var dd = document.getElementById('timer-chip-dropdown');
    if (dd) dd.style.display = 'none';
    return;
  }
  wrap.style.display = 'inline-block';

  // Most recent first
  timers = timers.slice().sort(function(a, b) { return b.start_time - a.start_time; });
  var primary = timers[0];
  var task = TASKS.find(function(t) { return t.idx === primary.task_idx; });
  var title = task ? task.title : 'Task #' + primary.task_idx;
  var titleEsc = (typeof esc === 'function') ? esc(title) : title;

  var html = '';
  if (timers.length === 1) {
    html += '<span class="timer-chip-pulse"></span>';
    html += '<span class="timer-chip-elapsed" id="chip-primary-elapsed">' + formatTimerChip(Date.now() - primary.start_time) + '</span>';
    html += '<span class="timer-chip-task" title="' + titleEsc + '">' + titleEsc + '</span>';
    html += '<button class="timer-chip-stop" onclick="event.stopPropagation();stopTimer(' + primary.oid + ');" title="Stop timer"><svg class="icon" aria-hidden="true"><use href="#ph-stop"></use></svg></button>';
  } else if (timers.length <= 3) {
    html += '<span class="timer-chip-pulse"></span>';
    html += '<span class="timer-chip-elapsed" id="chip-primary-elapsed">' + formatTimerChip(Date.now() - primary.start_time) + '</span>';
    html += '<span class="timer-chip-task" title="' + titleEsc + '">' + titleEsc + '</span>';
    html += '<span class="timer-chip-badge" onclick="event.stopPropagation();toggleTimerChipDropdown();">+' + (timers.length - 1) + ' more</span>';
    html += '<button class="timer-chip-stop" onclick="event.stopPropagation();stopTimer(' + primary.oid + ');" title="Stop most recent timer"><svg class="icon" aria-hidden="true"><use href="#ph-stop"></use></svg></button>';
  } else {
    var combined = timers.reduce(function(s, e) { return s + (Date.now() - e.start_time); }, 0);
    html += '<span class="timer-chip-pulse"></span>';
    html += '<span class="timer-chip-elapsed" id="chip-summary-elapsed">' + formatTimerChip(combined) + '</span>';
    html += '<span class="timer-chip-task">' + timers.length + ' timers running</span>';
    html += '<span class="timer-chip-caret">▾</span>';
  }
  chip.innerHTML = html;

  // Re-render dropdown content (keeps state in sync if open)
  renderTimerChipDropdown(timers);

  // Make sure the per-second tick is running.
  startTimerTick();
}

function renderTimerChipDropdown(timers) {
  var dd = document.getElementById('timer-chip-dropdown');
  if (!dd) return;
  if (!timers || !timers.length) { dd.style.display = 'none'; return; }
  var html = '<div class="timer-chip-dd-header">Active timers</div>';
  timers.forEach(function(e) {
    var task = TASKS.find(function(t) { return t.idx === e.task_idx; });
    var title = task ? task.title : 'Task #' + e.task_idx;
    var titleEsc = (typeof esc === 'function') ? esc(title) : title;
    var projTitle = '';
    if (task && task.project) projTitle = task.project;
    else if (task && task.project_id) {
      var proj = PROJECTS.find(function(p) { return p.id == task.project_id; });
      if (proj) projTitle = proj.title;
    }
    html += '<div class="timer-chip-dd-row" onclick="switchTab(\'mywork\');closeTimerChipDropdown();">';
    html += '<span class="timer-chip-pulse" style="width:6px;height:6px;"></span>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div class="timer-chip-dd-title">' + titleEsc + '</div>';
    if (projTitle) html += '<div class="timer-chip-dd-meta">' + (typeof esc === 'function' ? esc(projTitle) : projTitle) + '</div>';
    html += '</div>';
    html += '<span class="timer-chip-dd-elapsed" id="chip-dd-elapsed-' + e.oid + '">' + formatTimerChip(Date.now() - e.start_time) + '</span>';
    html += '<button class="timer-chip-dd-stop" onclick="event.stopPropagation();stopTimer(' + e.oid + ');" title="Stop this timer"><svg class="icon" aria-hidden="true"><use href="#ph-stop"></use></svg></button>';
    html += '</div>';
  });
  html += '<div class="timer-chip-dd-footer">';
  html += '<span style="color:var(--text-muted);">' + timers.length + ' running</span>';
  html += '<a href="#" onclick="event.preventDefault();closeTimerChipDropdown();switchTab(\'mywork\');">Manage in My Work →</a>';
  html += '</div>';
  dd.innerHTML = html;
}

function toggleTimerChipDropdown() {
  var dd = document.getElementById('timer-chip-dropdown');
  if (!dd) return;
  dd.style.display = (dd.style.display === 'block') ? 'none' : 'block';
}

function closeTimerChipDropdown() {
  var dd = document.getElementById('timer-chip-dropdown');
  if (dd) dd.style.display = 'none';
}

function onTimerChipClick(evt) {
  // For the 4+ case, the chip itself opens the dropdown; otherwise it jumps to My Work.
  var timers = getActiveTimers();
  if (timers.length >= 4) {
    toggleTimerChipDropdown();
  } else {
    switchTab('mywork');
  }
}

// Close dropdown when clicking outside the chip wrapper.
document.addEventListener('click', function(e) {
  var wrap = document.getElementById('timer-chip-wrap');
  if (!wrap) return;
  if (!wrap.contains(e.target)) closeTimerChipDropdown();
});

function startTimerTick() {
  if (Internal.timerInterval) return; // already ticking
  Internal.timerInterval = setInterval(function() {
    var activeTimers = getActiveTimers();
    if (!activeTimers.length) {
      // Stop ticking when there's nothing to update — restart on next renderTimerChip call.
      clearInterval(Internal.timerInterval);
      Internal.timerInterval = null;
      return;
    }
    activeTimers.forEach(function(e) {
      // My Work card elapsed (now ticks in HH:MM:SS to match the header chip)
      var el = document.getElementById('timer-elapsed-' + e.oid);
      if (el) el.textContent = formatTimerChip(Date.now() - e.start_time);
      // Chip dropdown row elapsed (when dropdown is open)
      var dEl = document.getElementById('chip-dd-elapsed-' + e.oid);
      if (dEl) dEl.textContent = formatTimerChip(Date.now() - e.start_time);
    });
    // Chip primary elapsed (1–3 timers case)
    var primaryEl = document.getElementById('chip-primary-elapsed');
    if (primaryEl && activeTimers.length <= 3) {
      var sorted = activeTimers.slice().sort(function(a, b) { return b.start_time - a.start_time; });
      primaryEl.textContent = formatTimerChip(Date.now() - sorted[0].start_time);
    }
    // Chip summary elapsed (4+ case)
    var summaryEl = document.getElementById('chip-summary-elapsed');
    if (summaryEl && activeTimers.length >= 4) {
      var combined = activeTimers.reduce(function(s, e) { return s + (Date.now() - e.start_time); }, 0);
      summaryEl.textContent = formatTimerChip(combined);
    }
  }, 1000);
}

function buildTimeEntryRowHTML(e, opts) {
  const task = TASKS.find(function(t) { return t.idx === e.task_idx; });
  const taskTitle = task ? task.title : 'Task #' + e.task_idx;
  const hrs = e.hours ? (Math.round(e.hours * 100) / 100) + 'h' : '—';
  let html = '<div class="te-entry-row" id="te-row-' + e.oid + '">';
  html += '<div class="flex-1-min0">';
  html += '<div class="te-row-title">' + esc(taskTitle) + '</div>';
  html += '<div class="text-muted-sm">' + formatTimeShort(e.start_time) + ' → ' + formatTimeShort(e.end_time);
  if (opts.showCumulative) {
    const cumulHrs = getTaskHours(e.task_idx);
    if (cumulHrs > 0) html += ' · Total: ' + cumulHrs + 'h';
  }
  html += '</div>';
  if (e.notes) html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;">' + esc(e.notes) + '</div>';
  html += '</div>';
  html += '<div class="te-row-hours">' + hrs + '</div>';
  if (opts.canResume) {
    html += '<button onclick="startTimer(\'' + e.task_idx + '\')" class="btn-timer-resume" title="Resume this task">▶</button>';
  }
  html += '<button onclick="toggleEditTimeEntry(' + e.oid + ')" class="btn-te-icon"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg></button>';
  html += '<button onclick="deleteTimeEntry(' + e.oid + ')" class="btn-te-del"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></button>';
  html += '</div>';
  // Inline edit form
  html += '<div id="te-edit-' + e.oid + '" class="te-edit-form">';
  html += '<div class="te-edit-grid">';
  html += '<div><label class="te-edit-label">START</label><input type="datetime-local" id="te-start-' + e.oid + '" class="mf-input" style="font-size:13px;margin-bottom:0;" value="' + toDatetimeLocal(e.start_time) + '"></div>';
  html += '<div><label class="te-edit-label">END</label><input type="datetime-local" id="te-end-' + e.oid + '" class="mf-input" style="font-size:13px;margin-bottom:0;" value="' + toDatetimeLocal(e.end_time) + '"></div>';
  html += '<div><label class="te-edit-label">NOTES</label><input type="text" id="te-notes-' + e.oid + '" class="mf-input" style="font-size:13px;margin-bottom:0;" value="' + esc(e.notes || '') + '" placeholder="Work description"></div>';
  html += '</div>';
  html += '<div class="te-edit-actions">';
  html += '<button onclick="toggleEditTimeEntry(' + e.oid + ')" class="btn-te-cancel">Cancel</button>';
  html += '<button onclick="saveTimeEntryEdit(' + e.oid + ')" class="btn-te-save">Save</button>';
  html += '</div></div>';
  return html;
}

function buildActiveTimersHTML(activeTimers) {
  if (activeTimers.length === 0) return '';
  let html = '<div style="margin-bottom:14px;">';
  activeTimers.forEach(function(e) {
    const task = TASKS.find(function(t) { return t.idx === e.task_idx; });
    const taskTitle = task ? task.title : 'Task #' + e.task_idx;
    let projTitle = '';
    if (task && task.project) {
      projTitle = task.project;
    } else if (task && task.project_id) {
      const proj = PROJECTS.find(function(p) { return p.id == task.project_id; });
      if (proj) projTitle = proj.title;
    }
    const elapsed = formatTimerChip(Date.now() - e.start_time);
    html += '<div class="timer-card">';
    html += '<div class="timer-pulse"></div>';
    html += '<div class="flex-1-min0">';
    html += '<div class="timer-task-title">' + esc(taskTitle) + '</div>';
    if (projTitle) html += '<div class="text-muted-sm">' + esc(projTitle) + '</div>';
    const cumulHrs = getTaskHours(e.task_idx);
    html += '<div class="text-muted-sm">Started ' + formatTimeShort(e.start_time) + (cumulHrs > 0 ? ' · Total: ' + cumulHrs + 'h' : '') + '</div>';
    html += '</div>';
    html += '<div class="timer-elapsed" id="timer-elapsed-' + e.oid + '">' + elapsed + '</div>';
    html += '<button onclick="pauseTimer(' + e.oid + ',\'' + e.task_idx + '\')" class="btn-timer-pause"><svg class="icon" aria-hidden="true"><use href="#ph-pause"></use></svg> Pause</button>';
    html += '<button onclick="stopTimer(' + e.oid + ')" class="btn-timer-stop"><svg class="icon" aria-hidden="true"><use href="#ph-stop"></use></svg> Stop</button>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function buildTimeTrackingPanel() {
  const myTasks = getMyTasks();
  const activeTimers = getActiveTimers();
  const todayEntries = getTodayEntries().filter(function(e) { return e.end_time; }); // completed only
  const weekEntries = getWeekEntries().filter(function(e) { return e.end_time; });
  const todayHours = todayEntries.reduce(function(s, e) { return s + (e.hours || 0); }, 0);
  const weekHours = weekEntries.reduce(function(s, e) { return s + (e.hours || 0); }, 0);

  let html = '<div class="mywork-section mywork-full-width" id="mw-time-tracking">';
  html += '<div class="mywork-section-header"><svg class="icon" aria-hidden="true"><use href="#ph-clock"></use></svg> Time Tracking</div>';

  // Active timers
  html += buildActiveTimersHTML(activeTimers);

  // Start new timer — task selector. Exclude tasks that already have a
  // running timer (one active timer per task).
  const runningTaskIds = {};
  activeTimers.forEach(function(e) { runningTaskIds[String(e.task_idx)] = true; });
  const availableTasks = myTasks.filter(function(t) {
    if (runningTaskIds[String(t.idx)]) return false;
    return t.status === 'Active' || t.status === 'Waiting for Response' || t.status === 'On Hold';
  });
  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">';
  html += '<select id="te-task-select" class="mf-input" style="flex:1;margin-bottom:0;">';
  html += '<option value="">Select a task to start timing…</option>';
  availableTasks.forEach(function(t) {
    const title = getTaskProjectTitle(t);
    const projLabel = title ? ' — ' + title : '';
    html += '<option value="' + t.idx + '">' + esc(t.title + projLabel) + '</option>';
  });
  html += '</select>';
  html += '<button onclick="var s=document.getElementById(\'te-task-select\');if(s.value)startTimer(s.value);else showToast(\'Select a task first.\',\'warn\');" class="btn-navy-lg">▶ Start</button>';
  html += '</div>';

  // Today's summary
  html += '<div style="display:flex;gap:16px;margin-bottom:12px;font-size:13px;color:var(--text-muted);">';
  html += '<span><strong style="color:var(--navy);">' + Math.round(todayHours * 100) / 100 + 'h</strong> logged today</span>';
  html += '<span><strong style="color:var(--navy);">' + Math.round(weekHours * 100) / 100 + 'h</strong> this week</span>';
  html += '</div>';

  // Today's completed entries
  if (todayEntries.length > 0) {
    todayEntries.sort(function(a, b) { return b.start_time - a.start_time; });
    const activeTaskIds = {};
    activeTimers.forEach(function(e) { activeTaskIds[e.task_idx] = true; });
    const resumeShown = {};
    html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Today\'s Log</div>';
    todayEntries.forEach(function(e) {
      const canResume = !activeTaskIds[e.task_idx] && !resumeShown[e.task_idx];
      html += buildTimeEntryRowHTML(e, { showCumulative: true, canResume: canResume });
      if (canResume) resumeShown[e.task_idx] = true;
    });
  }

  // Recent entries (past 7 days, excluding today) — collapsible
  const todayStr2 = (function() {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
  })();
  const recentEntries = TIME_ENTRIES.filter(function(e) {
    if (!e.end_time) return false;
    if (e.work_date === todayStr2) return false; // already in today's log
    // Last 7 days
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    const entryDate = new Date(e.work_date + 'T00:00:00');
    return entryDate >= weekAgo;
  }).sort(function(a, b) { return b.start_time - a.start_time; });

  if (recentEntries.length > 0) {
    html += '<div id="te-recent-section" style="display:none;">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;margin-top:14px;">Recent (Past 7 Days)</div>';
    let lastDate = '';
    recentEntries.forEach(function(e) {
      if (e.work_date !== lastDate) {
        const dateObj = new Date(e.work_date + 'T00:00:00');
        const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        html += '<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-top:10px;margin-bottom:4px;">' + dateLabel + '</div>';
        lastDate = e.work_date;
      }
      html += buildTimeEntryRowHTML(e, { showCumulative: false, canResume: false });
    });
    html += '</div>';
    html += '<button class="mywork-expand-btn" onclick="toggleRecentEntries()">' +
      'Show recent entries (' + recentEntries.length + ')' +
    '</button>';
  }

  html += '</div>';
  return html;
}

function toggleRecentEntries() {
  const panel = document.getElementById('te-recent-section');
  const btn = event.target;
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? '' : 'none';
  if (isHidden) {
    btn.dataset.origLabel = btn.textContent;
    btn.textContent = 'Hide recent entries';
  } else {
    btn.textContent = btn.dataset.origLabel || 'Show recent entries';
  }
}

function toggleEditTimeEntry(oid) {
  const el = document.getElementById('te-edit-' + oid);
  if (!el) return;
  const isHidden = getComputedStyle(el).display === 'none';
  el.style.display = isHidden ? 'block' : 'none';
}
