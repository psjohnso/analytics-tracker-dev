// ─────────────────────────────────────────────────────────────────────
// modals/settings-editors.js — Settings sub-panels
//
// Owns: the saveConfigKey helper that round-trips a single
// app_config key, the Allocation Defaults editor (size×role percentage
// grid), the recomputeAllProjCap utility that recalculates everyone's
// project capacity after the productivity ratio changes, the generic
// list editor (renderListEditor + saveListEdit), the
// description-list editor for project/task categories
// (renderDescListEditor + add/edit/save handlers), and the Status
// History editor for projects.
//
// All of these live inside the Settings tab content area (or the
// project detail page in the case of status history).
//
// Forward references: Auth, Editor, RESOURCES_DATA, _allocationDefaults,
// _productivityRatio, _configOids, agolApplyEdits, ARCGIS_CONFIG,
// PROJECTS, TASKS, showToast, esc, render, refreshEnums, markDataDirty.
// ─────────────────────────────────────────────────────────────────────

// ── saveConfigKey + Allocation Defaults editor ─────────────
// Save a single config key back to ArcGIS Online
async function saveConfigKey(key, valueArray) {
  const oid = _configOids[key];
  const jsonValue = JSON.stringify(valueArray);
  console.log('[Config] Saving "' + key + '" (' + jsonValue.length + ' chars)');
  try {
    if (oid) {
      // Update existing record
      const result = await agolApplyEdits(ARCGIS_CONFIG.appConfigUrl, {
        updates: [{ attributes: { ObjectId: oid, config_value: jsonValue } }]
      });
      // Check for per-record failure
      if (result && result.updateResults && result.updateResults[0] && !result.updateResults[0].success) {
        const err = result.updateResults[0].error || {};
        throw new Error(err.description || 'Update failed — the config_value field may be too short for ' + jsonValue.length + ' characters. Increase the field length in ArcGIS Online.');
      }
      console.log('[Config] Updated "' + key + '" in ArcGIS Online');
    } else {
      // Create new record
      const result = await agolApplyEdits(ARCGIS_CONFIG.appConfigUrl, {
        adds: [{ attributes: { config_key: key, config_value: jsonValue } }]
      });
      // Check for per-record failure
      if (result && result.addResults && result.addResults[0] && !result.addResults[0].success) {
        const err = result.addResults[0].error || {};
        throw new Error(err.description || 'Create failed — the config_value field may be too short for ' + jsonValue.length + ' characters. Increase the field length in ArcGIS Online.');
      }
      // Store the new ObjectId for future updates
      if (result && result.addResults && result.addResults[0] && result.addResults[0].objectId) {
        _configOids[key] = result.addResults[0].objectId;
      }
      console.log('[Config] Created "' + key + '" in ArcGIS Online');
    }
    return true;
  } catch (e) {
    console.error('Failed to save config "' + key + '" to ArcGIS:', e);
    showToast('Failed to save "' + key + '": ' + e.message, 'error');
    return false;
  }
}

// ── Access & Permissions editor (admin-only) ──────────────
// Edits the capability matrix (CAPABILITY_DEFS overridden by PERMISSIONS_CONFIG)
// and persists it to app_config 'permissions'. WHO is in each tier is managed in
// ArcGIS groups, not here — this only controls what each tier can do.
var _permissionsDraft = null;
function _ensurePermDraft() {
  if (_permissionsDraft) return;
  _permissionsDraft = {};
  Object.keys(CAPABILITY_DEFS).forEach(function(cap) {
    if (CAPABILITY_DEFS[cap].meta) return;
    var live = (typeof capabilityTiers === 'function') ? (capabilityTiers(cap) || []) : (CAPABILITY_DEFS[cap].tiers || []);
    _permissionsDraft[cap] = live.slice();
  });
}
function buildPermissionsPanel() {
  _ensurePermDraft();
  function cb(cap, tier, disabled) {
    if (disabled) return '<span style="color:var(--text-muted);">—</span>';
    var on = (_permissionsDraft[cap] || []).indexOf(tier) >= 0;
    return '<input type="checkbox"' + (on ? ' checked' : '') + ' onchange="togglePermission(\'' + cap + '\',\'' + tier + '\',this.checked)" style="width:16px;height:16px;cursor:pointer;">';
  }
  var rows = '';
  Object.keys(CAPABILITY_DEFS).forEach(function(cap) {
    var def = CAPABILITY_DEFS[cap];
    if (def.meta) return;
    rows += '<tr>' +
      '<td style="font-weight:600;">' + esc(def.label) + '</td>' +
      '<td style="text-align:center;">' + cb(cap, 'member', def.leadOnly) + '</td>' +
      '<td style="text-align:center;">' + cb(cap, 'lead', false) + '</td>' +
      '<td style="text-align:center;opacity:0.45;"><input type="checkbox" checked disabled title="Admins can always do everything" style="width:16px;height:16px;"></td>' +
    '</tr>';
  });
  var metaRows = '';
  Object.keys(CAPABILITY_DEFS).forEach(function(cap) {
    var def = CAPABILITY_DEFS[cap];
    if (!def.meta) return;
    metaRows += '<tr style="opacity:0.65;"><td style="font-weight:600;"><svg class="icon" aria-hidden="true"><use href="#ph-lock"></use></svg> ' + esc(def.label) + '</td><td colspan="3" style="text-align:center;font-size:11px;color:var(--text-muted);">Admin only — locked</td></tr>';
  });
  return '<div class="settings-panel-title">Access &amp; Permissions</div>' +
    '<div class="settings-panel-desc">Choose what each tier can do. <strong>Who</strong> is in each tier (admin / lead / member) is managed in ArcGIS Online via the <em>Project Tracker – Admins / Leads / Members</em> groups; this page controls their <strong>capabilities</strong>. Admins can always do everything; members can always view and edit items they own. Locked rows can’t be changed (they would allow privilege escalation).</div>' +
    '<table class="member-table" style="max-width:620px;"><thead><tr>' +
      '<th>Capability</th><th style="text-align:center;">Member</th><th style="text-align:center;">Lead</th><th style="text-align:center;">Admin</th>' +
    '</tr></thead><tbody>' + rows + metaRows + '</tbody></table>' +
    '<div style="margin-top:16px;display:flex;gap:8px;">' +
      '<button class="settings-btn settings-btn-primary" onclick="btnPending(this, () => savePermissions())">Save changes</button>' +
      '<button class="settings-btn settings-btn-secondary" onclick="discardPermissions()">Discard</button>' +
    '</div>' +
    '<div class="settings-panel-desc" style="margin-top:8px;font-size:11px;">“Create / edit any project” are lead abilities scoped to the lead’s assigned team (set per member under Team members).</div>';
}
function togglePermission(cap, tier, on) {
  _ensurePermDraft();
  if (!_permissionsDraft[cap]) _permissionsDraft[cap] = [];
  var arr = _permissionsDraft[cap];
  var i = arr.indexOf(tier);
  if (on && i < 0) arr.push(tier);
  else if (!on && i >= 0) arr.splice(i, 1);
}
async function savePermissions() {
  _ensurePermDraft();
  var ok = await saveConfigKey('permissions', _permissionsDraft);
  if (ok) {
    PERMISSIONS_CONFIG = JSON.parse(JSON.stringify(_permissionsDraft));
    _permissionsDraft = null;
    if (typeof showToast === 'function') showToast('Permissions saved.', 'success');
    if (typeof renderSettingsPage === 'function') renderSettingsPage(document.getElementById('content-area'));
  }
}
function discardPermissions() {
  _permissionsDraft = null;
  if (typeof renderSettingsPage === 'function') renderSettingsPage(document.getElementById('content-area'));
  if (typeof showToast === 'function') showToast('Changes discarded.', 'success');
}

async function saveCustomLists(listKey) {
  if (listKey === 'dept') {
    await saveConfigKey('partner_depts', _customPartnerDepts);
  } else if (listKey === 'team') {
    await saveConfigKey('itd_teams', _customItdTeams);
  } else if (listKey === 'owning_team') {
    await saveConfigKey('owning_teams', _customOwningTeams);
  } else if (listKey === 'proj_cat') {
    await saveConfigKey('proj_categories', compressDescList(_customProjCategories));
  } else if (listKey === 'task_cat') {
    await saveConfigKey('task_categories', compressDescList(_customTaskCategories));
  } else if (listKey === 'task_tool') {
    await saveConfigKey('task_tools', compressDescList(_customTaskTools));
  } else if (listKey === 'review_types') {
    await saveConfigKey('review_types', _reviewTypes);
  }
}

// ── Allocation Defaults Editor ──────────────────────────────────
function renderAllocDefaultsEditor() {
  var container = document.getElementById('alloc-defaults-editor');
  if (!container) return;
  var sizes = ['S', 'M', 'L', 'XL'];
  var sizeLabels = { S: 'Small', M: 'Medium', L: 'Large', XL: 'Extra large' };
  var roles = ['Lead', 'Contributor', 'Reviewer'];
  var html = '<table style="width:100%;border-collapse:collapse;background:var(--white);border:1px solid #E8E6DF;border-radius:10px;overflow:hidden;font-size:13px;">';
  html += '<thead><tr><th style="background:var(--surface-2);padding:10px 14px;text-align:left;font-weight:700;color:var(--navy);border-bottom:2px solid #E8E6DF;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Size</th>';
  roles.forEach(function(r) {
    html += '<th style="background:var(--surface-2);padding:10px 14px;text-align:center;font-weight:700;color:var(--navy);border-bottom:2px solid #E8E6DF;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">' + r + '</th>';
  });
  html += '</tr></thead><tbody>';
  sizes.forEach(function(s) {
    var d = _allocationDefaults[s] || {};
    html += '<tr>';
    html += '<td style="padding:10px 14px;border-bottom:1px solid #F3F1EB;font-weight:700;color:var(--navy);">' + s + ' — ' + sizeLabels[s] + '</td>';
    roles.forEach(function(r) {
      html += '<td style="padding:6px 10px;border-bottom:1px solid #F3F1EB;text-align:center;">';
      html += '<input type="number" min="0" max="100" step="5" value="' + (d[r] || 0) + '" ';
      html += 'id="ad-' + s + '-' + r + '" ';
      html += 'style="width:60px;padding:4px 6px;text-align:center;border:1px solid #E8E6DF;border-radius:4px;font-size:13px;font-family:Lato,sans-serif;">';
      html += '<span style="font-size:11px;color:var(--text-muted);margin-left:2px;">%</span>';
      html += '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<div style="margin-top:10px;display:flex;justify-content:flex-end;">';
  html += '<button class="settings-btn settings-btn-primary" onclick="btnPending(this, () => saveAllocDefaults())">Save Defaults</button>';
  html += '</div>';
  container.innerHTML = html;
}

// Recompute proj_cap and allocation hours for every loaded person using the current _productivityRatio.
// Called after the admin saves a new ratio so the change is visible immediately.
function recomputeAllProjCap() {
  if (!RESOURCES_DATA || !RESOURCES_DATA.people) return;
  const weeks = RESOURCES_DATA.weeks;
  Object.entries(RESOURCES_DATA.people).forEach(function(entry) {
    const p = entry[1];
    for (let i = 0; i < weeks.length; i++) {
      const ppWeek = getPayPeriodWeek(weeks[i]);
      const scheduledHours = (ppWeek === 'A') ? p.week1_hours : p.week2_hours;
      p.proj_cap[i] = (scheduledHours - (p.absences[i] || 0)) * _productivityRatio * p.proj_pct;
    }
    (p.allocations || []).forEach(function(a) {
      a.hours = (a.fracs || []).map(function(f, i) { return f * (p.proj_cap[i] || 0); });
    });
  });
}

// One-time migration: recompute hours = fraction × proj_cap for every allocation record in ArcGIS
// using the current productivity ratio. Useful after admin changes the ratio so external consumers
// (Power BI, exports, dashboards) see fresh values. The in-app behavior doesn't depend on this —
// loaded allocations always have hours recomputed locally.
async function migrateAllocationHours() {
  if (!RESOURCES_DATA) {
    showToast('Resources data is still loading. Try again in a moment.', 'error');
    return;
  }
  var ratioPct = Math.round((_productivityRatio || 0.75) * 100);
  if (!confirm('Recalculate stored hours on every allocation record using the current productivity ratio (' + ratioPct + '%)?\n\nOnly records whose stored hours differ from the new value will be updated. Records for inactive people or out-of-range weeks will be skipped.\n\nThis may take a minute on large datasets.')) return;

  var btn = document.getElementById('btn-migrate-alloc-hours');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading allocations…'; }

  try {
    var allocFeatures = await agolQuery(ARCGIS_CONFIG.allocationsUrl);
    var weekIdx = {};
    RESOURCES_DATA.weeks.forEach(function(w, i) { weekIdx[w] = i; });
    var people = RESOURCES_DATA.people;

    var updates = [];
    var skipped = 0;
    allocFeatures.forEach(function(f) {
      var a = f.attributes;
      var oid = a.OBJECTID || a.ObjectId || a.objectid;
      var p = people[a.name];
      if (!p) { skipped++; return; }
      var wkStr = epochToDateStr(a.week_date);
      var wi = weekIdx[wkStr];
      if (wi === undefined) { skipped++; return; }
      var fraction = a.fraction || 0;
      var newHours = Math.round(fraction * (p.proj_cap[wi] || 0) * 100) / 100;
      var oldHours = Math.round((a.hours || 0) * 100) / 100;
      if (Math.abs(newHours - oldHours) < 0.01) return; // no meaningful change
      updates.push({ attributes: { ObjectId: oid, hours: newHours } });
    });

    if (updates.length === 0) {
      showToast('All ' + allocFeatures.length + ' allocation records already match the current ratio.', 'success');
      return;
    }

    var updated = 0, failed = 0;
    for (var i = 0; i < updates.length; i += 100) {
      var batch = updates.slice(i, i + 100);
      if (btn) btn.textContent = 'Updating ' + Math.min(i + 100, updates.length) + ' / ' + updates.length + '…';
      var result = await agolApplyEdits(ARCGIS_CONFIG.allocationsUrl, { updates: batch });
      if (result && result.updateResults) {
        result.updateResults.forEach(function(r) { if (r.success) updated++; else failed++; });
      } else {
        updated += batch.length;
      }
    }

    var msg = 'Updated ' + updated + ' allocation record' + (updated === 1 ? '' : 's');
    if (skipped > 0) msg += ' · ' + skipped + ' skipped';
    if (failed > 0) msg += ' · ' + failed + ' failed';
    showToast(msg + '.', failed > 0 ? 'error' : 'success');
  } catch (e) {
    console.error('[Migration] Failed:', e);
    showToast('Migration failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Update stored allocation hours'; }
  }
}

async function saveProductivityRatio() {
  const el = document.getElementById('settings-productivity-ratio');
  if (!el) return;
  const pctEntered = parseFloat(el.value);
  if (isNaN(pctEntered) || pctEntered <= 0 || pctEntered > 100) {
    showToast('Productivity ratio must be between 1 and 100.', 'error');
    return;
  }
  const ratio = Math.round(pctEntered) / 100;
  _productivityRatio = ratio;
  const success = await saveConfigKey('productivity_ratio', ratio);
  if (success) {
    recomputeAllProjCap();
    showToast('Productivity ratio saved (' + Math.round(ratio * 100) + '%).', 'success');
    render();
  }
}

async function saveAllocDefaults() {
  var sizes = ['S', 'M', 'L', 'XL'];
  var roles = ['Lead', 'Contributor', 'Reviewer'];
  var newDefaults = {};
  sizes.forEach(function(s) {
    newDefaults[s] = {};
    roles.forEach(function(r) {
      var el = document.getElementById('ad-' + s + '-' + r);
      newDefaults[s][r] = el ? parseInt(el.value) || 0 : 0;
    });
  });
  _allocationDefaults = newDefaults;
  var success = await saveConfigKey('allocation_defaults', newDefaults);
  if (success) {
    showToast('Allocation defaults saved.', 'success');
  }
}

// ── List editors (generic + descriptive) ───────────────────
function renderListEditor(containerId, title, items, listKey) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Get values from project data that aren't in the custom list
  let fromData = [];
  if (listKey === 'dept') {
    fromData = [...new Set(PROJECTS.map(function(p) { return p.partner_dept; }))].filter(function(v) { return v && !items.includes(v); }).sort();
  } else if (listKey === 'team') {
    fromData = [...new Set(PROJECTS.map(function(p) { return p.itd_team; }))].filter(function(v) { return v && !items.includes(v); }).sort();
  } else if (listKey === 'owning_team') {
    fromData = [...new Set(PROJECTS.map(function(p) { return p.owning_team; }))].filter(function(v) { return v && !items.includes(v); }).sort();
  }

  const itemsHtml = items.map(function(item, idx) {
    return '<div class="list-editor-item">' +
      '<span class="list-editor-item-name">' + esc(item) + '</span>' +
      '<button class="list-editor-remove" title="Remove" onclick="removeListItem(\'' + listKey + '\',' + idx + ')"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg></button>' +
    '</div>';
  }).join('');

  // Show data-sourced items (read-only, can't be removed since they come from project data)
  const dataItemsHtml = fromData.map(function(item) {
    return '<div class="list-editor-item">' +
      '<span class="list-editor-item-name">' + esc(item) + '</span>' +
      '<span class="list-editor-item-from-data">from project data</span>' +
    '</div>';
  }).join('');

  const totalCount = items.length + fromData.length;

  container.innerHTML = '<div class="list-editor-card">' +
    '<div class="list-editor-card-header">' +
      '<span>' + title + '</span>' +
      '<span class="list-count">' + totalCount + ' items</span>' +
    '</div>' +
    '<div class="list-editor-items">' + itemsHtml + dataItemsHtml + '</div>' +
    '<div class="list-editor-add">' +
      '<input type="text" id="list-add-input-' + listKey + '" placeholder="Add new ' + (listKey === 'dept' ? 'department' : listKey === 'owning_team' ? 'team' : 'unit') + '…" onkeydown="if(event.key===\'Enter\')addListItem(\'' + listKey + '\')">' +
      '<button onclick="addListItem(\'' + listKey + '\')">＋ Add</button>' +
    '</div>' +
  '</div>';
}

async function addListItem(listKey) {
  const inputId = 'list-add-input-' + listKey;
  const input = document.getElementById(inputId);
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  const list = listKey === 'dept' ? _customPartnerDepts : listKey === 'owning_team' ? _customOwningTeams : _customItdTeams;
  if (list.includes(val)) {
    showToast('This item already exists in the list.', 'warn');
    return;
  }
  list.push(val);
  list.sort();

  // Refresh the enum aliases so form dropdowns pick up the change
  refreshEnums();

  // Re-render the editor immediately (optimistic UI)
  renderListEditor(
    listKey === 'dept' ? 'list-editor-dept' : listKey === 'owning_team' ? 'list-editor-owning-team' : 'list-editor-team',
    listKey === 'dept' ? 'Partner Departments' : listKey === 'owning_team' ? 'Teams' : 'Units',
    list, listKey
  );

  // Save to ArcGIS Online
  await saveCustomLists(listKey);
}

async function removeListItem(listKey, idx) {
  const list = listKey === 'dept' ? _customPartnerDepts : listKey === 'owning_team' ? _customOwningTeams : _customItdTeams;
  const item = list[idx];
  if (!confirm('Remove "' + item + '" from the list?')) return;
  list.splice(idx, 1);

  // Refresh the enum aliases
  refreshEnums();

  // Re-render the editor immediately (optimistic UI)
  renderListEditor(
    listKey === 'dept' ? 'list-editor-dept' : listKey === 'owning_team' ? 'list-editor-owning-team' : 'list-editor-team',
    listKey === 'dept' ? 'Partner Departments' : listKey === 'owning_team' ? 'Teams' : 'Units',
    list, listKey
  );

  // Save to ArcGIS Online
  await saveCustomLists(listKey);
}

// ── Description List Editor (for categories & tools with name + description) ──

function getDescList(listKey) {
  if (listKey === 'proj_cat') return _customProjCategories;
  if (listKey === 'task_cat') return _customTaskCategories;
  if (listKey === 'task_tool') return _customTaskTools;
  return [];
}

function getDescListMeta(listKey) {
  if (listKey === 'proj_cat') return { containerId: 'desc-editor-proj-cat', title: 'Project Categories', dataSource: 'projects', dataField: 'category' };
  if (listKey === 'task_cat') return { containerId: 'desc-editor-task-cat', title: 'Task Categories', dataSource: 'tasks', dataField: 'category' };
  if (listKey === 'task_tool') return { containerId: 'desc-editor-task-tool', title: 'Task Tools', dataSource: 'tasks', dataField: 'tool' };
  return {};
}

function renderDescListEditor(listKey) {
  const meta = getDescListMeta(listKey);
  const container = document.getElementById(meta.containerId);
  if (!container) return;
  const list = getDescList(listKey);

  // Values from data not in custom list
  let dataValues = [];
  const listNames = list.map(function(i) { return i.name; });
  if (meta.dataSource === 'projects') {
    dataValues = [...new Set(PROJECTS.map(function(p) { return p[meta.dataField]; }))].filter(function(v) { return v && !listNames.includes(v); }).sort();
  } else {
    dataValues = [...new Set(TASKS.map(function(t) { return t[meta.dataField]; }))].filter(function(v) { return v && !listNames.includes(v); }).sort();
  }

  const hasActiveFlag = (listKey === 'task_tool'); // Active/retired toggle for task tools
  const activeCount = hasActiveFlag ? list.filter(function(i) { return i.active !== false; }).length : list.length;

  const itemsHtml = list.map(function(item, idx) {
    const isInactive = hasActiveFlag && item.active === false;
    const inactiveStyle = isInactive ? ' style="opacity:0.5;"' : '';
    let toggleHtml = '';
    if (hasActiveFlag) {
      const toggleLabel = isInactive ? 'Retired' : 'Active';
      const toggleColor = isInactive ? '#EF4444' : '#22C55E';
      const toggleTitle = isInactive ? 'Click to reactivate' : 'Click to retire';
      toggleHtml = '<button class="desc-editor-edit" title="' + toggleTitle + '" onclick="toggleDescListActive(\'' + listKey + '\',' + idx + ')" style="font-size:10px;font-weight:700;color:' + toggleColor + ';letter-spacing:0.03em;">' + toggleLabel + '</button>';
    }
    return '<div class="desc-editor-item"' + inactiveStyle + '>' +
      '<div class="desc-editor-item-main">' +
        '<span class="desc-editor-item-name">' + esc(item.name) + (isInactive ? ' <span style="font-size:10px;color:#EF4444;font-weight:700;">(retired)</span>' : '') + '</span>' +
        '<div class="desc-editor-item-actions">' +
          toggleHtml +
          '<button class="desc-editor-edit" title="Edit" onclick="editDescListItem(\'' + listKey + '\',' + idx + ')"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg></button>' +
          '<button class="list-editor-remove" title="Remove" onclick="removeDescListItem(\'' + listKey + '\',' + idx + ')"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg></button>' +
        '</div>' +
      '</div>' +
      '<div class="desc-editor-item-desc">' + esc(item.desc || '') + '</div>' +
    '</div>';
  }).join('');

  const dataItemsHtml = dataValues.map(function(v) {
    return '<div class="desc-editor-item">' +
      '<div class="desc-editor-item-main">' +
        '<span class="desc-editor-item-name">' + esc(v) + '</span>' +
        '<span class="list-editor-item-from-data">from data</span>' +
      '</div>' +
    '</div>';
  }).join('');

  const countLabel = hasActiveFlag ? activeCount + ' active / ' + list.length + ' total' : (list.length + dataValues.length) + ' items';

  container.innerHTML = '<div class="list-editor-card">' +
    '<div class="list-editor-card-header">' +
      '<span>' + meta.title + '</span>' +
      '<span class="list-count">' + countLabel + '</span>' +
    '</div>' +
    '<div class="list-editor-items" style="max-height:400px;">' + itemsHtml + dataItemsHtml + '</div>' +
    '<div class="desc-editor-add">' +
      '<input type="text" id="desc-add-name-' + listKey + '" placeholder="Name…" onkeydown="if(event.key===\'Enter\')document.getElementById(\'desc-add-desc-' + listKey + '\').focus()">' +
      '<input type="text" id="desc-add-desc-' + listKey + '" placeholder="Description…" onkeydown="if(event.key===\'Enter\')addDescListItem(\'' + listKey + '\')">' +
      '<button onclick="addDescListItem(\'' + listKey + '\')">＋ Add</button>' +
    '</div>' +
  '</div>';
}

async function addDescListItem(listKey) {
  const nameInput = document.getElementById('desc-add-name-' + listKey);
  const descInput = document.getElementById('desc-add-desc-' + listKey);
  if (!nameInput) return;
  const name = nameInput.value.trim();
  const desc = descInput ? descInput.value.trim() : '';
  if (!name) { showToast('Please enter a name.', 'warn'); return; }

  const list = getDescList(listKey);
  if (list.some(function(i) { return i.name.toLowerCase() === name.toLowerCase(); })) {
    showToast('An item with this name already exists.', 'warn');
    return;
  }
  const newItem = { name: name, desc: desc };
  // If this list uses active flags, default new items to active
  if (list.length > 0 && list[0].active !== undefined) newItem.active = true;
  list.push(newItem);
  list.sort(function(a, b) { return a.name.localeCompare(b.name); });

  refreshEnums();
  renderDescListEditor(listKey);
  await saveCustomLists(listKey);
}

async function removeDescListItem(listKey, idx) {
  const list = getDescList(listKey);
  const item = list[idx];
  if (!confirm('Remove "' + item.name + '" from the list?')) return;
  list.splice(idx, 1);
  refreshEnums();
  renderDescListEditor(listKey);
  await saveCustomLists(listKey);
}

function editDescListItem(listKey, idx) {
  const list = getDescList(listKey);
  const item = list[idx];
  const meta = getDescListMeta(listKey);
  const container = document.getElementById(meta.containerId);
  if (!container) return;

  // Find the item row and replace with inline edit form
  const items = container.querySelectorAll('.desc-editor-item');
  if (!items[idx]) return;
  const row = items[idx];
  row.innerHTML = '<div class="desc-editor-inline-edit">' +
    '<input type="text" id="desc-edit-name-' + listKey + '-' + idx + '" class="fm-input" value="' + esc(item.name) + '" style="font-weight:700;margin-bottom:4px;">' +
    '<input type="text" id="desc-edit-desc-' + listKey + '-' + idx + '" class="fm-input" value="' + esc(item.desc || '') + '" placeholder="Description…" style="font-size:12px;">' +
    '<div style="display:flex;gap:6px;margin-top:6px;">' +
      '<button class="settings-btn settings-btn-primary" style="padding:4px 12px;font-size:11px;" onclick="btnPending(this, () => saveDescListEdit(\'' + listKey + '\',' + idx + '))">Save</button>' +
      '<button class="settings-btn settings-btn-secondary" style="padding:4px 12px;font-size:11px;" onclick="renderDescListEditor(\'' + listKey + '\')">Cancel</button>' +
    '</div>' +
  '</div>';
  document.getElementById('desc-edit-name-' + listKey + '-' + idx).focus();
}

async function saveDescListEdit(listKey, idx) {
  const nameEl = document.getElementById('desc-edit-name-' + listKey + '-' + idx);
  const descEl = document.getElementById('desc-edit-desc-' + listKey + '-' + idx);
  if (!nameEl) return;
  const newName = nameEl.value.trim();
  const newDesc = descEl ? descEl.value.trim() : '';
  if (!newName) { showToast('Name cannot be empty.', 'warn'); return; }

  const list = getDescList(listKey);
  // Check for duplicate (excluding self)
  if (list.some(function(i, ii) { return ii !== idx && i.name.toLowerCase() === newName.toLowerCase(); })) {
    showToast('An item with this name already exists.', 'warn');
    return;
  }
  list[idx] = { name: newName, desc: newDesc, active: list[idx].active };
  list.sort(function(a, b) { return a.name.localeCompare(b.name); });
  refreshEnums();
  renderDescListEditor(listKey);
  await saveCustomLists(listKey);
}

async function toggleDescListActive(listKey, idx) {
  const list = getDescList(listKey);
  const item = list[idx];
  item.active = item.active === false ? true : false;
  refreshEnums();
  renderDescListEditor(listKey);
  await saveCustomLists(listKey);
}

// ── Status History editor ──────────────────────────────────
function toggleStatusHistoryEditor(projectId, objectId) {
  const container = document.getElementById('status-history-editor');
  if (!container) return;
  if (Editor.shProjectId === projectId && container.innerHTML !== '') {
    container.innerHTML = '';
    Editor.shProjectId = null;
    return;
  }
  Editor.shProjectId = projectId;
  Editor.shObjectId = objectId;
  renderStatusHistoryEditor();
}

function renderStatusHistoryEditor() {
  const container = document.getElementById('status-history-editor');
  if (!container || !Editor.shProjectId) return;
  const history = getProjectStatusHistory(Editor.shProjectId);
  const proj = PROJECTS.find(function(p) { return p.id == Editor.shProjectId; });
  const projTitle = proj ? proj.title : '';

  const statusOpts = ['Future','Scheduled','Active','On Hold','Waiting for Response','Complete','Canceled'];

  let rowsHtml = history.map(function(h, idx) {
    const sc = STATUS_COLOR(h.status) || '#9CA3AF';
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #F3F1EB;">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:' + sc + ';flex-shrink:0;"></span>' +
      '<span style="flex:1;font-size:12px;font-weight:600;color:var(--text-body);">' + esc(h.status) + '</span>' +
      '<span style="font-size:11px;color:var(--text-muted);min-width:85px;">' + (h.changed_date || '') + '</span>' +
      '<span style="font-size:11px;color:var(--text-muted);min-width:100px;">' + esc(h.changed_by || '') + '</span>' +
      '<button onclick="btnPending(this, () => deleteStatusHistoryRecord(' + idx + '), \'\')" style="background:none;border:none;color:#E1E2DD;cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;" title="Remove" onmouseover="this.style.color=\'#EF4444\'" onmouseout="this.style.color=\'#E1E2DD\'"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg></button>' +
    '</div>';
  }).join('');

  if (!history.length) {
    rowsHtml = '<div style="padding:12px 0;font-size:12px;color:var(--text-muted);font-style:italic;">No status history records yet. Add entries below to build the timeline.</div>';
  }

  const statusSelectHtml = statusOpts.map(function(s) {
    return '<option value="' + s + '">' + s + '</option>';
  }).join('');

  container.innerHTML = '<div style="margin-top:16px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:16px;">' +
    '<div style="font-size:13px;font-weight:800;color:var(--navy);margin-bottom:10px;">Status History Editor</div>' +
    '<div style="margin-bottom:12px;">' + rowsHtml + '</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
      '<select id="sh-add-status" style="padding:6px 10px;border:1.5px solid #E1E2DD;border-radius:6px;font-size:12px;font-family:Lato,sans-serif;">' + statusSelectHtml + '</select>' +
      '<input type="date" id="sh-add-date" style="padding:6px 10px;border:1.5px solid #E1E2DD;border-radius:6px;font-size:12px;font-family:Lato,sans-serif;" value="' + new Date().toISOString().slice(0, 10) + '">' +
      '<button onclick="addStatusHistoryRecord()" style="background:var(--navy);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:Lato,sans-serif;">＋ Add Entry</button>' +
    '</div>' +
    '<div style="font-size:10px;color:var(--text-muted);margin-top:8px;">Add historical status changes to build the project timeline. Each entry marks when the project entered that status.</div>' +
  '</div>';
}

async function addStatusHistoryRecord() {
  const statusEl = document.getElementById('sh-add-status');
  const dateEl = document.getElementById('sh-add-date');
  if (!statusEl || !dateEl) return;
  const status = statusEl.value;
  const dateVal = dateEl.value;
  if (!status || !dateVal) { showToast('Please select a status and date.', 'warn'); return; }

  const proj = PROJECTS.find(function(p) { return p.id == Editor.shProjectId; });
  const projTitle = proj ? proj.title : '';
  const who = Auth.fullName || 'Unknown';

  const record = {
    project_id: Editor.shProjectId,
    project_title: projTitle,
    status: status,
    changed_date: dateVal,
    changed_by: who,
  };

  STATUS_HISTORY.push(record);

  try {
    // Creator/CreationDate auto-populated by AGO via editor tracking.
    // (We send the user-chosen dateVal as a separate field IF the schema
    // ever needs it; for now CreationDate captures "when entered".)
    const result = await agolApplyEdits(ARCGIS_CONFIG.statusHistoryUrl, {
      adds: [{ attributes: {
        project_number: Editor.shProjectId,
        project_title: projTitle,
        status: status,
      }}]
    });
    if (result && result.addResults && result.addResults[0] && result.addResults[0].objectId) {
      record.objectId = result.addResults[0].objectId;
    }
    console.log('[StatusHistory] Added:', projTitle, '→', status, 'on', dateVal);
  } catch (err) {
    console.error('[StatusHistory] Failed to add:', err);
    showToast('Failed to save: ' + err.message, 'error');
  }

  renderStatusHistoryEditor();
  // Re-render the full page to update the timeline bar, then reopen editor
  const savedProjId = Editor.shProjectId;
  markDataDirty();
  render();
  Editor.shProjectId = savedProjId;
  renderStatusHistoryEditor();
}

async function deleteStatusHistoryRecord(histIdx) {
  const history = getProjectStatusHistory(Editor.shProjectId);
  if (histIdx < 0 || histIdx >= history.length) return;
  const record = history[histIdx];
  if (!confirm('Remove "' + record.status + '" entry from ' + record.changed_date + '?')) return;

  // Remove from local array
  const globalIdx = STATUS_HISTORY.indexOf(record);
  if (globalIdx >= 0) STATUS_HISTORY.splice(globalIdx, 1);

  // Delete from ArcGIS Online
  if (record.objectId) {
    try {
      await agolApplyEdits(ARCGIS_CONFIG.statusHistoryUrl, {
        deletes: [record.objectId]
      });
      console.log('[StatusHistory] Deleted record OID:', record.objectId);
    } catch (err) {
      console.error('[StatusHistory] Failed to delete:', err);
    }
  }

  // Re-render page then reopen editor
  const savedProjId = Editor.shProjectId;
  markDataDirty();
  render();
  Editor.shProjectId = savedProjId;
  renderStatusHistoryEditor();
}

// ── Trash panel ────────────────────────────────────────────
// Lists soft-deleted projects, tasks, and issues. Each item has
// Restore (clear deleted_at/deleted_by) and Permanent delete (real
// AGOL delete) actions. Allocations cascaded with deleted projects
// are NOT restored — restoring a project brings the project back but
// not the resource allocations that were hard-deleted at delete time.

function buildTrashPanel() {
  var html = '<div class="settings-panel-title">Trash</div>';
  html += '<div class="settings-panel-desc">Items moved to trash. Restoring returns them to the active list. Permanent delete removes them from ArcGIS Online entirely and cannot be undone. Tasks deleted as part of a project cascade stay in the trash even after the project is restored — restore them individually if needed.</div>';
  html += '<div id="trash-content"><div style="padding:40px;text-align:center;color:var(--text-muted);">Loading deleted items…</div></div>';
  return html;
}

function _trashTimeAgo(epoch) {
  if (!epoch) return '—';
  var ms = Date.now() - epoch;
  if (ms < 0) return 'just now';
  var minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + ' minute' + (minutes !== 1 ? 's' : '') + ' ago';
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' hour' + (hours !== 1 ? 's' : '') + ' ago';
  var days = Math.floor(hours / 24);
  if (days < 30) return days + ' day' + (days !== 1 ? 's' : '') + ' ago';
  var months = Math.floor(days / 30);
  return months + ' month' + (months !== 1 ? 's' : '') + ' ago';
}

async function loadAndRenderTrash() {
  var container = document.getElementById('trash-content');
  if (!container) return;
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Loading deleted items…</div>';

  try {
    var results = await Promise.all([
      agolQuery(ARCGIS_CONFIG.projectsUrl, 'deleted_at IS NOT NULL'),
      agolQuery(ARCGIS_CONFIG.tasksUrl, 'deleted_at IS NOT NULL'),
      agolQuery(ARCGIS_CONFIG.issuesUrl, 'deleted_at IS NOT NULL'),
    ]);
    var projectFeatures = results[0];
    var taskFeatures = results[1];
    var issueFeatures = results[2];

    var items = [];
    projectFeatures.forEach(function(f) {
      var a = f.attributes || {};
      items.push({
        type: 'project',
        oid: a.OBJECTID || a.ObjectId,
        title: a.title || '(untitled project)',
        deleted_at: a.deleted_at,
        deleted_by: a.deleted_by,
      });
    });
    taskFeatures.forEach(function(f) {
      var a = f.attributes || {};
      items.push({
        type: 'task',
        oid: a.OBJECTID || a.ObjectId,
        title: a.title || '(untitled task)',
        project: a.project || '',
        deleted_at: a.deleted_at,
        deleted_by: a.deleted_by,
      });
    });
    issueFeatures.forEach(function(f) {
      var a = f.attributes || {};
      items.push({
        type: 'issue',
        oid: a.OBJECTID || a.ObjectId,
        title: a.title || '(untitled issue)',
        deleted_at: a.deleted_at,
        deleted_by: a.deleted_by,
      });
    });

    // Newest first
    items.sort(function(a, b) { return (b.deleted_at || 0) - (a.deleted_at || 0); });

    if (items.length === 0) {
      container.innerHTML = '<div style="padding:60px 40px;text-align:center;color:var(--text-muted);">' +
        '<div style="font-size:40px;margin-bottom:12px;"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></div>' +
        '<div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:4px;">Trash is empty</div>' +
        '<div style="font-size:12px;">Deleted projects, tasks, and issues appear here.</div>' +
        '</div>';
      return;
    }

    var typeBadge = {
      project: '<span style="display:inline-block;background:#EEF2FF;color:#1E40AF;font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;letter-spacing:0.04em;text-transform:uppercase;"><svg class="icon" aria-hidden="true"><use href="#ph-folder"></use></svg> Project</span>',
      task:    '<span style="display:inline-block;background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;letter-spacing:0.04em;text-transform:uppercase;"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg> Task</span>',
      issue:   '<span style="display:inline-block;background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;letter-spacing:0.04em;text-transform:uppercase;"><svg class="icon" aria-hidden="true"><use href="#ph-bug"></use></svg> Issue</span>',
    };

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:var(--surface-2);">' +
      '<th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--navy);border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Type</th>' +
      '<th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--navy);border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Title</th>' +
      '<th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--navy);border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Deleted by</th>' +
      '<th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--navy);border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">When</th>' +
      '<th style="padding:10px 14px;text-align:right;font-weight:700;color:var(--navy);border-bottom:2px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Actions</th>' +
      '</tr></thead><tbody>';
    items.forEach(function(item) {
      var subtitle = item.type === 'task' && item.project
        ? '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">in ' + esc(item.project) + '</div>'
        : '';
      html += '<tr style="border-bottom:1px solid var(--border);">';
      html += '<td style="padding:12px 14px;vertical-align:top;">' + typeBadge[item.type] + '</td>';
      html += '<td style="padding:12px 14px;"><div style="font-weight:600;color:var(--text-body);">' + esc(item.title) + '</div>' + subtitle + '</td>';
      html += '<td style="padding:12px 14px;color:var(--text-body);">' + esc(item.deleted_by || 'Unknown') + '</td>';
      html += '<td style="padding:12px 14px;color:var(--text-muted);font-size:12px;">' + _trashTimeAgo(item.deleted_at) + '</td>';
      html += '<td style="padding:12px 14px;text-align:right;white-space:nowrap;">';
      html += '<button onclick="restoreFromTrash(\'' + item.type + '\',' + item.oid + ')" style="padding:5px 12px;background:var(--green);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;margin-right:6px;">Restore</button>';
      html += '<button onclick="btnPending(this, () => hardDeleteFromTrash(\'' + item.type + '\',' + item.oid + ',\'' + escapeAttr(item.title) + '\'), \'Deleting…\')" style="padding:5px 12px;background:var(--white);color:#EF4444;border:1px solid #FECACA;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Permanent delete</button>';
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="margin-top:12px;font-size:11px;color:var(--text-muted);">' + items.length + ' item' + (items.length !== 1 ? 's' : '') + ' in trash</div>';
    container.innerHTML = html;
  } catch (err) {
    console.error('[Trash] Load failed:', err);
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#991B1B;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;">Failed to load trash: ' + esc(err.message) + '</div>';
  }
}

async function restoreFromTrash(type, oid) {
  var url, label, reloadFn;
  if (type === 'project')   { url = ARCGIS_CONFIG.projectsUrl; label = 'Project'; reloadFn = loadArcGISData; }
  else if (type === 'task') { url = ARCGIS_CONFIG.tasksUrl;    label = 'Task';    reloadFn = loadArcGISData; }
  else if (type === 'issue'){ url = ARCGIS_CONFIG.issuesUrl;   label = 'Issue';   reloadFn = loadIssues; }
  else return;

  try {
    await agolApplyEdits(url, {
      updates: [{ attributes: { ObjectId: oid, deleted_at: null, deleted_by: null } }]
    });
    showToast(label + ' restored.', 'success');
    if (reloadFn) {
      try { await reloadFn(); } catch (e) { console.warn('[Trash] reload after restore failed:', e); }
    }
    loadAndRenderTrash();
  } catch (err) {
    console.error('[Trash] Restore failed:', err);
    showToast('Restore failed: ' + err.message, 'error');
  }
}

async function hardDeleteFromTrash(type, oid, title) {
  if (!confirm('Permanently delete "' + title + '"?\n\nThis removes the record from ArcGIS Online entirely and cannot be undone.')) return;
  var url, label;
  if (type === 'project')   { url = ARCGIS_CONFIG.projectsUrl; label = 'Project'; }
  else if (type === 'task') { url = ARCGIS_CONFIG.tasksUrl;    label = 'Task'; }
  else if (type === 'issue'){ url = ARCGIS_CONFIG.issuesUrl;   label = 'Issue'; }
  else return;

  try {
    await agolApplyEdits(url, { deletes: [oid] });
    showToast(label + ' permanently deleted.', 'success');
    loadAndRenderTrash();
  } catch (err) {
    console.error('[Trash] Permanent delete failed:', err);
    showToast('Permanent delete failed: ' + err.message, 'error');
  }
}

// ─── Settings → System → Data Program teams ───────────────────────────
// Admin-only editor for app_config.data_program. Drives every team
// dropdown, badge, color, and label across the app — the Data Program
// project field, the data_program_lead_team picker on members, the
// "DA Lead" / "EDI Lead" chips in the team-members table, and the
// upcoming Overview Data Program section + Slideshow slide.
//
// Each team row: order ▲▼, ID (short code, ~2-3 letters), color picker,
// name, description, remove. + Add team button. Save persists to
// app_config.data_program; Discard reverts to last-saved state.

var _dataProgramEditDraft = null;

function _dpEnsureDraft() {
  if (_dataProgramEditDraft) return _dataProgramEditDraft;
  var current = (typeof _dataProgramConfig !== 'undefined' && _dataProgramConfig)
    ? _dataProgramConfig
    : DATA_PROGRAM_DEFAULT_CONFIG;
  _dataProgramEditDraft = JSON.parse(JSON.stringify(current));
  if (!Array.isArray(_dataProgramEditDraft.teams)) _dataProgramEditDraft.teams = [];
  _dataProgramEditDraft.teams.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
  _dataProgramEditDraft.teams.forEach(function(t, i) { t.order = i + 1; });
  return _dataProgramEditDraft;
}

function buildDataProgramConfigPanel() {
  if (!isAdmin()) {
    return '<div class="settings-panel-title">Data Program teams</div>' +
      '<div class="settings-panel-desc">Admin-only — only Team Leads can configure the Data Program team list.</div>';
  }
  // Reset draft each time the panel opens so it reflects current saved state
  _dataProgramEditDraft = null;
  var draft = _dpEnsureDraft();

  var html = '<div class="settings-panel-title">Data Program teams</div>';
  html += '<div class="settings-panel-desc">The four cross-team groups that make up the City Data Program. These names, colors, and descriptions appear everywhere the program is shown &mdash; project Classification fields, the "DA Lead" / "EDI Lead" badges in Team Members, the Overview Data Program section, and the lobby Slideshow.</div>';

  html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:36px 70px 60px minmax(0,1.2fr) minmax(0,2fr) 90px;gap:10px;align-items:center;padding:10px 14px;background:var(--surface-2);border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">';
  html += '<span title="Reorder">Order</span><span>ID</span><span>Color</span><span>Name</span><span>Description</span><span style="text-align:right;">Actions</span>';
  html += '</div>';

  draft.teams.forEach(function(t, i) {
    var isFirst = (i === 0);
    var isLast = (i === draft.teams.length - 1);
    html += '<div style="display:grid;grid-template-columns:36px 70px 60px minmax(0,1.2fr) minmax(0,2fr) 90px;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);">';
    html += '<div style="display:flex;flex-direction:column;gap:2px;">';
    html += '<button onclick="dpEditMove(\'' + esc(t.id) + '\', -1)"' + (isFirst ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:var(--white);border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (isFirst ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▲</button>';
    html += '<button onclick="dpEditMove(\'' + esc(t.id) + '\', 1)"' + (isLast ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:var(--white);border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (isLast ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▼</button>';
    html += '</div>';
    html += '<input type="text" value="' + esc(t.id) + '" oninput="dpEditField(\'' + esc(t.id) + '\', \'id\', this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:Lato,sans-serif;font-weight:700;color:var(--navy);min-width:0;width:100%;">';
    html += '<input type="color" value="' + esc(t.color || '#002669') + '" oninput="dpEditField(\'' + esc(t.id) + '\', \'color\', this.value)" style="width:48px;height:30px;border:1px solid var(--border);border-radius:5px;cursor:pointer;background:var(--white);padding:2px;">';
    html += '<input type="text" value="' + esc(t.name) + '" oninput="dpEditField(\'' + esc(t.id) + '\', \'name\', this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:13px;font-family:Lato,sans-serif;color:var(--text-body);min-width:0;width:100%;">';
    html += '<input type="text" value="' + esc(t.description || '') + '" oninput="dpEditField(\'' + esc(t.id) + '\', \'description\', this.value)" placeholder="Brief description…" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:Lato,sans-serif;color:var(--text-muted);min-width:0;width:100%;">';
    html += '<div style="text-align:right;"><button onclick="dpEditDelete(\'' + esc(t.id) + '\')" style="padding:4px 8px;border:1px solid #FECACA;background:#FEF2F2;color:#B91C1C;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;font-family:Lato,sans-serif;"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg> Remove</button></div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div style="margin-top:14px;display:flex;gap:8px;align-items:center;">';
  html += '<button onclick="dpEditAdd()" class="settings-btn" style="background:var(--white);border:1px solid var(--border);color:var(--navy);">+ Add team</button>';
  html += '<button onclick="btnPending(this, () => dpEditSave())" class="settings-btn settings-btn-primary" style="margin-left:auto;">Save changes</button>';
  html += '<button onclick="dpEditDiscard()" class="settings-btn" style="background:var(--white);border:1px solid var(--border);color:var(--navy);">Discard</button>';
  html += '</div>';

  html += '<div style="background:#FFFBEB;border-left:3px solid #FCD34D;border-radius:0 6px 6px 0;padding:10px 14px;margin-top:14px;font-size:12px;color:#92400E;">';
  html += '<strong>About IDs:</strong> The team ID (DI / DA / DL / EDI by default) shows up in places like the "DA Lead" / "EDI Lead" chips. Keep them short (2&ndash;3 letters) and stable. Renaming an existing team\'s <em>name</em> is safe; changing its <em>ID</em> is fine but updates the abbreviation everywhere it shows.';
  html += '</div>';

  return html;
}

function dpEditField(id, field, value) {
  var draft = _dpEnsureDraft();
  var t = draft.teams.find(function(x) { return x.id === id; });
  if (t) t[field] = value;
}

function dpEditMove(id, delta) {
  var draft = _dpEnsureDraft();
  var i = draft.teams.findIndex(function(x) { return x.id === id; });
  if (i < 0) return;
  var j = i + delta;
  if (j < 0 || j >= draft.teams.length) return;
  var tmp = draft.teams[i];
  draft.teams[i] = draft.teams[j];
  draft.teams[j] = tmp;
  renderSettingsPage(document.getElementById('content-area'));
}

function dpEditDelete(id) {
  var draft = _dpEnsureDraft();
  if (!confirm('Remove this team from the Data Program list? Existing projects with this team are not affected.')) return;
  draft.teams = draft.teams.filter(function(x) { return x.id !== id; });
  renderSettingsPage(document.getElementById('content-area'));
}

function dpEditAdd() {
  var draft = _dpEnsureDraft();
  var n = draft.teams.length + 1;
  var newId = 'NEW' + n;
  while (draft.teams.find(function(x) { return x.id === newId; })) { n++; newId = 'NEW' + n; }
  draft.teams.push({ id: newId, name: 'New team', color: '#9CA3AF', description: '', order: draft.teams.length + 1 });
  renderSettingsPage(document.getElementById('content-area'));
}

async function dpEditSave() {
  if (!_dataProgramEditDraft) return;
  // Re-assign order based on current array position
  _dataProgramEditDraft.teams.forEach(function(t, i) { t.order = i + 1; });
  // Validate: each team needs an ID and name; IDs must be unique
  var seen = {};
  for (var i = 0; i < _dataProgramEditDraft.teams.length; i++) {
    var t = _dataProgramEditDraft.teams[i];
    t.id = (t.id || '').trim();
    t.name = (t.name || '').trim();
    if (!t.id || !t.name) {
      showToast('Each team needs an ID and a name (row ' + (i + 1) + ').', 'warn');
      return;
    }
    if (seen[t.id]) {
      showToast('Team IDs must be unique. Duplicate: ' + t.id, 'warn');
      return;
    }
    seen[t.id] = true;
  }
  try {
    var ok = await saveConfigKey('data_program', _dataProgramEditDraft);
    if (!ok) throw new Error('Save returned false');
    _dataProgramConfig = JSON.parse(JSON.stringify(_dataProgramEditDraft));
    _dataProgramEditDraft = null;
    showToast('Data Program teams saved.', 'success');
    renderSettingsPage(document.getElementById('content-area'));
  } catch (e) {
    console.error('[DataProgram] Save failed:', e);
    showToast('Save failed: ' + e.message, 'error');
  }
}

function dpEditDiscard() {
  _dataProgramEditDraft = null;
  renderSettingsPage(document.getElementById('content-area'));
  showToast('Changes discarded.', 'info');
}

// ─── Settings → System → Team Introduction ────────────────────────────
// Admin-only editor for app_config.team_intro. Drives the Overview tab
// content: mission, six service areas, year-tagged goals, top partner
// departments, and the about-this-app blurb. Goals especially drift
// year-to-year — this editor lets a lead update them without a deploy.
//
// Sections in the panel: Mission, Services (rows), Goals (rows),
// Partners (rows), About app.

var _teamIntroEditDraft = null;
var _tiEditTeam = null; // which team's intro is being edited (Tier 2)

function _tiHomeTeam() { return (typeof HOME_TEAM !== 'undefined') ? HOME_TEAM : 'Data Intelligence'; }
function _tiIsHomeTeam(team) {
  if (!team) return true;
  return (typeof sameTeam === 'function') ? sameTeam(team, _tiHomeTeam()) : team === _tiHomeTeam();
}
// Find the existing byTeam key matching a team (case-insensitive), or null.
function _tiByTeamKey(cfg, team) {
  if (!cfg || !cfg.byTeam || !team) return null;
  return Object.keys(cfg.byTeam).find(function(t) {
    return (typeof sameTeam === 'function') ? sameTeam(t, team) : t === team;
  }) || null;
}
function _tiBlankIntro(team) {
  return { eyebrow: team || '', mission: '', services: [], goals: [], partners: [], about: '', goalsHeading: '', goalsLede: '' };
}

function _tiEnsureDraft() {
  if (_teamIntroEditDraft) return _teamIntroEditDraft;
  var cfg = (typeof _teamIntroConfig !== 'undefined' && _teamIntroConfig) ? _teamIntroConfig : TEAM_INTRO_DEFAULT_CONFIG;
  var team = _tiEditTeam || _tiHomeTeam();
  var source;
  if (_tiIsHomeTeam(team)) {
    // Home team = the flat top-level config.
    source = cfg;
  } else {
    var key = _tiByTeamKey(cfg, team);
    source = (key && cfg.byTeam) ? cfg.byTeam[key] : _tiBlankIntro(team);
  }
  _teamIntroEditDraft = JSON.parse(JSON.stringify(source));
  // byTeam is a container, not editable content — never carry it into a draft.
  if (_teamIntroEditDraft.byTeam) delete _teamIntroEditDraft.byTeam;
  if (!Array.isArray(_teamIntroEditDraft.services)) _teamIntroEditDraft.services = [];
  if (!Array.isArray(_teamIntroEditDraft.goals))    _teamIntroEditDraft.goals = [];
  if (!Array.isArray(_teamIntroEditDraft.partners)) _teamIntroEditDraft.partners = [];
  return _teamIntroEditDraft;
}

// Admin team picker for the intro editor.
function tiSetEditTeam(team) {
  _tiEditTeam = team || _tiHomeTeam();
  _teamIntroEditDraft = null;
  renderSettingsPage(document.getElementById('content-area'));
}

function _tiSectionHeader(label, hint) {
  return '<div style="margin:22px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--border);">' +
    '<div style="font-size:13px;font-weight:800;color:var(--navy);letter-spacing:0.04em;text-transform:uppercase;">' + esc(label) + '</div>' +
    (hint ? '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + hint + '</div>' : '') +
  '</div>';
}

function _tiInputRow(labelText, fieldKey, value, placeholder) {
  return '<div style="display:grid;grid-template-columns:160px 1fr;gap:10px;align-items:center;margin-bottom:10px;">' +
    '<label style="font-size:12px;font-weight:700;color:var(--navy);">' + esc(labelText) + '</label>' +
    '<input type="text" value="' + esc(value || '') + '"' +
      ' oninput="tiEditScalar(\'' + fieldKey + '\', this.value)"' +
      ' placeholder="' + esc(placeholder || '') + '"' +
      ' style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:Lato,sans-serif;">' +
  '</div>';
}

function _tiTextareaRow(labelText, fieldKey, value, placeholder, rows) {
  return '<div style="display:grid;grid-template-columns:160px 1fr;gap:10px;align-items:start;margin-bottom:10px;">' +
    '<label style="font-size:12px;font-weight:700;color:var(--navy);padding-top:4px;">' + esc(labelText) + '</label>' +
    '<textarea oninput="tiEditScalar(\'' + fieldKey + '\', this.value)"' +
      ' placeholder="' + esc(placeholder || '') + '"' +
      ' rows="' + (rows || 3) + '"' +
      ' style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:Lato,sans-serif;line-height:1.5;resize:vertical;">' + esc(value || '') + '</textarea>' +
  '</div>';
}

function _tiArrayRowControls(section, idx, total) {
  var isFirst = idx === 0;
  var isLast = idx === total - 1;
  var html = '<div style="display:flex;flex-direction:column;gap:2px;">';
  html += '<button onclick="tiEditMove(\'' + section + '\',' + idx + ',-1)"' + (isFirst ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:var(--white);border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (isFirst ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▲</button>';
  html += '<button onclick="tiEditMove(\'' + section + '\',' + idx + ',1)"' + (isLast ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:var(--white);border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (isLast ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▼</button>';
  html += '</div>';
  return html;
}

function _tiRemoveBtn(section, idx) {
  return '<button onclick="tiEditRemove(\'' + section + '\',' + idx + ')" style="padding:4px 8px;border:1px solid #FECACA;background:#FEF2F2;color:#B91C1C;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;font-family:Lato,sans-serif;"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></button>';
}

function buildTeamIntroConfigPanel() {
  var isAdminUser = isAdmin();
  var myLeadTeam = (typeof getLeadTeam === 'function') ? getLeadTeam() : null;
  if (!isAdminUser && !myLeadTeam) {
    return '<div class="settings-panel-title">Team Introduction</div>' +
      '<div class="settings-panel-desc">Only Team Leads and admins can edit Overview tab content.</div>';
  }
  // Resolve which team's intro we're editing: leads are locked to their own;
  // admins default to the home team and can switch via the picker.
  if (!isAdminUser) _tiEditTeam = myLeadTeam;
  else if (!_tiEditTeam) _tiEditTeam = _tiHomeTeam();

  _teamIntroEditDraft = null;
  var draft = _tiEnsureDraft();

  var html = '<div class="settings-panel-title">Team Introduction</div>';
  html += '<div class="settings-panel-desc">Edit the content of the Overview tab: mission, services, year-tagged goals, top partner departments, and the about-this-app blurb. Changes are visible to everyone the next time they refresh.</div>';

  // Per-team scope banner (Tier 2): admin gets a team picker; a lead is locked.
  html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:8px;padding:8px 12px;font-size:12px;color:var(--navy);margin-bottom:16px;">';
  if (isAdminUser) {
    var _tiTeams = (typeof allKnownTeams === 'function') ? allKnownTeams() : [_tiHomeTeam()];
    html += 'Editing intro for: <select onchange="tiSetEditTeam(this.value)" style="font-family:Lato,sans-serif;font-size:12px;font-weight:700;color:var(--navy);border:1px solid #C7D2FE;border-radius:5px;padding:3px 8px;background:var(--white);">' +
      _tiTeams.map(function(t) {
        var sel = (typeof sameTeam === 'function') ? sameTeam(t, _tiEditTeam) : (t === _tiEditTeam);
        return '<option value="' + esc(t) + '"' + (sel ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('') + '</select>';
    html += '<span style="color:var(--text-muted);">' + (_tiIsHomeTeam(_tiEditTeam) ? 'home team' : 'per-team intro') + '</span>';
  } else {
    html += 'Editing intro for your team: <b>' + esc(_tiEditTeam) + '</b> &nbsp;<svg class="icon" aria-hidden="true"><use href="#ph-lock"></use></svg>';
  }
  html += '</div>';

  // Mission section
  html += _tiSectionHeader('Mission &amp; framing', 'The big mission statement and the small eyebrow line above it.');
  html += _tiInputRow('Eyebrow line', 'eyebrow', draft.eyebrow, 'CITY OF TUCSON · DATA INTELLIGENCE TEAM · INFORMATION TECHNOLOGY');
  html += _tiTextareaRow('Mission statement', 'mission', draft.mission, 'One sentence about what the team exists to do.', 2);

  // Services section
  html += _tiSectionHeader('What we do · service areas', 'Each row is one service card on the Overview page.');
  html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:36px 50px minmax(0,1fr) minmax(0,2fr) 50px;gap:10px;align-items:center;padding:8px 12px;background:var(--surface-2);border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">';
  html += '<span>Order</span><span>Icon</span><span>Title</span><span>Description</span><span></span>';
  html += '</div>';
  draft.services.forEach(function(s, i) {
    html += '<div style="display:grid;grid-template-columns:36px 50px minmax(0,1fr) minmax(0,2fr) 50px;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);">';
    html += _tiArrayRowControls('services', i, draft.services.length);
    html += '<input type="text" value="' + esc(s.icon || '') + '" oninput="tiEditField(\'services\',' + i + ',\'icon\',this.value)" maxlength="4" style="padding:5px;border:1px solid var(--border);border-radius:5px;font-size:16px;text-align:center;width:100%;min-width:0;">';
    html += '<input type="text" value="' + esc(s.title || '') + '" oninput="tiEditField(\'services\',' + i + ',\'title\',this.value)" placeholder="Service title" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:13px;font-family:Lato,sans-serif;font-weight:700;color:var(--navy);width:100%;min-width:0;">';
    html += '<input type="text" value="' + esc(s.description || '') + '" oninput="tiEditField(\'services\',' + i + ',\'description\',this.value)" placeholder="One-line description" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:Lato,sans-serif;color:var(--text-body);width:100%;min-width:0;">';
    html += '<div style="text-align:center;">' + _tiRemoveBtn('services', i) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div style="margin-top:8px;"><button onclick="tiEditAdd(\'services\')" class="settings-btn" style="background:var(--white);border:1px solid var(--border);color:var(--navy);">+ Add service</button></div>';

  // Goals section
  html += _tiSectionHeader('Goals · this year', 'Year-tagged objectives. Update annually. Goal body supports inline HTML (<code>&lt;code&gt;</code>, <code>&lt;strong&gt;</code>, etc.).');
  html += _tiInputRow('Goals heading', 'goalsHeading', draft.goalsHeading, 'Where we’re going · 2026');
  html += _tiInputRow('Goals lede', 'goalsLede', draft.goalsLede, 'Four bets that define a successful year.');
  html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:10px;">';
  html += '<div style="display:grid;grid-template-columns:36px 50px minmax(0,1fr) minmax(0,2fr) 50px;gap:10px;align-items:center;padding:8px 12px;background:var(--surface-2);border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">';
  html += '<span>Order</span><span>#</span><span>Title</span><span>Body (HTML)</span><span></span>';
  html += '</div>';
  draft.goals.forEach(function(g, i) {
    html += '<div style="display:grid;grid-template-columns:36px 50px minmax(0,1fr) minmax(0,2fr) 50px;gap:10px;align-items:start;padding:8px 12px;border-bottom:1px solid var(--border);">';
    html += '<div style="padding-top:4px;">' + _tiArrayRowControls('goals', i, draft.goals.length) + '</div>';
    html += '<input type="text" value="' + esc(g.num || '') + '" oninput="tiEditField(\'goals\',' + i + ',\'num\',this.value)" maxlength="3" style="padding:5px;border:1px solid var(--border);border-radius:5px;font-size:14px;text-align:center;font-weight:800;color:var(--navy);width:100%;min-width:0;">';
    html += '<input type="text" value="' + esc(g.title || '') + '" oninput="tiEditField(\'goals\',' + i + ',\'title\',this.value)" placeholder="Goal title" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:13px;font-family:Lato,sans-serif;font-weight:700;color:var(--navy);width:100%;min-width:0;">';
    html += '<textarea oninput="tiEditField(\'goals\',' + i + ',\'body\',this.value)" rows="3" placeholder="Body (HTML allowed)" style="padding:6px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:Lato,sans-serif;line-height:1.5;color:var(--text-body);width:100%;min-width:0;resize:vertical;">' + esc(g.body || '') + '</textarea>';
    html += '<div style="text-align:center;padding-top:4px;">' + _tiRemoveBtn('goals', i) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div style="margin-top:8px;"><button onclick="tiEditAdd(\'goals\')" class="settings-btn" style="background:var(--white);border:1px solid var(--border);color:var(--navy);">+ Add goal</button></div>';

  // Partners section
  html += _tiSectionHeader('Partner departments', '"Match" terms (comma-separated) are substring patterns used to count active projects per partner. Match is lowercased before comparison.');
  html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:36px 50px minmax(0,1.2fr) minmax(0,1.5fr) 50px;gap:10px;align-items:center;padding:8px 12px;background:var(--surface-2);border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">';
  html += '<span>Order</span><span>Icon</span><span>Display name</span><span>Match terms (comma-separated)</span><span></span>';
  html += '</div>';
  draft.partners.forEach(function(pt, i) {
    var matchStr = Array.isArray(pt.match) ? pt.match.join(', ') : (pt.match || '');
    html += '<div style="display:grid;grid-template-columns:36px 50px minmax(0,1.2fr) minmax(0,1.5fr) 50px;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);">';
    html += _tiArrayRowControls('partners', i, draft.partners.length);
    html += '<input type="text" value="' + esc(pt.icon || '') + '" oninput="tiEditField(\'partners\',' + i + ',\'icon\',this.value)" maxlength="4" style="padding:5px;border:1px solid var(--border);border-radius:5px;font-size:16px;text-align:center;width:100%;min-width:0;">';
    html += '<input type="text" value="' + esc(pt.name || '') + '" oninput="tiEditField(\'partners\',' + i + ',\'name\',this.value)" placeholder="Department name" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:13px;font-family:Lato,sans-serif;color:var(--navy);font-weight:700;width:100%;min-width:0;">';
    html += '<input type="text" value="' + esc(matchStr) + '" oninput="tiEditField(\'partners\',' + i + ',\'match\',this.value)" placeholder="water, tucson water" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:Lato,sans-serif;color:var(--text-muted);width:100%;min-width:0;">';
    html += '<div style="text-align:center;">' + _tiRemoveBtn('partners', i) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div style="margin-top:8px;"><button onclick="tiEditAdd(\'partners\')" class="settings-btn" style="background:var(--white);border:1px solid var(--border);color:var(--navy);">+ Add partner</button></div>';

  // About app section
  html += _tiSectionHeader('About this app', 'The blurb at the bottom of the Overview tab. HTML allowed.');
  html += _tiTextareaRow('About text', 'about', draft.about, '', 4);

  // Action buttons
  html += '<div style="margin-top:24px;display:flex;gap:8px;align-items:center;padding-top:18px;border-top:1px solid var(--border);">';
  html += '<button onclick="btnPending(this, () => tiEditSave())" class="settings-btn settings-btn-primary">Save changes</button>';
  html += '<button onclick="tiEditDiscard()" class="settings-btn" style="background:var(--white);border:1px solid var(--border);color:var(--navy);">Discard</button>';
  html += '<span style="font-size:11px;color:var(--text-muted);margin-left:auto;">Visible to everyone after their next page refresh.</span>';
  html += '</div>';

  return html;
}

function tiEditScalar(field, value) {
  var draft = _tiEnsureDraft();
  draft[field] = value;
}

function tiEditField(section, idx, field, value) {
  var draft = _tiEnsureDraft();
  if (Array.isArray(draft[section]) && draft[section][idx]) {
    draft[section][idx][field] = value;
  }
}

function tiEditMove(section, idx, delta) {
  var draft = _tiEnsureDraft();
  if (!Array.isArray(draft[section])) return;
  var arr = draft[section];
  var j = idx + delta;
  if (j < 0 || j >= arr.length) return;
  var tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
  renderSettingsPage(document.getElementById('content-area'));
}

function tiEditRemove(section, idx) {
  var draft = _tiEnsureDraft();
  if (!Array.isArray(draft[section])) return;
  if (!confirm('Remove this row?')) return;
  draft[section].splice(idx, 1);
  renderSettingsPage(document.getElementById('content-area'));
}

function tiEditAdd(section) {
  var draft = _tiEnsureDraft();
  if (!Array.isArray(draft[section])) draft[section] = [];
  if (section === 'services') {
    draft.services.push({ icon: '✨', title: 'New service', description: '' });
  } else if (section === 'goals') {
    draft.goals.push({ num: String(draft.goals.length + 1), title: '', body: '' });
  } else if (section === 'partners') {
    draft.partners.push({ name: 'New partner', icon: '🏛️', match: [] });
  }
  renderSettingsPage(document.getElementById('content-area'));
}

async function tiEditSave() {
  if (!_teamIntroEditDraft) return;
  // Normalize partners.match: convert comma-separated strings to arrays of trimmed lowercase terms
  if (Array.isArray(_teamIntroEditDraft.partners)) {
    _teamIntroEditDraft.partners.forEach(function(p) {
      if (typeof p.match === 'string') {
        p.match = p.match.split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
      }
    });
  }
  // Merge the draft into the correct slice: home team → flat top-level
  // (preserving the byTeam map); other teams → byTeam[team]. This way a lead
  // saving their team can never clobber another team's intro.
  var base = (typeof _teamIntroConfig !== 'undefined' && _teamIntroConfig) ? JSON.parse(JSON.stringify(_teamIntroConfig)) : {};
  var team = _tiEditTeam || _tiHomeTeam();
  var merged;
  if (_tiIsHomeTeam(team)) {
    var keepByTeam = base.byTeam;
    merged = JSON.parse(JSON.stringify(_teamIntroEditDraft));
    if (keepByTeam) merged.byTeam = keepByTeam;
  } else {
    merged = base;
    merged.byTeam = merged.byTeam || {};
    var oldKey = _tiByTeamKey(merged, team);
    if (oldKey && oldKey !== team) delete merged.byTeam[oldKey];
    merged.byTeam[team] = JSON.parse(JSON.stringify(_teamIntroEditDraft));
  }
  try {
    var ok = await saveConfigKey('team_intro', merged);
    if (!ok) throw new Error('Save returned false');
    _teamIntroConfig = merged;
    _teamIntroEditDraft = null;
    showToast('Team Introduction saved' + (_tiIsHomeTeam(team) ? '.' : ' for ' + team + '.'), 'success');
    renderSettingsPage(document.getElementById('content-area'));
  } catch (e) {
    console.error('[TeamIntro] Save failed:', e);
    showToast('Save failed: ' + e.message, 'error');
  }
}

function tiEditDiscard() {
  _teamIntroEditDraft = null;
  renderSettingsPage(document.getElementById('content-area'));
  showToast('Changes discarded.', 'info');
}

// ── Project intake (per-team: Submit Idea review vs. direct full-project create) ──
function buildProjectIntakePanel() {
  var isAdminUser = isAdmin();
  var myLeadTeam = (typeof getLeadTeam === 'function') ? getLeadTeam() : null;
  if (!isAdminUser && !myLeadTeam) {
    return '<div class="settings-panel-title">Project intake</div>' +
      '<div class="settings-panel-desc">Only Team Leads and admins can change this.</div>';
  }
  var teams = isAdminUser
    ? ((typeof allKnownTeams === 'function') ? allKnownTeams() : [])
    : [myLeadTeam];
  var html = '<div class="settings-panel-title">Project intake</div>';
  html += '<div class="settings-panel-desc">How a team starts projects. <strong>Submit Idea</strong> routes new work through the idea-review process; <strong>Create directly</strong> lets the team’s members open the full project editor and skip review.</div>';
  html += '<div style="display:flex;flex-direction:column;gap:10px;max-width:580px;">';
  teams.forEach(function(t) {
    var on = (typeof teamCreatesDirectly === 'function') && teamCreatesDirectly(t);
    html += '<label style="display:flex;align-items:center;gap:12px;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px 16px;cursor:pointer;">' +
      '<input type="checkbox"' + (on ? ' checked' : '') + ' onchange="toggleDirectProjectTeam(' + JSON.stringify(t).replace(/"/g, '&quot;') + ', this.checked)" style="width:18px;height:18px;cursor:pointer;accent-color:var(--navy);flex-shrink:0;">' +
      '<div><div style="font-weight:800;color:var(--navy);">' + esc(t) + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);">' + (on ? 'Creates projects directly — Submit Idea review skipped' : 'Uses the Submit Idea review process') + '</div></div>' +
    '</label>';
  });
  html += '</div>';
  html += '<div class="list-editor-note" style="margin-top:14px;">When on, the team’s members get a “＋ New Project” button (full editor) instead of “Submit Idea.” Saved to ArcGIS Online and shared across users.</div>';
  return html;
}

async function toggleDirectProjectTeam(team, enabled) {
  // Leads may only change their own team; admins any team.
  if (!isAdmin()) {
    var lead = (typeof getLeadTeam === 'function') ? getLeadTeam() : null;
    var ok = lead && ((typeof sameTeam === 'function') ? sameTeam(team, lead) : team === lead);
    if (!ok) { showToast('You can only change your own team.', 'warn'); return; }
  }
  var list = (typeof _directProjectTeams !== 'undefined' && Array.isArray(_directProjectTeams)) ? _directProjectTeams.slice() : [];
  list = list.filter(function(t) { return !((typeof sameTeam === 'function') ? sameTeam(t, team) : t === team); });
  if (enabled) list.push(team);
  try {
    var saved = await saveConfigKey('direct_project_teams', list);
    if (!saved) throw new Error('Save returned false');
    _directProjectTeams = list;
    showToast('Project intake updated for ' + team + '.', 'success');
    if (typeof markDataDirty === 'function') markDataDirty();
    render();
  } catch (e) {
    console.error('[Intake] Save failed:', e);
    showToast('Save failed: ' + e.message, 'error');
  }
}

// ── Organization editor (Department → Team → Unit) — Phase D ───────────
// Admin-only tree editor. Single source of truth for the org hierarchy; the
// team list and per-team unit lists everywhere derive from it. Edits an in-memory
// draft (deep clone of getOrgStructure()); Save persists the draft to the
// org_structure config, then re-derives the flat lists. Replaces the flat Teams
// and Units list editors. Renames are vocab-only (soft) — existing projects/
// members keep their stored value, so a rename can leave drift behind.
//
// Editing is inline: clicking a name (or its <svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg>) swaps it for a text field in
// place; "＋ add" controls expand into inline inputs. Only one node is editable
// at a time, tracked by _orgEdit / _orgAdd. Enter commits, Esc cancels.
var _orgDraft = null;
var _orgEdit = null; // { kind:'dept'|'team', di, ti } — node being renamed in place
var _orgAdd = null;  // { kind:'unit'|'team'|'dept', di, ti } — open inline add input

function _orgNorm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

function _orgDraftEnsure() {
  if (!_orgDraft) _orgDraft = JSON.parse(JSON.stringify(getOrgStructure()));
  if (!_orgDraft || !Array.isArray(_orgDraft.departments)) _orgDraft = { departments: [] };
  return _orgDraft;
}

function _orgDraftDirty() {
  return !!_orgDraft && JSON.stringify(_orgDraft) !== JSON.stringify(getOrgStructure());
}

function _orgAllTeamNames(d) {
  var out = [];
  (d.departments || []).forEach(function(dep) { (dep.teams || []).forEach(function(t) { if (t && t.name) out.push(t.name); }); });
  return out;
}
function _orgAllUnitNames(d) {
  var out = [];
  (d.departments || []).forEach(function(dep) { (dep.teams || []).forEach(function(t) { (t.units || []).forEach(function(u) { if (u) out.push(u); }); }); });
  return out;
}

// Re-render the settings page, then restore focus to the active inline input
// (the full settings DOM is rebuilt, so the field would otherwise lose focus).
function _orgRerender() {
  renderSettingsPage(document.getElementById('content-area'));
  var f = document.getElementById('org-ed-name') || document.getElementById('org-ad-input');
  if (f) { f.focus(); if (f.select) f.select(); }
}

// Shared inline styles (kept here so the editor needs no app.css changes).
var _ORG_INP = 'font-family:inherit;font-weight:700;color:var(--navy);border:1.5px solid var(--navy);border-radius:6px;padding:5px 9px;outline:none;background:var(--white);';

function buildOrgEditorPanel() {
  if (typeof isAdmin === 'function' && !isAdmin()) {
    return '<div class="settings-panel-title">Organization</div>' +
      '<div class="settings-panel-desc">Only admins can edit the organization structure.</div>';
  }
  var d = _orgDraftEnsure();
  var dirty = _orgDraftDirty();

  function okCancel(commit, cancel) {
    return '<button class="settings-btn settings-btn-primary" title="Save" onclick="' + commit + '" style="padding:3px 9px;"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg></button>' +
      '<button class="settings-btn settings-btn-secondary" title="Cancel (Esc)" onclick="' + cancel + '" style="padding:3px 9px;"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg></button>';
  }

  function unitChip(u, di, ti, ui) {
    return '<span style="display:inline-flex;align-items:center;gap:5px;background:var(--white);border:1px solid var(--border);border-radius:20px;padding:3px 6px 3px 11px;font-size:12px;font-weight:600;color:var(--navy);">' +
      esc(u) +
      '<span title="Remove unit" onclick="orgRemoveUnit(' + di + ',' + ti + ',' + ui + ')" style="width:16px;height:16px;border-radius:50%;background:var(--surface-2);color:#9A3412;font-size:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg></span>' +
    '</span>';
  }

  function teamHead(t, di, ti, teamCount) {
    var editing = _orgEdit && _orgEdit.kind === 'team' && _orgEdit.di === di && _orgEdit.ti === ti;
    if (editing) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--surface-2);border-bottom:1px solid var(--border);">' +
        '<input id="org-ed-name" value="' + esc(t.name) + '" placeholder="Team name" onkeydown="orgEditKey(event)" style="' + _ORG_INP + 'font-size:13px;min-width:220px;">' +
        okCancel('orgCommitEdit()', 'orgCancelEdit()') +
        '<span style="margin-left:auto;"></span>' +
      '</div>';
    }
    var units = t.units || [];
    var meta = units.length ? ('· ' + units.length + ' unit' + (units.length === 1 ? '' : 's')) : '· no units';
    return '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--surface-2);border-bottom:1px solid var(--border);">' +
      '<span onclick="orgStartEdit(\'team\',' + di + ',' + ti + ')" title="Click to rename" style="font-size:13.5px;font-weight:800;color:var(--navy);cursor:text;">' + esc(t.name) + '</span>' +
      '<span style="font-size:11px;color:var(--text-muted);">' + meta + '</span>' +
      '<span style="margin-left:auto;"></span>' +
      _orgArrows('orgMoveTeam(' + di + ',' + ti + ',-1)', 'orgMoveTeam(' + di + ',' + ti + ',1)', ti, teamCount) +
      '<button class="settings-btn settings-btn-secondary" title="Rename team" onclick="orgStartEdit(\'team\',' + di + ',' + ti + ')" style="padding:3px 8px;"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg></button>' +
      '<button class="settings-btn settings-btn-danger" title="Remove team" onclick="orgRemoveTeam(' + di + ',' + ti + ')" style="padding:3px 8px;"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></button>' +
    '</div>';
  }

  function teamHtml(t, di, ti, teamCount) {
    var units = t.units || [];
    var unitsHtml = '<span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-right:4px;">Units</span>';
    units.forEach(function(u, ui) { unitsHtml += unitChip(u, di, ti, ui); });
    var addingUnit = _orgAdd && _orgAdd.kind === 'unit' && _orgAdd.di === di && _orgAdd.ti === ti;
    if (addingUnit) {
      unitsHtml += '<input id="org-ad-input" placeholder="unit name… ⏎" onkeydown="orgAddKey(event)" style="' + _ORG_INP + 'font-size:12px;width:160px;border-radius:20px;padding:3px 10px;">' +
        okCancel('orgCommitAdd()', 'orgCancelAdd()');
    } else {
      unitsHtml += '<span onclick="orgStartAdd(\'unit\',' + di + ',' + ti + ')" style="display:inline-flex;align-items:center;gap:4px;border:1px dashed #C7D2FE;background:var(--surface-2);border-radius:20px;padding:3px 11px;font-size:12px;font-weight:700;color:var(--navy);cursor:pointer;">＋ add unit</span>';
    }
    return '<div style="border:1px solid var(--border);border-radius:9px;margin-bottom:10px;">' +
      teamHead(t, di, ti, teamCount) +
      '<div style="padding:10px 12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">' + unitsHtml + '</div>' +
    '</div>';
  }

  function deptHead(dep, di, deptCount) {
    var editing = _orgEdit && _orgEdit.kind === 'dept' && _orgEdit.di === di;
    if (editing) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:#EEF2FF;border-bottom:1px solid #C7D2FE;">' +
        '<input id="org-ed-name" value="' + esc(dep.name) + '" placeholder="Department name" onkeydown="orgEditKey(event)" style="' + _ORG_INP + 'font-size:15px;min-width:230px;">' +
        '<input id="org-ed-short" value="' + esc(dep.short || '') + '" placeholder="SHORT" onkeydown="orgEditKey(event)" style="' + _ORG_INP + 'font-size:11px;width:72px;text-transform:uppercase;">' +
        okCancel('orgCommitEdit()', 'orgCancelEdit()') +
        '<span style="margin-left:auto;"></span>' +
      '</div>';
    }
    var shortBadge = dep.short ? '<span style="font-size:10px;font-weight:800;letter-spacing:0.05em;background:var(--navy);color:#fff;border-radius:5px;padding:2px 7px;">' + esc(dep.short) + '</span>' : '';
    return '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:#EEF2FF;border-bottom:1px solid #C7D2FE;">' +
      '<span onclick="orgStartEdit(\'dept\',' + di + ')" title="Click to rename" style="font-size:15px;font-weight:800;color:var(--navy);cursor:text;">' + esc(dep.name) + '</span>' +
      shortBadge +
      '<span style="margin-left:auto;"></span>' +
      _orgArrows('orgMoveDept(' + di + ',-1)', 'orgMoveDept(' + di + ',1)', di, deptCount) +
      '<button class="settings-btn settings-btn-secondary" title="Edit department name / short code" onclick="orgStartEdit(\'dept\',' + di + ')" style="padding:3px 8px;"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg></button>' +
      '<button class="settings-btn settings-btn-danger" title="Remove department" onclick="orgRemoveDept(' + di + ')" style="padding:3px 8px;"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></button>' +
    '</div>';
  }

  function deptHtml(dep, di, deptCount) {
    var teams = dep.teams || [];
    var body = '';
    teams.forEach(function(t, ti) { body += teamHtml(t, di, ti, teams.length); });
    var addingTeam = _orgAdd && _orgAdd.kind === 'team' && _orgAdd.di === di;
    if (addingTeam) {
      body += '<div style="display:flex;gap:6px;align-items:center;padding:4px 2px 0;">' +
        '<input id="org-ad-input" placeholder="New team name… ⏎" onkeydown="orgAddKey(event)" style="' + _ORG_INP + 'font-size:13px;min-width:220px;">' +
        okCancel('orgCommitAdd()', 'orgCancelAdd()') +
      '</div>';
    } else {
      body += '<div style="padding:4px 2px 0;"><button onclick="orgStartAdd(\'team\',' + di + ')" style="border:1px dashed var(--border);background:var(--white);color:var(--navy);border-radius:7px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;width:100%;text-align:left;">＋ Add team to ' + esc(dep.name) + '</button></div>';
    }
    return '<div style="border:1px solid var(--border);border-radius:11px;margin-bottom:16px;overflow:hidden;">' +
      deptHead(dep, di, deptCount) +
      '<div style="padding:12px 14px 14px;">' + body + '</div>' +
    '</div>';
  }

  var html = '<div class="settings-panel-title">Organization</div>' +
    '<div class="settings-panel-desc">Departments → Teams → Units. One source of truth for the org hierarchy — the team switcher, the per-team Unit dropdowns, and the header subtitle all derive from it. Click a name to rename it in place; press Enter to save, Esc to cancel. Units belong to one team; teams belong to one department.</div>';

  d.departments.forEach(function(dep, di) { html += deptHtml(dep, di, d.departments.length); });

  if (_orgAdd && _orgAdd.kind === 'dept') {
    html += '<div style="display:flex;gap:6px;align-items:center;margin-top:2px;">' +
      '<input id="org-ad-input" placeholder="New department name… ⏎" onkeydown="orgAddKey(event)" style="' + _ORG_INP + 'font-size:15px;min-width:230px;">' +
      '<input id="org-ad-short" placeholder="SHORT" onkeydown="orgAddKey(event)" style="' + _ORG_INP + 'font-size:11px;width:72px;text-transform:uppercase;">' +
      okCancel('orgCommitAdd()', 'orgCancelAdd()') +
    '</div>';
  } else {
    html += '<button onclick="orgStartAdd(\'dept\')" style="border:1px dashed var(--navy);background:var(--surface-2);color:var(--navy);border-radius:9px;padding:11px 14px;font-size:13px;font-weight:800;cursor:pointer;width:100%;text-align:center;">＋ Add department</button>';
  }

  html += '<div style="display:flex;gap:10px;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">' +
    '<button class="settings-btn settings-btn-primary" onclick="btnPending(this, () => orgEditorSave(), \'Saving…\')"' + (dirty ? '' : ' disabled style="opacity:0.5;cursor:default;"') + '>Save organization</button>' +
    '<button class="settings-btn settings-btn-secondary" onclick="orgEditorDiscard()"' + (dirty ? '' : ' disabled style="opacity:0.5;cursor:default;"') + '>Discard</button>' +
    (dirty ? '<span style="font-size:11px;font-weight:700;color:#9A3412;">Unsaved changes</span>' : '') +
  '</div>';

  html += '<div class="list-editor-note" style="margin-top:14px;line-height:1.6;">' +
    '• <strong>Units belong to one team.</strong> Renaming a team or unit changes the canonical name only — existing projects/members keep their stored value, so renames can leave drift behind.<br>' +
    '• <strong>Data Program</strong> is a separate cross-cutting collection of teams (Settings → System → Data Program teams), not part of this org chart.<br>' +
    '• <strong>Partner departments</strong> (the city departments you do work for) are managed separately under Settings → System → Partner departments.<br>' +
    '• Removing a team or unit doesn’t delete history — values already used on records still display; they just stop appearing as new options.' +
  '</div>';
  return html;
}

// Up/down reorder arrows; the relevant arrow is dimmed at the ends.
function _orgArrows(upCall, downCall, idx, count) {
  var atTop = idx <= 0, atBottom = idx >= count - 1;
  return '<button class="settings-btn settings-btn-secondary" title="Move up" onclick="' + upCall + '" style="padding:3px 7px;' + (atTop ? 'opacity:0.3;cursor:default;' : '') + '"' + (atTop ? ' disabled' : '') + '>↑</button>' +
    '<button class="settings-btn settings-btn-secondary" title="Move down" onclick="' + downCall + '" style="padding:3px 7px;' + (atBottom ? 'opacity:0.3;cursor:default;' : '') + '"' + (atBottom ? ' disabled' : '') + '>↓</button>';
}

// ── Inline rename (edit) ──
function orgEditKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); orgCommitEdit(); }
  else if (e.key === 'Escape') { e.preventDefault(); orgCancelEdit(); }
}
function orgStartEdit(kind, di, ti) { _orgAdd = null; _orgEdit = { kind: kind, di: di, ti: ti }; _orgRerender(); }
function orgCancelEdit() { _orgEdit = null; _orgRerender(); }
function orgCommitEdit() {
  if (!_orgEdit) return;
  var d = _orgDraftEnsure();
  var nameEl = document.getElementById('org-ed-name');
  var name = (nameEl ? nameEl.value : '').trim();
  if (!name) { showToast('Name can’t be empty.', 'warn'); return; }
  if (_orgEdit.kind === 'dept') {
    var dep = d.departments[_orgEdit.di]; if (!dep) { _orgEdit = null; _orgRerender(); return; }
    if (d.departments.some(function(x, i) { return i !== _orgEdit.di && _orgNorm(x.name) === _orgNorm(name); })) { showToast('A department with that name already exists.', 'warn'); return; }
    dep.name = name;
    var shortEl = document.getElementById('org-ed-short');
    dep.short = (shortEl ? shortEl.value : '').trim();
  } else {
    var dep2 = d.departments[_orgEdit.di]; var t = dep2 && dep2.teams ? dep2.teams[_orgEdit.ti] : null;
    if (!t) { _orgEdit = null; _orgRerender(); return; }
    if (_orgAllTeamNames(d).some(function(x) { return _orgNorm(x) === _orgNorm(name) && _orgNorm(x) !== _orgNorm(t.name); })) { showToast('A team with that name already exists in the org.', 'warn'); return; }
    t.name = name;
  }
  _orgEdit = null; _orgRerender();
}

// ── Inline add ──
function orgAddKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); orgCommitAdd(); }
  else if (e.key === 'Escape') { e.preventDefault(); orgCancelAdd(); }
}
function orgStartAdd(kind, di, ti) { _orgEdit = null; _orgAdd = { kind: kind, di: di, ti: ti }; _orgRerender(); }
function orgCancelAdd() { _orgAdd = null; _orgRerender(); }
function orgCommitAdd() {
  if (!_orgAdd) return;
  var d = _orgDraftEnsure();
  var el = document.getElementById('org-ad-input');
  var val = (el ? el.value : '').trim();
  if (!val) { if (_orgAdd.kind === 'unit') { _orgAdd = null; _orgRerender(); } return; }
  if (_orgAdd.kind === 'dept') {
    if (d.departments.some(function(x) { return _orgNorm(x.name) === _orgNorm(val); })) { showToast('A department with that name already exists.', 'warn'); return; }
    var shortEl = document.getElementById('org-ad-short');
    d.departments.push({ name: val, short: (shortEl ? shortEl.value : '').trim(), teams: [] });
    _orgAdd = null; _orgRerender();
  } else if (_orgAdd.kind === 'team') {
    var dep = d.departments[_orgAdd.di]; if (!dep) { _orgAdd = null; _orgRerender(); return; }
    if (_orgAllTeamNames(d).some(function(x) { return _orgNorm(x) === _orgNorm(val); })) { showToast('A team with that name already exists in the org.', 'warn'); return; }
    if (!Array.isArray(dep.teams)) dep.teams = [];
    dep.teams.push({ name: val, units: [] });
    _orgAdd = null; _orgRerender();
  } else { // unit — keep the input open & focused for rapid entry
    var dep3 = d.departments[_orgAdd.di]; var t = dep3 && dep3.teams ? dep3.teams[_orgAdd.ti] : null;
    if (!t) { _orgAdd = null; _orgRerender(); return; }
    if (_orgAllUnitNames(d).some(function(x) { return _orgNorm(x) === _orgNorm(val); })) { showToast('A unit with that name already exists in the org.', 'warn'); return; }
    if (!Array.isArray(t.units)) t.units = [];
    t.units.push(val);
    _orgRerender(); // _orgAdd stays set → a fresh empty input re-focuses
  }
}

// ── Reorder / remove ──
function orgRemoveDept(di) {
  var d = _orgDraftEnsure(); var dep = d.departments[di]; if (!dep) return;
  var n = (dep.teams || []).length;
  if (!confirm('Remove department "' + dep.name + '"' + (n ? ' and its ' + n + ' team' + (n === 1 ? '' : 's') : '') + '? Existing records keep their values.')) return;
  _orgEdit = null; _orgAdd = null;
  d.departments.splice(di, 1);
  _orgRerender();
}
function orgMoveDept(di, dir) {
  var d = _orgDraftEnsure(); var j = di + dir;
  if (j < 0 || j >= d.departments.length) return;
  var tmp = d.departments[di]; d.departments[di] = d.departments[j]; d.departments[j] = tmp;
  _orgRerender();
}
function orgRemoveTeam(di, ti) {
  var d = _orgDraftEnsure(); var dep = d.departments[di]; if (!dep || !dep.teams[ti]) return;
  var t = dep.teams[ti];
  var n = (t.units || []).length;
  if (!confirm('Remove team "' + t.name + '"' + (n ? ' and its ' + n + ' unit' + (n === 1 ? '' : 's') : '') + '? Existing records keep their values.')) return;
  _orgEdit = null; _orgAdd = null;
  dep.teams.splice(ti, 1);
  _orgRerender();
}
function orgMoveTeam(di, ti, dir) {
  var d = _orgDraftEnsure(); var dep = d.departments[di]; if (!dep) return;
  var j = ti + dir;
  if (j < 0 || j >= dep.teams.length) return;
  var tmp = dep.teams[ti]; dep.teams[ti] = dep.teams[j]; dep.teams[j] = tmp;
  _orgRerender();
}
function orgRemoveUnit(di, ti, ui) {
  var d = _orgDraftEnsure(); var dep = d.departments[di]; if (!dep || !dep.teams) return;
  var t = dep.teams[ti]; if (!t || !t.units) return;
  t.units.splice(ui, 1);
  _orgRerender();
}

// ── Save / Discard ──
async function orgEditorSave() {
  if (!_orgDraftDirty()) return;
  var d = _orgDraftEnsure();
  for (var i = 0; i < d.departments.length; i++) {
    if (!String(d.departments[i].name || '').trim()) { showToast('Every department needs a name.', 'warn'); return; }
  }
  var clean = JSON.parse(JSON.stringify(d));
  _orgStructure = clean;
  if (typeof _deriveOrgLists === 'function') _deriveOrgLists();
  if (typeof refreshEnums === 'function') refreshEnums();
  var ok = await saveConfigKey('org_structure', clean);
  if (ok) {
    showToast('Organization saved.', 'success');
    _orgDraft = null; _orgEdit = null; _orgAdd = null;
    if (typeof markDataDirty === 'function') markDataDirty();
    render();
  }
}
function orgEditorDiscard() {
  if (_orgDraftDirty() && !confirm('Discard unsaved changes to the organization?')) return;
  _orgDraft = null; _orgEdit = null; _orgAdd = null;
  _orgRerender();
}
