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

// Default config used until the admin-managed app_config.display_config
// is loaded. All overview slides on, 15s each.
var _slideshowDefaultConfig = {
  defaultDurationSec: 15,
  slides: [
    { id: 'snapshot',  enabled: true, durationSec: null },
    { id: 'pipeline',  enabled: true, durationSec: null },
    { id: 'deadlines', enabled: true, durationSec: null },
    { id: 'priority',  enabled: true, durationSec: null },
    { id: 'category',  enabled: true, durationSec: null },
    { id: 'intake',    enabled: true, durationSec: null },
    { id: 'overdue',   enabled: true, durationSec: null },
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
}

function _slideshowRenderCurrent() {
  var slides = _slideshowGetVisibleSlides();
  if (!slides.length) return;
  var slide = slides[_slideshowIdx % slides.length];
  var slideEl = document.getElementById('slideshow-slide');
  var progressEl = document.getElementById('slideshow-progress');
  if (!slideEl) return;
  slideEl.innerHTML =
    '<div class="slideshow-slide-title">' + esc(slide.title) + '</div>' +
    '<div class="slideshow-slide-body">' + slide.html + '</div>';
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
