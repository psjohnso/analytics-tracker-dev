// ============================================================
// SPEC SHEET — typography, spacing, iconography
// ============================================================

function SpecType() {
  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>03 · Typography</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>
        Three families, <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>cast carefully</span>.
      </h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 580, marginBottom: 28 }}>
        Instrument Serif handles editorial moments — page titles, empty-state poetry. Hanken Grotesk does the actual work. JetBrains Mono carries every number, ID, and timestamp.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <TypeRow family="Instrument Serif" role="Display · editorial">
          <div className="oe-display-1" style={{ margin: 0 }}>Good morning, <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>Laura</span></div>
          <div style={{ display: 'flex', gap: 32, marginTop: 14, alignItems: 'baseline' }}>
            <div>
              <div className="oe-display-2">Aa Bb Cc</div>
              <div className="oe-mono" style={{ color: 'var(--ink-5)', marginTop: 4 }}>display-2 · 44 / 46</div>
            </div>
            <div>
              <div className="oe-display-3">Aa Bb Cc</div>
              <div className="oe-mono" style={{ color: 'var(--ink-5)', marginTop: 4 }}>display-3 · 32 / 34</div>
            </div>
          </div>
        </TypeRow>

        <TypeRow family="Hanken Grotesk" role="UI · workhorse">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
            <RampLine cls="oe-h1" label="h1 · 28 / 600">Project portfolio</RampLine>
            <RampLine cls="oe-h2" label="h2 · 22 / 600">Active engagements</RampLine>
            <RampLine cls="oe-h3" label="h3 · 17 / 600">ADA Accessibility Compliance</RampLine>
            <RampLine cls="oe-h4" label="h4 · 14 / 600">Hub sites · phase 2</RampLine>
            <RampLine cls="oe-body" label="body · 14 / 1.55">A workspace for the people moving Tucson's projects forward.</RampLine>
            <RampLine cls="oe-body-sm" label="body-sm · 13 / 1.55">Secondary copy. Helper text. Filter results.</RampLine>
            <RampLine cls="oe-meta" label="meta · 11 / 600 / 0.08em">Section · category · table heading</RampLine>
          </div>
        </TypeRow>

        <TypeRow family="JetBrains Mono" role="Data · IDs, timestamps, numbers">
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <MonoSample>P-187</MonoSample>
            <MonoSample>2026-05-15</MonoSample>
            <MonoSample>v1.61.2.2</MonoSample>
            <MonoSample>1,757h</MonoSample>
            <MonoSample>5 / 13</MonoSample>
          </div>
        </TypeRow>
      </div>
    </div>
  );
}
function TypeRow({ family, role, children }) {
  return (
    <div style={{ borderTop: '1px solid var(--ink-2)', paddingTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div className="oe-h4" style={{ color: 'var(--ink-7)' }}>{family}</div>
        <div className="oe-meta">{role}</div>
      </div>
      {children}
    </div>
  );
}
function RampLine({ cls, label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className={cls}>{children}</div>
      <div className="oe-mono" style={{ color: 'var(--ink-5)', fontSize: 10 }}>{label}</div>
    </div>
  );
}
function MonoSample({ children }) {
  return (
    <div>
      <div className="oe-mono" style={{ fontSize: 18, color: 'var(--ink-7)' }}>{children}</div>
      <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)', marginTop: 4 }}>tabular-nums</div>
    </div>
  );
}

// ---------- SPACING + RADII + SHADOW ----------
function SpecSpacing() {
  const spacing = [
    { name: 's-1', px: 4 },
    { name: 's-2', px: 8 },
    { name: 's-3', px: 12 },
    { name: 's-4', px: 16 },
    { name: 's-5', px: 24 },
    { name: 's-6', px: 32 },
    { name: 's-7', px: 48 },
    { name: 's-8', px: 64 },
  ];
  const radii = [
    { name: 'r-1', px: 3, use: 'chips' },
    { name: 'r-2', px: 5, use: 'buttons / inputs' },
    { name: 'r-3', px: 8, use: 'cards' },
    { name: 'r-4', px: 12, use: 'modals' },
    { name: 'r-pill', px: 999, use: 'pills' },
  ];
  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>04 · Spacing, radii, elevation</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>One scale. Used everywhere.</h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 540, marginBottom: 28 }}>
        Inconsistent gaps are the source of half the visual noise in the old app. A single 4-based scale, applied without exception, fixes it before color or type ever has to.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32 }}>
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Spacing scale</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {spacing.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="oe-mono" style={{ width: 60, color: 'var(--ink-5)', fontSize: 11 }}>{s.name}</div>
                <div className="oe-mono" style={{ width: 44, color: 'var(--ink-7)', fontSize: 11 }}>{s.px}px</div>
                <div style={{ background: 'var(--navy-500)', height: 14, width: s.px, borderRadius: 2 }}></div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Radii</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {radii.map(r => (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, background: 'var(--navy-500)', borderRadius: r.px === 999 ? 999 : r.px, flex: '0 0 auto' }}></div>
                <div style={{ flex: 1 }}>
                  <div className="oe-mono" style={{ color: 'var(--ink-7)', fontSize: 11 }}>{r.name} · {r.px === 999 ? '999' : `${r.px}px`}</div>
                  <div className="oe-body-sm" style={{ color: 'var(--ink-5)' }}>{r.use}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="oe-meta" style={{ marginTop: 24, marginBottom: 14 }}>Elevation</div>
          <div style={{ display: 'flex', gap: 14 }}>
            <ElevSample name="shadow-1" shadow="var(--shadow-1)" />
            <ElevSample name="shadow-2" shadow="var(--shadow-2)" />
            <ElevSample name="shadow-3" shadow="var(--shadow-3)" />
          </div>
        </div>
      </div>
    </div>
  );
}
function ElevSample({ name, shadow }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ width: '100%', height: 56, background: 'var(--ink-paper)', borderRadius: 8, boxShadow: shadow, marginBottom: 8 }}></div>
      <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>{name}</div>
    </div>
  );
}

// ---------- ICONOGRAPHY ----------
function SpecIcons() {
  const icons = [
    'house', 'briefcase', 'folder-open', 'chart-bar', 'chart-line-up',
    'users-three', 'user-circle', 'calendar-blank', 'clock-counter-clockwise',
    'check-circle', 'warning-circle', 'x-circle', 'pause-circle', 'arrow-clockwise',
    'magnifying-glass', 'funnel', 'sort-ascending', 'plus', 'pencil-simple',
    'trash', 'dots-three', 'gear', 'lightbulb', 'bell', 'sign-out',
    'arrow-right', 'arrow-up-right', 'caret-down', 'check', 'list-bullets',
  ];
  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>05 · Iconography</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>Phosphor · regular.</h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 540, marginBottom: 28 }}>
        A single, linear icon family. Always the regular weight at 1em. Color inherits from the surrounding text — icons sit inside hierarchy, they don't fight for it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, background: 'var(--ink-2)', border: '1px solid var(--ink-2)', borderRadius: 8, overflow: 'hidden' }}>
        {icons.map(n => (
          <div key={n} style={{ background: 'var(--ink-paper)', padding: '18px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <i className={`ph ph-${n}`} style={{ fontSize: 22, color: 'var(--ink-7)' }}></i>
            <div className="oe-mono" style={{ fontSize: 9, color: 'var(--ink-5)', textAlign: 'center' }}>{n}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, padding: 20, background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 8 }}>
        <div className="oe-meta" style={{ marginBottom: 12 }}>Sizing</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
          {[14, 16, 20, 24, 32].map(s => (
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <i className="ph ph-folder-open" style={{ fontSize: s, color: 'var(--ink-7)' }}></i>
              <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>{s}px</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SpecType, SpecSpacing, SpecIcons });
