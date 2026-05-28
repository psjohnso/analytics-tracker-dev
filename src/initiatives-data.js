// ─────────────────────────────────────────────────────────────────────
// initiatives-data.js — loads + maintains the INITIATIVES list
//
// Owns: INITIATIVES global, INITIATIVES_BY_ID lookup, loadInitiatives(),
// lookup helpers (getInitiative, getProjectsForInitiative, deriveInitiativeStatus).
//
// Forward references: ARCGIS_CONFIG, agolQuery, agolApplyEdits, PROJECTS,
// epochToDateStr.
// ─────────────────────────────────────────────────────────────────────

// Global: list of initiatives, sorted by name. Empty array when the AGOL
// layer isn't configured yet — every consumer feature-detects, so the rest
// of the app keeps working until the layer is added.
var INITIATIVES = [];
// Lookup map: initiative_id (slug) → initiative object. Built alongside the
// list so per-project FK resolution is O(1).
var INITIATIVES_BY_ID = {};

async function loadInitiatives() {
  INITIATIVES = [];
  INITIATIVES_BY_ID = {};
  if (typeof ARCGIS_CONFIG === 'undefined' || !ARCGIS_CONFIG.initiativesUrl) {
    console.log('[Initiatives] No initiativesUrl configured — skipping load.');
    return;
  }
  try {
    const features = await agolQuery(ARCGIS_CONFIG.initiativesUrl);
    INITIATIVES = features.map(function(f) {
      const a = f.attributes;
      return {
        objectId: a.OBJECTID || a.ObjectId || a.objectid,
        initiative_id: a.initiative_id || '',
        name: a.name || '',
        description: a.description || '',
        owner: a.owner || '',
        status: a.status || 'Planning',
        target_start: epochToDateStr(a.target_start),
        target_completion: epochToDateStr(a.target_completion),
        strategic_alignment: a.strategic_alignment || '',
      };
    }).sort(function(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    INITIATIVES.forEach(function(i) { if (i.initiative_id) INITIATIVES_BY_ID[i.initiative_id] = i; });
    console.log('[Initiatives] Loaded', INITIATIVES.length, 'initiatives');
  } catch (err) {
    console.warn('[Initiatives] Load failed; continuing without:', err);
    INITIATIVES = [];
    INITIATIVES_BY_ID = {};
  }
}

// Returns the initiative object for a given id, or null.
function getInitiative(initiativeId) {
  if (!initiativeId) return null;
  return INITIATIVES_BY_ID[String(initiativeId)] || null;
}

// All projects attached to a given initiative, sorted by initiative_sequence
// (ascending; nulls last for projects that haven't been ordered yet).
function getProjectsForInitiative(initiativeId) {
  if (!initiativeId || typeof PROJECTS === 'undefined') return [];
  const id = String(initiativeId);
  return PROJECTS
    .filter(function(p) { return p.initiative_id != null && String(p.initiative_id) === id; })
    .sort(function(a, b) {
      const aa = a.initiative_sequence == null ? Number.POSITIVE_INFINITY : a.initiative_sequence;
      const bb = b.initiative_sequence == null ? Number.POSITIVE_INFINITY : b.initiative_sequence;
      if (aa === bb) return String(a.title || '').localeCompare(String(b.title || ''));
      return aa - bb;
    });
}

// Derive the initiative's effective status from its child projects when the
// stored status is Active/Planning (the "computed" path). On Hold / Complete /
// Canceled are admin-set overrides and pass through unchanged. Useful for the
// list-card "is this thing actually rolling?" signal — never replaces the
// stored value.
function deriveInitiativeStatus(initiative) {
  if (!initiative) return null;
  const stored = initiative.status || 'Planning';
  if (stored === 'On Hold' || stored === 'Canceled' || stored === 'Complete') return stored;
  const projects = getProjectsForInitiative(initiative.initiative_id);
  if (!projects.length) return stored; // empty initiative → trust stored
  const all = projects.length;
  const complete = projects.filter(function(p) { return p.status === 'Complete'; }).length;
  if (complete === all) return 'Complete'; // every child done → roll up to Complete
  const anyActive = projects.some(function(p) { return p.status === 'Active' || p.status === 'On Hold' || p.status === 'Waiting for Response'; });
  return anyActive ? 'Active' : stored;
}

// Cheap progress fraction (0..1) — share of child projects in a "done" state.
function initiativeProgress(initiative) {
  if (!initiative) return 0;
  const projects = getProjectsForInitiative(initiative.initiative_id);
  if (!projects.length) return 0;
  const done = projects.filter(function(p) { return p.status === 'Complete'; }).length;
  return done / projects.length;
}

// Generate a slug for a brand-new initiative. Lowercases name, strips
// non-alphanumerics, truncates, and appends a 4-char base36 suffix to dodge
// collisions when two initiatives share leading words.
function makeInitiativeSlug(name) {
  const base = String(name || 'initiative').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const suffix = Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0');
  return (base || 'initiative') + '-' + suffix;
}
