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
  projectsUrl:      'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/projects/FeatureServer/0',
  tasksUrl:         'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/tasks/FeatureServer/0',
  teamMembersUrl:   'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/team_members/FeatureServer/0',
  absencesUrl:      'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/absences/FeatureServer/0',
  allocationsUrl:   'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/allocations/FeatureServer/0',
  weeklyCapacityUrl:'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/weekly_capacity/FeatureServer/0',
  appConfigUrl:     'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/app_config/FeatureServer/0',
  timeEntriesUrl:   'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/time_series/FeatureServer/0',
  statusHistoryUrl: 'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/status_history/FeatureServer/0',
  issuesUrl:        'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/issues/FeatureServer/0',
  projectReviewsUrl:'https://services3.arcgis.com/9coHY2fvuFjG9HQX/ArcGIS/rest/services/Project_Reviews/FeatureServer/0',
  // Public views — ArcGIS Online Item IDs for read-only feature layer views.
  // Create views in ArcGIS Online: Content → source layer → Manage → Create View Layer.
  // Share the views publicly or org-wide. Find the Item ID in the URL bar of the item page.
  // Leave empty to disable read-only public access.
  publicProjectsItemId: '8d28b20af78d4e01bffbac8abd9dd8ed',
  publicTasksItemId:    '1b24f6c11021452e938747ff18cd5340',
  publicConfigItemId:   '693882a97ea84c92ad2b41f7d35fa529',
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
//  Projects layer fields (ArcGIS):
//    ObjectId, id, pid, title, status, priority, contact,
//    other_members, partner_dept, category, start, end_ (alias: end),
//    actual_end, description, problem_statement, itd_team, project_number,
//    is_data_program, it_initiative, city_initiative, it_priority_project,
//    dp_goal, wwc_practice, wwc_criteria
//
//  Tasks layer fields (ArcGIS):
//    ObjectId, idx, id, title, status, priority, assignee,
//    project_id, project, category, start, due,
//    actual_end, tool, description, hours, Hours_Worked, resolution, task_number
//
//  KEY JOIN: Task.project_id = Project.id
//
//  NOTE: ArcGIS fields are nearly 1:1 with local field names.
//        The only difference is the project date field 'end_' in
//        ArcGIS maps to 'end' locally (since 'end' is a reserved word).
//        DateOnly fields are returned as string values (YYYY-MM-DD).
// ══════════════════════════════════════════════════════════════════════

// Maps: localFieldName → ArcGIS field name (only where they differ)
const PROJECT_FIELD_MAP = {
  end: 'end_',  // 'end' is reserved; ArcGIS stores it as 'end_'
};

// Reverse map for projects: ArcGIS field → local field
const PROJECT_AGOL_TO_LOCAL = { 'end_': 'end' };

// For tasks, all field names are identical — no mapping needed.

// ── Convert ArcGIS feature → local object ──────────────────────────
function agolProjectToLocal(feature) {
  const attrs = feature.attributes || {};
  const local = { objectId: attrs.ObjectId };
  for (const key of Object.keys(attrs)) {
    if (key === 'ObjectId') continue;
    const localKey = PROJECT_AGOL_TO_LOCAL[key] || key;
    local[localKey] = attrs[key];
  }
  // Generate pid if missing
  if (!local.pid) {
    local.pid = (local.title || '').replace(/\s+/g, '').slice(0, 40) + local.id;
  }
  // Normalize boolean fields from ArcGIS Short Integer (0/1) to JS truthy
  // Data Program status is derived: true if any Data Program Goal is set
  local.is_data_program = (local.dp_goal && local.dp_goal.trim().length > 0 && local.dp_goal.trim() !== 'None') ? 1 : 0;
  return local;
}

function agolTaskToLocal(feature) {
  const attrs = feature.attributes || {};
  const local = { objectId: attrs.ObjectId };
  for (const key of Object.keys(attrs)) {
    if (key === 'ObjectId') continue;
    local[key] = attrs[key];
  }
  // Ensure Hours_Worked is numeric (this is the primary hours field for calculations)
  local.Hours_Worked = parseFloat(local.Hours_Worked) || 0;
  return local;
}

// ── Convert local fields → ArcGIS attributes for create/update ──────
function localToAgolProject(fields) {
  const attrs = {};
  for (const key of Object.keys(fields)) {
    const val = fields[key];
    if (key === 'objectId' || key === 'pid' || val === undefined) continue;
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
    attrs[key] = val;
  }
  return attrs;
}
