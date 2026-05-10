// ─────────────────────────────────────────────────────────────────────
// modals/member-form.js — Team member form + Absence editor
//
// Owns: the Add/Edit member form (open/close, validation, save,
// delete), tracking-level + schedule-type change handlers, week-totals
// calculator, plus the Absence editor (open, render, navigate, save).
//
// Forward references: Auth, Editor, RESOURCES_DATA, _productivityRatio,
// agolQuery, agolApplyEdits, ARCGIS_CONFIG, showToast, esc, render,
// renderSettingsPage, switchSettingsSection.
// ─────────────────────────────────────────────────────────────────────

// ── Member Form (Add / Edit) ──────────────────────────────────────
function openMemberForm(mode, name) {
  document.getElementById('mf-title').textContent = mode === 'edit' ? 'Edit Team Member' : 'Add Team Member';
  document.getElementById('mf-oid').value = '';
  // Build the Data Program Lead Team dropdown options from the live config
  // (excluding DI — DI leads use the existing AGO Team Leads group, not this field).
  var dpltSel = document.getElementById('mf-data-program-lead-team');
  if (dpltSel && typeof getDataProgramTeams === 'function') {
    var teams = getDataProgramTeams().filter(function(t) { return t.id !== 'DI'; });
    dpltSel.innerHTML = '<option value="">&mdash; Not a Data Program lead &mdash;</option>' +
      teams.map(function(t) { return '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>'; }).join('');
  }
  if (mode === 'edit' && RESOURCES_DATA && RESOURCES_DATA.people[name]) {
    const p = RESOURCES_DATA.people[name];
    document.getElementById('mf-name').value = name;
    document.getElementById('mf-name').dataset.origName = name;
    document.getElementById('mf-role').value = p.role;
    document.getElementById('mf-team').value = p.team;
    document.getElementById('mf-member-group').value = p.member_group || 'Data Intelligence';
    document.getElementById('mf-skill').value = p.skill;
    document.getElementById('mf-proj-pct').value = Math.round(p.proj_pct * 100);
    document.getElementById('mf-tracking-level').value = p.tracking_level || 'full';
    if (dpltSel) dpltSel.value = p.data_program_lead_team || '';
    document.getElementById('mf-schedule-type').value = p.schedule_type || '5/8';
    document.getElementById('mf-rdo-day').value = p.rdo_day || '';
    document.getElementById('mf-lunch').value = String(p.lunch_minutes != null ? p.lunch_minutes : 60);
    // Daily start/end times
    const days = ['mon','tue','wed','thu','fri'];
    ['wk1','wk2'].forEach(function(wk) {
      days.forEach(function(d) {
        const startEl = document.getElementById('mf-' + wk + '-' + d + '-start');
        const endEl = document.getElementById('mf-' + wk + '-' + d + '-end');
        if (startEl) startEl.value = p.schedule[wk + '_' + d + '_start'] || '';
        if (endEl) endEl.value = p.schedule[wk + '_' + d + '_end'] || '';
      });
    });
    updateWeekTotals();
    // We need to find the OID for this member
    document.getElementById('mf-name').readOnly = false;
    document.getElementById('mf-name').style.background = '';
  } else {
    document.getElementById('mf-name').value = '';
    document.getElementById('mf-name').dataset.origName = '';
    document.getElementById('mf-role').value = '';
    document.getElementById('mf-team').value = '';
    document.getElementById('mf-member-group').value = 'Data Intelligence';
    document.getElementById('mf-skill').value = '';
    document.getElementById('mf-proj-pct').value = '';
    document.getElementById('mf-tracking-level').value = 'full';
    if (dpltSel) dpltSel.value = '';
    document.getElementById('mf-schedule-type').value = '5/8';
    document.getElementById('mf-rdo-day').value = '';
    document.getElementById('mf-lunch').value = '60';
    // Default 5/8: 8am-5pm every day
    const days2 = ['mon','tue','wed','thu','fri'];
    ['wk1','wk2'].forEach(function(wk) {
      days2.forEach(function(d) {
        const startEl = document.getElementById('mf-' + wk + '-' + d + '-start');
        const endEl = document.getElementById('mf-' + wk + '-' + d + '-end');
        if (startEl) startEl.value = '08:00';
        if (endEl) endEl.value = '17:00';
      });
    });
    updateWeekTotals();
    document.getElementById('mf-name').readOnly = false;
    document.getElementById('mf-name').style.background = '';
  }
  document.getElementById('member-form-backdrop').classList.add('open');
  onTrackingLevelChange();
}

function onTrackingLevelChange() {
  var level = document.getElementById('mf-tracking-level').value;
  var fullFields = document.getElementById('mf-full-fields');
  var hint = document.getElementById('mf-light-hint');
  if (fullFields) fullFields.style.display = level === 'light' ? 'none' : '';
  if (hint) hint.style.display = level === 'light' ? '' : 'none';
}

// Auto-fill start/end times when schedule type changes
function onScheduleTypeChange() {
  const type = document.getElementById('mf-schedule-type').value;
  const rdo = document.getElementById('mf-rdo-day').value;
  const days = ['mon','tue','wed','thu','fri'];
  const rdoIdx = rdo ? ['Monday','Tuesday','Wednesday','Thursday','Friday'].indexOf(rdo) : -1;

  function setDay(wk, d, start, end) {
    const s = document.getElementById('mf-' + wk + '-' + d + '-start');
    const e = document.getElementById('mf-' + wk + '-' + d + '-end');
    if (s) s.value = start || '';
    if (e) e.value = end || '';
  }

  if (type === '5/8') {
    document.getElementById('mf-rdo-day').value = '';
    days.forEach(function(d) {
      setDay('wk1', d, '08:00', '17:00');
      setDay('wk2', d, '08:00', '17:00');
    });
  } else if (type === '4/10') {
    days.forEach(function(d, i) {
      if (i === rdoIdx) {
        setDay('wk1', d, '', '');
        setDay('wk2', d, '', '');
      } else {
        setDay('wk1', d, '07:00', '18:00');
        setDay('wk2', d, '07:00', '18:00');
      }
    });
  } else if (type === '9/80') {
    days.forEach(function(d, i) {
      if (i === rdoIdx) {
        setDay('wk1', d, '07:00', '16:00'); // Week A: short day
        setDay('wk2', d, '', '');             // Week B: day off
      } else {
        setDay('wk1', d, '07:00', '17:00');
        setDay('wk2', d, '07:00', '17:00');
      }
    });
  }
  updateWeekTotals();
}

function updateWeekTotals() {
  const days = ['mon','tue','wed','thu','fri'];
  const lunch = parseInt(document.getElementById('mf-lunch').value) || 0;
  let wk1 = 0, wk2 = 0;
  ['wk1','wk2'].forEach(function(wk) {
    days.forEach(function(d) {
      const s = document.getElementById('mf-' + wk + '-' + d + '-start');
      const e = document.getElementById('mf-' + wk + '-' + d + '-end');
      if (s && e && s.value && e.value) {
        const sp = s.value.split(':'), ep = e.value.split(':');
        const startMins = parseInt(sp[0]) * 60 + parseInt(sp[1]);
        const endMins = parseInt(ep[0]) * 60 + parseInt(ep[1]);
        const hrs = Math.max(0, (endMins - startMins) / 60 - lunch / 60);
        if (wk === 'wk1') wk1 += hrs;
        else wk2 += hrs;
      }
    });
  });
  document.getElementById('mf-wk1-total').textContent = Math.round(wk1 * 100) / 100 + 'h';
  document.getElementById('mf-wk2-total').textContent = Math.round(wk2 * 100) / 100 + 'h';
}

async function toggleTimeTracking(name, enabled) {
  try {
    const existing = await agolQuery(ARCGIS_CONFIG.teamMembersUrl, "name='" + name.replace(/'/g, "''") + "'");
    if (existing.length === 0) { showToast('Could not find record for ' + name, 'error'); return; }
    const oid = existing[0].attributes.OBJECTID || existing[0].attributes.ObjectId || existing[0].attributes.objectid;
    const attrs = { OBJECTID: oid };
    // Use case-insensitive field name detection
    if (RESOURCES_DATA && RESOURCES_DATA._memberFieldNames) {
      const fieldNames = RESOURCES_DATA._memberFieldNames;
      const fn = fieldNames.find(function(f) { return f.toLowerCase() === 'time_tracking'; });
      if (fn) {
        attrs[fn] = enabled ? 'true' : 'false';
      } else {
        showToast('time_tracking field not found on team_members service. Add it as String(10) in ArcGIS Online.', 'error');
        return;
      }
    } else {
      attrs.time_tracking = enabled ? 'true' : 'false';
    }
    const result = await agolApplyEdits(ARCGIS_CONFIG.teamMembersUrl, { updates: [{ attributes: attrs }] });
    console.log('[Settings] Time tracking for', name, ':', enabled, result);
    // Update local data
    if (RESOURCES_DATA && RESOURCES_DATA.people[name]) {
      RESOURCES_DATA.people[name].time_tracking = enabled;
    }
  } catch (err) {
    console.error('[Settings] Toggle time tracking failed:', err);
    showToast('Failed to update time tracking: ' + err.message, 'error');
    return;
  }
  // Reload time entries if toggling self (separate try/catch)
  if (name === Auth.fullName) {
    if (enabled) {
      try {
        await reloadAllTimeData();
      } catch (err2) {
        console.warn('[Settings] Could not load time entries:', err2);
        // Don't alert — the toggle saved, entries will load on next page refresh
      }
    } else {
      TIME_ENTRIES = [];
    }
    markDataDirty();
    render();
  }
}

async function cascadeRename(oldName, newName) {
  const log = [];
  const escaped = oldName.replace(/'/g, "''");

  // Helper: query + batch update a service
  async function renameInService(url, whereField, attrs) {
    try {
      const features = await agolQuery(url, whereField + "='" + escaped + "'");
      if (features.length === 0) return;
      const updates = features.map(function(f) {
        const oid = f.attributes.OBJECTID || f.attributes.ObjectId || f.attributes.objectid || f.attributes.FID;
        const upd = Object.assign({ OBJECTID: oid }, attrs);
        return { attributes: upd };
      });
      await agolApplyEdits(url, { updates: updates });
      log.push(whereField + ': ' + features.length + ' records');
    } catch (err) {
      console.error('[Rename] Failed on', whereField, ':', err);
      log.push(whereField + ': FAILED - ' + err.message);
    }
  }

  // 1. Projects: contact
  await renameInService(ARCGIS_CONFIG.projectsUrl, 'contact', { contact: newName });

  // 2. Projects: other_members (comma-separated, need to query and do string replace)
  try {
    const projFeatures = await agolQuery(ARCGIS_CONFIG.projectsUrl, "other_members LIKE '%" + escaped + "%'");
    if (projFeatures.length > 0) {
      const updates = projFeatures.map(function(f) {
        const oid = f.attributes.OBJECTID || f.attributes.ObjectId || f.attributes.objectid;
        const om = f.attributes.other_members || '';
        // Replace the name in the comma-separated list
        const parts = om.split(',').map(function(s) { return s.trim() === oldName ? newName : s.trim(); });
        return { attributes: { OBJECTID: oid, other_members: parts.join(', ') } };
      });
      await agolApplyEdits(ARCGIS_CONFIG.projectsUrl, { updates: updates });
      log.push('other_members: ' + projFeatures.length + ' records');
    }
  } catch (err) {
    console.error('[Rename] Failed on other_members:', err);
    log.push('other_members: FAILED - ' + err.message);
  }

  // 3. Tasks: assignee
  await renameInService(ARCGIS_CONFIG.tasksUrl, 'assignee', { assignee: newName });

  // 4. Time entries: name
  await renameInService(ARCGIS_CONFIG.timeEntriesUrl, 'name', { name: newName });

  // 5. Allocations: name
  await renameInService(ARCGIS_CONFIG.allocationsUrl, 'name', { name: newName });

  // 6. Absences: name
  await renameInService(ARCGIS_CONFIG.absencesUrl, 'name', { name: newName });

  // 7. Status history: changed_by
  await renameInService(ARCGIS_CONFIG.statusHistoryUrl, 'changed_by', { changed_by: newName });

  // 8. Update local arrays
  PROJECTS.forEach(function(p) {
    if (p.contact === oldName) p.contact = newName;
    if (p.other_members) {
      p.other_members = p.other_members.split(',').map(function(s) { return s.trim() === oldName ? newName : s.trim(); }).join(', ');
    }
  });
  TASKS.forEach(function(t) {
    if (t.assignee === oldName) t.assignee = newName;
  });
  TIME_ENTRIES.forEach(function(e) {
    if (e.name === oldName) e.name = newName;
  });
  STATUS_HISTORY.forEach(function(h) {
    if (h.changed_by === oldName) h.changed_by = newName;
  });
  // Update RESOURCES_DATA
  if (RESOURCES_DATA && RESOURCES_DATA.people[oldName]) {
    RESOURCES_DATA.people[newName] = RESOURCES_DATA.people[oldName];
    delete RESOURCES_DATA.people[oldName];
  }
  // Update Auth.fullName if renaming self
  if (Auth.fullName === oldName) Auth.fullName = newName;

  console.log('[Rename] Cascade complete:', log.join(', '));
}

async function toggleMemberActive(name) {
  const p = RESOURCES_DATA && RESOURCES_DATA.people[name];
  if (!p) return;
  const newActive = p.active === false ? true : false;
  try {
    const existing = await agolQuery(ARCGIS_CONFIG.teamMembersUrl, "name='" + name.replace(/'/g, "''") + "'");
    if (existing.length === 0) { showToast('Could not find record for ' + name, 'error'); return; }
    const oid = existing[0].attributes.OBJECTID || existing[0].attributes.ObjectId || existing[0].attributes.objectid;
    const attrs = { OBJECTID: oid, active: newActive ? 'true' : 'false' };
    await agolApplyEdits(ARCGIS_CONFIG.teamMembersUrl, { updates: [{ attributes: attrs }] });
    console.log('[Settings] Member active for', name, ':', newActive);
    p.active = newActive;
    refreshEnums();
    renderSettingsPage(document.getElementById('content-area'));
  } catch (err) {
    console.error('[Settings] Toggle member active failed:', err);
    showToast('Failed to update: ' + err.message, 'error');
  }
}

function closeMemberForm() {
  document.getElementById('member-form-backdrop').classList.remove('open');
}

async function saveMemberForm() {
  const name = document.getElementById('mf-name').value.trim();
  const role = document.getElementById('mf-role').value.trim();
  const team = document.getElementById('mf-team').value.trim();
  const memberGroup = document.getElementById('mf-member-group').value || 'Data Intelligence';
  const skill = document.getElementById('mf-skill').value.trim();
  const projPct = parseFloat(document.getElementById('mf-proj-pct').value) || 0;
  const trackingLevel = document.getElementById('mf-tracking-level').value || 'full';
  const dpLeadTeam = document.getElementById('mf-data-program-lead-team').value || null;
  const scheduleType = document.getElementById('mf-schedule-type').value || '5/8';
  const rdoDay = document.getElementById('mf-rdo-day').value || null;
  const lunchMinutes = parseInt(document.getElementById('mf-lunch').value) || 60;
  const origName = document.getElementById('mf-name').dataset.origName || '';

  // Collect start/end times and convert "HH:MM" to ms since midnight for TimeOnly fields
  const days = ['mon','tue','wed','thu','fri'];
  function hhmmToTimeStr(val) {
    if (!val) return null;
    // HTML time inputs return "HH:MM" — append :00 for seconds
    return val.length === 5 ? val + ':00' : val;
  }
  const scheduleFields = {};
  ['wk1','wk2'].forEach(function(wk) {
    days.forEach(function(d) {
      const startEl = document.getElementById('mf-' + wk + '-' + d + '-start');
      const endEl = document.getElementById('mf-' + wk + '-' + d + '-end');
      scheduleFields[wk + '_' + d + '_start'] = startEl ? hhmmToTimeStr(startEl.value) : null;
      scheduleFields[wk + '_' + d + '_end'] = endEl ? hhmmToTimeStr(endEl.value) : null;
    });
  });

  if (!name) { showToast('Name is required.', 'warn'); return; }
  if (projPct < 0 || projPct > 100) { showToast('Project % must be 0–100.', 'warn'); return; }

  const memberAttrs = {
    name: name,
    role: role,
    team: team,
    member_group: memberGroup,
    skill: skill,
    proj_pct: projPct / 100,
    tracking_level: trackingLevel,
  };

  // Only include schedule fields if the service supports them
  if (RESOURCES_DATA && RESOURCES_DATA._memberFieldNames) {
    const fieldNames = RESOURCES_DATA._memberFieldNames;
    const fn = function(target) { return fieldNames.find(function(f) { return f.toLowerCase() === target.toLowerCase(); }) || null; };
    const stField = fn('schedule_type');
    if (stField) {
      memberAttrs[stField] = scheduleType;
      const rd = fn('rdo_day'); if (rd) memberAttrs[rd] = rdoDay;
      const lm = fn('lunch_minutes'); if (lm) memberAttrs[lm] = lunchMinutes;
      // Start/end time fields
      Object.keys(scheduleFields).forEach(function(key) {
        const field = fn(key);
        if (field) memberAttrs[field] = scheduleFields[key];
      });
    } else {
      console.warn('[Settings] Schedule fields not found on team_members service.');
    }
    // Data Program Lead Team — only included if the field exists on the service
    const dpltField = fn('data_program_lead_team');
    if (dpltField) memberAttrs[dpltField] = dpLeadTeam;
  }

  const isEdit = origName !== '';
  const isRename = isEdit && origName !== name;

  // Only set active on new member creation (edits preserve existing value)
  if (!isEdit) {
    memberAttrs.active = 'true';
  }

  if (isRename) {
    if (!confirm('Renaming "' + origName + '" to "' + name + '" will update all projects, tasks, time entries, allocations, and absences.\n\nThis may take a moment. Continue?')) return;
  }

  // Check for duplicate if name is changing or adding new
  if ((!isEdit || isRename) && RESOURCES_DATA && RESOURCES_DATA.people[name]) {
    showToast('A team member named "' + name + '" already exists.', 'warn');
    return;
  }

  try {
    var result;
    if (isEdit) {
      // Find existing OID using original name
      const existing = await agolQuery(ARCGIS_CONFIG.teamMembersUrl, "name='" + origName.replace(/'/g, "''") + "'");
      if (existing.length === 0) { showToast('Could not find existing record for ' + origName, 'error'); return; }
      const oid = existing[0].attributes.OBJECTID || existing[0].attributes.ObjectId || existing[0].attributes.objectid || existing[0].attributes.FID;
      memberAttrs.OBJECTID = oid;
      console.log('[Settings] Saving member update:', JSON.stringify(memberAttrs));
      result = await agolApplyEdits(ARCGIS_CONFIG.teamMembersUrl, {
        updates: [{ attributes: memberAttrs }]
      });
      console.log('[Settings] Updated member:', name, result);

      // Cascading rename across all services
      if (isRename) {
        showLoadingOverlay('Renaming "' + origName + '" → "' + name + '" across all records...');
        await cascadeRename(origName, name);
      }
    } else {
      console.log('[Settings] Saving new member:', JSON.stringify(memberAttrs));
      result = await agolApplyEdits(ARCGIS_CONFIG.teamMembersUrl, {
        adds: [{ attributes: memberAttrs }]
      });
      console.log('[Settings] Added member:', name, result);
    }

    // Check for errors
    const errors = [];
    if (result.addResults) result.addResults.forEach(function(r) { if (!r.success) errors.push(r.error ? r.error.description : 'unknown'); });
    if (result.updateResults) result.updateResults.forEach(function(r) { if (!r.success) errors.push(r.error ? r.error.description : 'unknown'); });
    if (errors.length > 0) {
      showToast('Save failed: ' + errors.join(', '), 'error');
      return;
    }

    closeMemberForm();
    // Reload resources data and re-render
    showLoadingOverlay('Saving team member...');
    await loadResourcesData();
    initResourcesWeekIndices();
    hideLoadingOverlay();
    markSynced(isRename ? 'Renamed ' + origName + ' → ' + name : isEdit ? 'Updated ' + name : 'Added ' + name);
    markDataDirty();
    render();
  } catch (err) {
    hideLoadingOverlay();
    console.error('[Settings] Save member failed:', err);
    showToast('Save failed: ' + err.message, 'error');
  }
}

async function deleteMember(name) {
  if (!confirm('Remove "' + name + '" from the team?\n\nThis will delete their team member record. Their allocation and absence history will remain in the database.')) return;
  try {
    const existing = await agolQuery(ARCGIS_CONFIG.teamMembersUrl, "name='" + name.replace(/'/g, "''") + "'");
    if (existing.length === 0) { showToast('Could not find record for ' + name, 'error'); return; }
    const oid = existing[0].attributes.ObjectId || existing[0].attributes.OBJECTID || existing[0].attributes.objectid || existing[0].attributes.FID;
    const result = await agolApplyEdits(ARCGIS_CONFIG.teamMembersUrl, { deletes: [oid] });
    console.log('[Settings] Deleted member:', name, result);

    if (result.deleteResults && result.deleteResults[0] && !result.deleteResults[0].success) {
      showToast('Delete failed: ' + (result.deleteResults[0].error ? result.deleteResults[0].error.description : 'unknown'), 'error');
      return;
    }

    if (Editor.selectedMember === name) Editor.selectedMember = null;

    showLoadingOverlay('Removing team member...');
    await loadResourcesData();
    initResourcesWeekIndices();
    hideLoadingOverlay();
    markSynced('Removed ' + name);
    markDataDirty();
    render();
  } catch (err) {
    console.error('[Settings] Delete member failed:', err);
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// ── Absence Editor ───────────────────────────────────────────────
function openAbsenceEditor(name) {
  Editor.selectedMember = name;
  Editor.absWindowStart = Math.max(0, window.currentWeekIdx - 3);
  renderAbsenceEditor(name);
  // Scroll to the section
  setTimeout(function() {
    const el = document.getElementById('settings-absence-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

function renderAbsenceEditor(name) {
  const section = document.getElementById('settings-absence-section');
  if (!section || !RESOURCES_DATA || !RESOURCES_DATA.people[name]) return;

  const p = RESOURCES_DATA.people[name];
  const weeks = RESOURCES_DATA.weeks;
  const N = weeks.length;
  const wEnd = Math.min(Editor.absWindowStart + ABS_COLS, N);
  const wIdxs = [];
  for (let i = Editor.absWindowStart; i < wEnd; i++) wIdxs.push(i);

  const startLabel = absMonLabel(wIdxs[0]);
  const endLabel = absMonLabel(wIdxs[wIdxs.length - 1]);

  let html = '<div class="settings-section">' +
    '<div class="settings-section-header">' +
      '<span>Absences — ' + esc(name) + '</span>' +
      '<button class="settings-btn settings-btn-secondary" onclick="Editor.selectedMember=null;render();">✕ Close</button>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">' +
      '<button class="settings-btn settings-btn-secondary" onclick="absEditorShift(-1)" ' + (Editor.absWindowStart === 0 ? 'disabled' : '') + '>◀ Prev</button>' +
      '<div style="text-align:center;flex:1;">' +
        '<div style="font-weight:700;color:var(--navy);font-size:14px;">' + startLabel + ' — ' + endLabel + '</div>' +
        '<div class="text-muted-sm">W' + (wIdxs[0]+1) + ' – W' + (wIdxs[wIdxs.length-1]+1) + ' · Enter hours off per week (0–40)</div>' +
      '</div>' +
      '<button class="settings-btn settings-btn-secondary" onclick="absJumpCurrent()">Today</button>' +
      '<button class="settings-btn settings-btn-secondary" onclick="absEditorShift(1)" ' + (wEnd >= N ? 'disabled' : '') + '>Next ▶</button>' +
    '</div>' +
    '<div class="abs-grid"><table><thead><tr><th style="text-align:left;min-width:60px;">Week</th>';

  // Header row: week labels
  for (let ci = 0; ci < wIdxs.length; ci++) {
    const wi = wIdxs[ci];
    const isCur = wi === window.currentWeekIdx;
    html += '<th class="' + (isCur ? 'abs-cur' : '') + '">' + absMonLabel(wi) + '</th>';
  }
  html += '</tr></thead><tbody><tr><td style="text-align:left;font-weight:700;color:var(--navy);font-size:12px;">Hours Off</td>';

  // Input cells
  for (let ci = 0; ci < wIdxs.length; ci++) {
    const wi = wIdxs[ci];
    const hrs = p.absences[wi] || 0;
    const isCur = wi === window.currentWeekIdx;
    const hasVal = hrs > 0;
    html += '<td class="' + (isCur ? 'abs-cur' : '') + '">' +
      '<input type="number" min="0" max="40" step="1" value="' + hrs + '" ' +
      'class="abs-input' + (hasVal ? ' has-val' : '') + '" ' +
      'data-name="' + esc(name) + '" data-wi="' + wi + '" ' +
      'onchange="absValueChanged(this)" onfocus="this.select()">' +
    '</td>';
  }

  // Capacity row (read-only, shows computed proj_cap)
  html += '</tr><tr><td style="text-align:left;font-size:11px;color:var(--text-muted);">Proj Capacity</td>';
  for (let ci = 0; ci < wIdxs.length; ci++) {
    const wi = wIdxs[ci];
    const cap = p.proj_cap[wi] || 0;
    const isCur = wi === window.currentWeekIdx;
    html += '<td class="' + (isCur ? 'abs-cur' : '') + '" class="text-muted-sm">' + cap.toFixed(1) + 'h</td>';
  }

  html += '</tr></tbody></table></div></div>';
  section.innerHTML = html;
}

function absMonLabel(wi) {
  if (!RESOURCES_DATA || !RESOURCES_DATA.weeks[wi]) return '';
  const d = new Date(RESOURCES_DATA.weeks[wi] + 'T00:00:00');
  d.setDate(d.getDate() + 1); // Sun→Mon
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function absEditorShift(dir) {
  const N = RESOURCES_DATA.weeks.length;
  Editor.absWindowStart = Math.max(0, Math.min(Editor.absWindowStart + dir, N - ABS_COLS));
  renderAbsenceEditor(Editor.selectedMember);
}

function absJumpCurrent() {
  Editor.absWindowStart = Math.max(0, window.currentWeekIdx - 3);
  renderAbsenceEditor(Editor.selectedMember);
}

async function absValueChanged(input) {
  const name = input.dataset.name;
  const wi = parseInt(input.dataset.wi);
  const hrs = Math.min(40, Math.max(0, parseFloat(input.value) || 0));
  input.value = hrs;
  input.className = 'abs-input' + (hrs > 0 ? ' has-val' : '');

  const p = RESOURCES_DATA.people[name];
  if (!p) return;

  const oldHrs = p.absences[wi] || 0;
  p.absences[wi] = hrs;

  // Recalculate proj_cap for this week: (40 - absences) × productivity × proj_pct
  p.proj_cap[wi] = (40 - hrs) * _productivityRatio * p.proj_pct;

  // Recalculate hours and utilization for this week
  p.allocations.forEach(function(a) {
    a.hours[wi] = (a.fracs[wi] || 0) * p.proj_cap[wi];
  });
  let totalHrs = 0;
  p.allocations.forEach(function(a) { totalHrs += (a.hours[wi] || 0); });
  p.weekly_allocated[wi] = totalHrs;
  p.utilization[wi] = p.proj_cap[wi] > 0 ? totalHrs / p.proj_cap[wi] : 0;

  // Update capacity display in the grid
  renderAbsenceEditor(name);

  // Save to REST
  const weekDate = RESOURCES_DATA.weeks[wi];
  try {
    // Find existing absence record for this person+week
    const existing = await agolQuery(ARCGIS_CONFIG.absencesUrl,
      "name='" + name.replace(/'/g, "''") + "' AND week_date='" + weekDate + "'");

    if (existing.length > 0) {
      const oid = existing[0].attributes.OBJECTID || existing[0].attributes.ObjectId || existing[0].attributes.objectid || existing[0].attributes.FID;
      if (hrs > 0) {
        // Update existing
        await agolApplyEdits(ARCGIS_CONFIG.absencesUrl, {
          updates: [{ attributes: { OBJECTID: oid, absence_hours: hrs } }]
        });
      } else {
        // Delete if zero
        await agolApplyEdits(ARCGIS_CONFIG.absencesUrl, { deletes: [oid] });
      }
    } else if (hrs > 0) {
      // Add new
      await agolApplyEdits(ARCGIS_CONFIG.absencesUrl, {
        adds: [{ attributes: { name: name, week_date: weekDate, absence_hours: hrs } }]
      });
    }
    console.log('[Settings] Saved absence for', name, 'week', weekDate, ':', hrs, 'hours');
  } catch (err) {
    console.error('[Settings] Absence save failed:', err);
    showToast('Absence save failed: ' + err.message, 'error');
  }
}
