// ─────────────────────────────────────────────────────────────────────
// risk.js — In-flight Project Risk Score
//
// A transparent, additive early-warning score for active projects, built
// from leading indicators already in the data. Every score shows the
// factors that drove it — no black box. Weights/thresholds and the
// calibration set (reference projects per failure mode) are admin-tunable
// and persisted to app_config under the key 'risk_config'.
//
// Surfaces:
//   - Insights tab: buildRiskSection()  (At-Risk rollup + per-project breakdown)
//   - Settings tab: renderRiskConfigPanel()  (weights/thresholds + calibration editor)
//
// Forward refs (globals): PROJECTS, TASKS, esc, isAdmin, saveConfigKey,
// showToast, currentTab.
// ─────────────────────────────────────────────────────────────────────

// ── Factor + failure-mode metadata ───────────────────────────────────
// `live` factors compute from current data; `pending` factors are wired
// but degrade to n/a until their data source exists (snapshots / task
// creation history) — their weight is redistributed so nothing is
// penalized for missing data.
const RISK_FACTORS = [
  { key: 'schedule_drift', label: 'Schedule drift',        status: 'live',    desc: 'working_due slip vs committed end; elapsed vs the calibrated expected duration' },
  { key: 'overdue_aging',  label: 'Overdue & aging tasks', status: 'live',    desc: 'share of open tasks overdue + oldest open-task age' },
  { key: 'stalled',        label: 'Stalled work',          status: 'live',    desc: 'open tasks sitting in Waiting for Response / On Hold' },
  { key: 'pace',           label: 'Pace vs plan',          status: 'live',    desc: '% of tasks done vs % of schedule elapsed' },
  { key: 'single_thread',  label: 'Single-thread staffing',status: 'live',    desc: "lead's concurrent project load vs the team norm (bus-factor)" },
  { key: 'scope_churn',    label: 'Scope churn',           status: 'pending', desc: 'tasks added after start (needs task creation history)' },
  { key: 'plan_actual_burn', label: 'Plan-vs-actual burn', status: 'pending', desc: 'allocation actual vs estimate (needs snapshot history)' }
];

const RISK_MODES = [
  { key: 'schedule_blowout', label: 'Schedule blowout', expect: 'red'   },
  { key: 'single_thread',    label: 'Single-thread / overstretched lead', expect: 'red' },
  { key: 'partner_blocked',  label: 'Partner-blocked / stalled', expect: 'red' },
  { key: 'scope_churn',      label: 'Scope churn', expect: 'red' },
  { key: 'moderate',         label: 'Moderate slip (watch)', expect: 'amber' },
  { key: 'healthy',          label: 'Healthy (control)', expect: 'green' }
];

// ── Default config (overridden by app_config 'risk_config') ───────────
const RISK_DEFAULT_CONFIG = {
  weights: {
    schedule_drift: 25, overdue_aging: 20, stalled: 15, pace: 15,
    single_thread: 5, scope_churn: 10, plan_actual_burn: 10
  },
  thresholds: {
    min_planned_weeks: 2,      // floor before trusting the schedule ratio
    drift_full_ratio: 1.5,     // elapsed/expected at which schedule drift maxes out
    overdue_full_share: 0.5,   // share of open tasks overdue for full severity
    aging_full_days: 60,       // oldest open-task age for full severity
    stalled_full_count: 3,     // # of Waiting/On-Hold tasks for full severity
    pace_gap_full: 0.4,        // gap between %elapsed and %done for full severity
    single_thread_tail: 20     // lead concurrency (above team norm) for full severity
  },
  bands: { watch: 25, atrisk: 50 }, // <watch = healthy, <atrisk = watch, else at risk
  calibration: [
    { title: 'City Manager Dashboard',                          mode: 'schedule_blowout', note: '37 → 81 wks, +287d drift' },
    { title: 'Dashboard for Water Conservation Programs (Rebates)', mode: 'single_thread', note: '+339d slip, lead juggling 21' },
    { title: 'Ivanti Push for Power BI',                        mode: 'schedule_blowout', note: '5.7 → 35 wks, 6.1×' },
    { title: 'Migrate Park Tucson Permit Reports to Power BI',  mode: 'moderate',         note: '11.7 → 18.7 wks, +38d' },
    { title: 'ADA Accessibility Compliance - City GIS Sites',   mode: 'healthy',          note: '27.6 → 30 wks, +6d — should stay green' }
  ]
};

// Live config — deep clone of defaults until app_config loads.
var _riskConfig = JSON.parse(JSON.stringify(RISK_DEFAULT_CONFIG));

// Merge a parsed app_config payload over the defaults (forward-compatible:
// unknown keys ignored, missing keys keep their default).
function applyRiskConfig(parsed) {
  if (!parsed || typeof parsed !== 'object') return;
  if (parsed.weights)   Object.assign(_riskConfig.weights, parsed.weights);
  if (parsed.thresholds) Object.assign(_riskConfig.thresholds, parsed.thresholds);
  if (parsed.bands)     Object.assign(_riskConfig.bands, parsed.bands);
  if (Array.isArray(parsed.calibration)) _riskConfig.calibration = parsed.calibration;
}

// ── Small helpers ─────────────────────────────────────────────────────
function _rkMs(s) { return s ? new Date(s + 'T12:00:00').getTime() : null; }
function _rkClamp(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
function _rkWeeks(a, b) { return (a != null && b != null) ? (b - a) / (7 * 86400000) : null; }
function _rkBand(score) {
  var b = _riskConfig.bands;
  if (score >= (b.atrisk != null ? b.atrisk : 50)) return 'red';
  if (score >= (b.watch  != null ? b.watch  : 25)) return 'amber';
  return 'green';
}
function _rkBandColor(band) {
  if (band === 'red')   return { bg: '#FECACA', fg: '#991B1B', dot: '#DC2626', label: 'At risk' };
  if (band === 'amber') return { bg: '#FEF9C3', fg: '#854D0E', dot: '#CA8A04', label: 'Watch' };
  return { bg: '#DCFCE7', fg: '#166534', dot: '#16A34A', label: 'Healthy' };
}
function _rkActive(p) { return p.status === 'Active' || p.status === 'Scheduled'; }
function _rkTasksFor(pn) {
  if (typeof TASKS === 'undefined') return [];
  return TASKS.filter(function(t) { return String(t.project_id) === String(pn); });
}

// ── Reference-class duration multipliers, by category ─────────────────
// Median actual÷planned weeks across completed projects (planned floored
// at min_planned_weeks so placeholder end-dates don't distort).
function _rkCategoryMultipliers() {
  var floor = _riskConfig.thresholds.min_planned_weeks || 2;
  var byCat = {};
  (typeof PROJECTS !== 'undefined' ? PROJECTS : []).forEach(function(p) {
    if (p.status !== 'Complete') return;
    var s = _rkMs(p.start), e = _rkMs(p.end), ae = _rkMs(p.actual_end);
    var planned = _rkWeeks(s, e), actual = _rkWeeks(s, ae);
    if (planned == null || actual == null || planned < floor) return;
    var cat = p.category || 'Uncategorized';
    (byCat[cat] = byCat[cat] || []).push(actual / planned);
  });
  var out = {};
  Object.keys(byCat).forEach(function(c) {
    var a = byCat[c].sort(function(x, y) { return x - y; });
    out[c] = a[Math.floor(a.length / 2)];
  });
  return out;
}

// Lead concurrency: # of other projects led by the same contact whose active
// window overlaps this project's. Computed once per render into a context.
function _rkBuildContext() {
  var projs = (typeof PROJECTS !== 'undefined' ? PROJECTS : []);
  var now = Date.now();
  var withWin = projs.map(function(p) {
    var s = _rkMs(p.start);
    if (s == null) return null;
    var e = _rkMs(p.actual_end) || _rkMs(p.end) || _rkMs(p.working_due) || now;
    return { p: p, lead: (p.contact || '').trim(), w: [s, Math.max(e, s)] };
  }).filter(Boolean);
  function concurrency(p) {
    var me = withWin.find(function(x) { return x.p === p; });
    if (!me || !me.lead) return 0;
    return withWin.filter(function(y) {
      return y.p !== p && y.lead === me.lead && me.w[0] <= y.w[1] && y.w[0] <= me.w[1];
    }).length;
  }
  // Team norm = median concurrency across leads (so the factor is relative —
  // everyone being stretched is the baseline, not an anomaly).
  var counts = withWin.map(function(x) { return concurrency(x.p); }).sort(function(a, b) { return a - b; });
  var norm = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  return { catMult: _rkCategoryMultipliers(), concurrency: concurrency, norm: norm, now: now };
}

// ── The scoring engine ────────────────────────────────────────────────
// Returns { score, band, factors:[{key,label,weight,severity,points,detail,na}] }.
// Works on active projects (in-flight signals) and completed projects
// (retrospective signals — schedule drift + single-thread dominate), which
// is what lets the calibration preview validate the weighting.
function computeProjectRisk(p, ctx, tasksOverride) {
  ctx = ctx || _rkBuildContext();
  var th = _riskConfig.thresholds, w = _riskConfig.weights;
  var tasks = tasksOverride || _rkTasksFor(p.project_number != null ? p.project_number : p.id);
  var openTasks = tasks.filter(function(t) { return t.status !== 'Complete' && t.status !== 'Canceled'; });
  var completed = !!p.actual_end;
  var s = _rkMs(p.start), e = _rkMs(p.end), ae = _rkMs(p.actual_end), wd = _rkMs(p.working_due);
  var todayStr = new Date().toISOString().slice(0, 10);

  var sev = {}; var detail = {};

  // 1. Schedule drift
  (function() {
    var plannedW = _rkWeeks(s, e);
    if (plannedW == null) { sev.schedule_drift = null; return; }
    plannedW = Math.max(plannedW, th.min_planned_weeks || 2);
    var ratio, det;
    if (completed) {
      var actualW = _rkWeeks(s, ae);
      ratio = actualW / plannedW;
      det = ratio.toFixed(2) + '× planned (' + Math.round(_rkWeeks(s, e)) + '→' + Math.round(actualW) + ' wks)';
    } else {
      var elapsedW = _rkWeeks(s, ctx.now);
      var wdW = (wd != null) ? _rkWeeks(s, wd) : null;
      ratio = Math.max(elapsedW || 0, wdW || 0) / plannedW;
      var slipDays = (wd != null && e != null) ? Math.round((wd - e) / 86400000) : null;
      det = ratio.toFixed(2) + '× the expected timeline' + (slipDays > 0 ? ' · target slipped ' + slipDays + 'd' : '');
    }
    var full = (th.drift_full_ratio || 1.5);
    sev.schedule_drift = _rkClamp((ratio - 1) / (full - 1));
    detail.schedule_drift = det;
  })();

  // 2. Overdue & aging tasks (in-flight signal — n/a once the project is done)
  (function() {
    if (completed) { sev.overdue_aging = null; detail.overdue_aging = 'completed — n/a'; return; }
    if (!tasks.length) { sev.overdue_aging = null; return; }
    if (!openTasks.length) { sev.overdue_aging = 0; detail.overdue_aging = 'all tasks closed'; return; }
    var overdue = openTasks.filter(function(t) { return t.due && t.due < todayStr; });
    var share = overdue.length / openTasks.length;
    var oldest = 0;
    openTasks.forEach(function(t) { var ts = _rkMs(t.start); if (ts) oldest = Math.max(oldest, (ctx.now - ts) / 86400000); });
    var sShare = share / (th.overdue_full_share || 0.5);
    var sAge = oldest / (th.aging_full_days || 60);
    sev.overdue_aging = _rkClamp(Math.max(sShare, sAge));
    detail.overdue_aging = overdue.length + ' of ' + openTasks.length + ' open overdue' + (oldest ? ' · oldest ' + Math.round(oldest) + 'd' : '');
  })();

  // 3. Stalled work (in-flight signal — n/a once the project is done)
  (function() {
    if (completed) { sev.stalled = null; detail.stalled = 'completed — n/a'; return; }
    if (!tasks.length) { sev.stalled = null; return; }
    var stalled = openTasks.filter(function(t) { return t.status === 'Waiting for Response' || t.status === 'On Hold'; });
    sev.stalled = _rkClamp(stalled.length / (th.stalled_full_count || 3));
    detail.stalled = stalled.length ? stalled.length + ' task' + (stalled.length === 1 ? '' : 's') + ' waiting / on hold' : 'none stalled';
  })();

  // 4. Pace vs plan (in-flight only)
  (function() {
    if (completed || !tasks.length || s == null || e == null || e <= s) { sev.pace = null; return; }
    var doneCount = tasks.filter(function(t) { return t.status === 'Complete'; }).length;
    var pctDone = doneCount / tasks.length;
    var pctElapsed = _rkClamp((ctx.now - s) / (e - s));
    var gap = pctElapsed - pctDone;
    sev.pace = _rkClamp(gap / (th.pace_gap_full || 0.4));
    detail.pace = Math.round(pctDone * 100) + '% done at ' + Math.round(pctElapsed * 100) + '% elapsed';
  })();

  // 5. Single-thread staffing (relative to team norm)
  (function() {
    var lead = (p.contact || '').trim();
    if (!lead) { sev.single_thread = null; return; }
    var c = ctx.concurrency(p);
    var tail = th.single_thread_tail || 20;
    var span = Math.max(1, tail - ctx.norm);
    sev.single_thread = _rkClamp((c - ctx.norm) / span);
    detail.single_thread = lead + ' leads ' + c + ' concurrent (team norm ' + ctx.norm + ')';
  })();

  // 6 & 7. Pending factors — degrade to n/a until their data exists.
  sev.scope_churn = null; detail.scope_churn = 'needs task creation history';
  sev.plan_actual_burn = null; detail.plan_actual_burn = 'needs snapshot history';

  // Aggregate over available factors; redistribute weight of n/a factors.
  var factors = [], availWeight = 0, gotPoints = 0;
  RISK_FACTORS.forEach(function(f) {
    var weight = w[f.key] || 0;
    var sv = sev[f.key];
    if (sv == null) {
      factors.push({ key: f.key, label: f.label, weight: weight, severity: null, points: 0, detail: detail[f.key] || 'no data', na: true });
    } else {
      availWeight += weight;
      var pts = weight * sv;
      gotPoints += pts;
      factors.push({ key: f.key, label: f.label, weight: weight, severity: sv, points: pts, detail: detail[f.key] || '', na: false });
    }
  });
  var score = availWeight > 0 ? Math.round(gotPoints / availWeight * 100) : 0;
  return { score: score, band: _rkBand(score), factors: factors, availWeight: availWeight };
}

// ══════════════════════════════════════════════════════════════════════
//  INSIGHTS SURFACE — At-Risk rollup + per-project breakdown
// ══════════════════════════════════════════════════════════════════════
function _rkBadge(score, band) {
  var c = _rkBandColor(band);
  return '<span style="display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:12px;padding:3px 10px;border-radius:999px;background:' + c.bg + ';color:' + c.fg + ';font-variant-numeric:tabular-nums;">' +
    '<span style="width:8px;height:8px;border-radius:50%;background:' + c.dot + ';"></span>' + score + '</span>';
}
function _rkChips(factors) {
  // Top 3 contributing factors as chips.
  return factors.filter(function(f) { return !f.na && f.points > 0; })
    .sort(function(a, b) { return b.points - a.points; })
    .slice(0, 3)
    .map(function(f) {
      var sevHi = f.severity >= 0.66;
      var bg = sevHi ? '#FEE2E2' : '#FEF3C7', fg = sevHi ? '#991B1B' : '#92400E';
      return '<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;background:' + bg + ';color:' + fg + ';margin:1px 3px 1px 0;">' + esc(f.detail || f.label) + '</span>';
    }).join('') || '<span style="font-size:11px;color:var(--text-muted);">on track</span>';
}

function buildRiskSection() {
  // Leads/admins only — it's a management lens.
  if (typeof can === 'function' ? !can('risk_review') : (typeof isAdmin !== 'function' || !isAdmin())) return '';
  var ctx = _rkBuildContext();
  var inflight = (typeof PROJECTS !== 'undefined' ? PROJECTS : []).filter(_rkActive);
  var scored = inflight.map(function(p) { return { p: p, r: computeProjectRisk(p, ctx) }; })
    .sort(function(a, b) { return b.r.score - a.r.score; });

  var html = '<div style="margin-bottom:28px;">';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;">';
  html += '<div style="font-size:18px;font-weight:800;color:var(--navy);">At-Risk Projects</div>';
  html += '<span style="font-size:10px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:8px;"><svg class="icon" aria-hidden="true"><use href="#ph-lock"></use></svg> Leads &amp; admins</span>';
  html += '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">In-flight early-warning score from leading indicators (schedule drift, overdue/aging tasks, stalled work, pace, single-thread staffing). Additive and transparent — click a project for the per-factor breakdown. Tune weights and the calibration set in Settings → Project Risk.</div>';

  if (!scored.length) {
    html += '<div style="background:var(--white);border:1px dashed #E8E6DF;border-radius:10px;padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No active or scheduled projects to score.</div></div>';
    return html;
  }

  html += '<div style="overflow-x:auto;border:1px solid #E8E6DF;border-radius:10px;background:var(--white);"><table class="member-table" style="margin:0;"><thead><tr>';
  html += '<th>Project</th><th style="text-align:center;">Risk</th><th>Top drivers</th><th>Lead</th></tr></thead><tbody>';
  scored.forEach(function(row, i) {
    var p = row.p, r = row.r, id = 'rk' + i;
    html += '<tr style="cursor:pointer;" onclick="rkToggle(\'' + id + '\')">';
    html += '<td style="font-weight:700;color:var(--navy);"><span id="rk-caret-' + id + '" style="display:inline-block;width:12px;color:var(--text-muted);">▸</span> ' + esc(p.title) + '</td>';
    html += '<td style="text-align:center;">' + _rkBadge(r.score, r.band) + '</td>';
    html += '<td>' + _rkChips(r.factors) + '</td>';
    html += '<td style="font-size:12px;">' + esc(p.contact || '—') + '</td></tr>';
    // Hidden breakdown row
    html += '<tr data-rk-parent="' + id + '" style="display:none;background:var(--surface-2);"><td colspan="4" style="padding:12px 18px;">';
    html += _rkBreakdownHtml(r);
    html += '</td></tr>';
  });
  html += '</tbody></table></div>';
  html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;margin-top:8px;">Two factors (scope churn, plan-vs-actual burn) are wired but show n/a until task-creation and snapshot history accrue — their weight is redistributed so scores aren’t penalized for missing data.</div>';
  return html + '</div>';
}

function _rkBreakdownHtml(r) {
  var html = '<div style="font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Score breakdown — ' + r.score + '/100</div>';
  html += '<div style="display:flex;flex-direction:column;gap:5px;">';
  r.factors.forEach(function(f) {
    var pct = f.weight > 0 ? Math.round((f.na ? 0 : f.severity) * 100) : 0;
    var barColor = f.na ? '#E5E7EB' : (f.severity >= 0.66 ? '#DC2626' : f.severity >= 0.33 ? '#CA8A04' : '#16A34A');
    html += '<div style="display:grid;grid-template-columns:170px 1fr 90px;gap:10px;align-items:center;' + (f.na ? 'opacity:0.5;' : '') + '">';
    html += '<div><div style="font-weight:700;font-size:12px;color:var(--navy);">' + esc(f.label) + '</div><div style="font-size:11px;color:var(--text-muted);">' + esc(f.detail) + '</div></div>';
    html += '<div style="height:9px;background:var(--surface-2);border-radius:5px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:' + barColor + ';"></div></div>';
    html += '<div style="text-align:right;font-weight:800;font-size:12px;font-variant-numeric:tabular-nums;">' + (f.na ? 'n/a' : (Math.round(f.points) + '/' + f.weight)) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function rkToggle(id) {
  var rows = document.querySelectorAll('[data-rk-parent="' + id + '"]');
  var caret = document.getElementById('rk-caret-' + id);
  var anyHidden = false;
  rows.forEach(function(r) { if (r.style.display === 'none') anyHidden = true; });
  rows.forEach(function(r) { r.style.display = anyHidden ? '' : 'none'; });
  if (caret) caret.textContent = anyHidden ? '▾' : '▸';
}

// ══════════════════════════════════════════════════════════════════════
//  SETTINGS PANEL — weights / thresholds + calibration editor
// ══════════════════════════════════════════════════════════════════════
function _rkResolveProject(entry) {
  var projs = (typeof PROJECTS !== 'undefined' ? PROJECTS : []);
  if (entry.project_number != null) {
    var byNum = projs.find(function(p) { return String(p.project_number) === String(entry.project_number); });
    if (byNum) return byNum;
  }
  if (entry.title) {
    var t = entry.title.toLowerCase();
    return projs.find(function(p) { return (p.title || '').toLowerCase() === t; }) || null;
  }
  return null;
}

function renderRiskConfigPanel() {
  var c = document.getElementById('risk-config-panel');
  if (!c) return;
  var w = _riskConfig.weights, th = _riskConfig.thresholds, b = _riskConfig.bands;
  var totalWeight = RISK_FACTORS.reduce(function(s, f) { return s + (w[f.key] || 0); }, 0);

  var html = '';

  // Weights
  html += '<div class="settings-section"><div class="settings-section-header">Factor weights</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Relative weight of each risk factor. The score is the weighted average of the factors that have data (n/a factors are excluded and their weight redistributed). Total: <strong id="rk-weight-total">' + totalWeight + '</strong>.</div>';
  html += '<div class="tbl-wrap" style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:8px 14px;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html += '<thead><tr><th style="text-align:left;padding:6px;">Factor</th><th style="width:90px;text-align:right;padding:6px;">Weight</th><th style="text-align:left;padding:6px;">What it measures</th></tr></thead><tbody>';
  RISK_FACTORS.forEach(function(f) {
    var statusTag = f.status === 'pending' ? ' <span style="font-size:9px;font-weight:700;background:var(--surface-2);color:#6B7280;padding:1px 5px;border-radius:6px;">pending data</span>' : '';
    html += '<tr><td style="padding:6px;font-weight:700;color:var(--navy);">' + esc(f.label) + statusTag + '</td>';
    html += '<td style="padding:6px;text-align:right;"><input type="number" min="0" max="100" value="' + (w[f.key] || 0) + '" onchange="rkCfgSet(\'weights\',\'' + f.key + '\',this.value)" style="width:64px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;text-align:right;"></td>';
    html += '<td style="padding:6px;color:var(--text-muted);">' + esc(f.desc) + '</td></tr>';
  });
  html += '</tbody></table></div></div>';

  // Thresholds + bands
  html += '<div class="settings-section"><div class="settings-section-header">Thresholds &amp; bands</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">The point at which each factor reaches full severity, and the score cutoffs for the colored bands.</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">';
  var thRows = [
    ['min_planned_weeks', 'Min planned weeks (drift floor)'],
    ['drift_full_ratio', 'Drift full at × expected'],
    ['overdue_full_share', 'Overdue full at share (0–1)'],
    ['aging_full_days', 'Aging full at days'],
    ['stalled_full_count', 'Stalled full at # tasks'],
    ['pace_gap_full', 'Pace gap full at (0–1)'],
    ['single_thread_tail', 'Single-thread full at concurrency']
  ];
  thRows.forEach(function(r) {
    html += '<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-muted);">' + esc(r[1]) +
      '<input type="number" step="any" value="' + (th[r[0]] != null ? th[r[0]] : '') + '" onchange="rkCfgSet(\'thresholds\',\'' + r[0] + '\',this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;"></label>';
  });
  html += '<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-muted);">Watch band starts at' +
    '<input type="number" value="' + (b.watch != null ? b.watch : 25) + '" onchange="rkCfgSet(\'bands\',\'watch\',this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;"></label>';
  html += '<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-muted);">At-risk band starts at' +
    '<input type="number" value="' + (b.atrisk != null ? b.atrisk : 50) + '" onchange="rkCfgSet(\'bands\',\'atrisk\',this.value)" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;"></label>';
  html += '</div></div>';

  // Calibration set
  html += '<div class="settings-section"><div class="settings-section-header">Calibration set</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Reference projects for each way a project goes sideways. Adjust the weights above until each one’s score lands in its expected band — the preview updates live. Completed projects are scored retrospectively (schedule drift + single-thread dominate).</div>';
  html += '<div id="rk-calib-table"></div>';
  // Add row
  html += '<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">';
  html += '<select id="rk-add-project" style="flex:1;min-width:240px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;"><option value="">Add a project…</option>';
  (typeof PROJECTS !== 'undefined' ? PROJECTS : []).slice().sort(function(a, b2) { return (a.title || '').localeCompare(b2.title || ''); })
    .forEach(function(p) { html += '<option value="' + esc(String(p.project_number)) + '">' + esc(p.title) + '</option>'; });
  html += '</select>';
  html += '<select id="rk-add-mode" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;">';
  RISK_MODES.forEach(function(m) { html += '<option value="' + m.key + '">' + esc(m.label) + '</option>'; });
  html += '</select>';
  html += '<button class="settings-btn settings-btn-secondary" onclick="rkAddCalib()">＋ Add</button>';
  html += '</div></div>';

  // Save
  html += '<div style="margin-top:18px;"><button class="settings-btn settings-btn-primary" onclick="rkSaveConfig()">Save risk configuration</button>';
  html += '<span style="font-size:11px;color:var(--text-muted);margin-left:10px;">Saves weights, thresholds, bands, and the calibration set to ArcGIS Online (shared).</span></div>';

  c.innerHTML = html;
  renderRiskCalibTable();
}

function renderRiskCalibTable() {
  var c = document.getElementById('rk-calib-table');
  if (!c) return;
  var ctx = _rkBuildContext();
  var modeLabel = {}; RISK_MODES.forEach(function(m) { modeLabel[m.key] = m; });
  var html = '<div class="tbl-wrap" style="background:var(--white);border:1px solid #E8E6DF;border-radius:10px;padding:8px 14px;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html += '<thead><tr><th style="text-align:left;padding:6px;">Project</th><th style="text-align:left;padding:6px;">Failure mode</th><th style="text-align:center;padding:6px;">Expected</th><th style="text-align:center;padding:6px;">Current score</th><th style="text-align:center;padding:6px;">Match</th><th style="padding:6px;"></th></tr></thead><tbody>';
  if (!_riskConfig.calibration.length) {
    html += '<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--text-muted);font-style:italic;">No calibration projects yet. Add some below.</td></tr>';
  }
  _riskConfig.calibration.forEach(function(entry, i) {
    var p = _rkResolveProject(entry);
    var mode = modeLabel[entry.mode] || { label: entry.mode || '—', expect: 'red' };
    var expC = _rkBandColor(mode.expect);
    var scoreCell, matchCell;
    if (!p) {
      scoreCell = '<span style="color:#EF4444;font-size:11px;">not found</span>';
      matchCell = '—';
    } else {
      var r = computeProjectRisk(p, ctx);
      scoreCell = _rkBadge(r.score, r.band);
      var ok = (r.band === mode.expect);
      matchCell = ok ? '<span style="color:#16A34A;font-weight:800;"><svg class="icon" aria-hidden="true"><use href="#ph-check"></use></svg></span>' : '<span style="color:#EF4444;font-weight:800;"><svg class="icon" aria-hidden="true"><use href="#ph-x"></use></svg></span>';
    }
    html += '<tr>';
    html += '<td style="padding:6px;font-weight:700;color:var(--navy);">' + esc(entry.title || (p && p.title) || '—') + (entry.note ? '<div style="font-size:10px;color:var(--text-muted);font-weight:400;">' + esc(entry.note) + '</div>' : '') + '</td>';
    html += '<td style="padding:6px;"><select onchange="rkSetCalibMode(' + i + ',this.value)" style="padding:3px 6px;border:1px solid var(--border);border-radius:5px;font-size:11px;">' +
      RISK_MODES.map(function(m) { return '<option value="' + m.key + '"' + (m.key === entry.mode ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('') + '</select></td>';
    html += '<td style="padding:6px;text-align:center;"><span style="font-size:10px;font-weight:800;text-transform:uppercase;background:' + expC.bg + ';color:' + expC.fg + ';padding:2px 7px;border-radius:8px;">' + expC.label + '</span></td>';
    html += '<td style="padding:6px;text-align:center;">' + scoreCell + '</td>';
    html += '<td style="padding:6px;text-align:center;">' + matchCell + '</td>';
    html += '<td style="padding:6px;text-align:right;"><button class="settings-btn settings-btn-danger" onclick="rkRemoveCalib(' + i + ')" style="padding:2px 8px;"><svg class="icon" aria-hidden="true"><use href="#ph-trash"></use></svg></button></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  c.innerHTML = html;
}

// ── Config edit handlers ──────────────────────────────────────────────
function rkCfgSet(group, key, value) {
  var n = parseFloat(value);
  if (isNaN(n)) return;
  if (!_riskConfig[group]) _riskConfig[group] = {};
  _riskConfig[group][key] = n;
  if (group === 'weights') {
    var total = RISK_FACTORS.reduce(function(s, f) { return s + (_riskConfig.weights[f.key] || 0); }, 0);
    var totalEl = document.getElementById('rk-weight-total');
    if (totalEl) totalEl.textContent = total;
  }
  renderRiskCalibTable(); // live re-preview
}
function rkAddCalib() {
  var psel = document.getElementById('rk-add-project'), msel = document.getElementById('rk-add-mode');
  if (!psel || !psel.value) { showToast('Pick a project first.', 'warn'); return; }
  var p = (typeof PROJECTS !== 'undefined' ? PROJECTS : []).find(function(x) { return String(x.project_number) === psel.value; });
  if (!p) return;
  if (_riskConfig.calibration.some(function(e) { return String(e.project_number) === psel.value || (e.title || '') === p.title; })) {
    showToast('That project is already in the set.', 'warn'); return;
  }
  _riskConfig.calibration.push({ project_number: p.project_number, title: p.title, mode: msel.value, note: '' });
  renderRiskCalibTable();
  psel.value = '';
}
function rkRemoveCalib(i) {
  _riskConfig.calibration.splice(i, 1);
  renderRiskCalibTable();
}
function rkSetCalibMode(i, mode) {
  if (_riskConfig.calibration[i]) _riskConfig.calibration[i].mode = mode;
  renderRiskCalibTable();
}
async function rkSaveConfig() {
  if (typeof saveConfigKey !== 'function') return;
  var ok = await saveConfigKey('risk_config', _riskConfig);
  if (ok) showToast('Risk configuration saved.', 'success');
}
