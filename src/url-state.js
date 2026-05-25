// ─────────────────────────────────────────────────────────────────────
// url-state.js — shareable view links + refresh persistence (Phase 3).
//
// Goal: a teammate can share "this exact view" and a refresh restores it.
//
// Why not continuously rewrite the address bar: the app has a back-button
// trap (index.html) that re-pushes history on popstate, plus one-shot URL
// cleaners (handleDeepLink ?project=, ?slideshow=). Churning the address bar
// every render would fight those. So instead:
//   • refresh persistence  → a compact snapshot in sessionStorage
//   • sharing              → an on-demand "Copy link" that builds a query-param
//                            URL; opening it applies the state (applyUrlState)
//
// Precedence on load (handled in initViewStateRouting): a shared link's query
// params win over the session snapshot, which wins over the default saved view.
//
// Forward references (resolve at call time): currentTab, currentView,
// currentDetail, activeFilters, PROJECTS, TASKS, switchTab, render,
// openProject, openTask, svCaptureCurrent, applyFilterSnapshot, showToast.
// ─────────────────────────────────────────────────────────────────────

var URL_STATE_KEY = 'tracker_view_state';
// Persistence is gated off until routing has read the previous snapshot, so the
// bootstrap renders don't overwrite the snapshot we're about to restore.
var _viewStateReady = false;
var SV_QUERY_ARRAY_KEYS = ['status','priority','category','member','partnerDept','itdTeam','taskStatus','taskCategory','taskTool'];

// Snapshot the current view: tab, view mode, sort, filters, open record.
function captureViewState() {
  var s = {
    tab:  (typeof currentTab !== 'undefined') ? currentTab : null,
    view: (typeof currentView !== 'undefined') ? currentView : null,
    sort: (function () { var el = document.getElementById('sort-select'); return el ? el.value : null; })(),
    filters: (typeof svCaptureCurrent === 'function') ? svCaptureCurrent() : null,
    open: null
  };
  if (typeof currentDetail !== 'undefined' && currentDetail && currentDetail.id != null &&
      (currentDetail.type === 'project' || currentDetail.type === 'task')) {
    var rec = null;
    if (currentDetail.type === 'project' && typeof PROJECTS !== 'undefined') rec = PROJECTS.find(function (p) { return p.objectId === currentDetail.id; });
    if (currentDetail.type === 'task'    && typeof TASKS    !== 'undefined') rec = TASKS.find(function (t) { return t.objectId === currentDetail.id; });
    if (rec) s.open = { type: currentDetail.type, num: currentDetail.type === 'project' ? (rec.project_number || String(rec.objectId)) : (rec.task_number || String(rec.objectId)) };
  }
  return s;
}

// Save the snapshot for refresh restore. Called from render() (no-op until ready).
function persistViewState() {
  if (!_viewStateReady) return;
  try { sessionStorage.setItem(URL_STATE_KEY, JSON.stringify(captureViewState())); } catch (e) {}
}

// Build an absolute shareable URL with the current view encoded as query params.
function buildShareUrl() {
  var s = captureViewState();
  var p = new URLSearchParams();
  if (s.tab)  p.set('tab', s.tab);
  if (s.view) p.set('view', s.view);
  if (s.sort) p.set('sort', s.sort);
  var f = s.filters || {};
  SV_QUERY_ARRAY_KEYS.forEach(function (k) { if (f[k] && f[k].length) p.set(k, f[k].join('~')); });
  if (f.dataProgram) p.set('dp', '1');
  if (f.overdue)     p.set('overdue', '1');
  if (f.search)      p.set('q', f.search);
  if (s.open)        p.set('open', (s.open.type === 'task' ? 't:' : 'p:') + s.open.num);
  return window.location.origin + window.location.pathname + '?' + p.toString();
}

function copyViewLink() {
  var url = buildShareUrl();
  var ok = function () { if (typeof showToast === 'function') showToast('Link copied — opens this exact view.', 'success'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(ok, function () { window.prompt('Copy this link to share the view:', url); });
  } else {
    window.prompt('Copy this link to share the view:', url);
  }
}

function applyOpenRecord(type, num) {
  if (type === 'project' && typeof PROJECTS !== 'undefined' && typeof openProject === 'function') {
    var pr = PROJECTS.find(function (p) { return p.project_number === num || String(p.objectId) === num; });
    if (pr) openProject(pr.objectId);
  } else if (type === 'task' && typeof TASKS !== 'undefined' && typeof openTask === 'function') {
    var t = TASKS.find(function (x) { return x.task_number === num || String(x.objectId) === num; });
    if (t) openTask(t.objectId);
  }
}

var SHARE_KEYS = ['tab','view','sort','dp','overdue','q','open'].concat(SV_QUERY_ARRAY_KEYS);

// Return the shared-view params from the URL — or, when an ArcGIS OAuth sign-in
// round trip stripped the query (redirect_uri is origin+pathname, no query),
// from the pre-redirect stash saved at load. Clears the stash once consumed.
function getShareQuery() {
  var p = new URLSearchParams(window.location.search);
  if (SHARE_KEYS.some(function (k) { return p.has(k); })) {
    try { sessionStorage.removeItem('tracker_pending_query'); } catch (e) {}
    return p;
  }
  try {
    var pending = sessionStorage.getItem('tracker_pending_query');
    if (pending) {
      sessionStorage.removeItem('tracker_pending_query');
      var pp = new URLSearchParams(pending);
      if (SHARE_KEYS.some(function (k) { return pp.has(k); })) return pp;
    }
  } catch (e) {}
  return null;
}

// Apply state from a shared link's query (URL or post-sign-in stash). Returns
// true if applied.
function applyUrlStateFromQuery() {
  var p = getShareQuery();
  if (!p) return false;

  if (typeof activeFilters !== 'undefined') {
    SV_QUERY_ARRAY_KEYS.forEach(function (k) { activeFilters[k] = p.has(k) ? p.get(k).split('~') : []; });
    activeFilters.dataProgram = p.get('dp') === '1';
    activeFilters.overdue = p.get('overdue') === '1';
    activeFilters.search = p.get('q') || '';
    var si = document.getElementById('search-input'); if (si) si.value = activeFilters.search;
  }
  if (p.get('sort')) { var ss = document.getElementById('sort-select'); if (ss) ss.value = p.get('sort'); }
  if (p.get('view') && typeof currentView !== 'undefined') currentView = p.get('view');

  var tab = p.get('tab');
  if (tab && typeof switchTab === 'function') switchTab(tab, true);
  else if (typeof render === 'function') render();

  var open = p.get('open');
  if (open) { applyOpenRecord(open.indexOf('t:') === 0 ? 'task' : 'project', open.replace(/^[pt]:/, '')); }
  return true;
}

// Restore the last view from the sessionStorage snapshot (refresh). Returns true
// if applied.
function restoreViewStateFromSession() {
  var raw; try { raw = sessionStorage.getItem(URL_STATE_KEY); } catch (e) { return false; }
  if (!raw) return false;
  var s; try { s = JSON.parse(raw); } catch (e) { return false; }
  if (!s) return false;

  if (s.filters && typeof applyFilterSnapshot === 'function') applyFilterSnapshot(s.filters);
  if (s.sort) { var ss = document.getElementById('sort-select'); if (ss) ss.value = s.sort; }
  if (s.view && typeof currentView !== 'undefined') currentView = s.view;
  if (s.tab && typeof switchTab === 'function') switchTab(s.tab, true);
  else if (typeof render === 'function') render();
  if (s.open) applyOpenRecord(s.open.type, s.open.num);
  return true;
}

// Bootstrap entry: apply URL share-link state, else restore the session
// snapshot, else leave the default view in place. Enables persistence after.
function initViewStateRouting() {
  var applied = null;
  try {
    if (applyUrlStateFromQuery()) applied = 'url';
    else if (restoreViewStateFromSession()) applied = 'session';
  } catch (e) {
    console.warn('view-state routing failed:', e);
  }
  _viewStateReady = true; // from now on, render() persists snapshots
  return applied;
}

// Runs at script load (before init() triggers any OAuth redirect): if this page
// was opened from a shared link, stash the query so it survives the sign-in
// round trip — the redirect_uri is origin+pathname and drops the query string.
(function captureSharedQueryBeforeAuth() {
  try {
    var p = new URLSearchParams(window.location.search);
    if (SHARE_KEYS.some(function (k) { return p.has(k); })) {
      sessionStorage.setItem('tracker_pending_query', window.location.search);
    }
  } catch (e) {}
})();
