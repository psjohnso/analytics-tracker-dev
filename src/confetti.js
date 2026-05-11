// ─────────────────────────────────────────────────────────────────────
// confetti.js — tiny self-contained confetti burst, no dependencies.
//
// fireConfetti({ origin?, count?, colors? }) drops a fixed-position
// overlay onto the page, spawns N colored particles that fly up-and-out
// from the origin, then cleans itself up after ~2s. Anchors to the
// user's most recent mousedown position so completions feel anchored
// to the click. Respects UserPrefs.confetti (off-switch) and the OS
// prefers-reduced-motion setting.
// ─────────────────────────────────────────────────────────────────────

(function() {
  var _lastClickPos = null;
  document.addEventListener('mousedown', function(e) {
    _lastClickPos = { x: e.clientX, y: e.clientY };
  }, { passive: true, capture: true });
  window._getConfettiOrigin = function() {
    return _lastClickPos || { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  };
})();

var CONFETTI_COLORS = ['#FFDB22', '#C24200', '#83AC16', '#0088FF', '#7C3AED', '#EC4899', '#14B8A6', '#0C447C'];

function fireConfetti(opts) {
  opts = opts || {};
  if (typeof UserPrefs !== 'undefined' && UserPrefs && UserPrefs.confetti === false) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var origin = opts.origin || (typeof _getConfettiOrigin === 'function' ? _getConfettiOrigin() : { x: window.innerWidth / 2, y: window.innerHeight * 0.4 });
  var count = opts.count || 36;
  var colors = opts.colors || CONFETTI_COLORS;

  var container = document.createElement('div');
  container.className = 'confetti-burst';
  container.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:9999;';
  document.body.appendChild(container);

  for (var i = 0; i < count; i++) {
    var p = document.createElement('span');
    var size = 6 + Math.random() * 7;
    var color = colors[i % colors.length];
    // Bias upward: angle between -36° and -144° from horizontal.
    var angle = Math.PI * (-0.2 - Math.random() * 0.6);
    var speed = 140 + Math.random() * 180;
    var dx = Math.cos(angle) * speed;
    var dy = Math.sin(angle) * speed;
    var grav = 140 + Math.random() * 80;
    var rot = (Math.random() * 720 - 360) + 'deg';
    var dur = (0.9 + Math.random() * 0.7).toFixed(2) + 's';
    p.style.cssText =
      'position:absolute;' +
      'left:' + origin.x + 'px;' +
      'top:' + origin.y + 'px;' +
      'width:' + size.toFixed(1) + 'px;' +
      'height:' + (size * 0.5).toFixed(1) + 'px;' +
      'background:' + color + ';' +
      'border-radius:1px;' +
      'transform:translate(0,0) rotate(0deg);' +
      'opacity:1;' +
      'animation:confettiPiece ' + dur + ' cubic-bezier(0.15,0.9,0.45,1) forwards;' +
      '--cf-dx:' + dx.toFixed(0) + 'px;' +
      '--cf-dy:' + dy.toFixed(0) + 'px;' +
      '--cf-grav:' + grav.toFixed(0) + 'px;' +
      '--cf-r:' + rot + ';';
    container.appendChild(p);
  }
  setTimeout(function() { if (container.parentNode) container.parentNode.removeChild(container); }, 2000);
}
