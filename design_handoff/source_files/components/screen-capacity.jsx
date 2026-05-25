// ============================================================
// HERO SCREEN — CAPACITY (team load + weekly allocation chart)
// ============================================================

function ScreenCapacity() {
  const team = [
    { initials: 'PJ', name: 'Peter Johnson',        util: 25,  hue: 'var(--data-1)' },
    { initials: 'JF', name: 'Jessica Fraver',       util: 100, hue: 'var(--data-2)' },
    { initials: 'JM', name: 'James McGinnis',       util: 100, hue: 'var(--data-5)', active: true },
    { initials: 'KC', name: 'Kate Carter',          util: 100, hue: 'var(--data-1)' },
    { initials: 'VB', name: 'Vladimir Berg',        util: 88,  hue: 'var(--data-5)' },
    { initials: 'AS', name: 'Andrew Sutton',        util: 100, hue: 'var(--data-4)' },
    { initials: 'JN', name: 'JeanPaul NduwayoNtore',util: 100, hue: 'var(--data-1)' },
    { initials: 'JA', name: 'Joseph Ahumada',       util: 100, hue: 'var(--data-3)' },
    { initials: 'LW', name: 'Liz Wilshin',          util: 92,  hue: 'var(--data-7)' },
    { initials: 'DV', name: 'Deborah Vulcan',       util: 0,   hue: 'var(--data-8)' },
    { initials: 'AS', name: 'Adam Silva',           util: 0,   hue: 'var(--data-6)' },
    { initials: 'DJ', name: 'Daniel Jackson',       util: 18,  hue: 'var(--data-7)' },
    { initials: 'KW', name: 'Kira Watt',            util: 75,  hue: 'var(--data-2)' },
    { initials: 'TM', name: 'Theo Maddox',          util: 60,  hue: 'var(--data-3)' },
  ];

  // 20 weekly bars: 8 categorical projects + 1 other (rest collapsed)
  // values are stacks per project per week
  const weekStacks = generateWeeks();

  const projectLegend = [
    { name: 'BISC — Energov: Add Financial Data', color: 'var(--data-3)' },
    { name: 'Security Dashboard to Power BI', color: 'var(--data-5)' },
    { name: 'Vulnerability Management Dashboard', color: 'var(--data-2)' },
    { name: 'City Manager Dashboard', color: 'var(--data-1)' },
    { name: 'MDW to Snowflake Migration', color: 'var(--data-4)' },
    { name: 'Safe Cities Dashboard', color: 'var(--data-3)' },
    { name: 'Migrate Ivanti Power BI Views', color: 'var(--data-7)' },
    { name: 'Infrastructure Report Card', color: 'var(--data-8)' },
    { name: 'Other (5 projects)', color: 'var(--data-other)' },
  ];

  return (
    <div className="oe" data-screen-label="03 Capacity" style={{ width: '100%', height: '100%', overflow: 'auto', background: 'var(--ink-0)' }}>
      <OETopBar activeTab="Capacity" />

      <div style={{ padding: '24px 28px 64px' }}>
        {/* Title + sub-tabs */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div className="oe-meta" style={{ color: 'var(--navy-300)', marginBottom: 6 }}>Team capacity · Jan 5 → May 24, 2026</div>
            <h1 className="oe-h1">Capacity</h1>
          </div>
          <div className="oe-tabs" style={{ borderBottom: 'none' }}>
            <button className="oe-tab" aria-selected="true">Resources</button>
            <button className="oe-tab" aria-selected="false">Forecast</button>
            <button className="oe-tab" aria-selected="false">Insights</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18 }}>
          {/* TEAM SIDEBAR */}
          <div className="oe-card" style={{ padding: 0, alignSelf: 'flex-start' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--ink-2)', display: 'flex', alignItems: 'center' }}>
              <span className="oe-meta">Team</span>
              <span className="oe-mono" style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-5)' }}>14</span>
              <div className="oe-spacer"></div>
              <button className="oe-btn oe-btn--ghost oe-btn--sm"><i className="ph ph-funnel"></i></button>
            </div>
            <div style={{ maxHeight: 540, overflow: 'auto' }}>
              {team.map((m, i) => (
                <button key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 16px',
                  background: m.active ? 'var(--navy-50)' : 'transparent',
                  borderLeft: m.active ? '3px solid var(--navy-500)' : '3px solid transparent',
                  border: 0, borderBottom: '1px solid var(--ink-2)', cursor: 'pointer', textAlign: 'left'
                }}>
                  <span className="oe-avatar oe-avatar--sm" style={{ background: m.active ? 'var(--navy-500)' : 'var(--ink-1)', color: m.active ? 'var(--ink-paper)' : 'var(--ink-6)' }}>{m.initials}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="oe-h4" style={{ fontSize: 12, fontWeight: m.active ? 600 : 500, color: m.active ? 'var(--navy-700)' : 'var(--ink-7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                    <UtilBar value={m.util} />
                  </div>
                  <span className="oe-mono" style={{ fontSize: 10, color: utilColor(m.util), minWidth: 30, textAlign: 'right' }}>{m.util}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* MAIN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Inner tabs Summary / Edit */}
            <div className="oe-tabs">
              <button className="oe-tab" aria-selected="true"><i className="ph ph-users-three"></i>Summary</button>
              <button className="oe-tab" aria-selected="false"><i className="ph ph-pencil-simple"></i>Edit allocations</button>
            </div>

            {/* Member header */}
            <div className="oe-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 20 }}>
                <span className="oe-avatar oe-avatar--lg" style={{ background: 'var(--navy-500)', color: 'var(--ink-paper)', width: 48, height: 48, fontSize: 16 }}>JM</span>
                <div>
                  <h2 className="oe-display-3" style={{ margin: 0, color: 'var(--ink-7)' }}>
                    James <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>McGinnis</span>
                  </h2>
                  <div className="oe-body-sm" style={{ color: 'var(--ink-5)', marginTop: 4 }}>
                    Business &amp; Advanced Analytics · Data Intelligence team · <span style={{ color: 'var(--sage-700)' }}>63% project-available</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: '1px solid var(--ink-2)' }}>
                <CapKPI label="Most-recent-week utilization" value="100%" tone="overdue" sub="22.7h of 22.7h capacity" />
                <CapKPI label="Available (most recent week)" value="0.0h" sub="unallocated project hours" />
                <CapKPI label="Active projects" value="5" sub="with allocations" />
                <CapKPI label="Hours logged YTD" value="363h" sub="through current week" />
              </div>
            </div>

            {/* Chart */}
            <div className="oe-card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--ink-2)' }}>
                <div>
                  <div className="oe-meta">Weekly project allocation</div>
                  <div className="oe-h3" style={{ marginTop: 2 }}>
                    Jan 5 → May 24, <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>2026</span>
                  </div>
                </div>
                <div className="oe-spacer"></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="oe-btn oe-btn--ghost oe-btn--sm"><i className="ph ph-caret-left"></i>Prev</button>
                  <button className="oe-btn oe-btn--ghost oe-btn--sm">Next<i className="ph ph-caret-right"></i></button>
                </div>
              </div>

              <div style={{ padding: '24px 20px 16px' }}>
                <BarChart weeks={weekStacks} />
              </div>

              {/* Legend */}
              <div style={{ padding: '14px 20px 18px', borderTop: '1px solid var(--ink-2)', display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
                {projectLegend.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, display: 'inline-block' }}></span>
                    <span className="oe-body-sm" style={{ color: 'var(--ink-6)', fontSize: 11 }}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function utilColor(v) {
  if (v >= 100) return 'var(--status-overdue-fg)';
  if (v >= 75)  return 'var(--status-hold-fg)';
  if (v > 0)    return 'var(--sage-700)';
  return 'var(--ink-4)';
}

function UtilBar({ value }) {
  return (
    <div style={{ height: 3, background: 'var(--ink-1)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(value, 100)}%`,
        height: '100%',
        background: utilColor(value),
        opacity: 0.7
      }}></div>
    </div>
  );
}

function CapKPI({ label, value, sub, tone }) {
  const color = tone === 'overdue' ? 'var(--status-overdue-fg)' : 'var(--ink-7)';
  return (
    <div style={{ padding: '18px 20px', borderRight: '1px solid var(--ink-2)' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>{label}</div>
      <div className="oe-mono" style={{ fontSize: 24, color, lineHeight: 1 }}>{value}</div>
      <div className="oe-body-sm" style={{ color: 'var(--ink-5)', marginTop: 6, fontSize: 11 }}>{sub}</div>
    </div>
  );
}

// Deterministic mock — 20 weeks, each week has up to 8 named projects + Other
function generateWeeks() {
  const palette = ['var(--data-3)','var(--data-5)','var(--data-2)','var(--data-1)','var(--data-4)','var(--data-3)','var(--data-7)','var(--data-8)','var(--data-other)'];
  const weeks = [];
  const dates = ['Jan 5','12','19','26','Feb 2','9','16','23','Mar 2','9','16','23','30','Apr 6','13','20','27','May 4','11','18'];
  // pseudo-random but stable
  const seed = (i, j) => ((i * 7 + j * 13 + 3) % 5);
  for (let w = 0; w < 20; w++) {
    const stacks = [];
    for (let i = 0; i < 9; i++) {
      const v = seed(w, i);
      if (v > 0 || (w + i) % 4 === 0) {
        stacks.push({ color: palette[i], h: 2 + ((seed(w, i) + (w * 3 + i)) % 6) });
      }
    }
    weeks.push({ label: dates[w], stacks });
  }
  return weeks;
}

function BarChart({ weeks }) {
  const maxTotal = Math.max(...weeks.map(w => w.stacks.reduce((s, x) => s + x.h, 0)));
  const chartH = 220;
  const capacity = 22;
  return (
    <div>
      <div style={{ position: 'relative', height: chartH, display: 'flex', alignItems: 'flex-end', gap: 4, paddingLeft: 36 }}>
        {/* Y axis ticks */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 16, width: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {[24, 18, 12, 6, 0].map((t, i) => (
            <div key={i} className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-4)', textAlign: 'right' }}>{t}</div>
          ))}
        </div>
        {/* Grid lines */}
        <div style={{ position: 'absolute', left: 36, right: 0, top: 0, bottom: 16, pointerEvents: 'none' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${p * 100}%`, height: 1, background: 'var(--ink-2)', opacity: 0.7 }}></div>
          ))}
          {/* Capacity reference line */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - capacity / 24) * 100}%`, height: 1, borderTop: '1px dashed var(--navy-500)' }}>
            <span className="oe-mono" style={{ position: 'absolute', right: 0, top: -16, background: 'var(--ink-paper)', padding: '0 6px', fontSize: 10, color: 'var(--navy-500)' }}>Capacity · 22.7h</span>
          </div>
        </div>

        {weeks.map((w, wi) => {
          const total = w.stacks.reduce((s, x) => s + x.h, 0);
          return (
            <div key={wi} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, height: '100%', justifyContent: 'flex-end', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '70%', maxWidth: 22, display: 'flex', flexDirection: 'column-reverse', borderRadius: '2px 2px 0 0', overflow: 'hidden', height: `${(total / 24) * 100}%`, minHeight: 1 }}>
                {w.stacks.map((s, si) => (
                  <div key={si} style={{ height: `${(s.h / total) * 100}%`, background: s.color, opacity: 0.95 }}></div>
                ))}
              </div>
              <div className="oe-mono" style={{ fontSize: 9, color: 'var(--ink-5)', marginTop: 4, position: 'absolute', bottom: -16 }}>{w.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 18 }}></div>
    </div>
  );
}

Object.assign(window, { ScreenCapacity });
