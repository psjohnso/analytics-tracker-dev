// ─────────────────────────────────────────────────────────────────────
// notifications.js — in-app notifications (activity feed + @mentions)
//
// Pull-based: on data load we query the notifications table for rows where
// recipient = the signed-in user, show an unread count on a header bell, and
// list them in a dropdown. @mentions in the project journal write rows here.
// No server triggers (AGO is CRUD-only), so this is in-app only; email/Teams
// delivery would be a later external runner.
//
// AGO table fields (datateam_portfolio_v2/FeatureServer/5): OBJECTID, notif_id,
// recipient, actor, kind, item_type, item_number, item_title, snippet, is_read,
// created_at (epoch ms). Mirrors the project-notes.js pattern.
//
// Gated behind the 'notifications' beta feature.
// ─────────────────────────────────────────────────────────────────────

let NOTIFICATIONS = [];
let _notifLoaded = false;
let _notifPanelOpen = false;

function _notifOn() {
  // Guarded: this can be called from the header refresh during the very first
  // render, before the FEATURE_* consts are initialized — reading them then
  // throws a TDZ ReferenceError. Treat "not ready yet" as off.
  try { return typeof isFeatureOn === 'function' && isFeatureOn('notifications'); }
  catch (e) { return false; }
}
function _notifNewId() {
  if (typeof _newNoteId === 'function') return _newNoteId();
  return 'n-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
function _notifInitials(n) { n = n || '?'; return n.split(/\s+/).map(function(w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); }
function _notifAgo(ms) {
  if (!ms) return '';
  var days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + 'd ago';
  return Math.floor(days / 7) + 'w ago';
}

// ── Load / counts ──
async function loadNotifications() {
  NOTIFICATIONS = []; _notifLoaded = false;
  try {
    if (Auth.loggedIn && Auth.fullName && _notifOn() &&
        typeof ARCGIS_CONFIG !== 'undefined' && ARCGIS_CONFIG.notificationsUrl) {
      var me = String(Auth.fullName).replace(/'/g, "''");
      var features = await agolQuery(ARCGIS_CONFIG.notificationsUrl, "recipient='" + me + "'");
      NOTIFICATIONS = features.map(function(f) {
        var a = f.attributes || {};
        return {
          objectId: a.OBJECTID || a.ObjectId || a.objectid,
          notif_id: a.notif_id,
          recipient: a.recipient || '',
          actor: a.actor || '',
          kind: a.kind || '',
          item_type: a.item_type || '',
          item_number: a.item_number != null ? String(a.item_number) : '',
          item_title: a.item_title || '',
          snippet: a.snippet || '',
          is_read: a.is_read ? 1 : 0,
          created_at: a.created_at || a.CreationDate || 0
        };
      }).sort(function(a, b) { return (b.created_at || 0) - (a.created_at || 0); });
      _notifLoaded = true;
      console.log('[Notif] Loaded', NOTIFICATIONS.length, 'notifications.');
    }
  } catch (e) {
    console.warn('[Notif] Failed to load notifications:', e);
    NOTIFICATIONS = [];
  }
  renderInbox(); // always sync the bell, even when the query is skipped
}

function notifUnreadCount() { return NOTIFICATIONS.filter(function(n) { return !n.is_read; }).length; }

// ── Write ──
// Create a notification for `recipient`. No-op for self-notification or when the
// feature/table isn't available.
async function addNotification(recipient, kind, itemType, itemNumber, itemTitle, snippet) {
  if (!recipient || !_notifOn()) return;
  if (Auth.fullName && recipient === Auth.fullName) return;
  if (typeof ARCGIS_CONFIG === 'undefined' || !ARCGIS_CONFIG.notificationsUrl) return;
  var attrs = {
    notif_id: _notifNewId(),
    recipient: recipient,
    actor: Auth.fullName || Auth.username || '',
    kind: kind || 'mention',
    item_type: itemType || '',
    item_number: String(itemNumber == null ? '' : itemNumber),
    item_title: (itemTitle || '').slice(0, 500),
    snippet: (snippet || '').slice(0, 1000),
    is_read: 0,
    created_at: Date.now()
  };
  try {
    await agolApplyEdits(ARCGIS_CONFIG.notificationsUrl, { adds: [{ attributes: attrs }] });
  } catch (e) {
    console.error('[Notif] Failed to add notification:', e);
  }
}

async function markNotifRead(oid) {
  var n = NOTIFICATIONS.find(function(x) { return x.objectId == oid; });
  if (!n || n.is_read) return;
  n.is_read = 1; renderInbox();
  try {
    await agolApplyEdits(ARCGIS_CONFIG.notificationsUrl, { updates: [{ attributes: { OBJECTID: oid, is_read: 1 } }] });
  } catch (e) { console.error('[Notif] markRead failed:', e); }
}
async function markAllNotifsRead() {
  var unread = NOTIFICATIONS.filter(function(n) { return !n.is_read; });
  if (!unread.length) return;
  unread.forEach(function(n) { n.is_read = 1; });
  renderInbox();
  try {
    await agolApplyEdits(ARCGIS_CONFIG.notificationsUrl, {
      updates: unread.map(function(n) { return { attributes: { OBJECTID: n.objectId, is_read: 1 } }; })
    });
  } catch (e) { console.error('[Notif] markAll failed:', e); }
}

// ── Bell + panel ──
function _notifBell() { return document.getElementById('notif-bell'); }
function _notifPanel() {
  var p = document.getElementById('notif-panel');
  if (!p) {
    p = document.createElement('div');
    p.id = 'notif-panel';
    p.className = 'notif-panel';
    document.body.appendChild(p);
    document.addEventListener('click', function(e) {
      if (!_notifPanelOpen) return;
      var bell = _notifBell();
      if (p.contains(e.target) || (bell && bell.contains(e.target))) return;
      closeInbox();
    });
  }
  return p;
}
function renderInbox() {
  var bell = _notifBell();
  if (!bell) return;
  if (!_notifOn() || !Auth.loggedIn) { bell.style.display = 'none'; closeInbox(); return; }
  bell.style.display = '';
  var unread = notifUnreadCount();
  var badge = document.getElementById('notif-badge');
  if (badge) { badge.textContent = unread || ''; badge.style.display = unread ? 'flex' : 'none'; }
  if (_notifPanelOpen) renderInboxPanel();
}
function _notifMsg(n) {
  var who = '<b>' + esc(n.actor || 'Someone') + '</b>';
  var item = '<b>' + esc(n.item_title || 'an item') + '</b>';
  if (n.kind === 'mention') return who + ' mentioned you in ' + item;
  if (n.kind === 'assigned') return who + ' assigned you to ' + item;
  if (n.kind === 'status') return 'Status changed on ' + item;
  if (n.kind === 'comment') return who + ' commented on ' + item;
  return who + ' · ' + item;
}
function renderInboxPanel() {
  var p = _notifPanel();
  var rows = NOTIFICATIONS.length ? NOTIFICATIONS.map(function(n) {
    var av = n.kind === 'status' ? '★' : _notifInitials(n.actor);
    var ctx = _notifAgo(n.created_at) + (n.snippet ? ' · “' + esc(n.snippet.slice(0, 60)) + (n.snippet.length > 60 ? '…' : '') + '”' : '');
    return '<div class="ntf' + (n.is_read ? '' : ' unread') + '" onclick="openNotif(' + n.objectId + ')">' +
      '<div class="ntf-av">' + esc(av) + '</div>' +
      '<div class="ntf-body"><div class="ntf-msg">' + _notifMsg(n) + '</div><div class="ntf-ctx">' + ctx + '</div></div>' +
      '<div class="ntf-dot' + (n.is_read ? ' hidden' : '') + '"></div>' +
    '</div>';
  }).join('') : '<div class="ntf-empty">You’re all caught up 🎉</div>';
  p.innerHTML = '<div class="ntf-head"><span class="ntf-title">Notifications</span>' +
    (notifUnreadCount() ? '<button class="ntf-mark" onclick="markAllNotifsRead()">Mark all read</button>' : '') +
    '</div><div class="ntf-list">' + rows + '</div>';
}
function toggleInbox(e) { if (e) e.stopPropagation(); if (_notifPanelOpen) closeInbox(); else openInbox(); }
function openInbox() {
  _notifPanelOpen = true;
  var p = _notifPanel();
  p.style.display = 'block';
  renderInboxPanel();
  var bell = _notifBell();
  if (!bell) return;
  // Anchor under the bell, right-aligned; fixed + self-correct for any
  // transformed ancestor (same technique as the calendar tooltip).
  var r = bell.getBoundingClientRect();
  var pw = p.offsetWidth;
  var sx = Math.min(r.right - pw, window.innerWidth - pw - 8);
  if (sx < 8) sx = 8;
  var sy = r.bottom + 8;
  p.style.left = sx + 'px'; p.style.top = sy + 'px';
  var got = p.getBoundingClientRect();
  var dx = sx - got.left, dy = sy - got.top;
  if (dx || dy) { p.style.left = (sx + dx) + 'px'; p.style.top = (sy + dy) + 'px'; }
}
function closeInbox() { _notifPanelOpen = false; var p = document.getElementById('notif-panel'); if (p) p.style.display = 'none'; }

function openNotif(oid) {
  var n = NOTIFICATIONS.find(function(x) { return x.objectId == oid; });
  markNotifRead(oid);
  closeInbox();
  if (!n) return;
  if (n.item_type === 'task') {
    var t = (typeof TASKS !== 'undefined' && TASKS) ? TASKS.find(function(x) { return String(x.task_number) === String(n.item_number); }) : null;
    if (t && typeof openTask === 'function') { openTask(t.objectId); return; }
  } else {
    var pr = (typeof PROJECTS !== 'undefined' && PROJECTS) ? PROJECTS.find(function(x) { return String(x.project_number) === String(n.item_number); }) : null;
    if (pr && typeof openProject === 'function') { openProject(pr.objectId); return; }
  }
  if (typeof showToast === 'function') showToast('That item isn’t in your current view.', 'warn');
}

// ── @mention autocomplete (attach to a textarea) ──────────────────────
var _mTA = null, _mStart = -1, _mMatches = [], _mSel = 0;

function notifRoster() {
  if (typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return [];
  return Object.keys(RESOURCES_DATA.people).filter(function(n) {
    var p = RESOURCES_DATA.people[n];
    return p && p.active !== false;
  });
}
function _mMenu() {
  var m = document.getElementById('notif-mmenu');
  if (!m) { m = document.createElement('div'); m.id = 'notif-mmenu'; m.className = 'notif-mmenu'; document.body.appendChild(m); }
  return m;
}
function notifMentionInput(e) {
  if (!_notifOn()) return;
  var ta = e.target; _mTA = ta;
  var caret = ta.selectionStart, upto = ta.value.slice(0, caret);
  var m = upto.match(/@([A-Za-z]*)$/);
  if (!m) { _mHide(); return; }
  _mStart = caret - m[0].length;
  var q = m[1].toLowerCase();
  _mMatches = notifRoster().filter(function(x) { return x.toLowerCase().indexOf(q) >= 0; }).slice(0, 6);
  _mSel = 0;
  if (!_mMatches.length) { _mHide(); return; }
  _mShow(ta);
}
function _mShow(ta) {
  var m = _mMenu();
  m.innerHTML = _mMatches.map(function(name, i) {
    return '<div class="mi' + (i === _mSel ? ' sel' : '') + '" onmousedown="notifPickMention(event,' + i + ')">' + esc(name) + '</div>';
  }).join('');
  m.style.display = 'block';
  var r = ta.getBoundingClientRect();
  var sx = r.left, sy = r.bottom + 4;
  m.style.left = sx + 'px'; m.style.top = sy + 'px';
  var got = m.getBoundingClientRect();
  var dx = sx - got.left, dy = sy - got.top;
  if (dx || dy) { m.style.left = (sx + dx) + 'px'; m.style.top = (sy + dy) + 'px'; }
}
function _mHide() { var m = document.getElementById('notif-mmenu'); if (m) m.style.display = 'none'; _mStart = -1; }
function notifPickMention(e, i) {
  if (e) e.preventDefault();
  var name = _mMatches[i];
  if (!name || !_mTA || _mStart < 0) return;
  var ta = _mTA, caret = ta.selectionStart;
  var insert = '@' + name + ' ';
  ta.value = ta.value.slice(0, _mStart) + insert + ta.value.slice(caret);
  var pos = _mStart + insert.length;
  ta.focus(); ta.setSelectionRange(pos, pos);
  _mHide();
}
function notifMentionKey(e) {
  var m = document.getElementById('notif-mmenu');
  if (!m || m.style.display !== 'block' || !_mMatches.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); _mSel = (_mSel + 1) % _mMatches.length; _mShow(_mTA); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _mSel = (_mSel - 1 + _mMatches.length) % _mMatches.length; _mShow(_mTA); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); notifPickMention(e, _mSel); }
  else if (e.key === 'Escape') { _mHide(); }
}
// Names present in the text as "@Full Name" (matched against the roster).
function notifParseMentions(text) {
  var found = [];
  notifRoster().forEach(function(name) {
    if (text.indexOf('@' + name) >= 0 && found.indexOf(name) < 0) found.push(name);
  });
  return found;
}
// Wrap @Name in chips. Input must already be HTML-escaped.
function notifRenderMentions(escHtml) {
  if (!_notifOn()) return escHtml;
  notifRoster().forEach(function(name) {
    escHtml = escHtml.split('@' + esc(name)).join('<span class="notif-mention">@' + esc(name) + '</span>');
  });
  return escHtml;
}
