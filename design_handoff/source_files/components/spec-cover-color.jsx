// ============================================================
// SPEC SHEET — design-system documentation cards
// Each card is a self-contained artboard worth of content.
// ============================================================

const { useState } = React;

// ---------- COVER ----------
function SpecCover() {
  return (
    <div className="oe" style={{ padding: '64px 56px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'var(--ink-0)' }}>
      <div>
        <div className="oe-meta" style={{ color: 'var(--navy-500)', marginBottom: 12 }}>City of Tucson · Office of Equity</div>
        <h1 className="oe-display-1" style={{ margin: 0, color: 'var(--ink-7)', maxWidth: 560 }}>
          A quieter civic <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>tool</span>.
        </h1>
        <p className="oe-body" style={{ marginTop: 28, maxWidth: 460, color: 'var(--ink-6)', fontSize: 16, lineHeight: 1.6 }}>
          A redesign of the Project &amp; Task Tracker around three commitments: typography that <span className="oe-italic-serif">earns</span> its weight, color used as language rather than decoration, and a structure that respects how much work a city actually moves through in a day.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, paddingTop: 32, borderTop: '1px solid var(--ink-2)' }}>
        <SpecPrinciple num="01" title="Type before color" body="Hierarchy comes from scale and weight first. Color is reserved for status and a single primary action." />
        <SpecPrinciple num="02" title="Status is the only color rule" body="Pills, dots, and left-border accents map to real states. Everything else stays neutral." />
        <SpecPrinciple num="03" title="Density without noise" body="A power-user tool, calmed. More data per fold, less ornament." />
      </div>
    </div>
  );
}
function SpecPrinciple({ num, title, body }) {
  return (
    <div>
      <div className="oe-mono" style={{ color: 'var(--navy-300)', marginBottom: 8 }}>{num}</div>
      <div className="oe-h4" style={{ marginBottom: 6, color: 'var(--ink-7)' }}>{title}</div>
      <div className="oe-body-sm" style={{ color: 'var(--ink-5)', lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

// ---------- COLOR ----------
function SpecColor() {
  const Swatch = ({ name, token, hex, dark }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderRadius: 6, background: 'var(--ink-paper)', border: '1px solid var(--ink-2)' }}>
      <div style={{ width: 36, height: 36, borderRadius: 4, background: hex, flex: '0 0 auto', boxShadow: dark ? 'inset 0 0 0 1px rgba(0,0,0,0.1)' : 'inset 0 0 0 1px rgba(0,0,0,0.05)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="oe-h4" style={{ fontSize: 13, marginBottom: 2 }}>{name}</div>
        <div className="oe-mono" style={{ color: 'var(--ink-5)', fontSize: 11 }}>{token}</div>
      </div>
      <div className="oe-mono" style={{ color: 'var(--ink-5)', fontSize: 11 }}>{hex}</div>
    </div>
  );

  const Ramp = ({ title, items }) => (
    <div>
      <div className="oe-meta" style={{ marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--ink-2)' }}>
        {items.map((it, i) => (
          <div key={i} style={{ flex: 1, background: it.hex, padding: '24px 10px 10px', minHeight: 88, color: it.light ? 'var(--ink-7)' : 'rgba(255,255,255,0.85)' }}>
            <div className="oe-mono" style={{ fontSize: 10, opacity: 0.7 }}>{it.step}</div>
            <div className="oe-mono" style={{ fontSize: 10, marginTop: 2 }}>{it.hex}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>02 · Color</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>Tucson, <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>dialed back</span>.</h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 580, marginBottom: 28 }}>
        Two blues + a sage carry structure and primary action. Status and data-viz pull from the official Tucson palette at roughly half saturation — the city's voice, used as language. Saturated fills are reserved for state.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Ramp title="Navy · primary structure" items={[
          { step: '50', hex: '#eaeef5', light: true },
          { step: '100', hex: '#d2dbeb', light: true },
          { step: '200', hex: '#9fb1cf', light: true },
          { step: '300', hex: '#5d78a3' },
          { step: '500', hex: '#1f3b6b' },
          { step: '700', hex: '#0e2240' },
          { step: '900', hex: '#060f1e' },
        ]} />
        <Ramp title="Steel · secondary" items={[
          { step: '50', hex: '#eef1f4', light: true },
          { step: '100', hex: '#d6dde5', light: true },
          { step: '300', hex: '#7d92ab', light: true },
          { step: '500', hex: '#3d5878' },
          { step: '700', hex: '#243a55' },
        ]} />
        <Ramp title="Sage · confirmation" items={[
          { step: '50', hex: '#ebefe9', light: true },
          { step: '100', hex: '#d2dccd', light: true },
          { step: '300', hex: '#87a07f', light: true },
          { step: '500', hex: '#4a6b48' },
          { step: '700', hex: '#2d4530' },
        ]} />

        {/* Tucson brand accent strip */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="oe-meta">Tucson brand accents · subdued</span>
            <span className="oe-body-sm" style={{ color: 'var(--ink-5)', fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>~55% saturation of official hues</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
            {[
              { name: 'Innovation', sub: '#002669', ours: '#1f3b6b', token: '--tucson-innovation' },
              { name: 'Sky',        sub: '#0088FF', ours: '#4a7fae', token: '--tucson-sky' },
              { name: 'Saguaro',    sub: '#83AC16', ours: '#8aa050', token: '--tucson-saguaro' },
              { name: 'Sunset',     sub: '#C24200', ours: '#b85630', token: '--tucson-sunset' },
              { name: 'Sun',        sub: '#FFDB22', ours: '#c89500', token: '--tucson-sun' },
              { name: 'Cactus',     sub: '#9E0059', ours: '#8a4c70', token: '--tucson-cactus' },
              { name: 'Night Sky',  sub: '#140233', ours: '#3d2e55', token: '--tucson-night' },
              { name: 'Sand',       sub: '#E5D086', ours: '#d4bc7a', token: '--tucson-sand' },
            ].map((c, i) => (
              <div key={i}>
                {/* Official strip (thin) */}
                <div style={{ background: c.sub, height: 10, borderRadius: '4px 4px 0 0', opacity: 0.95 }}></div>
                {/* Our subdued (large) */}
                <div style={{ background: c.ours, height: 64, borderRadius: '0 0 4px 4px', padding: '8px 8px 6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div className="oe-h4" style={{ color: 'rgba(255,255,255,0.95)', fontSize: 11, fontWeight: 600 }}>{c.name}</div>
                  <div className="oe-mono" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>{c.ours}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 4 }}>
          <div>
            <div className="oe-meta" style={{ marginBottom: 10 }}>Neutrals · warm ink</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Swatch name="ink-0 · page" token="--ink-0" hex="#faf8f3" dark />
              <Swatch name="ink-2 · divider" token="--ink-2" hex="#e8e2d3" dark />
              <Swatch name="ink-5 · secondary text" token="--ink-5" hex="#6b6354" />
              <Swatch name="ink-7 · primary text" token="--ink-7" hex="#1e1c14" />
            </div>
          </div>
          <div>
            <div className="oe-meta" style={{ marginBottom: 10 }}>Semantic · status (tinted)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <SemanticRow name="Active" bg="var(--status-active-bg)" fg="var(--status-active-fg)" dot="var(--status-active-dot)" />
              <SemanticRow name="Future" bg="var(--status-future-bg)" fg="var(--status-future-fg)" dot="var(--status-future-dot)" />
              <SemanticRow name="Complete" bg="var(--status-complete-bg)" fg="var(--status-complete-fg)" dot="var(--status-complete-dot)" />
              <SemanticRow name="On hold" bg="var(--status-hold-bg)" fg="var(--status-hold-fg)" dot="var(--status-hold-dot)" />
              <SemanticRow name="Canceled" bg="var(--status-canceled-bg)" fg="var(--status-canceled-fg)" dot="var(--status-canceled-dot)" />
              <SemanticRow name="Overdue" bg="var(--status-overdue-bg)" fg="var(--status-overdue-fg)" dot="var(--status-overdue-dot)" />
            </div>
          </div>
        </div>

        <div>
          <div className="oe-meta" style={{ marginBottom: 10 }}>Data viz · categorical (Tucson · 8 + other)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 6 }}>
            {[
              { c: '#1f3b6b', n: 'Innovation' },
              { c: '#8aa050', n: 'Saguaro' },
              { c: '#b85630', n: 'Sunset' },
              { c: '#8a4c70', n: 'Cactus' },
              { c: '#4a7fae', n: 'Sky' },
              { c: '#3d2e55', n: 'Night Sky' },
              { c: '#d4bc7a', n: 'Sand' },
              { c: '#c89500', n: 'Sun' },
              { c: '#b8b9b3', n: 'Other' },
            ].map((x, i) => (
              <div key={i} style={{ background: x.c, height: 64, borderRadius: 4, position: 'relative', padding: '8px 8px 6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div className="oe-mono" style={{ fontSize: 9, color: i === 6 || i === 8 ? 'var(--ink-7)' : 'rgba(255,255,255,0.7)' }}>{i === 8 ? 'other' : `0${i+1}`}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: i === 6 || i === 8 ? 'var(--ink-7)' : 'rgba(255,255,255,0.95)' }}>{x.n}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
function SemanticRow({ name, bg, fg, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 5, background: 'var(--ink-paper)', border: '1px solid var(--ink-2)' }}>
      <span className="oe-pill" style={{ background: bg, color: fg, gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, display: 'inline-block' }}></span>
        {name}
      </span>
      <div className="oe-spacer"></div>
      <div className="oe-mono" style={{ color: 'var(--ink-5)', fontSize: 10 }}>bg / fg / dot</div>
    </div>
  );
}

Object.assign(window, { SpecCover, SpecColor });
