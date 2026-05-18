// ─────────────────────────────────────────────────────────────────────
// agol.js — ArcGIS Online REST API layer
//
// Service URLs, query/applyEdits helpers, field mapping, and feature
// projection (ArcGIS attributes ↔ local objects).
//
// Forward references: agolQuery and agolApplyEdits call ensureAgolToken
// from the auth module, and handleAgolTokenError calls clearAgolToken /
// agolAuthorizeUrl. These resolve at call time (not load time), so this
// file can load before auth as long as nothing here is invoked at the
// top level.
// ─────────────────────────────────────────────────────────────────────

const ARCGIS_CONFIG = {
  portalUrl:        'https://cotgis.maps.arcgis.com',
  clientId:         'H8cR2cAUoy0fVrJF',

  // Three consolidated FeatureServers (v2 — replicated 2026-05-17).
  // Layer indices identical to v1.
  projectsUrl:       'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_portfolio_v2/FeatureServer/0',
  tasksUrl:          'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_portfolio_v2/FeatureServer/1',
  projectNotesUrl:   'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_portfolio_v2/FeatureServer/2',
  projectReviewsUrl: 'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_portfolio_v2/FeatureServer/3',
  statusHistoryUrl:  'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_portfolio_v2/FeatureServer/4',

  teamMembersUrl:    'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_capacity_v2/FeatureServer/0',
  absencesUrl:       'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_capacity_v2/FeatureServer/1',
  timeEntriesUrl:    'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_capacity_v2/FeatureServer/2',
  allocationsUrl:    'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_capacity_v2/FeatureServer/3',

  appConfigUrl:      'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_tracker_admin_v2/FeatureServer/0',
  issuesUrl:         'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_tracker_admin_v2/FeatureServer/1',

  // Public, read-only copy of the slideshow-only project + task fields.
  // Maintained by notebooks/refresh_public_slideshow.ipynb (truncate-and-reload
  // every 15 min). Lets the lobby-display TV/anonymous browsing render without
  // an AGO token. Schema is intentionally narrow — see PROJECT_FIELDS /
  // TASK_FIELDS in that notebook for what is and isn't exposed.
  publicProjectsUrl: 'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_portfolio_public/FeatureServer/0',
  publicTasksUrl:    'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/datateam_portfolio_public/FeatureServer/1',
  publicConfigUrl:   null,
};

// ── Token error handler ────────────────────────────────────────────
// Detects ArcGIS auth-error codes (498/499) and triggers re-login.
function handleAgolTokenError(data) {
  if (data && data.error) {
    const code = data.error.code;
    if (code === 498 || code === 499) {
      clearAgolToken();
      window.location.href = agolAuthorizeUrl();
      return true; // signal that a redirect is happening
    }
  }
  return false;
}

// ── ArcGIS REST API Helpers ──────────────────────────────────────────

/**
 * Query all features from an ArcGIS Feature Service layer.
 * Handles pagination via resultOffset for services with maxRecordCount.
 */
async function agolQuery(serviceUrl, where) {
  if (!where) where = '1=1';
  const token = await ensureAgolToken();
  if (!token) return []; // redirect in progress
  let allFeatures = [];
  let offset = 0;
  let batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      where: where,
      outFields: '*',
      f: 'json',
      token: token,
      resultOffset: String(offset),
      resultRecordCount: String(batchSize),
    });
    const resp = await fetch(serviceUrl + '/query?' + params.toString());
    if (!resp.ok) throw new Error('ArcGIS query failed: ' + resp.status + ' ' + resp.statusText);
    const data = await resp.json();
    if (handleAgolTokenError(data)) return []; // token expired, redirect happening
    if (data.error) throw new Error('ArcGIS query error: ' + (data.error.message || JSON.stringify(data.error)));
    const features = data.features || [];
    allFeatures = allFeatures.concat(features);
    hasMore = features.length >= batchSize && data.exceededTransferLimit !== false;
    offset += features.length;
  }
  return allFeatures;
}

// Query ArcGIS without a token (for read-only public access)
async function agolQueryPublic(serviceUrl, where) {
  if (!where) where = '1=1';
  var allFeatures = [];
  var offset = 0;
  var batchSize = 1000;
  var hasMore = true;
  while (hasMore) {
    var params = new URLSearchParams({
      where: where, outFields: '*', f: 'json',
      resultOffset: String(offset), resultRecordCount: String(batchSize),
    });
    var resp = await fetch(serviceUrl + '/query?' + params.toString());
    if (!resp.ok) throw new Error('Public query failed: ' + resp.status);
    var data = await resp.json();
    if (data.error) throw new Error('Public query error: ' + (data.error.message || JSON.stringify(data.error)));
    var features = data.features || [];
    allFeatures = allFeatures.concat(features);
    hasMore = features.length >= batchSize && data.exceededTransferLimit !== false;
    offset += features.length;
  }
  return allFeatures;
}

// Resolve an ArcGIS Online Item ID to its REST endpoint URL
async function resolveItemId(itemId) {
  if (!itemId) return null;
  var resp = await fetch('https://www.arcgis.com/sharing/rest/content/items/' + itemId + '?f=json');
  if (!resp.ok) throw new Error('Failed to resolve Item ID: ' + itemId);
  var data = await resp.json();
  if (data.error) throw new Error('Item ID error: ' + (data.error.message || JSON.stringify(data.error)));
  if (!data.url) throw new Error('Item ' + itemId + ' has no service URL');
  // Append /0 for the first layer if not already present
  var url = data.url;
  if (!url.match(/\/\d+$/)) url += '/0';
  return url;
}

/**
 * Apply edits (add/update/delete) to an ArcGIS Feature Service layer.
 * @param {string} serviceUrl - The layer URL
 * @param {Object} edits - { adds: [], updates: [], deletes: [] }
 * @returns {Object} The applyEdits response
 */
async function agolApplyEdits(serviceUrl, edits) {
  const token = await ensureAgolToken();
  if (!token) throw new Error('Authentication required');
  const body = new URLSearchParams({ f: 'json', token: token });
  if (edits.adds && edits.adds.length > 0)
    body.append('adds', JSON.stringify(edits.adds));
  if (edits.updates && edits.updates.length > 0)
    body.append('updates', JSON.stringify(edits.updates));
  if (edits.deletes && edits.deletes.length > 0)
    body.append('deletes', JSON.stringify(edits.deletes));

  var serviceName = serviceUrl.split('/services/')[1] || serviceUrl;
  console.log('[ArcGIS] applyEdits →', serviceName, edits);
  var t0 = Date.now();

  const resp = await fetch(serviceUrl + '/applyEdits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  console.log('[ArcGIS] Response in', (Date.now() - t0) + 'ms, status:', resp.status);
  if (!resp.ok) throw new Error('ArcGIS applyEdits failed: ' + resp.status + ' ' + resp.statusText);
  const result = await resp.json();
  console.log('[ArcGIS] Result:', JSON.stringify(result).slice(0, 500));
  if (handleAgolTokenError(result)) throw new Error('Token expired — re-authenticating');
  if (result.error) throw new Error('ArcGIS applyEdits error: ' + (result.error.message || JSON.stringify(result.error)));

  // Check per-record results for failures
  var resultArrays = ['addResults', 'updateResults', 'deleteResults'];
  var failures = [];
  resultArrays.forEach(function(key) {
    if (result[key]) {
      result[key].forEach(function(r) {
        if (r.success === false) {
          var errMsg = r.error ? (r.error.description || r.error.message || JSON.stringify(r.error)) : 'Unknown error';
          failures.push(key + ' OID ' + (r.objectId || '?') + ': ' + errMsg);
        }
      });
    }
  });
  if (failures.length > 0) {
    console.error('[ArcGIS] Per-record failures:', failures);
    throw new Error('ArcGIS save failed: ' + failures[0]);
  }

  return result;
}


// ══════════════════════════════════════════════════════════════════════
//  FIELD MAPPING: ArcGIS Feature Service Fields ↔ Local JS Field Names
//  ─────────────────────────────────────────────────────────────────
//  Projects layer fields (ArcGIS, datateam_portfolio_v2/0):
//    ObjectId, project_number, title, status, priority, contact,
//    other_members, partner_dept, category, start_date, end_date,
//    actual_end, description, problem_statement, itd_team,
//    is_data_program, it_initiative, city_initiative, it_priority_project,
//    dp_goal, wwc_practice, wwc_criteria, data_program_team,
//    leadership_title, leadership_summary, primary_dp_goal, public_visibility
//
//  Tasks layer fields (ArcGIS, datateam_portfolio_v2/1):
//    ObjectId, task_number, project_number, title, status, priority,
//    assignee, category, start_date, due_date, working_due, actual_end,
//    tool, description, hours, hours_worked, resolution
//
//  KEY JOIN: Task.project_number = Project.project_number  (Strings)
//
//  LEGACY ALIASES: the projection functions also expose:
//    Project: local.id     ← project_number   (consumer compat)
//             local.start  ← start_date       (consumer compat)
//             local.end    ← end_date         (consumer compat)
//    Task:    local.project_id ← project_number   (consumer compat)
//             local.idx        ← task_number      (consumer compat)
//             local.start      ← start_date       (consumer compat)
//             local.due        ← due_date         (consumer compat)
//  These exist so consumer code can continue reading the legacy names
//  while it's migrated to the new schema. localToAgolProject /
//  localToAgolTask reverse-translate so writes hit the real fields.
// ══════════════════════════════════════════════════════════════════════

// Maps: localFieldName → ArcGIS field name (only where they differ)
const PROJECT_FIELD_MAP = {
  start: 'start_date',
  end:   'end_date',
};

// Reverse map for projects: ArcGIS field → local field
const PROJECT_AGOL_TO_LOCAL = {
  'start_date': 'start',
  'end_date':   'end',
};

// For tasks, no map — date aliases are added inline in agolTaskToLocal.

// ── Convert ArcGIS feature → local object ──────────────────────────
function agolProjectToLocal(feature) {
  const attrs = feature.attributes || {};
  const local = { objectId: attrs.ObjectId };
  for (const key of Object.keys(attrs)) {
    if (key === 'ObjectId') continue;
    const localKey = PROJECT_AGOL_TO_LOCAL[key] || key;
    local[localKey] = attrs[key];
  }
  // Legacy alias: many consumers read p.id; new schema uses
  // project_number as the canonical PK (String). Will be removed once
  // consumer code migrates to p.project_number.
  if (local.project_number != null) local.id = local.project_number;
  // Legacy alias for the org-rename: consumer code still reads p.itd_team
  // even though the AGO storage column has been renamed to owning_unit.
  // Remove this once consumers migrate to p.owning_unit (and AGO drops
  // itd_team in Phase 4 of the rename).
  if (local.owning_unit != null) local.itd_team = local.owning_unit;
  // Normalize boolean fields from ArcGIS Short Integer (0/1) to JS truthy.
  // Data Program status is derived: true if data_program_team is set
  // (the explicit way), OR if any Data Program Goal is set on a DI
  // project (the legacy way, preserved for projects created before the
  // data_program_team field existed).
  var hasTeam = local.data_program_team && local.data_program_team.trim().length > 0;
  var hasGoal = local.dp_goal && local.dp_goal.trim().length > 0 && local.dp_goal.trim() !== 'None';
  local.is_data_program = (hasTeam || hasGoal) ? 1 : 0;
  return local;
}

function agolTaskToLocal(feature) {
  const attrs = feature.attributes || {};
  const local = { objectId: attrs.ObjectId };
  for (const key of Object.keys(attrs)) {
    if (key === 'ObjectId') continue;
    local[key] = attrs[key];
  }
  // Legacy aliases (see agolProjectToLocal). Consumers read t.project_id,
  // t.idx, t.start, t.due; new schema uses project_number, task_number,
  // start_date, due_date.
  if (local.project_number != null) local.project_id = local.project_number;
  if (local.task_number    != null) local.idx        = local.task_number;
  if (local.start_date     != null) local.start      = local.start_date;
  if (local.due_date       != null) local.due        = local.due_date;
  // Ensure hours_worked is numeric (this is the primary hours field for calculations)
  local.hours_worked = parseFloat(local.hours_worked) || 0;
  return local;
}

// ── Convert local fields → ArcGIS attributes for create/update ──────
function localToAgolProject(fields) {
  const attrs = {};
  for (const key of Object.keys(fields)) {
    const val = fields[key];
    // Skip transient/local-only/alias-only keys that have no schema field.
    if (key === 'objectId' || key === 'pid' || key === 'id' || val === undefined) continue;
    // Org-rename: form code still writes fields.itd_team; reroute to the
    // new owning_unit column on AGO. Remove once form code uses owning_unit
    // directly and itd_team is dropped from AGO in Phase 4 of the rename.
    if (key === 'itd_team') { attrs.owning_unit = val; continue; }
    const agolKey = PROJECT_FIELD_MAP[key] || key;
    attrs[agolKey] = val;
  }
  return attrs;
}

function localToAgolTask(fields) {
  const attrs = {};
  for (const key of Object.keys(fields)) {
    const val = fields[key];
    if (key === 'objectId' || val === undefined) continue;
    // Translate legacy alias keys back to real schema field names.
    if (key === 'project_id') { attrs.project_number = val; continue; }
    if (key === 'idx')        { attrs.task_number    = val; continue; }
    if (key === 'start')      { attrs.start_date     = val; continue; }
    if (key === 'due')        { attrs.due_date       = val; continue; }
    if (key === 'id')         continue;  // alias-only on projects, but skip if ever passed
    attrs[key] = val;
  }
  return attrs;
}
