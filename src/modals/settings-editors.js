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

async function saveCustomLists(listKey) {
  if (listKey === 'dept') {
    await saveConfigKey('partner_depts', _customPartnerDepts);
  } else if (listKey === 'team') {
    await saveConfigKey('itd_teams', _customItdTeams);
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
  var html = '<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #E8E6DF;border-radius:10px;overflow:hidden;font-size:13px;">';
  html += '<thead><tr><th style="background:#FDFCF8;padding:10px 14px;text-align:left;font-weight:700;color:var(--navy);border-bottom:2px solid #E8E6DF;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">Size</th>';
  roles.forEach(function(r) {
    html += '<th style="background:#FDFCF8;padding:10px 14px;text-align:center;font-weight:700;color:var(--navy);border-bottom:2px solid #E8E6DF;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">' + r + '</th>';
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
  html += '<button class="settings-btn settings-btn-primary" onclick="saveAllocDefaults()">Save Defaults</button>';
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
  }

  const itemsHtml = items.map(function(item, idx) {
    return '<div class="list-editor-item">' +
      '<span class="list-editor-item-name">' + esc(item) + '</span>' +
      '<button class="list-editor-remove" title="Remove" onclick="removeListItem(\'' + listKey + '\',' + idx + ')">✕</button>' +
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
      '<input type="text" id="list-add-input-' + listKey + '" placeholder="Add new ' + (listKey === 'dept' ? 'department' : 'team') + '…" onkeydown="if(event.key===\'Enter\')addListItem(\'' + listKey + '\')">' +
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

  const list = listKey === 'dept' ? _customPartnerDepts : _customItdTeams;
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
    listKey === 'dept' ? 'list-editor-dept' : 'list-editor-team',
    listKey === 'dept' ? 'Partner Departments' : 'ITD Teams',
    list, listKey
  );

  // Save to ArcGIS Online
  await saveCustomLists(listKey);
}

async function removeListItem(listKey, idx) {
  const list = listKey === 'dept' ? _customPartnerDepts : _customItdTeams;
  const item = list[idx];
  if (!confirm('Remove "' + item + '" from the list?')) return;
  list.splice(idx, 1);

  // Refresh the enum aliases
  refreshEnums();

  // Re-render the editor immediately (optimistic UI)
  renderListEditor(
    listKey === 'dept' ? 'list-editor-dept' : 'list-editor-team',
    listKey === 'dept' ? 'Partner Departments' : 'ITD Teams',
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
          '<button class="desc-editor-edit" title="Edit" onclick="editDescListItem(\'' + listKey + '\',' + idx + ')">✏️</button>' +
          '<button class="list-editor-remove" title="Remove" onclick="removeDescListItem(\'' + listKey + '\',' + idx + ')">✕</button>' +
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
      '<button class="settings-btn settings-btn-primary" style="padding:4px 12px;font-size:11px;" onclick="saveDescListEdit(\'' + listKey + '\',' + idx + ')">Save</button>' +
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
      '<button onclick="deleteStatusHistoryRecord(' + idx + ')" style="background:none;border:none;color:#E1E2DD;cursor:pointer;font-size:14px;padding:2px 4px;border-radius:4px;" title="Remove" onmouseover="this.style.color=\'#EF4444\'" onmouseout="this.style.color=\'#E1E2DD\'">✕</button>' +
    '</div>';
  }).join('');

  if (!history.length) {
    rowsHtml = '<div style="padding:12px 0;font-size:12px;color:var(--text-muted);font-style:italic;">No status history records yet. Add entries below to build the timeline.</div>';
  }

  const statusSelectHtml = statusOpts.map(function(s) {
    return '<option value="' + s + '">' + s + '</option>';
  }).join('');

  container.innerHTML = '<div style="margin-top:16px;background:#F7F5EF;border:1px solid var(--border);border-radius:10px;padding:16px;">' +
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
    const result = await agolApplyEdits(ARCGIS_CONFIG.statusHistoryUrl, {
      adds: [{ attributes: {
        project_number: Editor.shProjectId,
        project_title: projTitle,
        status: status,
        changed_date: dateVal,
        changed_by: who,
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
        '<div style="font-size:40px;margin-bottom:12px;">🗑️</div>' +
        '<div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:4px;">Trash is empty</div>' +
        '<div style="font-size:12px;">Deleted projects, tasks, and issues appear here.</div>' +
        '</div>';
      return;
    }

    var typeBadge = {
      project: '<span style="display:inline-block;background:#EEF2FF;color:#1E40AF;font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;letter-spacing:0.04em;text-transform:uppercase;">📁 Project</span>',
      task:    '<span style="display:inline-block;background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;letter-spacing:0.04em;text-transform:uppercase;">✓ Task</span>',
      issue:   '<span style="display:inline-block;background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;letter-spacing:0.04em;text-transform:uppercase;">🐛 Issue</span>',
    };

    var html = '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#FDFCF8;">' +
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
      html += '<button onclick="hardDeleteFromTrash(\'' + item.type + '\',' + item.oid + ',\'' + escapeAttr(item.title) + '\')" style="padding:5px 12px;background:#fff;color:#EF4444;border:1px solid #FECACA;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Permanent delete</button>';
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

  html += '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:36px 70px 60px minmax(0,1.2fr) minmax(0,2fr) 90px;gap:10px;align-items:center;padding:10px 14px;background:#FDFCF8;border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">';
  html += '<span title="Reorder">Order</span><span>ID</span><span>Color</span><span>Name</span><span>Description</span><span style="text-align:right;">Actions</span>';
  html += '</div>';

  draft.teams.forEach(function(t, i) {
    var isFirst = (i === 0);
    var isLast = (i === draft.teams.length - 1);
    html += '<div style="display:grid;grid-template-columns:36px 70px 60px minmax(0,1.2fr) minmax(0,2fr) 90px;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);">';
    html += '<div style="display:flex;flex-direction:column;gap:2px;">';
    html += '<button onclick="dpEditMove(\'' + esc(t.id) + '\', -1)"' + (isFirst ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:#fff;border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (isFirst ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▲</button>';
    html += '<button onclick="dpEditMove(\'' + esc(t.id) + '\', 1)"' + (isLast ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:#fff;border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (isLast ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▼</button>';
    html += '</div>';
    html += '<input type="text" value="' + esc(t.id) + '" oninput="dpEditField(\'' + esc(t.id) + '\', \'id\', this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:Lato,sans-serif;font-weight:700;color:var(--navy);min-width:0;width:100%;">';
    html += '<input type="color" value="' + esc(t.color || '#002669') + '" oninput="dpEditField(\'' + esc(t.id) + '\', \'color\', this.value)" style="width:48px;height:30px;border:1px solid var(--border);border-radius:5px;cursor:pointer;background:#fff;padding:2px;">';
    html += '<input type="text" value="' + esc(t.name) + '" oninput="dpEditField(\'' + esc(t.id) + '\', \'name\', this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:13px;font-family:Lato,sans-serif;color:var(--text-body);min-width:0;width:100%;">';
    html += '<input type="text" value="' + esc(t.description || '') + '" oninput="dpEditField(\'' + esc(t.id) + '\', \'description\', this.value)" placeholder="Brief description…" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:Lato,sans-serif;color:var(--text-muted);min-width:0;width:100%;">';
    html += '<div style="text-align:right;"><button onclick="dpEditDelete(\'' + esc(t.id) + '\')" style="padding:4px 8px;border:1px solid #FECACA;background:#FEF2F2;color:#B91C1C;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;font-family:Lato,sans-serif;">🗑 Remove</button></div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div style="margin-top:14px;display:flex;gap:8px;align-items:center;">';
  html += '<button onclick="dpEditAdd()" class="settings-btn" style="background:#fff;border:1px solid var(--border);color:var(--navy);">+ Add team</button>';
  html += '<button onclick="dpEditSave()" class="settings-btn settings-btn-primary" style="margin-left:auto;">Save changes</button>';
  html += '<button onclick="dpEditDiscard()" class="settings-btn" style="background:#fff;border:1px solid var(--border);color:var(--navy);">Discard</button>';
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

function _tiEnsureDraft() {
  if (_teamIntroEditDraft) return _teamIntroEditDraft;
  var current = (typeof _teamIntroConfig !== 'undefined' && _teamIntroConfig)
    ? _teamIntroConfig
    : TEAM_INTRO_DEFAULT_CONFIG;
  _teamIntroEditDraft = JSON.parse(JSON.stringify(current));
  if (!Array.isArray(_teamIntroEditDraft.services)) _teamIntroEditDraft.services = [];
  if (!Array.isArray(_teamIntroEditDraft.goals))    _teamIntroEditDraft.goals = [];
  if (!Array.isArray(_teamIntroEditDraft.partners)) _teamIntroEditDraft.partners = [];
  return _teamIntroEditDraft;
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
  html += '<button onclick="tiEditMove(\'' + section + '\',' + idx + ',-1)"' + (isFirst ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:#fff;border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (isFirst ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▲</button>';
  html += '<button onclick="tiEditMove(\'' + section + '\',' + idx + ',1)"' + (isLast ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:#fff;border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (isLast ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▼</button>';
  html += '</div>';
  return html;
}

function _tiRemoveBtn(section, idx) {
  return '<button onclick="tiEditRemove(\'' + section + '\',' + idx + ')" style="padding:4px 8px;border:1px solid #FECACA;background:#FEF2F2;color:#B91C1C;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;font-family:Lato,sans-serif;">🗑</button>';
}

function buildTeamIntroConfigPanel() {
  if (!isAdmin()) {
    return '<div class="settings-panel-title">Team Introduction</div>' +
      '<div class="settings-panel-desc">Admin-only — only Team Leads can edit the Overview tab content.</div>';
  }
  _teamIntroEditDraft = null;
  var draft = _tiEnsureDraft();

  var html = '<div class="settings-panel-title">Team Introduction</div>';
  html += '<div class="settings-panel-desc">Edit the content of the Overview tab: mission, services, year-tagged goals, top partner departments, and the about-this-app blurb. Changes are visible to everyone the next time they refresh.</div>';

  // Mission section
  html += _tiSectionHeader('Mission &amp; framing', 'The big mission statement and the small eyebrow line above it.');
  html += _tiInputRow('Eyebrow line', 'eyebrow', draft.eyebrow, 'CITY OF TUCSON · DATA INTELLIGENCE TEAM · INFORMATION TECHNOLOGY');
  html += _tiTextareaRow('Mission statement', 'mission', draft.mission, 'One sentence about what the team exists to do.', 2);

  // Services section
  html += _tiSectionHeader('What we do · service areas', 'Each row is one service card on the Overview page.');
  html += '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:36px 50px minmax(0,1fr) minmax(0,2fr) 50px;gap:10px;align-items:center;padding:8px 12px;background:#FDFCF8;border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">';
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
  html += '<div style="margin-top:8px;"><button onclick="tiEditAdd(\'services\')" class="settings-btn" style="background:#fff;border:1px solid var(--border);color:var(--navy);">+ Add service</button></div>';

  // Goals section
  html += _tiSectionHeader('Goals · this year', 'Year-tagged objectives. Update annually. Goal body supports inline HTML (<code>&lt;code&gt;</code>, <code>&lt;strong&gt;</code>, etc.).');
  html += _tiInputRow('Goals heading', 'goalsHeading', draft.goalsHeading, 'Where we’re going · 2026');
  html += _tiInputRow('Goals lede', 'goalsLede', draft.goalsLede, 'Four bets that define a successful year.');
  html += '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:10px;">';
  html += '<div style="display:grid;grid-template-columns:36px 50px minmax(0,1fr) minmax(0,2fr) 50px;gap:10px;align-items:center;padding:8px 12px;background:#FDFCF8;border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">';
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
  html += '<div style="margin-top:8px;"><button onclick="tiEditAdd(\'goals\')" class="settings-btn" style="background:#fff;border:1px solid var(--border);color:var(--navy);">+ Add goal</button></div>';

  // Partners section
  html += _tiSectionHeader('Partner departments', '"Match" terms (comma-separated) are substring patterns used to count active projects per partner. Match is lowercased before comparison.');
  html += '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:36px 50px minmax(0,1.2fr) minmax(0,1.5fr) 50px;gap:10px;align-items:center;padding:8px 12px;background:#FDFCF8;border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">';
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
  html += '<div style="margin-top:8px;"><button onclick="tiEditAdd(\'partners\')" class="settings-btn" style="background:#fff;border:1px solid var(--border);color:var(--navy);">+ Add partner</button></div>';

  // About app section
  html += _tiSectionHeader('About this app', 'The blurb at the bottom of the Overview tab. HTML allowed.');
  html += _tiTextareaRow('About text', 'about', draft.about, '', 4);

  // Action buttons
  html += '<div style="margin-top:24px;display:flex;gap:8px;align-items:center;padding-top:18px;border-top:1px solid var(--border);">';
  html += '<button onclick="tiEditSave()" class="settings-btn settings-btn-primary">Save changes</button>';
  html += '<button onclick="tiEditDiscard()" class="settings-btn" style="background:#fff;border:1px solid var(--border);color:var(--navy);">Discard</button>';
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
  try {
    var ok = await saveConfigKey('team_intro', _teamIntroEditDraft);
    if (!ok) throw new Error('Save returned false');
    _teamIntroConfig = JSON.parse(JSON.stringify(_teamIntroEditDraft));
    _teamIntroEditDraft = null;
    showToast('Team Introduction saved.', 'success');
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
