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
// Fill a <select> with options; preserves the current value even if it's not in
// the configured list (so editing a member with a legacy Unit/Team doesn't drop it).
function _mfFillSelect(id, options, current) {
  var sel = document.getElementById(id);
  if (!sel) return;
  var opts = (options || []).slice();
  if (current && opts.indexOf(current) < 0) opts.unshift(current);
  sel.innerHTML = '<option value="">— Select —</option>' +
    opts.map(function(o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('');
  sel.value = current || '';
}

// Cascading Unit dropdown: when the Team select changes, refill the Unit options
// with that team's units (org tree). Keeps the current unit if it's still valid
// for the new team; otherwise clears it.
function mfOnTeamChange() {
  var teamSel = document.getElementById('mf-team');
  var unitSel = document.getElementById('mf-role');
  if (!teamSel || !unitSel) return;
  var team = teamSel.value;
  var cur = unitSel.value;
  var units = (typeof fmUnitsForTeam === 'function') ? fmUnitsForTeam(team)
    : (typeof _customItdTeams !== 'undefined' ? _customItdTeams : []);
  _mfFillSelect('mf-role', units, (cur && units.indexOf(cur) >= 0) ? cur : '');
}

function openMemberForm(mode, name) {
  document.getElementById('mf-title').textContent = mode === 'edit' ? 'Edit Team Member' : 'Add Team Member';
  document.getElementById('mf-oid').value = '';
  // Build the Team Lead dropdown from the configured owning teams (excluding the
  // home team — its leads use the AGO admin group, not this field). A Team Lead
  // can create/edit all of their team's projects.
  var dpltSel = document.getElementById('mf-data-program-lead-team');
  if (dpltSel) {
    var home = (typeof HOME_TEAM !== 'undefined') ? HOME_TEAM : 'Data Intelligence';
    var leadTeams = (typeof _customOwningTeams !== 'undefined' && Array.isArray(_customOwningTeams))
      ? _customOwningTeams.filter(function(t) { return t && t !== home && t !== 'Not on a Team'; })
      : [];
    dpltSel.innerHTML = '<option value="">&mdash; Not a team lead &mdash;</option>' +
      leadTeams.map(function(t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('');
  }
  if (mode === 'edit' && RESOURCES_DATA && RESOURCES_DATA.people[name]) {
    const p = RESOURCES_DATA.people[name];
    document.getElementById('mf-name').value = name;
    document.getElementById('mf-name').dataset.origName = name;
    document.getElementById('mf-position-title').value = p.position_title || '';
    _mfFillSelect('mf-team', (typeof _customOwningTeams !== 'undefined' ? _customOwningTeams : []), p.team);
    _mfFillSelect('mf-role', (typeof fmUnitsForTeam === 'function' ? fmUnitsForTeam(p.team) : (typeof _customItdTeams !== 'undefined' ? _customItdTeams : [])), p.role);
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
    _mfFillSelect('mf-team', (typeof _customOwningTeams !== 'undefined' ? _customOwningTeams : []), '');
    _mfFillSelect('mf-role', (typeof fmUnitsForTeam === 'function' ? fmUnitsForTeam('') : (typeof _customItdTeams !== 'undefined' ? _customItdTeams : [])), '');
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
  // Team Lead scoping: a (non-admin) team lead manages only their own team —
  // lock the Team field to their team and hide the lead-assignment control.
  (function() {
    var actorLead = (typeof isAdmin === 'function' && !isAdmin() && typeof getLeadTeam === 'function') ? getLeadTeam() : null;
    var teamSel = document.getElementById('mf-team');
    var leadRow = document.getElementById('mf-team-lead-row');
    if (actorLead) {
      if (teamSel) {
        if (!Array.prototype.some.call(teamSel.options, function(o) { return o.value === actorLead; })) {
          teamSel.add(new Option(actorLead, actorLead));
        }
        teamSel.value = actorLead;
        teamSel.disabled = true;
      }
      if (leadRow) leadRow.style.display = 'none';
    } else {
      if (teamSel) teamSel.disabled = false;
      if (leadRow) leadRow.style.display = '';
    }
  })();
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
    const attrs = { ObjectId: oid };
    // Use case-insensitive field name detection
    if (RESOURCES_DATA && RESOURCES_DATA._memberFieldNames) {
      const fieldNames = RESOURCES_DATA._memberFieldNames;
      const fn = fieldNames.find(function(f) { return f.toLowerCase() === 'time_tracking'; });
      if (fn) {
        // time_tracking is an Integer field (1/0) since the 2026-05 migration.
        attrs[fn] = enabled ? 1 : 0;
      } else {
        showToast('time_tracking field not found on team_members service. Add it as Integer in ArcGIS Online.', 'error');
        return;
      }
    } else {
      attrs.time_tracking = enabled ? 1 : 0;
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
        const upd = Object.assign({ ObjectId: oid }, attrs);
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
        return { attributes: { ObjectId: oid, other_members: parts.join(', ') } };
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
    const attrs = { ObjectId: oid, active: newActive ? 'true' : 'false' };
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
  const positionTitle = document.getElementById('mf-position-title').value.trim();
  const role = document.getElementById('mf-role').value.trim();
  let team = document.getElementById('mf-team').value.trim();
  const memberGroup = document.getElementById('mf-member-group').value || 'Data Intelligence';
  const skill = document.getElementById('mf-skill').value.trim();
  const projPct = parseFloat(document.getElementById('mf-proj-pct').value) || 0;
  const trackingLevel = document.getElementById('mf-tracking-level').value || 'full';
  let dpLeadTeam = document.getElementById('mf-data-program-lead-team').value || null;
  const scheduleType = document.getElementById('mf-schedule-type').value || '5/8';
  const rdoDay = document.getElementById('mf-rdo-day').value || null;
  const lunchMinutes = parseInt(document.getElementById('mf-lunch').value) || 60;
  const origName = document.getElementById('mf-name').dataset.origName || '';

  // Team Lead enforcement: a non-admin team lead may only manage their own team's
  // members — force the team to theirs, never change lead assignment, and reject
  // editing a member who belongs to another team.
  var _actorLead = (typeof isAdmin === 'function' && !isAdmin() && typeof getLeadTeam === 'function') ? getLeadTeam() : null;
  if (_actorLead) {
    if (origName && RESOURCES_DATA && RESOURCES_DATA.people[origName]) {
      var _ot = (RESOURCES_DATA.people[origName].team) || '';
      var _match = (typeof sameTeam === 'function') ? sameTeam(_ot, _actorLead) : _ot === _actorLead;
      if (!_match) { showToast('You can only manage your own team\'s members.', 'warn'); return; }
      dpLeadTeam = RESOURCES_DATA.people[origName].data_program_lead_team || null; // preserve; leads can't grant lead status
    } else {
      dpLeadTeam = null; // a member added by a lead is never auto-made a lead
    }
    team = _actorLead; // force their own team
  }

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
    // Org-rename: writes only the new owning_unit/owning_team columns. The
    // legacy role/team columns are being dropped from team_members in the
    // same migration cycle. Local model still uses role/team as the JS
    // field names (see index.html load) — kept that way to avoid churning
    // all consumers.
    owning_unit: role,
    owning_team: team,
    member_group: memberGroup,
    skill: skill,
    proj_pct: projPct / 100,
    tracking_level: trackingLevel,
  };
  if (RESOURCES_DATA && RESOURCES_DATA._memberFieldNames) {
    const ptField = RESOURCES_DATA._memberFieldNames.find(function(f) { return f.toLowerCase() === 'position_title'; });
    if (ptField) memberAttrs[ptField] = positionTitle;
  }

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

  // Only set active on new member creation (edits preserve existing value).
  // active is an Integer field (1/0) since the 2026-05 migration — writing the
  // legacy string 'true' makes the add fail the integer conversion.
  if (!isEdit) {
    memberAttrs.active = 1;
  }

  if (isRename) {
    if (!await confirmDialog('Renaming "' + origName + '" to "' + name + '" will update all projects, tasks, time entries, allocations, and absences.\n\nThis may take a moment.', { title: 'Rename team member?', confirmLabel: 'Rename' })) return;
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
      memberAttrs.ObjectId = oid;
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
    // Verify-and-retry the reload so an added/renamed member shows even if the
    // team_members re-query lags behind the write. (Plain field edits: no check.)
    var _verify = (!isEdit)
      ? function() { return !!(RESOURCES_DATA && RESOURCES_DATA.people && RESOURCES_DATA.people[name]); }
      : isRename
        ? function() { return !!(RESOURCES_DATA && RESOURCES_DATA.people && RESOURCES_DATA.people[name] && !RESOURCES_DATA.people[origName]); }
        : null;
    await reloadResourcesUntil(_verify, 'member-save');
    // Optimistic overlay for edits: the team_members re-query can return stale
    // field values right after a write (read-after-write lag), which made edits
    // such as tracking_level appear not to take — the reload read the old value
    // straight back. Apply the values we just saved onto the local record so the
    // change shows immediately; the next refresh confirms from the server.
    if (isEdit && RESOURCES_DATA && RESOURCES_DATA.people && RESOURCES_DATA.people[name]) {
      var _ep = RESOURCES_DATA.people[name];
      _ep.role = role;
      _ep.team = team;
      _ep.member_group = memberGroup;
      _ep.skill = skill;
      _ep.proj_pct = projPct / 100;
      _ep.tracking_level = trackingLevel;
      _ep.position_title = positionTitle;
      _ep.data_program_lead_team = dpLeadTeam || null;
      _ep.schedule_type = scheduleType;
      _ep.rdo_day = rdoDay || null;
      _ep.lunch_minutes = (lunchMinutes != null ? lunchMinutes : 60);
    }
    // Fallback for read-after-write lag: if a newly added member still isn't in
    // RESOURCES_DATA after the reload+retries, insert a minimal optimistic entry
    // so they appear immediately. The next refresh fills in computed fields.
    if (!isEdit && RESOURCES_DATA && RESOURCES_DATA.people && !RESOURCES_DATA.people[name]) {
      RESOURCES_DATA.people[name] = {
        objectId: null, position_title: positionTitle || '',
        role: role || '', team: team || '', skill: skill || '',
        proj_pct: (projPct || 0) / 100,
        schedule_type: scheduleType || '5/8',
        week1_hours: 0, week2_hours: 0,
        rdo_day: rdoDay || null, lunch_minutes: (lunchMinutes != null ? lunchMinutes : 60),
        schedule: {},
        time_tracking: false, active: true,
        tracking_level: trackingLevel || 'full',
        member_group: memberGroup || 'Data Intelligence',
        data_program_lead_team: dpLeadTeam || null,
        proj_cap: new Array(52).fill(0), absences: new Array(52).fill(0),
        allocations: [], weekly_allocated: new Array(52).fill(0), utilization: new Array(52).fill(0)
      };
      console.log('[Settings] New member not yet in re-query — inserted optimistic entry for', name);
    }
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
  // Team Lead enforcement: a non-admin lead may only remove their own team's members.
  var _actorLead = (typeof isAdmin === 'function' && !isAdmin() && typeof getLeadTeam === 'function') ? getLeadTeam() : null;
  if (_actorLead) {
    var _p = RESOURCES_DATA && RESOURCES_DATA.people ? RESOURCES_DATA.people[name] : null;
    var _t = (_p && _p.team) || '';
    var _ok = (typeof sameTeam === 'function') ? sameTeam(_t, _actorLead) : _t === _actorLead;
    if (!_ok) { showToast('You can only remove your own team\'s members.', 'warn'); return; }
  }
  if (!await confirmDialog('Remove "' + name + '" from the team?\n\nThis will delete their team member record. Their allocation and absence history will remain in the database.', { title: 'Remove team member?', confirmLabel: 'Remove', danger: true })) return;
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
    // Verify-and-retry so the removed member is gone even if the re-query lags.
    await reloadResourcesUntil(function() { return !(RESOURCES_DATA && RESOURCES_DATA.people && RESOURCES_DATA.people[name]); }, 'member-delete');
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

  // Per-day grid: rows = weeks, cols = Mon Tue Wed Thu Fri | Total | Capacity.
  // Each cell takes hours off for that day (0..scheduled-hours). Non-working
  // days (scheduled = 0 — e.g. RDO on a 9/80 schedule) render disabled with
  // a "—" placeholder. Total is read-only (sum of the 5 day cells). Capacity
  // is the recomputed proj_cap after the absence is applied.
  const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  let html = '<div class="settings-section">' +
    '<div class="settings-section-header">' +
      '<span>Absences — ' + esc(name) + '</span>' +
      '<button class="settings-btn settings-btn-secondary" onclick="Editor.selectedMember=null;render();"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg> Close</button>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">' +
      '<button class="settings-btn settings-btn-secondary" onclick="absEditorShift(-1)" ' + (Editor.absWindowStart === 0 ? 'disabled' : '') + '>◀ Prev</button>' +
      '<div style="text-align:center;flex:1;">' +
        '<div style="font-weight:700;color:var(--navy);font-size:14px;">' + startLabel + ' — ' + endLabel + '</div>' +
        '<div class="text-muted-sm">Enter hours off per day · disabled cells = non-working day on this schedule</div>' +
      '</div>' +
      '<button class="settings-btn settings-btn-secondary" onclick="absJumpCurrent()">Today</button>' +
      '<button class="settings-btn settings-btn-secondary" onclick="absEditorShift(1)" ' + (wEnd >= N ? 'disabled' : '') + '>Next ▶</button>' +
    '</div>' +
    '<div class="abs-grid"><table><thead><tr>' +
      '<th style="text-align:left;min-width:90px;">Week</th>';
  dayLabels.forEach(function(d) { html += '<th style="min-width:60px;">' + d + '</th>'; });
  html += '<th style="min-width:60px;">Total</th><th style="min-width:70px;">Capacity</th></tr></thead><tbody>';

  wIdxs.forEach(function(wi) {
    const isCur = wi === window.currentWeekIdx;
    const sched = (typeof getDailySchedule === 'function') ? getDailySchedule(p, weeks[wi]) : { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 };
    const byDay = p.absencesByDay && p.absencesByDay[wi] ? p.absencesByDay[wi] : { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };
    const total = days.reduce(function(s, d) { return s + (byDay[d] || 0); }, 0);
    const cap = p.proj_cap[wi] || 0;
    html += '<tr class="' + (isCur ? 'abs-cur' : '') + '">';
    html += '<td style="text-align:left;font-weight:600;color:var(--navy);font-size:12px;">' + absMonLabel(wi) + (isCur ? ' <span style="font-size:10px;color:var(--text-muted);">(this wk)</span>' : '') + '</td>';
    days.forEach(function(d) {
      const dSched = sched[d] || 0;
      const dHrs = byDay[d] || 0;
      const disabled = dSched === 0;
      const hasVal = dHrs > 0;
      html += '<td>' +
        '<input type="number" min="0" max="' + dSched + '" step="0.5" ' +
        'value="' + (disabled ? '' : dHrs) + '" ' +
        'class="abs-input' + (hasVal ? ' has-val' : '') + '" ' +
        (disabled ? 'disabled placeholder="—" title="Not a working day"' : 'title="Up to ' + dSched + 'h scheduled"') + ' ' +
        'data-name="' + esc(name) + '" data-wi="' + wi + '" data-day="' + d + '" ' +
        'onchange="absDayValueChanged(this)" onfocus="this.select()">' +
      '</td>';
    });
    html += '<td style="font-weight:700;color:var(--navy);">' + total.toFixed(1) + 'h</td>';
    html += '<td class="text-muted-sm">' + cap.toFixed(1) + 'h</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
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

async function absDayValueChanged(input) {
  const name = input.dataset.name;
  const wi = parseInt(input.dataset.wi);
  const day = input.dataset.day; // 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  const p = RESOURCES_DATA.people[name];
  if (!p) return;

  // Clamp to that day's scheduled hours — typing 12 in a 6h cell silently caps.
  const sched = (typeof getDailySchedule === 'function') ? getDailySchedule(p, RESOURCES_DATA.weeks[wi]) : null;
  const maxHrs = sched ? (sched[day] || 0) : 24;
  const hrs = Math.min(maxHrs, Math.max(0, parseFloat(input.value) || 0));
  input.value = hrs;
  input.className = 'abs-input' + (hrs > 0 ? ' has-val' : '');

  // Update in-memory: per-day map + sum + downstream capacity/util.
  if (!p.absencesByDay[wi]) p.absencesByDay[wi] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };
  p.absencesByDay[wi][day] = hrs;
  const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const newTotal = days.reduce(function(s, d) { return s + (p.absencesByDay[wi][d] || 0); }, 0);
  p.absences[wi] = newTotal;

  const ppWeek = (typeof getPayPeriodWeek === 'function') ? getPayPeriodWeek(RESOURCES_DATA.weeks[wi]) : 'A';
  const scheduledHours = (ppWeek === 'A') ? (p.week1_hours || 40) : (p.week2_hours || 40);
  p.proj_cap[wi] = (scheduledHours - newTotal) * _productivityRatio * p.proj_pct;
  p.allocations.forEach(function(a) { a.hours[wi] = (a.fracs[wi] || 0) * p.proj_cap[wi]; });
  let totalAllocHrs = 0;
  p.allocations.forEach(function(a) { totalAllocHrs += (a.hours[wi] || 0); });
  p.weekly_allocated[wi] = totalAllocHrs;
  p.utilization[wi] = p.proj_cap[wi] > 0 ? totalAllocHrs / p.proj_cap[wi] : 0;

  renderAbsenceEditor(name);

  // Save to AGOL. We write all 5 day fields + the total on every save so that
  // legacy records (which had only absence_hours) get "locked in" to explicit
  // per-day values on first edit — subsequent reads use those directly instead
  // of recomputing the even-distribution fallback.
  const weekDate = RESOURCES_DATA.weeks[wi];
  try {
    const existing = await agolQuery(ARCGIS_CONFIG.absencesUrl,
      "name='" + name.replace(/'/g, "''") + "' AND week_date='" + weekDate + "'");

    const dayAttrs = {};
    days.forEach(function(d) { dayAttrs[d + '_hrs'] = p.absencesByDay[wi][d] || 0; });
    dayAttrs.absence_hours = newTotal;

    if (existing.length > 0) {
      const oid = existing[0].attributes.OBJECTID || existing[0].attributes.ObjectId || existing[0].attributes.objectid || existing[0].attributes.FID;
      if (newTotal > 0) {
        dayAttrs.ObjectId = oid;
        await agolApplyEdits(ARCGIS_CONFIG.absencesUrl, { updates: [{ attributes: dayAttrs }] });
      } else {
        await agolApplyEdits(ARCGIS_CONFIG.absencesUrl, { deletes: [oid] });
      }
    } else if (newTotal > 0) {
      dayAttrs.name = name;
      dayAttrs.week_date = weekDate;
      await agolApplyEdits(ARCGIS_CONFIG.absencesUrl, { adds: [{ attributes: dayAttrs }] });
    }
    console.log('[Settings] Saved absence for', name, 'week', weekDate, ':', JSON.stringify(p.absencesByDay[wi]), '=', newTotal, 'h');
  } catch (err) {
    console.error('[Settings] Absence save failed:', err);
    showToast('Absence save failed: ' + err.message, 'error');
  }
}
