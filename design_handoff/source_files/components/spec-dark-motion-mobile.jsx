// ============================================================
// SPEC — Dark mode preview, mobile, motion + a11y
// ============================================================

function SpecDarkMode() {
  return (
    <div data-theme="dark" className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%', color: 'var(--ink-7)' }}>
      <div className="oe-meta" style={{ marginBottom: 8, color: 'var(--ink-5)' }}>11 · Dark mode</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px', color: 'var(--ink-7)' }}>
        Same language, <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>after sunset</span>.
      </h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 580, marginBottom: 28 }}>
        Dark mode keeps the same tokens — only the surface and ink scales flip. Status hues lift ~15% to hold contrast against the dark surface. Brand structure (navy primary) becomes a lighter shade so it reads as primary, not background.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Card sample */}
        <div className="oe-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="oe-mono" style={{ fontSize: 11, color: 'var(--ink-5)' }}>P-187</span>
            <span className="oe-pill oe-pill--active">Active</span>
            <span className="oe-chip oe-chip--med">Medium</span>
          </div>
          <div className="oe-h3" style={{ color: 'var(--ink-7)' }}>ADA Accessibility Compliance</div>
          <div className="oe-body-sm" style={{ color: 'var(--ink-5)', marginTop: 4 }}>Hub sites · phase 2</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="oe-btn oe-btn--primary oe-btn--sm">Open project</button>
            <button className="oe-btn oe-btn--secondary oe-btn--sm">Share</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm">Edit</button>
          </div>
        </div>

        {/* Status pills */}
        <div className="oe-card" style={{ padding: 18 }}>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Status spectrum · dark</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span className="oe-pill oe-pill--active">Active</span>
            <span className="oe-pill oe-pill--future">Future</span>
            <span className="oe-pill oe-pill--complete">Complete</span>
            <span className="oe-pill oe-pill--hold">On hold</span>
            <span className="oe-pill oe-pill--canceled">Canceled</span>
            <span className="oe-pill oe-pill--overdue">Overdue</span>
          </div>
          <div className="oe-meta" style={{ margin: '18px 0 10px' }}>Priority</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="oe-chip oe-chip--high">High</span>
            <span className="oe-chip oe-chip--med">Medium</span>
            <span className="oe-chip oe-chip--low">Low</span>
          </div>
        </div>

        {/* Mini table */}
        <div className="oe-card" style={{ padding: 0, overflow: 'hidden', gridColumn: '1 / -1' }}>
          <table className="oe-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>ID</th>
                <th>Project</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 100 }}>Due</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><span className="oe-mono">P-187</span></td><td>ADA Accessibility — Hub Sites</td><td><span className="oe-pill oe-pill--active">Active</span></td><td><span className="oe-mono">2026-05-15</span></td></tr>
              <tr><td><span className="oe-mono">P-349</span></td><td>Achieve 90% Catalog Coverage</td><td><span className="oe-pill oe-pill--future">Future</span></td><td><span className="oe-mono" style={{ color: 'var(--ink-4)' }}>—</span></td></tr>
              <tr><td><span className="oe-mono">P-327</span></td><td>Upgrade GISPUBLICPRD to 11.3</td><td><span className="oe-pill oe-pill--overdue">Overdue</span></td><td><span className="oe-mono">2026-05-21</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SPEC — Motion + accessibility
// ============================================================

function SpecMotionA11y() {
  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>12 · Motion &amp; accessibility</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>How it <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>moves</span>. How it includes.</h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 580, marginBottom: 28 }}>
        Motion is purposeful and brief. Accessibility isn't an audit — it's baked into every token (contrast, focus ring, font size minimum, hit targets).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        {/* MOTION */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Motion durations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MotionRow name="dur-fast" ms={120} use="Hover, focus, button press" />
            <MotionRow name="dur-base" ms={200} use="Tooltip, popover, status change" />
            <MotionRow name="dur-slow" ms={320} use="Drawer, modal, page transition" />
          </div>

          <div className="oe-meta" style={{ margin: '24px 0 14px' }}>Easing</div>
          <div className="oe-mono" style={{ fontSize: 11, color: 'var(--ink-6)', padding: '10px 12px', background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 5 }}>
            --ease-out: cubic-bezier(0.2, 0.7, 0.3, 1)
          </div>
          <p className="oe-body-sm" style={{ color: 'var(--ink-5)', marginTop: 8, fontSize: 12 }}>
            One easing curve, used everywhere. Avoid bouncing or overshoot — this is a government tool, not a marketing site.
          </p>

          <div className="oe-meta" style={{ margin: '24px 0 14px' }}>Reduced motion</div>
          <div style={{ padding: 12, background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 5 }}>
            <code className="oe-mono" style={{ fontSize: 11, color: 'var(--ink-6)', display: 'block', lineHeight: 1.6 }}>
              @media (prefers-reduced-motion){'{'}<br />
              {'  '}*, *::before, *::after {'{'} transition: none !important; {'}'}<br />
              {'}'}
            </code>
          </div>
        </div>

        {/* A11Y */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Contrast · WCAG AA</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ContrastRow fg="var(--ink-7)" bg="var(--ink-0)" fgHex="#1e1c14" bgHex="#faf8f3" ratio="15.8 : 1" passes="AAA" />
            <ContrastRow fg="var(--ink-5)" bg="var(--ink-0)" fgHex="#6b6354" bgHex="#faf8f3" ratio="6.4 : 1" passes="AA" />
            <ContrastRow fg="var(--ink-paper)" bg="var(--navy-500)" fgHex="#ffffff" bgHex="#1f3b6b" ratio="11.2 : 1" passes="AAA" />
            <ContrastRow fg="var(--navy-500)" bg="var(--ink-0)" fgHex="#1f3b6b" bgHex="#faf8f3" ratio="10.8 : 1" passes="AAA" />
            <ContrastRow fg="var(--status-overdue-fg)" bg="var(--status-overdue-bg)" fgHex="#6e2a0a" bgHex="#f3dccc" ratio="6.7 : 1" passes="AA" />
          </div>

          <div className="oe-meta" style={{ margin: '24px 0 14px' }}>Focus ring</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="oe-btn oe-btn--primary" style={{ boxShadow: '0 0 0 3px var(--ink-0), 0 0 0 5px var(--navy-500)' }}>New project</button>
            <button className="oe-btn oe-btn--secondary" style={{ boxShadow: '0 0 0 3px var(--ink-0), 0 0 0 5px var(--navy-500)' }}>Refresh</button>
            <input className="oe-input" defaultValue="Focused input" style={{ width: 160, boxShadow: '0 0 0 3px rgba(31, 59, 107, 0.18)', borderColor: 'var(--navy-500)' }} />
          </div>
          <p className="oe-body-sm" style={{ color: 'var(--ink-5)', marginTop: 10, fontSize: 12 }}>
            2px solid ring + 3px halo, always navy-500 regardless of element. Visible against any background.
          </p>

          <div className="oe-meta" style={{ margin: '24px 0 14px' }}>Hit targets · 32px minimum</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <button className="oe-btn oe-btn--ghost oe-btn--icon"><i className="ph ph-dots-three"></i></button>
              <div style={{ position: 'absolute', inset: 0, border: '1px dashed var(--navy-300)', borderRadius: 5, pointerEvents: 'none' }}></div>
            </div>
            <span className="oe-body-sm" style={{ color: 'var(--ink-5)' }}>Icon-only buttons get padding to reach 32×32 even when the glyph is smaller.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MotionRow({ name, ms, use }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 5 }}>
      <div className="oe-mono" style={{ width: 80, fontSize: 11, color: 'var(--ink-7)' }}>{name}</div>
      <div className="oe-mono" style={{ width: 50, fontSize: 11, color: 'var(--ink-5)' }}>{ms}ms</div>
      <div style={{ flex: 1, position: 'relative', height: 4 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${ms / 4}px`, background: 'var(--navy-500)', borderRadius: 2 }}></div>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, background: 'var(--ink-1)', borderRadius: 2, zIndex: -1 }}></div>
      </div>
      <div className="oe-body-sm" style={{ flex: '0 0 200px', color: 'var(--ink-5)', fontSize: 12 }}>{use}</div>
    </div>
  );
}

function ContrastRow({ fg, bg, fgHex, bgHex, ratio, passes }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 5 }}>
      <div style={{ background: bg, color: fg, padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 500, minWidth: 80 }}>Aa Bb 12</div>
      <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>{fgHex} / {bgHex}</div>
      <div className="oe-spacer"></div>
      <div className="oe-mono" style={{ fontSize: 11, color: 'var(--ink-7)' }}>{ratio}</div>
      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: passes === 'AAA' ? 'var(--status-active-bg)' : 'var(--status-future-bg)', color: passes === 'AAA' ? 'var(--status-active-fg)' : 'var(--status-future-fg)' }}>{passes}</span>
    </div>
  );
}

// ============================================================
// HERO — Mobile dashboard
// ============================================================

function ScreenMobile() {
  return (
    <div className="oe" data-screen-label="05 Mobile" style={{ width: '100%', height: '100%', background: 'var(--ink-1)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 32 }}>
      {/* Phone frame */}
      <div style={{ width: 380, background: 'var(--ink-0)', borderRadius: 32, padding: '12px 12px 18px', boxShadow: 'var(--shadow-3)', border: '1px solid var(--ink-2)' }}>
        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 18px 14px', fontSize: 11, color: 'var(--ink-7)', fontFamily: 'var(--font-mono)' }}>
          <span>9:41</span>
          <span style={{ display: 'flex', gap: 4 }}>
            <i className="ph ph-cell-signal-high"></i>
            <i className="ph ph-wifi-high"></i>
            <i className="ph ph-battery-full"></i>
          </span>
        </div>

        {/* App content */}
        <div style={{ background: 'var(--ink-paper)', borderRadius: 18, overflow: 'hidden', minHeight: 720 }}>
          {/* Header */}
          <div style={{ padding: '18px 16px 16px', borderBottom: '1px solid var(--ink-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, background: 'var(--navy-500)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-paper)', fontFamily: 'var(--font-display)', fontSize: 18, lineHeight: 1 }}>T</div>
              <div style={{ flex: 1 }}>
                <div className="oe-meta">Office of Equity</div>
              </div>
              <i className="ph ph-bell" style={{ fontSize: 16, color: 'var(--ink-6)' }}></i>
              <span className="oe-avatar oe-avatar--sm" style={{ background: 'var(--steel-100)', color: 'var(--steel-700)' }}>LS</span>
            </div>
            <div className="oe-meta" style={{ color: 'var(--navy-300)', marginBottom: 8 }}>Monday · May 25</div>
            <div className="oe-display-3" style={{ fontSize: 28, lineHeight: 1.1 }}>
              Good morning, <span className="oe-italic-serif" style={{ fontStyle: 'italic', color: 'var(--navy-500)' }}>Laura</span>.
            </div>
          </div>

          {/* Week summary card */}
          <div style={{ margin: 16, padding: 18, background: 'var(--navy-700)', color: 'var(--ink-paper)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="oe-meta" style={{ color: 'var(--navy-200)' }}>This week</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginTop: 4, lineHeight: 1 }}>
                  0<span style={{ color: 'var(--navy-200)' }}>/40h</span>
                </div>
              </div>
              <i className="ph ph-arrow-right" style={{ color: 'var(--navy-200)' }}></i>
            </div>
          </div>

          {/* KPIs grid */}
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <MiniKPI label="Active" value="0" />
            <MiniKPI label="Open tasks" value="0" />
            <MiniKPI label="Overdue" value="0" />
            <MiniKPI label="Due this week" value="0" />
          </div>

          {/* My projects */}
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div className="oe-h4">My Projects</div>
              <span className="oe-tab-count" style={{ marginLeft: 8 }}>2</span>
              <div className="oe-spacer"></div>
              <a style={{ color: 'var(--navy-500)', fontSize: 12 }}>View all</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MobileProjectCard id="P-187" name="ADA Accessibility — Hub Sites" status="active" due="2026-05-15" />
              <MobileProjectCard id="P-327" name="Upgrade GISPUBLICPRD" status="overdue" due="4d ago" />
            </div>
          </div>
        </div>

        {/* Bottom nav */}
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '14px 0 4px' }}>
          {[
            { i: 'house', l: 'Home', active: true },
            { i: 'folder-open', l: 'Projects' },
            { i: 'chart-bar', l: 'Capacity' },
            { i: 'user-circle', l: 'Me' },
          ].map(t => (
            <div key={t.l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: t.active ? 'var(--navy-500)' : 'var(--ink-5)' }}>
              <i className={`ph ph-${t.i}`} style={{ fontSize: 22 }}></i>
              <div style={{ fontSize: 10, fontWeight: t.active ? 600 : 500 }}>{t.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function MiniKPI({ label, value }) {
  return (
    <div className="oe-card" style={{ padding: 12 }}>
      <div className="oe-meta" style={{ fontSize: 10 }}>{label}</div>
      <div className="oe-mono" style={{ fontSize: 20, color: 'var(--ink-7)', marginTop: 4, lineHeight: 1 }}>{value}</div>
    </div>
  );
}
function MobileProjectCard({ id, name, status, due }) {
  const statusDot = `var(--status-${status}-dot)`;
  return (
    <div className="oe-card" style={{ padding: 14, borderLeft: `3px solid ${statusDot}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>{id}</span>
        <div className="oe-spacer"></div>
        <span className={`oe-pill oe-pill--${status}`} style={{ fontSize: 10, padding: '2px 6px' }}>{cap2(status)}</span>
      </div>
      <div className="oe-h4" style={{ fontSize: 13 }}>{name}</div>
      <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)', marginTop: 4 }}>Due {due}</div>
    </div>
  );
}
function cap2(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

Object.assign(window, { SpecDarkMode, SpecMotionA11y, ScreenMobile });
