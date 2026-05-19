// ─────────────────────────────────────────────────────────────────────
// modals/alloc-editor.js — Allocation editor modal
//
// Owns: AE_COLS (visible week columns) and aeProjectDates state, the
// open/close/navigate flow, the grid renderer with role grouping,
// per-cell change handlers, role change re-grouping, the auto-fill-by-
// defaults helper, totals refresh, the apply-changes diff/save logic,
// and the dirty/saved/synced UI marker helpers.
//
// Forward references: Auth, Editor, RESOURCES_DATA, _allocationDefaults,
// _productivityRatio, agolApplyEdits, ARCGIS_CONFIG, showToast, esc,
// render, openProject, computeCapacityAndAllocations, generateWeeks,
// PROJECTS, TASKS.
// Backward references: STATUS_COLOR, PROJECT_COLORS.
// ─────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════
//  ALLOCATION EDITOR
// ══════════════════════════════════════════════════════════════════════
let AE_COLS     = 6;    // weeks visible in modal mode
const AE_COLS_FP = 8;   // weeks visible in full-page mode (wider canvas)
let aeProjectDates = {}; // { projTitle: { start, end } } — date ranges for highlighting

// Returns the number of week columns to render for the current mode.
function _aeCols() {
  return Editor.fullPageEditPerson ? AE_COLS_FP : AE_COLS;
}

// Looks up a DOM element by suffix, preferring the full-page version
// (`ae-fp-<suffix>`) when the editor is in full-page mode, otherwise
// the modal version (`ae-<suffix>`). Lets aeRenderGrid stay agnostic.
function _aeT(suffix) {
  if (Editor.fullPageEditPerson) {
    var fp = document.getElementById('ae-fp-' + suffix);
    if (fp) return fp;
  }
  return document.getElementById('ae-' + suffix);
}

function openAllocEditor(name) {
  Editor.person = name;
  const p = RESOURCES_DATA.people[name];
  if (!Editor.aeListenerAdded) {
    document.getElementById('alloc-editor-backdrop').addEventListener('click', function(e) {
      if (e.target === this) closeAllocEditor();
    });
    // Sync horizontal scroll between grid and totals bar
    var gridWrap = document.querySelector('.ae-grid-wrap');
    var totalsBar = document.getElementById('ae-totals-bar');
    if (gridWrap && totalsBar) {
      gridWrap.addEventListener('scroll', function() { totalsBar.scrollLeft = gridWrap.scrollLeft; });
      totalsBar.addEventListener('scroll', function() { gridWrap.scrollLeft = totalsBar.scrollLeft; });
    }
    Editor.aeListenerAdded = true;
  }

  // Build a single editable allocation set per person, regardless of current
  // project status. The render step filters by visible-window overlap, so a
  // closed project's past-week edits are accessible when the user navigates
  // back to those weeks, but a closed project doesn't clutter the view when
  // the user is looking at weeks outside its active span.
  const projTitleSet2 = new Set(PROJECTS.map(proj => proj.title));
  function canonicalAllocTitle2(raw) {
    if (projTitleSet2.has(raw)) return raw;
    const stripped = raw.replace(/\s*-\s*[A-Z][A-Za-z .]+$/, '').trim();
    return projTitleSet2.has(stripped) ? stripped : raw;
  }
  const byName = {};
  p.allocations.forEach(function(a) {
    const key = canonicalAllocTitle2(a.project);
    const proj = PROJECTS.find(function(px) { return px.title === key; });
    const currentStatus = proj ? proj.status : a.status;
    if (currentStatus === 'Idea') return; // hypothetical; don't clutter editing
    if (!byName[key]) {
      var existingRole = a.role || '';
      if (!existingRole && proj) {
        existingRole = proj.contact === name ? 'Lead' : 'Contributor';
      }
      byName[key] = { project: key, status: currentStatus, fracs: [...a.fracs], role: existingRole };
    } else {
      // Merge duplicate / person-split rows
      a.fracs.forEach((f, i) => { byName[key].fracs[i] = (byName[key].fracs[i] || 0) + f; });
    }
  });
  // Inject empty rows for forward-state projects (Active / On Hold / Waiting /
  // Scheduled) where this person is contact or other_members but has no
  // allocation yet. Complete and Canceled projects don't get empty injection —
  // if there's no existing allocation, there's nothing to reflect on.
  const N2 = RESOURCES_DATA.weeks.length;
  const aeForwardStates = { 'Active': 1, 'On Hold': 1, 'Waiting': 1, 'Scheduled': 1 };
  PROJECTS.forEach(function(proj) {
    if (!aeForwardStates[proj.status]) return;
    if (byName[proj.title]) return;
    const members = (proj.other_members || '').split(',').map(s => s.trim()).filter(Boolean);
    if (proj.contact !== name && !members.includes(name)) return;
    var inferredRole = proj.contact === name ? 'Lead' : 'Contributor';
    byName[proj.title] = { project: proj.title, status: proj.status, fracs: new Array(N2).fill(0), role: inferredRole };
  });
  // Alphabetical by project title — render then groups into Leading / Contributing.
  Editor.draft[name] = Object.values(byName).sort(function(a, b) {
    return a.project.localeCompare(b.project);
  });
  // Editor.closedAllocs is no longer maintained — the render step filters by
  // window-overlap. Clean up any stale state from previous-version opens.
  if (Editor.closedAllocs && Editor.closedAllocs[name]) {
    delete Editor.closedAllocs[name];
  }

  document.getElementById('editor-person-title').textContent = name;
  document.getElementById('editor-person-role').textContent =
    p.role + '  ·  ' + Math.round(p.proj_pct * 100) + '% project-available';

  Editor.aeWindowStart = Math.max(0, window.currentWeekIdx - 1);

  // Build project date map for range highlighting
  aeProjectDates = {};
  PROJECTS.forEach(function(proj) {
    aeProjectDates[proj.title] = { start: proj.start || null, end: proj.actual_end || proj.working_due || proj.end || null };
  });

  // In full-page mode, skip the modal render+open. aeEnterFullPage will
  // call render() which dispatches to aeRenderFullPage; that injects the
  // page HTML and re-invokes aeRenderGrid against the full-page DOM.
  if (!Editor.fullPageEditPerson) {
    aeRenderGrid();
    document.getElementById('alloc-editor-backdrop').classList.add('open');
  }
}

function closeAllocEditor() {
  document.getElementById('alloc-editor-backdrop').classList.remove('open');
  // If the editor was running in the Resources pane's edit mode (Option 3
  // rail+pane layout) or the older full-page route, clear both flags so
  // the next render() returns to the Summary view cleanly. Apply -> save
  // -> back to summary is the natural flow after a successful commit.
  if (Editor.fullPageEditPerson || Editor.resourceMode === 'edit') {
    Editor.fullPageEditPerson = null;
    Editor.person = null;
    Editor.resourceMode = 'summary';
  }
}

// ── Full-page allocation editor ──────────────────────────────────────
// Replaces the modal with a full-width page rendered into #content-area.
// Entry from the Resources "Edit Allocations" button via aeEnterFullPage.
// Exit via Cancel button (aeExitFullPage) or Apply (applyEditorChanges,
// which calls closeAllocEditor internally — clears the fullpage flag).

// Kept for backward compatibility — any caller can still ask for the
// full-page editor and it will route through the new Option 3 rail+pane
// layout in the Resources tab. The two functions just delegate to
// setResourceMode now.
function aeEnterFullPage(name) {
  if (typeof selectedPerson !== 'undefined') {
    selectedPerson = name;
  }
  if (typeof setResourceMode === 'function') {
    setResourceMode('edit');
  } else {
    // Fallback path if resources.js hasn't loaded yet (shouldn't happen in
    // practice — the button that triggers this lives inside Resources).
    Editor.fullPageEditPerson = name;
    Editor.person = name;
    openAllocEditor(name);
    if (typeof render === 'function') render();
  }
}

function aeExitFullPage() {
  if (typeof setResourceMode === 'function') {
    setResourceMode('summary');
  } else {
    Editor.fullPageEditPerson = null;
    Editor.person = null;
    if (typeof render === 'function') render();
  }
}

function aeRenderFullPage(area) {
  const name = Editor.fullPageEditPerson;
  const p = (typeof RESOURCES_DATA !== 'undefined' && RESOURCES_DATA.people) ? RESOURCES_DATA.people[name] : null;
  if (!p) {
    area.innerHTML = '<div style="padding:32px;color:var(--text-muted);font-size:13px;">Person not found: ' + esc(name || '(unknown)') + '. <a href="#" onclick="aeExitFullPage();return false;">Back to Resources</a></div>';
    return;
  }

  const curIdx   = window.currentWeekIdx || 0;
  const curCap   = (p.proj_cap         || [])[curIdx] || 0;
  const curAlloc = (p.weekly_allocated || [])[curIdx] || 0;
  const curUtil  = (p.utilization      || [])[curIdx] || 0;
  const ytdHours = (p.weekly_allocated || []).slice(0, curIdx + 1).reduce(function(s, v) { return s + (v || 0); }, 0);
  const role      = p.role || '';
  const team      = p.team || '';
  const projPctStr = Math.round((p.proj_pct || 0) * 100) + '%';

  area.innerHTML =
    '<div class="ae-fp-page">' +
      '<div class="ae-fp-subhdr">' +
        '<div class="ae-fp-crumb">' +
          '<a onclick="aeExitFullPage()">Resources</a>' +
          '<span class="sep">›</span>' +
          '<span class="here">Edit Allocations · ' + esc(name) + '</span>' +
        '</div>' +
        '<div class="ae-fp-actions">' +
          '<button class="ae-fp-btn ae-fp-btn-ghost" onclick="aeExitFullPage()">Cancel</button>' +
          '<button class="ae-fp-btn ae-fp-btn-primary" onclick="applyEditorChanges()">✓ Apply changes</button>' +
        '</div>' +
      '</div>' +
      '<div class="ae-fp-body">' +
        '<aside class="ae-fp-sidebar">' +
          '<div class="ae-fp-person-name">' + esc(name) + '</div>' +
          '<div class="ae-fp-person-sub">' + esc(team) + (role ? ' · ' + esc(role) : '') + ' · ' + projPctStr + ' project-available</div>' +
          '<h3>Current week</h3>' +
          '<div class="ae-fp-cap-row"><span>Project capacity</span><span>' + (Math.round(curCap * 10) / 10) + 'h</span></div>' +
          '<div class="ae-fp-cap-row"><span>Allocated</span><span>' + (Math.round(curAlloc * 10) / 10) + 'h</span></div>' +
          '<div class="ae-fp-cap-row"><span>Utilization</span><span>' + Math.round(curUtil * 100) + '%</span></div>' +
          '<h3>Year to date</h3>' +
          '<div class="ae-fp-cap-row"><span>Hours allocated</span><span>' + Math.round(ytdHours) + 'h</span></div>' +
          '<div class="ae-fp-legend">' +
            '<strong>Legend</strong><br>' +
            '▶ project start · ■ effective end<br>' +
            '<span class="ae-fp-leg-out"></span> outside active span<br>' +
            '<span class="ae-fp-leg-cur"></span> current week' +
          '</div>' +
        '</aside>' +
        '<div class="ae-fp-main">' +
          '<div class="ae-fp-nav">' +
            '<button class="ae-nav-btn" id="ae-fp-prev-btn" onclick="aeShift(-1)">◀ Prev</button>' +
            '<div class="ae-fp-nav-mid">' +
              '<div class="ae-fp-nav-label" id="ae-fp-range-label">—</div>' +
              '<div class="ae-fp-nav-sub" id="ae-fp-range-sub">—</div>' +
            '</div>' +
            '<div class="ae-fp-nav-right">' +
              '<button class="ae-jump-today" onclick="aeJumpCurrent()">Jump to Current Week</button>' +
              '<button class="ae-nav-btn" id="ae-fp-next-btn" onclick="aeShift(1)">Next ▶</button>' +
            '</div>' +
          '</div>' +
          '<div class="ae-fp-grid-wrap">' +
            '<table class="ae-grid" id="ae-fp-grid-table">' +
              '<thead id="ae-fp-thead"></thead>' +
              '<tbody id="ae-fp-tbody"></tbody>' +
              '<tfoot id="ae-fp-tfoot"></tfoot>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  aeRenderGrid();
}

function openProjectFromAlloc(el) {
  const projTitle = el.getAttribute('data-project');
  if (!projTitle) return;
  const proj = PROJECTS.find(function(p) { return p.title === projTitle; });
  if (!proj) { showToast('Project not found: ' + projTitle, 'error'); return; }
  closeAllocEditor();
  openProject(proj.objectId);
}
// backdrop click-to-close registered after DOM is ready (see bootstrap section)

function aeShift(dir) {
  const weeks = RESOURCES_DATA.weeks;
  Editor.aeWindowStart = Math.max(0, Math.min(Editor.aeWindowStart + dir, weeks.length - _aeCols()));
  aeRenderGrid();
}

function aeJumpCurrent() {
  Editor.aeWindowStart = Math.max(0, window.currentWeekIdx - 1);
  aeRenderGrid();
}

function aeMonLabel(wi) {
  const d = new Date(RESOURCES_DATA.weeks[wi] + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

var aeContribCollapsed = false;

function aeToggleContrib() {
  aeContribCollapsed = !aeContribCollapsed;
  aeRenderGrid();
}

function aeRenderGrid() {
  const weeks  = RESOURCES_DATA.weeks;
  const allocs = Editor.draft[Editor.person];
  const personRec = RESOURCES_DATA.people[Editor.person] || {};
  const projCap = personRec.proj_cap || [];
  const cols = _aeCols();
  const wEnd   = Math.min(Editor.aeWindowStart + cols, weeks.length);
  const wIdxs  = [];
  for (let i = Editor.aeWindowStart; i < wEnd; i++) wIdxs.push(i);

  const startLabel = aeMonLabel(wIdxs[0]);
  const endLabel   = aeMonLabel(wIdxs[wIdxs.length - 1]);
  var _aeRL = _aeT('range-label');     if (_aeRL) _aeRL.textContent = startLabel + ' — ' + endLabel;
  var _aeRS = _aeT('range-sub');       if (_aeRS) _aeRS.textContent = 'W' + (wIdxs[0]+1) + ' – W' + (wIdxs[wIdxs.length-1]+1);
  var _aePB = _aeT('prev-btn');        if (_aePB) _aePB.disabled = Editor.aeWindowStart === 0;
  var _aeNB = _aeT('next-btn');        if (_aeNB) _aeNB.disabled = wEnd >= weeks.length;

  // Header
  let thead = '<tr>';
  thead += '<th class="ae-proj-th">Project</th>';
  for (const wi of wIdxs) {
    const isCur = wi === window.currentWeekIdx;
    thead += '<th class="ae-wk-th' + (isCur ? ' ae-cur' : '') + '">' +
      aeMonLabel(wi) + '<br><span style="font-size:9px;opacity:.7;">W' + (wi+1) + '</span></th>';
  }
  thead += '</tr>';
  _aeT('thead').innerHTML = thead;

  // Project rows
  let tbody = '';

  // Hours summary row — shows project-available capacity per week and any
  // vacation/leave hours taken. Sits between the date header and Leading so
  // the user has the denominators in view while editing the % allocations.
  tbody += '<tr class="ae-hours-row"><td class="ae-proj-td ae-hours-label">' +
    '<span class="ae-hours-cap-lbl">Available hrs</span>' +
    '<span class="ae-hours-leave-lbl">Vacation / leave</span>' +
    '</td>';
  for (let ci = 0; ci < wIdxs.length; ci++) {
    const wi = wIdxs[ci];
    const isCur = wi === window.currentWeekIdx;
    const cap = projCap[wi] || 0;
    const lv  = (personRec.absences && personRec.absences[wi]) || 0;
    const capStr = (Math.round(cap * 10) / 10) + 'h';
    const lvStr  = lv > 0 ? (Math.round(lv * 10) / 10) + 'h' : '—';
    tbody += '<td class="ae-wk-td ae-hours-cell' + (isCur ? ' ae-cur' : '') + '">' +
      '<div class="ae-hours-cap">' + capStr + '</div>' +
      '<div class="ae-hours-leave' + (lv > 0 ? ' has-leave' : '') + '">' + lvStr + '</div>' +
      '</td>';
  }
  tbody += '</tr>';

  // ── Window-overlap filter ─────────────────────────────────────────
  // Show a project's row only if its active span [start, effective_end]
  // overlaps the visible week window, OR the person has a non-zero
  // allocation on it within the visible weeks (insurance against missing
  // date metadata). End date = actual_end / working_due / end_date, in
  // that priority — already baked into aeProjectDates.
  const winStartDate = weeks[wIdxs[0]];
  const _aeLastWkDt = new Date(weeks[wIdxs[wIdxs.length - 1]] + 'T12:00:00');
  _aeLastWkDt.setDate(_aeLastWkDt.getDate() + 6);
  const winEndDate = _aeLastWkDt.toISOString().slice(0, 10);
  function _aeInWindow(a) {
    // (b) any non-zero allocation in visible weeks — always include
    for (var i = 0; i < wIdxs.length; i++) {
      if ((a.fracs[wIdxs[i]] || 0) > 0) return true;
    }
    // (a) project active span overlaps the visible window
    const dates = aeProjectDates[a.project] || {};
    const pStart = dates.start || '';
    const pEnd   = dates.end   || '';
    if (!pStart && !pEnd) {
      // No date metadata: only show if status is forward-looking so an
      // empty row for an active project doesn't disappear.
      return a.status === 'Active' || a.status === 'On Hold' ||
             a.status === 'Waiting' || a.status === 'Scheduled';
    }
    if (pStart && winEndDate   < pStart) return false; // project starts after window ends
    if (pEnd   && winStartDate > pEnd)   return false; // project ended before window starts
    return true;
  }
  // _origIdx must reference position in the full draft array (cell change
  // handlers use it to look up Editor.draft[person][ai].fracs). Set BEFORE
  // filtering so the indices stay correct for hidden rows too.
  allocs.forEach(function(a, ai) { a._origIdx = ai; });
  const visibleAllocs = allocs.filter(_aeInWindow);

  if (!visibleAllocs.length) {
    var emptyMsg = allocs.length === 0
      ? 'No project allocations for this person.'
      : 'No projects with activity in this window. Use ◀ Prev / Next ▶ to navigate to weeks where this person had work.';
    tbody += '<tr><td colspan="' + (cols + 1) + '" style="text-align:center;color:var(--text-muted);padding:40px;font-size:13px;">' + emptyMsg + '</td></tr>';
    _aeT('tbody').innerHTML = tbody;
    var _aeTFE = _aeT('tfoot'); if (_aeTFE) _aeTFE.innerHTML = '';
    var _aeTBE = _aeT('totals-bar'); if (_aeTBE) _aeTBE.style.display = 'none';
    return;
  }

  const numRows = visibleAllocs.length;

  // Split VISIBLE allocs into Lead vs Contributing groups. _origIdx was
  // already set above (against the full draft array) so cell-change handlers
  // resolve correctly even though we're iterating the filtered subset here.
  const leadAllocs = [];
  const contribAllocs = [];
  visibleAllocs.forEach(function(a) {
    if (a.role === 'Lead') leadAllocs.push(a);
    else contribAllocs.push(a);
  });

  function renderAllocRow(a) {
    const ai = a._origIdx;
    const statusCol = STATUS_COLOR(a.status) || '#9CA3AF';
    const chipBg = statusCol + '22';
    const dates  = aeProjectDates[a.project] || {};
    const pStart = dates.start || null;
    const pEnd   = dates.end   || null;

    let row = '<tr><td class="ae-proj-td">' +
      '<span class="ae-proj-name ae-proj-link" onclick="openProjectFromAlloc(this)" data-project="' + esc(a.project) + '" title="View project details">' + esc(a.project) + '</span>' +
      '<span class="ae-proj-status" style="color:' + statusCol + ';background:' + chipBg + ';">' + esc(a.status) + '</span>' +
      '<select class="ae-role-select" data-ai="' + ai + '" onchange="aeRoleChange(' + ai + ',this.value)" title="Role on this project">' +
        '<option value=""' + (!a.role ? ' selected' : '') + '>Role…</option>' +
        '<option value="Lead"' + (a.role === 'Lead' ? ' selected' : '') + '>Lead</option>' +
        '<option value="Contributor"' + (a.role === 'Contributor' ? ' selected' : '') + '>Contributor</option>' +
        '<option value="Reviewer"' + (a.role === 'Reviewer' ? ' selected' : '') + '>Reviewer</option>' +
      '</select>';
    var hasEmptyWeeks = false;
    for (var ew = 0; ew < weeks.length; ew++) {
      if ((a.fracs[ew] || 0) > 0) continue;
      var wDate2 = weeks[ew];
      var afterStart2 = !pStart || wDate2 >= pStart;
      var beforeEnd2 = !pEnd || wDate2 <= pEnd;
      if (afterStart2 && beforeEnd2) { hasEmptyWeeks = true; break; }
    }
    if (hasEmptyWeeks) {
      row += '<span class="ae-autofill-btn" onclick="aeAutofillProject(' + ai + ')" title="Fill empty weeks with default % based on project size and role">&#9889; Auto-fill</span>';
    }
    if (pStart || pEnd) {
      row += '<span class="ae-date-range">';
      if (pStart) row += '&#9654; ' + pStart;
      if (pStart && pEnd) row += '&nbsp;&nbsp;';
      if (pEnd)   row += '&#9632; ' + pEnd;
      row += '</span>';
    }
    row += '</td>';

    for (let ci = 0; ci < wIdxs.length; ci++) {
      const wi = wIdxs[ci];
      const pct    = Math.round((a.fracs[wi] || 0) * 100);
      const isCur  = wi === window.currentWeekIdx;
      const hasVal = pct > 0;
      const wDate  = weeks[wi];
      let rangeClass = '';
      if (pStart || pEnd) {
        const afterStart = !pStart || wDate >= pStart;
        const beforeEnd  = !pEnd   || wDate <= pEnd;
        rangeClass = (afterStart && beforeEnd) ? ' ae-in-range' : ' ae-out-range';
      }
      let cls = 'ae-pct-input' + (hasVal ? ' has-val' : '') + (isCur ? ' cur-wk' : '');
      const tabIdx = ci * numRows + ai + 1;
      const cap = projCap[wi] || 0;
      const hoursLabel = hasVal ? (Math.round((pct / 100) * cap * 10) / 10) + 'h' : '';
      row += '<td class="ae-wk-td' + (isCur ? ' ae-cur' : '') + rangeClass + '">' +
        '<input type="number" min="0" max="100" value="' + pct + '" class="' + cls + '" ' +
        'tabindex="' + tabIdx + '" ' +
        'data-ai="' + ai + '" data-wi="' + wi + '" ' +
        'onchange="aeCellChange(' + ai + ',' + wi + ',this)" onfocus="this.select()">' +
        '<div class="ae-hrs" id="ae-hrs-' + ai + '-' + wi + '">' + hoursLabel + '</div>' +
        '</td>';
    }
    row += '</tr>';
    return row;
  }

  // Leading section
  if (leadAllocs.length > 0) {
    tbody += '<tr class="ae-group-hdr ae-group-lead"><td colspan="' + (wIdxs.length + 1) + '">Leading (' + leadAllocs.length + ')</td></tr>';
    leadAllocs.forEach(function(a) { tbody += renderAllocRow(a); });
  }

  // Contributing section (collapsible)
  if (contribAllocs.length > 0) {
    const chevron = aeContribCollapsed ? '&#9654;' : '&#9660;';
    tbody += '<tr class="ae-group-hdr ae-group-contrib" onclick="aeToggleContrib()"><td colspan="' + (wIdxs.length + 1) + '">' +
      '<span style="margin-right:6px;font-size:10px;">' + chevron + '</span>Contributing (' + contribAllocs.length + ')' +
      (aeContribCollapsed ? '<span style="font-weight:400;font-size:10px;margin-left:8px;text-transform:none;letter-spacing:0;">click to expand</span>' : '') +
      '</td></tr>';
    if (!aeContribCollapsed) {
      contribAllocs.forEach(function(a) { tbody += renderAllocRow(a); });
    }
  }

  // Closed work no longer renders as a separate section. Complete and
  // Canceled projects now appear in their proper Leading/Contributing
  // group when their active span overlaps the visible window (handled by
  // _aeInWindow above), so past-week reflections on them are directly
  // editable.

  _aeT('tbody').innerHTML = tbody;

  // Totals row — sums across every visible row (Lead + Contributing).
  // Since closed-project rows are now individually visible when their span
  // overlaps the window, their values are naturally included; no separate
  // closed rollup contribution needed.
  let totHtml = '<tr class="ae-total-row"><td class="ae-proj-td ae-total-label">Total allocated' + calcInfoIcon('allocTotal') + '</td>';
  for (const wi of wIdxs) {
    const total = visibleAllocs.reduce(function(s, a) { return s + Math.round((a.fracs[wi] || 0) * 100); }, 0);
    const cls   = total === 0 ? 'zero' : total > 100 ? 'over' : 'ok';
    const isCur = wi === window.currentWeekIdx;
    totHtml += '<td class="ae-wk-td' + (isCur ? ' ae-cur' : '') + '" id="ae-tot-' + wi + '">' +
      '<span class="ae-tot-chip ' + cls + '">' + total + '%</span></td>';
  }
  totHtml += '</tr>';
  _aeT('tfoot').innerHTML = totHtml;
  var _aeTBE2 = _aeT('totals-bar'); if (_aeTBE2) _aeTBE2.style.display = 'none';
}

function aeCellChange(ai, wi, input) {
  const pct = Math.min(100, Math.max(0, parseFloat(input.value) || 0));
  input.value = pct;
  Editor.draft[Editor.person][ai].fracs[wi] = pct / 100;
  const isCur = wi === window.currentWeekIdx;
  input.className = 'ae-pct-input' + (pct > 0 ? ' has-val' : '') + (isCur ? ' cur-wk' : '');
  // Refresh the per-cell hours label.
  const personRec = RESOURCES_DATA.people[Editor.person] || {};
  const cap = (personRec.proj_cap || [])[wi] || 0;
  const hrsEl = document.getElementById('ae-hrs-' + ai + '-' + wi);
  if (hrsEl) hrsEl.textContent = pct > 0 ? (Math.round((pct / 100) * cap * 10) / 10) + 'h' : '';
  aeTotRefresh(wi);
  // Live-update the rail badge if this edit affects the current-week total.
  // The rail badge shows current-week utilization; non-current-week edits
  // don't change what the badge represents.
  if (isCur) aeRefreshRailBadge(Editor.person);
}

// Recompute and update the rail's per-person utilization badge from the
// live Editor.draft so the team-column percent moves with every edit.
// Quiet no-op if the badge isn't in the DOM (e.g. modal mode).
function aeRefreshRailBadge(name) {
  if (!name) return;
  const cwIdx = window.currentWeekIdx;
  if (cwIdx == null) return;
  const personRec = (RESOURCES_DATA && RESOURCES_DATA.people) ? RESOURCES_DATA.people[name] : null;
  if (!personRec) return;
  const cap = (personRec.proj_cap || [])[cwIdx] || 0;
  // Sum the draft (live values) for this person at the current week.
  const allocs = (Editor.draft && Editor.draft[name]) || [];
  let totalFrac = 0;
  allocs.forEach(function(a) { totalFrac += (a.fracs[cwIdx] || 0); });
  // Utilization = allocated_hours / project_capacity. Match the formula
  // used in buildResourcePersonCards (which reads p.utilization[cwIdx]).
  const allocHrs = totalFrac * cap;
  const pct = cap > 0 ? (allocHrs / cap) * 100 : 0;
  const utilColor = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#83AC16';
  const badges = document.querySelectorAll('.res-rail .person-util-badge');
  badges.forEach(function(b) {
    if (b.getAttribute('data-person') === name) {
      b.textContent = pct.toFixed(0) + '%';
      b.style.background = utilColor + '22';
      b.style.color = utilColor;
    }
  });
}

function aeRoleChange(ai, role) {
  Editor.draft[Editor.person][ai].role = role;
  aeRenderGrid();
}

function aeAutofillProject(ai) {
  var alloc = Editor.draft[Editor.person][ai];
  var projTitle = alloc.project;
  var role = alloc.role;
  if (!role) {
    showToast('Select a role first (Lead, Contributor, or Reviewer).', 'warn');
    return;
  }
  // Look up project size
  var proj = PROJECTS.find(function(p) { return p.title === projTitle; });
  var size = proj ? (proj.project_size || '') : '';
  if (!size) {
    showToast('This project has no size set. Set the project size in the project editor first.', 'warn');
    return;
  }
  var defaults = _allocationDefaults[size];
  if (!defaults || !defaults[role]) {
    showToast('No default found for size "' + size + '" / role "' + role + '".', 'warn');
    return;
  }
  var defaultPct = defaults[role] / 100; // Convert to 0-1 fraction
  var weeks = RESOURCES_DATA.weeks;
  var N = weeks.length;
  // Determine project date range
  var dates = aeProjectDates[projTitle] || {};
  var pStart = dates.start || null;
  var pEnd = dates.end || null;
  var filled = 0;
  for (var i = 0; i < N; i++) {
    // Only fill empty weeks within project date range
    if (alloc.fracs[i] > 0) continue; // Don't overwrite existing values
    var wDate = weeks[i];
    var afterStart = !pStart || wDate >= pStart;
    var beforeEnd = !pEnd || wDate <= pEnd;
    if (afterStart && beforeEnd) {
      alloc.fracs[i] = defaultPct;
      filled++;
    }
  }
  if (filled === 0) {
    showToast('No empty weeks found within the project date range to fill.', 'info');
    return;
  }
  showToast('Filled ' + filled + ' week(s) with ' + defaults[role] + '% for ' + role + '.', 'success');
  aeRenderGrid(); // Re-render to show updated values
}

// ══════════════════════════════════════════════════════════════════════
//  AUTO-FILL ALLOCATIONS FOR NEW PROJECTS
//  Called automatically after creating a new Active project with a size.
//  Creates allocation records in ArcGIS Online for all team members.
// ══════════════════════════════════════════════════════════════════════
async function autoFillAllocationsForNewProject(fields) {
  var size = fields.project_size;
  var defaults = _allocationDefaults[size];
  if (!defaults) { console.warn('[AutoAlloc] No defaults for size:', size); return; }

  var startDate = fields.start || null;
  var endDate = fields.working_due || fields.end || null;
  if (!startDate || !endDate) {
    console.log('[AutoAlloc] Skipping — no start or end date set');
    return;
  }

  // Gather team members and their roles
  var members = [];
  if (fields.contact) {
    members.push({ name: fields.contact, role: 'Lead' });
  }
  if (fields.other_members) {
    fields.other_members.split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(name) {
      var memberRole = _formMemberRoles[name] || 'Contributor';
      members.push({ name: name, role: memberRole });
    });
  }
  if (members.length === 0) {
    console.log('[AutoAlloc] Skipping — no team members assigned');
    return;
  }

  // Find the project we just created to get analytics_id
  var proj = PROJECTS.find(function(p) { return p.title === fields.title; });
  var analyticsId = proj ? proj.id : null;

  // Generate weeks within date range
  var weeks = RESOURCES_DATA.weeks || [];
  var adds = [];

  members.forEach(function(member) {
    var defaultPct = defaults[member.role];
    if (!defaultPct) return;
    var fraction = defaultPct / 100;

    // Compute this person's proj_cap per week (if they're in RESOURCES_DATA)
    var person = RESOURCES_DATA.people ? RESOURCES_DATA.people[member.name] : null;

    for (var i = 0; i < weeks.length; i++) {
      var wDate = weeks[i];
      // Check if week is within project date range
      if (wDate < startDate || wDate > endDate) continue;

      var projCap = person ? (person.proj_cap[i] || 0) : 0;
      var hours = Math.round(fraction * projCap * 100) / 100;

      adds.push({
        attributes: {
          name:           member.name,
          project_number: analyticsId,
          project_role:   member.role,
          week_date:      wDate,
          fraction:       fraction,
        }
      });
    }
  });

  if (adds.length === 0) {
    console.log('[AutoAlloc] No allocation records generated');
    return;
  }

  console.log('[AutoAlloc] Creating', adds.length, 'allocation records for', members.length, 'members');
  try {
    var result = await agolApplyEdits(ARCGIS_CONFIG.allocationsUrl, { adds: adds });
    console.log('[AutoAlloc] Result:', JSON.stringify(result));

    var errorCount = 0;
    if (result && result.addResults) {
      result.addResults.forEach(function(r) { if (!r.success) errorCount++; });
    }
    if (errorCount > 0) {
      showToast('Some allocation records failed to save (' + errorCount + ' errors). Check the allocation editor.', 'warn');
    } else {
      showToast('Auto-filled allocations for ' + members.length + ' team member(s).', 'success');
    }

    // Reload resources to reflect the new allocations
    await loadResourcesData();
    initResourcesWeekIndices();
  } catch (err) {
    console.error('[AutoAlloc] Failed:', err);
    showToast('Failed to auto-fill allocations: ' + err.message, 'error');
  }
}

function aeTotRefresh(wi) {
  const allocs = Editor.draft[Editor.person];
  // Sum across the whole draft for this week — rows that are window-filtered
  // out have zero in this week by definition (the (b) inclusion rule
  // captures any row with non-zero in any visible week), so summing all is
  // equivalent to summing only visible rows but cheaper.
  const total = allocs.reduce(function(s, a) { return s + Math.round((a.fracs[wi] || 0) * 100); }, 0);
  const cell  = document.getElementById('ae-tot-' + wi);
  if (!cell) return;
  const cls  = total === 0 ? 'zero' : total > 100 ? 'over' : 'ok';
  const isCur = wi === window.currentWeekIdx;
  cell.innerHTML = '<span class="ae-tot-chip ' + cls + '">' + total + '%</span>';
}

function applyEditorChanges() {
  const name = Editor.person;
  const p    = RESOURCES_DATA.people[name];
  const N    = RESOURCES_DATA.weeks.length;
  const weeks = RESOURCES_DATA.weeks;

  // Build a map of canonicalized→original allocation names so we can match properly
  const projTitleSet3 = new Set(PROJECTS.map(proj => proj.title));
  function canonTitle(raw) {
    if (projTitleSet3.has(raw)) return raw;
    const stripped = raw.replace(/\s*-\s*[A-Z][A-Za-z .]+$/, '').trim();
    return projTitleSet3.has(stripped) ? stripped : raw;
  }
  // Map canonical name → array of original allocation objects
  const origByCanon = {};
  p.allocations.forEach(function(a) {
    const cn = canonTitle(a.project);
    if (!origByCanon[cn]) origByCanon[cn] = [];
    origByCanon[cn].push(a);
  });

  // Collect changed allocation weeks for REST write-back
  const editsToSave = [];

  Editor.draft[name].forEach(function(da) {
    const origArr = origByCanon[da.project] || [];
    // Resolve the project once up front. project_number (aliased as
    // proj.id) is NOT-NULL on the ALLOCATIONS table, so brand-new
    // allocations need this lookup — origArr[0] doesn't exist yet to
    // borrow it from. Fall back to PROJECTS lookup, then bail if even
    // that can't resolve it, rather than sending NULL to the server.
    const projForDa = PROJECTS.find(function(x) { return x.title === da.project; });
    const analyticsIdForDa = origArr.length > 0
      ? origArr[0].analytics_id
      : (projForDa ? projForDa.id : null);

    // Compute the original merged fracs (same merge logic as openAllocEditor)
    const mergedOrigFracs = new Array(N).fill(0);
    origArr.forEach(function(a) {
      for (let i = 0; i < N; i++) mergedOrigFracs[i] += (a.fracs[i] || 0);
    });

    // Detect which weeks actually changed
    for (let i = 0; i < N; i++) {
      const oldFrac = Math.round(mergedOrigFracs[i] * 10000) / 10000;
      const newFrac = Math.round((da.fracs[i] || 0) * 10000) / 10000;
      if (newFrac !== oldFrac) {
        if (newFrac > 0 && analyticsIdForDa == null) {
          // Can't insert without project_number — surface a clear
          // error rather than the cryptic SQL NOT-NULL violation.
          console.error('[Allocations] Cannot save allocation for "' + da.project + '" — project_number not resolvable. Is the project in PROJECTS?');
          showToast('Cannot save allocation for "' + da.project + '" — project not found.', 'error');
          continue;
        }
        const newHrs = newFrac * (p.proj_cap[i] || 0);
        editsToSave.push({
          name:           name,
          project:        da.project,
          project_status: da.status || '',
          project_type:   origArr.length > 0 ? (origArr[0].type || '') : '',
          analytics_id:   analyticsIdForDa,
          project_role:   da.role || null,
          week_date:      weeks[i],
          fraction:       newFrac,
          hours:          Math.round(newHrs * 100) / 100,
        });
      }
    }

    // Update local data: write back to the first matching original allocation
    // (or create a new one if none exists)
    if (origArr.length > 0) {
      // Update the first allocation, zero out any others (de-duplicate)
      origArr[0].fracs = da.fracs.slice();
      origArr[0].hours = da.fracs.map(function(f, i) { return f * (p.proj_cap[i] || 0); });
      origArr[0].role = da.role || origArr[0].role || '';
      for (let j = 1; j < origArr.length; j++) {
        origArr[j].fracs = new Array(N).fill(0);
        origArr[j].hours = new Array(N).fill(0);
      }
    } else {
      // Brand new allocation
      p.allocations.push({
        project:      da.project,
        status:       projForDa ? projForDa.status : da.status,
        type:         '',
        role:         da.role || '',
        fracs:        da.fracs.slice(),
        hours:        da.fracs.map(function(f, i) { return f * (p.proj_cap[i] || 0); }),
        analytics_id: projForDa ? projForDa.id : null,
      });
    }
  });

  // Recompute weekly_allocated and utilization (as 0.0–1.0 ratio, NOT percentage)
  p.weekly_allocated = weeks.map(function(_, i) {
    return p.allocations.reduce(function(s, a) { return s + (a.hours[i] || 0); }, 0);
  });
  p.utilization = weeks.map(function(_, i) {
    return p.proj_cap[i] > 0 ? p.weekly_allocated[i] / p.proj_cap[i] : 0;
  });
  closeAllocEditor();
  markDataDirty();
  render();

  // Save changed allocations to REST service (non-blocking)
  console.log('[Allocations] Detected', editsToSave.length, 'changed week(s):', editsToSave);
  if (editsToSave.length > 0) {
    saveAllocationsToRest(editsToSave);
  } else {
    console.log('[Allocations] No changes to save');
  }
}

/**
 * Write allocation changes to the ArcGIS Online allocations REST service.
 * Strategy: for each changed person+project+week, find and delete the existing
 * record (if any), then add a new one with updated values. If fraction is 0,
 * only delete (sparse storage).
 */
async function saveAllocationsToRest(edits) {
  try {
    console.log('[Allocations] Starting REST save for', edits.length, 'edits');
    const token = await ensureAgolToken();
    if (!token) {
      console.error('[Allocations] No token available');
      return;
    }

    // Query ALL existing allocation records for this person
    const personName = edits[0].name;
    console.log('[Allocations] Querying existing records for:', personName);
    const existing = await agolQuery(ARCGIS_CONFIG.allocationsUrl,
      "name='" + personName.replace(/'/g, "''") + "'");
    console.log('[Allocations] Found', existing.length, 'existing records');

    // week_date is a Date Only field — always send "YYYY-MM-DD" strings
    if (existing.length > 0) {
      console.log('[Allocations] Sample existing record:', JSON.stringify(existing[0].attributes));
    }

    // Build lookup: "canonicalProject|week_date_str" → array of OIDs
    const projTitleSet4 = new Set(PROJECTS.map(proj => proj.title));
    function canonTitle2(raw) {
      if (projTitleSet4.has(raw)) return raw;
      const stripped = raw.replace(/\s*-\s*[A-Z][A-Za-z .]+$/, '').trim();
      return projTitleSet4.has(stripped) ? stripped : raw;
    }

    const existingMap = {};
    existing.forEach(function(f) {
      const a = f.attributes;
      const oid = a.ObjectId || a.OBJECTID || a.objectid || a.FID;
      const wk = epochToDateStr(a.week_date); // normalizes both number and string to "YYYY-MM-DD"
      const canon = canonTitle2(a.project || '');
      const key = canon + '|' + wk;
      if (!existingMap[key]) existingMap[key] = [];
      existingMap[key].push(oid);
    });

    const deletes = [];
    const adds = [];

    edits.forEach(function(e) {
      const key = e.project + '|' + e.week_date;
      const existingOids = existingMap[key] || [];

      // Delete all matching existing records for this project+week
      existingOids.forEach(function(oid) {
        if (oid !== undefined && oid !== null) deletes.push(oid);
      });

      // Only add back if fraction > 0 (sparse storage)
      if (e.fraction > 0) {
        adds.push({
          attributes: {
            name:           e.name,
            project_number: e.analytics_id,
            project_role:   e.project_role || null,
            week_date:      e.week_date,
            fraction:       e.fraction,
          }
        });
      }
    });

    console.log('[Allocations] Deleting', deletes.length, 'OIDs:', deletes);
    console.log('[Allocations] Adding', adds.length, 'records');
    if (adds.length > 0) console.log('[Allocations] Sample add payload:', JSON.stringify(adds[0]));

    if (deletes.length === 0 && adds.length === 0) {
      console.log('[Allocations] Nothing to send');
      return;
    }

    // Send edits
    const editPayload = {};
    if (deletes.length > 0) editPayload.deletes = deletes;
    if (adds.length > 0)    editPayload.adds = adds;

    const result = await agolApplyEdits(ARCGIS_CONFIG.allocationsUrl, editPayload);
    console.log('[Allocations] applyEdits response:', JSON.stringify(result));

    // Check for per-record errors
    const errors = [];
    if (result.addResults) {
      result.addResults.forEach(function(r, i) {
        if (!r.success) errors.push('Add #' + i + ': ' + (r.error ? r.error.description : 'unknown'));
      });
    }
    if (result.deleteResults) {
      result.deleteResults.forEach(function(r, i) {
        if (!r.success) errors.push('Delete #' + i + ': ' + (r.error ? r.error.description : 'unknown'));
      });
    }

    if (errors.length > 0) {
      console.error('[Allocations] Partial failures:', errors);
      showToast('Some allocation changes failed to save. Check console for details.', 'error');
    } else {
      let msg = 'Saved ' + adds.length + ' allocation(s)';
      if (deletes.length > 0) msg += ', removed ' + deletes.length + ' old record(s)';
      console.log('[Allocations] ✓', msg);
      markSynced(msg);
    }
  } catch (err) {
    console.error('[Allocations] Save failed:', err);
    showToast('Allocation save failed: ' + err.message, 'error');
  }
}

async function saveAllData() {
  // Re-fetch all data from ArcGIS Online to sync local state
  showLoadingOverlay('Refreshing data from ArcGIS Online...');
  try {
    const projectFeatures = await agolQuery(ARCGIS_CONFIG.projectsUrl, 'deleted_at IS NULL');
    PROJECTS.length = 0;
    projectFeatures.forEach(function(f) { PROJECTS.push(agolProjectToLocal(f)); });

    const taskFeatures = await agolQuery(ARCGIS_CONFIG.tasksUrl, 'deleted_at IS NULL');
    TASKS.length = 0;
    taskFeatures.forEach(function(f) { TASKS.push(agolTaskToLocal(f)); });

    // Reload config
    try {
      const configFeatures = await agolQuery(ARCGIS_CONFIG.appConfigUrl);
      applyAppConfig(configFeatures);
    } catch (e) { console.warn('app_config reload failed:', e); }

    await loadResourcesData();
    initResourcesWeekIndices();
    loadUserPrefs();
    await loadIssues();

    hideLoadingOverlay();
    markSynced('Refreshed: ' + PROJECTS.length + ' projects, ' + TASKS.length + ' tasks');
    markDataDirty();
    render();
  } catch (err) {
    hideLoadingOverlay();
    console.error('Refresh failed:', err);
    showToast('Refresh failed: ' + err.message, 'error');
  }
}

// ── Unsaved-changes tracking ──────────────────────────────────────────
function markDirty() {
  if (Editor.hasUnsaved) return;
  Editor.hasUnsaved = true;
  const dot = document.getElementById('unsaved-dot');
  const btn = document.getElementById('btn-save-file');
  if (dot) dot.classList.add('show');
  if (btn) btn.classList.add('dirty');
}
function markSaved() {
  Editor.hasUnsaved = false;
  const dot = document.getElementById('unsaved-dot');
  const btn = document.getElementById('btn-save-file');
  if (dot) dot.classList.remove('show');
  if (btn) btn.classList.remove('dirty');
}

function markSynced(msg) {
  markSaved();
  // Brief green flash on sync button
  const btn = document.getElementById('btn-save-file');
  if (btn) {
    btn.style.background = '#83AC16';
    btn.title = msg || 'Data refreshed from ArcGIS Online';
    setTimeout(() => { btn.style.background = ''; btn.title = 'Refresh data from ArcGIS Online'; }, 2000);
  }
}
