// ─────────────────────────────────────────────────────────────────────
// modals/export.js — CSV export modal
//
// "Active during": item's interval [start, end-effective] overlaps
// [windowStart, windowEnd]. Missing start → treat as far-past;
// missing end → treat as still-running today. Items with neither
// start nor end are excluded (no data to evaluate).
//
// Forward references: PROJECTS, TASKS, RESOURCES_DATA, Auth,
// showToast, esc.
// Backward references: csvEscape, buildCsv, downloadCsv (util.js).
// ─────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════
//  CSV EXPORT — projects & tasks with employee + date filters
// ══════════════════════════════════════════════════════════════════════

// "Active during": item's interval [start, end-effective] overlaps [windowStart, windowEnd].
// Missing start → treat as far-past; missing end → treat as still-running today.
// Items with neither start nor end are excluded (no data to evaluate).
function _itemActiveDuring(start, endEff, ws, we) {
  if (!start && !endEff) return false;
  var todayStr = new Date().toISOString().slice(0, 10);
  var s = start || '1900-01-01';
  var e = endEff || todayStr;
  return s <= we && e >= ws;
}

function projectMatchesDateMode(p, mode, ws, we) {
  if (mode === 'none') return true;
  if (mode === 'active')    return _itemActiveDuring(p.start, p.actual_end || p.working_due || p.end, ws, we);
  if (mode === 'started')   return p.start && p.start >= ws && p.start <= we;
  if (mode === 'completed') return p.actual_end && p.actual_end >= ws && p.actual_end <= we;
  return true;
}

function taskMatchesDateMode(t, mode, ws, we) {
  if (mode === 'none') return true;
  if (mode === 'active')    return _itemActiveDuring(t.start, t.actual_end || t.working_due || t.due, ws, we);
  if (mode === 'started')   return t.start && t.start >= ws && t.start <= we;
  if (mode === 'completed') return t.actual_end && t.actual_end >= ws && t.actual_end <= we;
  return true;
}

function projectInvolves(p, names) {
  if (!names || !names.length) return true;
  if (names.indexOf(p.contact) >= 0) return true;
  if (p.other_members) {
    var members = String(p.other_members).split(',').map(function(s) { return s.trim(); });
    return names.some(function(n) { return members.indexOf(n) >= 0; });
  }
  return false;
}

function openExportModal() {
  if (!Auth.loggedIn) { showToast('Sign in to export data.', 'warn'); return; }
  closeExportModal(); // remove any prior instance
  var memberNames = (RESOURCES_DATA && RESOURCES_DATA.people) ?
    Object.keys(RESOURCES_DATA.people).filter(function(n) { return RESOURCES_DATA.people[n].active !== false; }).sort() : [];
  var statuses = ['Active', 'Scheduled', 'On Hold', 'Waiting for Response', 'Future', 'Pending', 'Complete', 'Canceled'];
  var todayStr = new Date().toISOString().slice(0, 10);
  var jan1 = todayStr.slice(0, 4) + '-01-01';

  var html = '<div id="export-modal-backdrop" class="export-modal-backdrop">';
  html += '<div class="export-modal" role="dialog" aria-modal="true">';
  html += '<div class="export-modal-header"><div class="export-modal-title">Export data</div><button class="export-modal-close" onclick="closeExportModal()" title="Close">×</button></div>';
  html += '<div class="export-modal-body">';

  html += '<div class="export-section"><div class="export-section-label">What to export</div>';
  html += '<label class="export-checkbox"><input type="checkbox" id="exp-projects" checked> Projects</label>';
  html += '<label class="export-checkbox"><input type="checkbox" id="exp-tasks" checked> Tasks</label>';
  html += '</div>';

  html += '<div class="export-section"><div class="export-section-label">Date filter</div>';
  html += '<label class="export-radio"><input type="radio" name="exp-mode" value="none"> No date filter</label>';
  html += '<label class="export-radio"><input type="radio" name="exp-mode" value="active" checked> Active during</label>';
  html += '<label class="export-radio"><input type="radio" name="exp-mode" value="started"> Started during</label>';
  html += '<label class="export-radio"><input type="radio" name="exp-mode" value="completed"> Completed during</label>';
  html += '<div style="display:flex;gap:10px;margin-top:8px;align-items:center;flex-wrap:wrap;">';
  html += '<label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">From</label>';
  html += '<input type="date" id="exp-from" value="' + jan1 + '" class="export-date">';
  html += '<label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">To</label>';
  html += '<input type="date" id="exp-to" value="' + todayStr + '" class="export-date">';
  html += '</div></div>';

  html += '<div class="export-section"><div class="export-section-label">Employees <span style="font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0;">(leave all unchecked for everyone)</span></div>';
  html += '<div class="export-people-list">';
  if (memberNames.length === 0) {
    html += '<div style="font-style:italic;color:var(--text-muted);font-size:12px;">No team members loaded.</div>';
  } else {
    memberNames.forEach(function(n) {
      html += '<label class="export-checkbox"><input type="checkbox" class="exp-emp" value="' + esc(n) + '"> ' + esc(n) + '</label>';
    });
  }
  html += '</div></div>';

  html += '<div class="export-section"><div class="export-section-label">Status <span style="font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0;">(leave all unchecked for any)</span></div>';
  html += '<div class="export-status-grid">';
  statuses.forEach(function(s) {
    html += '<label class="export-checkbox"><input type="checkbox" class="exp-status" value="' + esc(s) + '"> ' + esc(s) + '</label>';
  });
  html += '</div></div>';

  html += '</div>'; // body
  html += '<div class="export-modal-footer">';
  html += '<button class="export-btn-secondary" onclick="closeExportModal()">Cancel</button>';
  html += '<button class="export-btn-primary" onclick="runExport()"><svg class="icon" aria-hidden="true"><use href="#ph-download-simple"></use></svg> Export CSV</button>';
  html += '</div>';
  html += '</div></div>'; // modal, backdrop

  document.body.insertAdjacentHTML('beforeend', html);
  var bd = document.getElementById('export-modal-backdrop');
  bd.addEventListener('click', function(e) { if (e.target === bd) closeExportModal(); });
}

function closeExportModal() {
  var bd = document.getElementById('export-modal-backdrop');
  if (bd) bd.remove();
}

function runExport() {
  var doProjects = document.getElementById('exp-projects').checked;
  var doTasks    = document.getElementById('exp-tasks').checked;
  if (!doProjects && !doTasks) { showToast('Select at least one of Projects or Tasks.', 'warn'); return; }

  var modeEl = document.querySelector('input[name="exp-mode"]:checked');
  var mode = modeEl ? modeEl.value : 'none';
  var ws = (document.getElementById('exp-from') || {}).value || '';
  var we = (document.getElementById('exp-to')   || {}).value || '';
  if (mode !== 'none' && (!ws || !we)) { showToast('Set both From and To dates, or pick "No date filter".', 'warn'); return; }
  if (mode !== 'none' && ws > we) { showToast('From date must be on or before To date.', 'warn'); return; }

  var employees = Array.prototype.slice.call(document.querySelectorAll('.exp-emp:checked')).map(function(cb) { return cb.value; });
  var statuses  = Array.prototype.slice.call(document.querySelectorAll('.exp-status:checked')).map(function(cb) { return cb.value; });

  var stamp = new Date().toISOString().slice(0, 10);
  var totalCount = 0;

  if (doProjects) {
    var projHeaders = ['project_number','title','status','contact','other_members','partner_dept','itd_team','category','project_size','priority','start','end','actual_end','working_due','is_data_program','dp_goal','description'];
    var projRows = PROJECTS.filter(function(p) {
      if (statuses.length && statuses.indexOf(p.status) < 0) return false;
      if (!projectMatchesDateMode(p, mode, ws, we)) return false;
      if (!projectInvolves(p, employees)) return false;
      return true;
    }).map(function(p) {
      var row = {};
      projHeaders.forEach(function(h) { row[h] = p[h] != null ? p[h] : ''; });
      return row;
    });
    if (projRows.length) {
      downloadCsv('analytics-tracker-projects-' + stamp + '.csv', buildCsv(projHeaders, projRows));
      totalCount += projRows.length;
    }
  }

  if (doTasks) {
    var taskHeaders = ['task_number','project','project_id','title','status','assignee','priority','start','due','working_due','actual_end','category','tools','notes'];
    var taskRows = TASKS.filter(function(t) {
      if (statuses.length && statuses.indexOf(t.status) < 0) return false;
      if (!taskMatchesDateMode(t, mode, ws, we)) return false;
      if (employees.length && employees.indexOf(t.assignee) < 0) return false;
      return true;
    }).map(function(t) {
      var row = {};
      taskHeaders.forEach(function(h) { row[h] = t[h] != null ? t[h] : ''; });
      return row;
    });
    if (taskRows.length) {
      downloadCsv('analytics-tracker-tasks-' + stamp + '.csv', buildCsv(taskHeaders, taskRows));
      totalCount += taskRows.length;
    }
  }

  if (totalCount === 0) {
    showToast('No records matched the selected filters.', 'warn');
  } else {
    showToast('Exported ' + totalCount + ' record' + (totalCount === 1 ? '' : 's') + '.', 'success');
    closeExportModal();
  }
}
