// ─────────────────────────────────────────────────────────────────────
// project-notes.js — append-only project journal entries
//
// Mirrors the PROJECT_REVIEWS pattern: a separate AGO hosted table keyed
// by project_number. Notes are timestamped, append-only (no edit/delete
// surface in the UI), and rendered as a newest-first timeline on the
// Project Detail page.
//
// AGO table fields: OBJECTID, note_id, project_number, note_text,
// created_by, created_at (epoch ms via Date field).
// ─────────────────────────────────────────────────────────────────────

let PROJECT_NOTES = [];
let _projectNotesLoaded = false;

async function loadProjectNotes() {
  if (!Auth.loggedIn) return;
  try {
    const features = await agolQuery(ARCGIS_CONFIG.projectNotesUrl);
    PROJECT_NOTES = features.map(function(f) {
      const a = f.attributes || {};
      return {
        objectId: a.OBJECTID || a.ObjectId || a.objectid,
        note_id: a.note_id,
        project_number: a.project_number,
        note_text: a.note_text || '',
        created_by: a.created_by || a.Creator || '',
        created_at: a.created_at || a.CreationDate
      };
    });
    _projectNotesLoaded = true;
    console.log('[Notes] Loaded', PROJECT_NOTES.length, 'project note entries.');
  } catch (e) {
    console.warn('[Notes] Failed to load project notes:', e);
    PROJECT_NOTES = [];
  }
}

function getNotesForProject(projectNumber) {
  return PROJECT_NOTES
    .filter(function(n) { return n.project_number === projectNumber; })
    .sort(function(a, b) { return (b.created_at || 0) - (a.created_at || 0); });
}

function _newNoteId() {
  // RFC 4122-ish v4 UUID using crypto.randomUUID when available, else fallback.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function addProjectNote(projectNumber, noteText) {
  if (!Auth.loggedIn) { showToast('Sign in to add a note.', 'warn'); return; }
  var text = (noteText || '').trim();
  if (!text) return;
  var newId = _newNoteId();
  var nowEpoch = Date.now();
  // Creator/CreationDate auto-populated by AGO via editor tracking.
  var attrs = {
    note_id: newId,
    project_number: projectNumber,
    note_text: text.slice(0, 4000),
  };
  try {
    var result = await agolApplyEdits(ARCGIS_CONFIG.projectNotesUrl, {
      adds: [{ attributes: attrs }]
    });
    var newOid = result && result.addResults && result.addResults[0] && result.addResults[0].objectId;
    PROJECT_NOTES.push({
      objectId: newOid,
      note_id: newId,
      project_number: projectNumber,
      note_text: attrs.note_text,
      created_by: Auth.fullName || Auth.username || 'Unknown',
      created_at: nowEpoch
    });
    showToast('Note added.', 'success');
    // Re-render the detail page so the new entry appears immediately.
    if (typeof render === 'function') render();
  } catch (e) {
    console.error('[Notes] Failed to add note:', e);
    showToast('Failed to save note: ' + (e.message || e), 'error');
  }
}

// Renders the Project Journal section for the detail page.
// Returns an HTML string; callers should wrap it inside `.detail-section`-style
// containers consistent with the rest of the detail page.
function renderProjectJournalSection(p) {
  if (!p || !p.project_number) return '';
  var notes = getNotesForProject(p.project_number);
  var pn = String(p.project_number).replace(/'/g, "\\'");

  var html = '<div class="detail-section">';
  html += '<div class="detail-section-label">Project Journal</div>';

  // Composer: textarea + Add button. Only shown to signed-in users.
  if (Auth.loggedIn) {
    var taId = 'pj-input-' + p.objectId;
    html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">';
    html += '<textarea id="' + taId + '" placeholder="Add a journal entry — observations, blockers, decisions, anything that doesn\'t belong in the description." rows="3" style="width:100%;font-size:14px;padding:10px 12px;border:1.5px solid #E8E6DF;border-radius:8px;font-family:Lato,sans-serif;resize:vertical;box-sizing:border-box;"></textarea>';
    html += '<div style="display:flex;justify-content:flex-end;">';
    html += '<button onclick="var ta=document.getElementById(\'' + taId + '\');addProjectNote(\'' + pn + '\',ta.value);ta.value=\'\';" class="btn-navy-md">＋ Add Note</button>';
    html += '</div>';
    html += '</div>';
  }

  if (!notes.length) {
    html += '<div style="font-size:13px;color:var(--text-muted);font-style:italic;padding:8px 0;">No journal entries yet.</div>';
    html += '</div>';
    return html;
  }

  html += '<div style="border-left:2px solid #E8E6DF;padding-left:16px;margin-left:8px;">';
  notes.forEach(function(n) {
    var dateLabel = '';
    if (n.created_at) {
      var d = new Date(n.created_at);
      dateLabel = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) +
                  ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    html += '<div style="margin-bottom:14px;position:relative;">';
    html += '<div style="position:absolute;left:-23px;top:4px;width:10px;height:10px;border-radius:50%;background:#0088FF;border:2px solid #fff;"></div>';
    html += '<div style="font-size:12px;color:var(--text-muted);">' + esc(dateLabel) + ' · ' + esc(n.created_by || 'Unknown') + '</div>';
    html += '<div style="font-size:14px;margin-top:3px;color:var(--text-body);white-space:pre-wrap;">' + esc(n.note_text) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '</div>';
  return html;
}
