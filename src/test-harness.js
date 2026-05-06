// ─────────────────────────────────────────────────────────────────────
// test-harness.js — pure-function smoke tests
//
// Activates only when the URL has ?test=1. Renders an overlay panel
// with assertion results for the pure helpers extracted across the
// refactor. Catches regressions in date math, escaping, CSV building,
// fiscal-quarter logic, status colors, and dependency reference parsing.
//
// No DOM dependencies on app state, no AGOL calls. Safe to run before
// or after the main app boots.
// ─────────────────────────────────────────────────────────────────────

(function () {
  if (!new URLSearchParams(window.location.search).has('test')) return;

  var results = [];
  var passed = 0;
  var failed = 0;

  function assert(label, actual, expected) {
    var ok = deepEqual(actual, expected);
    results.push({ label: label, ok: ok, actual: actual, expected: expected });
    if (ok) passed++; else failed++;
  }

  function assertMatch(label, actual, regex) {
    var ok = typeof actual === 'string' && regex.test(actual);
    results.push({ label: label, ok: ok, actual: actual, expected: regex.toString() });
    if (ok) passed++; else failed++;
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      if (!deepEqual(a[ka[i]], b[ka[i]])) return false;
    }
    return true;
  }

  // ── HTML / attribute escaping ──────────────────────────────
  assert('esc(null) → empty', esc(null), '');
  assert('esc(undefined) → empty', esc(undefined), '');
  assert('esc("") → empty', esc(''), '');
  assert('esc passes plain text through', esc('hello world'), 'hello world');
  assert('esc encodes <script>', esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert('esc encodes & and "', esc('a & b "c"'), 'a &amp; b &quot;c&quot;');

  assert('escapeAttr(null) → empty', escapeAttr(null), '');
  assert('escapeAttr passes plain through', escapeAttr('Jane Doe'), 'Jane Doe');

  // ── Date / time formatting ─────────────────────────────────
  assert('epochToDateStr passthrough YYYY-MM-DD', epochToDateStr('2026-05-15'), '2026-05-15');
  assert('epochToDateStr null → empty', epochToDateStr(null), '');
  assert('epochToDateStr undefined → empty', epochToDateStr(undefined), '');
  assert('epochToDateStr 0 (UTC epoch)', epochToDateStr(0), '1970-01-01');

  assert('formatTimeShort 0 → em dash', formatTimeShort(0), '—');
  assert('formatTimeShort null → em dash', formatTimeShort(null), '—');

  assert('formatTimerChip 0 → 00:00:00', formatTimerChip(0), '00:00:00');
  assert('formatTimerChip 1h1m1s', formatTimerChip(3661000), '01:01:01');
  assert('formatTimerChip negative clamped', formatTimerChip(-1000), '00:00:00');
  assert('formatTimerChip 12h', formatTimerChip(12 * 3600 * 1000), '12:00:00');

  // ── Project Review date helpers ────────────────────────────
  assert('prFmtDateShort null → em dash', prFmtDateShort(null), '—');
  assert('prDaysSince null → null', prDaysSince(null), null);
  var fiveDaysAgo = Date.now() - 86400000 * 5;
  var ds = prDaysSince(fiveDaysAgo);
  assert('prDaysSince ~5 days ago', ds === 4 || ds === 5, true); // tolerate boundary

  // Date round-trip
  assert(
    'prEpochToInputDate(prDateToEpoch(YYYY-MM-DD)) round-trips',
    prEpochToInputDate(prDateToEpoch('2026-05-15')),
    '2026-05-15'
  );
  assert('prDateToEpoch invalid → null', prDateToEpoch(''), null);
  assert('prDateToEpoch malformed → null', prDateToEpoch('not-a-date'), null);

  // ── Dependency reference parsing ───────────────────────────
  assert('isProjectRef("P-001") → true', isProjectRef('P-001'), true);
  assert('isProjectRef("P-1") → true', isProjectRef('P-1'), true);
  assert('isProjectRef("P-001-001") → false (task)', isProjectRef('P-001-001'), false);
  assert('isProjectRef("foo") → false', isProjectRef('foo'), false);
  assert('isProjectRef("") → false', isProjectRef(''), false);

  // ── CSV building ───────────────────────────────────────────
  assert('csvEscape null → empty', csvEscape(null), '');
  assert('csvEscape undefined → empty', csvEscape(undefined), '');
  assert('csvEscape plain', csvEscape('hello'), 'hello');
  assert('csvEscape with comma quotes', csvEscape('a,b'), '"a,b"');
  assert('csvEscape with quote doubles', csvEscape('a"b'), '"a""b"');
  assert('csvEscape with newline quotes', csvEscape('a\nb'), '"a\nb"');
  assert('csvEscape number', csvEscape(42), '42');

  assert(
    'buildCsv simple',
    buildCsv(['a', 'b'], [{ a: 1, b: 2 }]),
    'a,b\r\n1,2\r\n'
  );
  assert(
    'buildCsv quotes commas',
    buildCsv(['a'], [{ a: 'has,comma' }]),
    'a\r\n"has,comma"\r\n'
  );
  assert(
    'buildCsv multiple rows',
    buildCsv(['x', 'y'], [{ x: 1, y: 2 }, { x: 3, y: 4 }]),
    'x,y\r\n1,2\r\n3,4\r\n'
  );

  // ── Status colors ──────────────────────────────────────────
  assert('STATUS_COLOR Active → Saguaro Green', STATUS_COLOR('Active'), '#83AC16');
  assert('STATUS_COLOR Idea → Sonoran Sand', STATUS_COLOR('Idea'), '#E5D086');
  assert('STATUS_COLOR On Hold → Sun Yellow', STATUS_COLOR('On Hold'), '#FFDB22');
  assert('STATUS_COLOR empty → fallback gray', STATUS_COLOR(''), '#9CA3AF');
  assertMatch('STATUS_COLOR unknown → deterministic hex', STATUS_COLOR('NewStatus42'), /^#[0-9A-F]{6}$/i);
  // Same input → same output
  assert(
    'STATUS_COLOR unknown is deterministic',
    STATUS_COLOR('Foobar'),
    STATUS_COLOR('Foobar')
  );

  assert('STATUS_TEXT_COLOR On Hold → dark navy', STATUS_TEXT_COLOR('On Hold'), '#002669');
  assert('STATUS_TEXT_COLOR Idea → dark navy', STATUS_TEXT_COLOR('Idea'), '#002669');
  assert('STATUS_TEXT_COLOR Active → white', STATUS_TEXT_COLOR('Active'), '#ffffff');
  assert('STATUS_TEXT_COLOR Complete → white', STATUS_TEXT_COLOR('Complete'), '#ffffff');

  // ── Tucson fiscal-quarter math ─────────────────────────────
  // FY runs Jul 1 → Jun 30. FY-name = year FY ends in.
  // Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun.
  var q = prFiscalQuarter('2026-07-15');
  assert('prFiscalQuarter Jul → Q1, FY27', q && q.q === 1 && q.fyYear === 2027, true);

  q = prFiscalQuarter('2026-04-15');
  assert('prFiscalQuarter Apr → Q4, FY26', q && q.q === 4 && q.fyYear === 2026, true);

  q = prFiscalQuarter('2026-01-15');
  assert('prFiscalQuarter Jan → Q3, FY26', q && q.q === 3 && q.fyYear === 2026, true);

  q = prFiscalQuarter('2025-12-31');
  assert('prFiscalQuarter Dec → Q2, FY26', q && q.q === 2 && q.fyYear === 2026, true);

  assert('prFiscalQuarter null → null', prFiscalQuarter(null), null);
  assert('prFiscalQuarter empty → null', prFiscalQuarter(''), null);
  assert('prFiscalQuarter malformed → null', prFiscalQuarter('not-a-date'), null);

  // ── Lifecycle phase requirements ──────────────────────────
  assert('parsePhaseReqs no task → []', parsePhaseReqs(null), []);
  assert('parsePhaseReqs no field → []', parsePhaseReqs({}), []);
  assert(
    'parsePhaseReqs splits and trims',
    parsePhaseReqs({ phase_requirements: 'P1_GOALS, P3_DEMOS ' }),
    ['P1_GOALS', 'P3_DEMOS']
  );

  // resolveReqInfo against an actual requirement
  var info = resolveReqInfo('P0_SPONSOR');
  assert('resolveReqInfo finds known req', info && info.phaseId === 0, true);
  assert('resolveReqInfo unknown → fallback', resolveReqInfo('UNKNOWN_ID') != null, true);

  // ── PRIORITY_ORDER spot check ──────────────────────────────
  assert('PRIORITY_ORDER High → 0', PRIORITY_ORDER.High, 0);
  assert('PRIORITY_ORDER Medium → 1', PRIORITY_ORDER.Medium, 1);
  assert('PRIORITY_ORDER Low → 2', PRIORITY_ORDER.Low, 2);

  // ── BETA_FEATURES registry ─────────────────────────────────
  assert('BETA_FEATURES has dependencies', !!BETA_FEATURES.dependencies, true);
  assert('BETA_FEATURES has projectReview', !!BETA_FEATURES.projectReview, true);
  assert(
    'BETA_FEATURES.dependencies maps to FEATURE_DEPENDENCIES flag',
    BETA_FEATURES.dependencies.flag,
    'FEATURE_DEPENDENCIES'
  );

  // ── Render results panel ───────────────────────────────────
  function renderResults() {
    var bg = failed === 0 ? '#0F4C2E' : '#7C2D12';
    var summaryBg = failed === 0 ? '#83AC16' : '#EF4444';
    var html =
      '<div id="test-harness-panel" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.92);color:#fff;font-family:Lato,sans-serif;z-index:99999;overflow-y:auto;padding:24px;">' +
      '<div style="max-width:900px;margin:0 auto;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;">' +
      '<div style="font-size:24px;font-weight:800;">🧪 Smoke tests</div>' +
      '<button onclick="document.getElementById(\'test-harness-panel\').remove();" style="padding:6px 16px;background:#fff;color:#000;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Close ✕</button>' +
      '</div>' +
      '<div style="display:inline-block;padding:8px 18px;border-radius:8px;background:' + summaryBg + ';font-size:15px;font-weight:700;margin-bottom:18px;">' +
      passed + ' / ' + (passed + failed) + ' passed' +
      (failed > 0 ? ' · ' + failed + ' failed' : '') +
      '</div>' +
      '<div style="background:' + bg + ';border-radius:8px;padding:4px;">';

    results.forEach(function (r) {
      var icon = r.ok ? '✓' : '✗';
      var color = r.ok ? '#83AC16' : '#FCA5A5';
      html +=
        '<div style="padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;font-family:monospace;">' +
        '<span style="color:' + color + ';font-weight:700;margin-right:8px;font-size:15px;">' + icon + '</span>' +
        '<span style="opacity:' + (r.ok ? 0.85 : 1) + ';">' + esc(r.label) + '</span>';
      if (!r.ok) {
        html +=
          '<div style="margin-top:6px;margin-left:24px;font-size:11px;opacity:0.85;">' +
          'expected: <code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;">' + esc(JSON.stringify(r.expected)) + '</code><br>' +
          'actual: <code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;">' + esc(JSON.stringify(r.actual)) + '</code>' +
          '</div>';
      }
      html += '</div>';
    });

    html += '</div></div></div>';

    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderResults);
  } else {
    renderResults();
  }

  console.log('[test-harness] ' + passed + ' / ' + (passed + failed) + ' passed' + (failed > 0 ? ' · ' + failed + ' failed' : ''));
})();
