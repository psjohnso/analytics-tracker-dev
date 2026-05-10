// ─────────────────────────────────────────────────────────────────────
// tabs/slideshow.js — Slideshow tab (lobby display mode)
//
// Cycles through the Overview tab's panels one at a time on a timer.
// Built for unattended display on a TV or large monitor — minimal
// chrome, big text, fullscreen toggle.
//
// Visibility: per-user opt-in via UserPrefs.showSlideshow (handled in
// applyOptionalTabVisibility). The slide list / order / per-slide
// duration is admin-managed and stored in app_config.display_config
// (commit #2 will surface that in Settings; for now we use defaults).
//
// Forward references: getOverviewSlides (overview.js), PROJECTS, TASKS,
// _displayConfig (set by applyAppConfig from app_config.display_config),
// showToast.
// ─────────────────────────────────────────────────────────────────────

var _slideshowTimer = null;
var _slideshowIdx = 0;
var _slideshowResizeObserver = null;
var _slideshowFullscreenListenerAttached = false;

// Default config used until the admin-managed app_config.display_config
// is loaded. All overview slides on, 15s each.
var _slideshowDefaultConfig = {
  defaultDurationSec: 15,
  slides: [
    { id: 'snapshot',    enabled: true, durationSec: null },
    { id: 'pipeline',    enabled: true, durationSec: null },
    { id: 'dataprogram', enabled: true, durationSec: null },
    { id: 'deadlines',   enabled: true, durationSec: null },
    { id: 'priority',    enabled: true, durationSec: null },
    { id: 'category',    enabled: true, durationSec: null },
    { id: 'intake',      enabled: true, durationSec: null },
    { id: 'overdue',     enabled: true, durationSec: null },
  ],
};

function _slideshowGetConfig() {
  if (typeof _displayConfig !== 'undefined' && _displayConfig && _displayConfig.slides) {
    return _displayConfig;
  }
  return _slideshowDefaultConfig;
}

// Returns the ordered, filtered list of slides to actually display:
// merges Overview's panel HTML with the admin config's enabled/order/duration.
function _slideshowGetVisibleSlides() {
  var allPanels = (typeof getOverviewSlides === 'function') ? getOverviewSlides() : [];
  var byId = {};
  allPanels.forEach(function(p) { byId[p.id] = p; });
  var config = _slideshowGetConfig();
  var defaultDur = config.defaultDurationSec || 15;
  return (config.slides || [])
    .filter(function(s) { return s.enabled && byId[s.id]; })
    .map(function(s) {
      var panel = byId[s.id];
      return {
        id: s.id,
        title: panel.title,
        html: panel.html,
        durationMs: (s.durationSec || defaultDur) * 1000,
      };
    });
}

function renderSlideshow(area) {
  var slides = _slideshowGetVisibleSlides();
  if (!slides.length) {
    area.innerHTML = '<div style="padding:60px 40px;text-align:center;color:var(--text-muted);">' +
      '<div style="font-size:40px;margin-bottom:12px;">📺</div>' +
      '<div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:4px;">No slides configured</div>' +
      '<div style="font-size:12px;">An admin can configure the slideshow in Settings → System → Slideshow.</div>' +
      '</div>';
    return;
  }

  // Clamp the current index in case the slide list shrank since last render
  if (_slideshowIdx >= slides.length) _slideshowIdx = 0;

  area.innerHTML =
    '<div id="slideshow-stage" class="slideshow-stage">' +
      '<div class="slideshow-header">' +
        '<div class="slideshow-mode">LOBBY DISPLAY</div>' +
        '<div class="slideshow-team">City of Tucson GIS/Data Analytics team</div>' +
        '<div id="slideshow-description" class="slideshow-description"></div>' +
      '</div>' +
      '<div class="slideshow-controls">' +
        '<button onclick="slideshowPrev()" title="Previous slide" class="slideshow-ctrl-btn">◀</button>' +
        '<button onclick="slideshowTogglePause()" id="slideshow-pause-btn" title="Pause / play" class="slideshow-ctrl-btn">⏸</button>' +
        '<button onclick="slideshowNext()" title="Next slide" class="slideshow-ctrl-btn">▶</button>' +
        '<button onclick="slideshowToggleFullscreen()" title="Toggle fullscreen" class="slideshow-ctrl-btn">⛶</button>' +
      '</div>' +
      '<div id="slideshow-slide" class="slideshow-slide"></div>' +
      '<div id="slideshow-progress" class="slideshow-progress"></div>' +
    '</div>';

  _slideshowRenderCurrent();
  _slideshowStartTimer();
  _slideshowAttachFitObserver();
}

// Measure the fit-inner's natural (unscaled) size at width=1600 and apply
// a uniform scale so it fits the stage's slide area. transform-origin is
// center center, combined with translate(-50%, -50%) for absolute centering.
function _slideshowFit() {
  var slideEl = document.getElementById('slideshow-slide');
  if (!slideEl) return;
  var inner = slideEl.querySelector('.slideshow-fit-inner');
  if (!inner) return;
  var availW = slideEl.clientWidth;
  var availH = slideEl.clientHeight;
  var naturalW = inner.offsetWidth;
  var naturalH = inner.scrollHeight;
  if (!naturalW || !naturalH || !availW || !availH) {
    inner.style.transform = 'translate(-50%, -50%)';
    return;
  }
  var scale = Math.min(availW / naturalW, availH / naturalH);
  inner.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
}

function _slideshowAttachFitObserver() {
  if (_slideshowResizeObserver) {
    try { _slideshowResizeObserver.disconnect(); } catch (e) {}
    _slideshowResizeObserver = null;
  }
  var stage = document.getElementById('slideshow-stage');
  if (!stage || typeof ResizeObserver === 'undefined') return;
  _slideshowResizeObserver = new ResizeObserver(function() { _slideshowFit(); });
  _slideshowResizeObserver.observe(stage);
  if (!_slideshowFullscreenListenerAttached) {
    document.addEventListener('fullscreenchange', function() {
      requestAnimationFrame(_slideshowFit);
    });
    _slideshowFullscreenListenerAttached = true;
  }
}

function _slideshowRenderCurrent() {
  var slides = _slideshowGetVisibleSlides();
  if (!slides.length) return;
  var slide = slides[_slideshowIdx % slides.length];
  var slideEl = document.getElementById('slideshow-slide');
  var progressEl = document.getElementById('slideshow-progress');
  var descEl = document.getElementById('slideshow-description');
  if (!slideEl) return;
  slideEl.innerHTML =
    '<div class="slideshow-fit-inner">' +
      '<div class="slideshow-slide-title">' + esc(slide.title) + '</div>' +
      '<div class="slideshow-slide-body">' + slide.html + '</div>' +
    '</div>';
  // Fit the freshly-rendered slide on the next frame, once layout has settled
  requestAnimationFrame(_slideshowFit);
  if (descEl) {
    descEl.textContent = 'Viewing: ' + slide.title + ' · Slide ' + (_slideshowIdx + 1) + ' of ' + slides.length;
  }
  if (progressEl) {
    var dots = slides.map(function(s, i) {
      var cls = 'slideshow-dot' + (i === _slideshowIdx ? ' active' : '');
      return '<span class="' + cls + '" title="' + esc(s.title) + '" onclick="slideshowJump(' + i + ')"></span>';
    }).join('');
    progressEl.innerHTML = dots + '<span class="slideshow-counter">' + (_slideshowIdx + 1) + ' / ' + slides.length + '</span>';
  }
}

function _slideshowStartTimer() {
  _slideshowStopTimer();
  var slides = _slideshowGetVisibleSlides();
  if (!slides.length) return;
  var current = slides[_slideshowIdx % slides.length];
  _slideshowTimer = setTimeout(function() { slideshowNext(); }, current.durationMs);
}

function _slideshowStopTimer() {
  if (_slideshowTimer) { clearTimeout(_slideshowTimer); _slideshowTimer = null; }
}

function slideshowNext() {
  var slides = _slideshowGetVisibleSlides();
  if (!slides.length) return;
  _slideshowIdx = (_slideshowIdx + 1) % slides.length;
  _slideshowRenderCurrent();
  // Only restart the timer if we're not paused
  if (document.getElementById('slideshow-pause-btn') &&
      document.getElementById('slideshow-pause-btn').textContent === '⏸') {
    _slideshowStartTimer();
  }
}

function slideshowPrev() {
  var slides = _slideshowGetVisibleSlides();
  if (!slides.length) return;
  _slideshowIdx = (_slideshowIdx - 1 + slides.length) % slides.length;
  _slideshowRenderCurrent();
  if (document.getElementById('slideshow-pause-btn') &&
      document.getElementById('slideshow-pause-btn').textContent === '⏸') {
    _slideshowStartTimer();
  }
}

function slideshowJump(idx) {
  _slideshowIdx = idx;
  _slideshowRenderCurrent();
  if (document.getElementById('slideshow-pause-btn') &&
      document.getElementById('slideshow-pause-btn').textContent === '⏸') {
    _slideshowStartTimer();
  }
}

function slideshowTogglePause() {
  var btn = document.getElementById('slideshow-pause-btn');
  if (!btn) return;
  if (btn.textContent === '⏸') {
    btn.textContent = '▶';
    btn.title = 'Resume';
    _slideshowStopTimer();
  } else {
    btn.textContent = '⏸';
    btn.title = 'Pause';
    _slideshowStartTimer();
  }
}

function slideshowToggleFullscreen() {
  var stage = document.getElementById('slideshow-stage');
  if (!stage) return;
  if (!document.fullscreenElement) {
    var req = stage.requestFullscreen || stage.webkitRequestFullscreen || stage.mozRequestFullScreen;
    if (req) req.call(stage);
  } else {
    var exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (exit) exit.call(document);
  }
}

// Stop the timer when the user navigates away from the Slideshow tab.
// switchTab() doesn't have a tear-down hook, but our timer is harmless
// to leave running — the next render will restart it. We do nothing
// here intentionally.


// ─── Settings → System → Slideshow editor ────────────────────────────
// Admin-only panel. Stored in app_config.display_config (team-wide).
// Each slide row: enable checkbox, up/down arrows, title, duration override.
// Plus a global "default duration" input.

// Working copy of the config — populated when the editor opens, mutated
// by the row controls, persisted on Save. Reset by re-opening the editor.
var _slideshowEditDraft = null;

function _slideshowEnsureDraft() {
  if (_slideshowEditDraft) return _slideshowEditDraft;
  // Start from the live config (or default) and ensure every available
  // panel id is represented — any new panels added to Overview after
  // this config was last saved get appended at the end, enabled.
  var current = _slideshowGetConfig();
  var allPanels = (typeof getOverviewSlides === 'function') ? getOverviewSlides() : [];
  var panelTitleById = {};
  allPanels.forEach(function(p) { panelTitleById[p.id] = p.title; });

  var draft = {
    defaultDurationSec: current.defaultDurationSec || 15,
    slides: (current.slides || []).slice().map(function(s) {
      return { id: s.id, enabled: !!s.enabled, durationSec: s.durationSec || null };
    }),
  };
  // Add any panel not yet in the saved config
  var seen = {};
  draft.slides.forEach(function(s) { seen[s.id] = true; });
  allPanels.forEach(function(p) {
    if (!seen[p.id]) draft.slides.push({ id: p.id, enabled: true, durationSec: null });
  });
  // Drop any saved slide whose panel no longer exists
  draft.slides = draft.slides.filter(function(s) { return panelTitleById[s.id]; });
  _slideshowEditDraft = draft;
  return draft;
}

function buildSlideshowConfigPanel() {
  if (!isAdmin()) {
    return '<div class="settings-panel-title">Slideshow</div>' +
      '<div class="settings-panel-desc">Admin-only — only Team Leads can configure the slideshow.</div>';
  }
  // Reset draft on each panel open so the editor reflects current saved state.
  _slideshowEditDraft = null;
  var draft = _slideshowEnsureDraft();
  var allPanels = getOverviewSlides();
  var titleById = {};
  allPanels.forEach(function(p) { titleById[p.id] = p.title; });

  var html = '<div class="settings-panel-title">Slideshow</div>';
  html += '<div class="settings-panel-desc">Configure the lobby-display slideshow that cycles through the Overview dashboard panels. Members can opt in to see the Slideshow tab via their own Preferences. The slide list, order, and timing here are team-wide.</div>';

  // Default duration row
  html += '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">';
  html += '<label style="font-size:13px;font-weight:700;color:var(--text-body);">Default duration per slide</label>';
  html += '<input id="slideshow-default-dur" type="number" min="3" max="300" value="' + draft.defaultDurationSec + '" oninput="slideshowEditDefaultDur(this.value)" style="width:80px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:Lato,sans-serif;">';
  html += '<span style="font-size:12px;color:var(--text-muted);">seconds. Used when a slide doesn\'t have its own duration set.</span>';
  html += '</div>';

  // Slide rows
  html += '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:28px 36px 1fr 110px;gap:10px;align-items:center;padding:10px 14px;background:#FDFCF8;border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">';
  html += '<span title="Enabled"></span><span title="Reorder">Order</span><span>Slide</span><span style="text-align:right;">Duration</span>';
  html += '</div>';
  draft.slides.forEach(function(s, i) {
    var checked = s.enabled ? ' checked' : '';
    var durVal = s.durationSec != null ? s.durationSec : '';
    var title = titleById[s.id] || s.id;
    html += '<div style="display:grid;grid-template-columns:28px 36px 1fr 110px;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);">';
    html += '<input type="checkbox"' + checked + ' onchange="slideshowEditToggle(\'' + esc(s.id) + '\', this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--navy);">';
    html += '<div style="display:flex;flex-direction:column;gap:2px;">';
    html += '<button onclick="slideshowEditMove(\'' + esc(s.id) + '\', -1)"' + (i === 0 ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:#fff;border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (i === 0 ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▲</button>';
    html += '<button onclick="slideshowEditMove(\'' + esc(s.id) + '\', 1)"' + (i === draft.slides.length - 1 ? ' disabled' : '') + ' style="padding:0;width:30px;height:14px;border:1px solid var(--border);background:#fff;border-radius:3px;font-size:9px;cursor:pointer;line-height:1;color:var(--navy);' + (i === draft.slides.length - 1 ? 'opacity:0.3;cursor:not-allowed;' : '') + '">▼</button>';
    html += '</div>';
    html += '<div style="font-size:13px;color:var(--text-body);font-weight:600;">' + esc(title) + '</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;">';
    html += '<input type="number" min="3" max="300" value="' + durVal + '" placeholder="default" oninput="slideshowEditDur(\'' + esc(s.id) + '\', this.value)" style="width:80px;padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:Lato,sans-serif;text-align:right;">';
    html += '<span style="font-size:11px;color:var(--text-muted);">s</span>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Action buttons
  html += '<div style="margin-top:14px;display:flex;gap:8px;align-items:center;">';
  html += '<button onclick="slideshowEditSave()" class="settings-btn settings-btn-primary">Save changes</button>';
  html += '<button onclick="slideshowEditDiscard()" class="settings-btn" style="background:#fff;border:1px solid var(--border);color:var(--navy);">Discard</button>';
  html += '<span style="font-size:11px;color:var(--text-muted);margin-left:auto;">Changes apply to everyone next time they open the Slideshow tab.</span>';
  html += '</div>';

  return html;
}

function slideshowEditDefaultDur(v) {
  var draft = _slideshowEnsureDraft();
  var n = parseInt(v, 10);
  if (isNaN(n) || n < 3) n = 3;
  if (n > 300) n = 300;
  draft.defaultDurationSec = n;
}

function slideshowEditToggle(id, enabled) {
  var draft = _slideshowEnsureDraft();
  var s = draft.slides.find(function(x) { return x.id === id; });
  if (s) s.enabled = !!enabled;
}

function slideshowEditDur(id, v) {
  var draft = _slideshowEnsureDraft();
  var s = draft.slides.find(function(x) { return x.id === id; });
  if (!s) return;
  if (v === '' || v == null) {
    s.durationSec = null;
    return;
  }
  var n = parseInt(v, 10);
  if (isNaN(n) || n < 3) return; // ignore noise — re-rendering on every digit would be jumpy
  if (n > 300) n = 300;
  s.durationSec = n;
}

function slideshowEditMove(id, delta) {
  var draft = _slideshowEnsureDraft();
  var i = draft.slides.findIndex(function(x) { return x.id === id; });
  if (i < 0) return;
  var j = i + delta;
  if (j < 0 || j >= draft.slides.length) return;
  var tmp = draft.slides[i];
  draft.slides[i] = draft.slides[j];
  draft.slides[j] = tmp;
  // Re-render the editor so the row positions update
  renderSettingsPage(document.getElementById('content-area'));
}

async function slideshowEditSave() {
  if (!_slideshowEditDraft) return;
  try {
    var ok = await saveConfigKey('display_config', _slideshowEditDraft);
    if (!ok) throw new Error('Save returned false');
    // Apply to live config so the Slideshow tab reflects changes immediately
    _displayConfig = JSON.parse(JSON.stringify(_slideshowEditDraft));
    _slideshowEditDraft = null;
    showToast('Slideshow configuration saved.', 'success');
    renderSettingsPage(document.getElementById('content-area'));
  } catch (e) {
    console.error('[Slideshow] Save failed:', e);
    showToast('Save failed: ' + e.message, 'error');
  }
}

function slideshowEditDiscard() {
  _slideshowEditDraft = null;
  renderSettingsPage(document.getElementById('content-area'));
  showToast('Changes discarded.', 'info');
}
