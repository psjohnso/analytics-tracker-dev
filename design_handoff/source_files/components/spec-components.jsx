// ============================================================
// SPEC SHEET — components (buttons, pills, inputs, cards, table, chart)
// ============================================================

function SpecComponents() {
  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>06 · Components</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>One shape language.</h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 540, marginBottom: 28 }}>
        Three buttons. Three statuses. One pill shape, one chip shape. Anything more is decoration trying to do meaning's job.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* BUTTONS */}
        <Section title="Buttons">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Row label="Primary · single CTA per view">
              <button className="oe-btn oe-btn--primary"><i className="ph ph-plus"></i>New project</button>
              <button className="oe-btn oe-btn--primary oe-btn--sm">Save</button>
            </Row>
            <Row label="Secondary · neutral actions">
              <button className="oe-btn oe-btn--secondary"><i className="ph ph-arrow-clockwise"></i>Refresh</button>
              <button className="oe-btn oe-btn--secondary oe-btn--sm">Filter</button>
            </Row>
            <Row label="Ghost · tertiary, inline">
              <button className="oe-btn oe-btn--ghost"><i className="ph ph-pencil-simple"></i>Edit</button>
              <button className="oe-btn oe-btn--ghost oe-btn--icon"><i className="ph ph-dots-three"></i></button>
            </Row>
          </div>
        </Section>

        {/* PILLS + CHIPS */}
        <Section title="Status pills · priority chips">
          <Row label="Status — meaning, not decoration">
            <span className="oe-pill oe-pill--active">Active</span>
            <span className="oe-pill oe-pill--future">Future</span>
            <span className="oe-pill oe-pill--complete">Complete</span>
            <span className="oe-pill oe-pill--hold">On hold</span>
            <span className="oe-pill oe-pill--canceled">Canceled</span>
            <span className="oe-pill oe-pill--overdue">Overdue</span>
          </Row>
          <Row label="Priority — ordinal, no dot">
            <span className="oe-chip oe-chip--high">High</span>
            <span className="oe-chip oe-chip--med">Medium</span>
            <span className="oe-chip oe-chip--low">Low</span>
          </Row>
        </Section>

        {/* INPUTS */}
        <Section title="Inputs">
          <Row label="Text + search">
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <input className="oe-input" placeholder="Project name" style={{ flex: 1 }} />
              <div className="oe-search" style={{ flex: 1 }}>
                <span className="oe-search-icon"><i className="ph ph-magnifying-glass"></i></span>
                <input className="oe-input" placeholder="Search" />
              </div>
            </div>
          </Row>
          <Row label="Select + checkbox">
            <select className="oe-input" style={{ flex: 1 }}>
              <option>All teams</option>
              <option>Business Analytics</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-6)' }}>
              <input type="checkbox" defaultChecked /> Data program only
            </label>
          </Row>
        </Section>

        {/* AVATARS + TABS */}
        <Section title="Tabs · avatars">
          <Row label="Tabs — single navy underline">
            <div className="oe-tabs" style={{ width: '100%' }}>
              <button className="oe-tab" aria-selected="false">Overview</button>
              <button className="oe-tab" aria-selected="true">Portfolio <span className="oe-tab-count">405</span></button>
              <button className="oe-tab" aria-selected="false">Capacity</button>
              <button className="oe-tab" aria-selected="false">Analytics</button>
            </div>
          </Row>
          <Row label="Avatars">
            <div style={{ display: 'flex', gap: 6 }}>
              <span className="oe-avatar oe-avatar--sm">LS</span>
              <span className="oe-avatar">JF</span>
              <span className="oe-avatar oe-avatar--lg">JM</span>
              <span className="oe-avatar" style={{ background: 'var(--sage-100)', color: 'var(--sage-700)' }}>KC</span>
              <span className="oe-avatar" style={{ background: 'var(--steel-100)', color: 'var(--steel-700)' }}>AS</span>
            </div>
          </Row>
        </Section>
      </div>

      {/* CARD PATTERNS */}
      <div style={{ marginTop: 24 }}>
        <Section title="Card patterns">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {/* metric */}
            <div className="oe-card" style={{ padding: 16 }}>
              <div className="oe-meta">Open tasks</div>
              <div className="oe-mono" style={{ fontSize: 32, color: 'var(--ink-7)', marginTop: 6 }}>135</div>
              <div className="oe-body-sm" style={{ color: 'var(--ink-5)', marginTop: 4 }}>across 41 active projects</div>
            </div>

            {/* project card with left accent */}
            <div className="oe-card" style={{ padding: 14, paddingLeft: 14, borderLeft: '3px solid var(--status-overdue-dot)', borderRadius: '4px 8px 8px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="oe-mono" style={{ fontSize: 11, color: 'var(--ink-5)' }}>P-327</span>
                <span className="oe-pill oe-pill--overdue" style={{ marginLeft: 'auto' }}>4d overdue</span>
              </div>
              <div className="oe-h4" style={{ marginBottom: 4 }}>Upgrade GISPUBLICPRD to 11.3</div>
              <div className="oe-body-sm" style={{ color: 'var(--ink-5)' }}>5 / 13 tasks done</div>
            </div>

            {/* hero stat */}
            <div className="oe-card" style={{ padding: 16, background: 'var(--navy-700)', color: 'var(--ink-paper)', border: 'none' }}>
              <div className="oe-meta" style={{ color: 'var(--navy-200)' }}>Year to date</div>
              <div className="oe-mono" style={{ fontSize: 32, color: 'var(--ink-paper)', marginTop: 6 }}>2,350h</div>
              <div className="oe-body-sm" style={{ color: 'var(--navy-100)', marginTop: 4 }}>across 50 projects</div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div>
      <div className="oe-meta" style={{ marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div>
      <div className="oe-body-sm" style={{ color: 'var(--ink-5)', marginBottom: 8, fontSize: 11 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

// ---------- TABLE + DATA VIZ ----------
function SpecTableViz() {
  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>07 · Tables &amp; data viz</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>Numbers that <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>line up</span>.</h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 580, marginBottom: 28 }}>
        Tabular layout uses mono numerals so digits align. Charts use the 8-hue categorical palette; everything past rank 8 collapses into a single &quot;Other&quot; band.
      </p>

      {/* TABLE */}
      <div className="oe-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 28 }}>
        <table className="oe-table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>ID</th>
              <th>Project</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 90 }}>Priority</th>
              <th style={{ width: 100 }}>Due</th>
            </tr>
          </thead>
          <tbody>
            <tr className="oe-row-group"><td colSpan="5">Active · 1</td></tr>
            <tr>
              <td><span className="oe-mono">P-187</span></td>
              <td>ADA Accessibility Compliance — Hub Sites</td>
              <td><span className="oe-pill oe-pill--active">Active</span></td>
              <td><span className="oe-chip oe-chip--med">Medium</span></td>
              <td><span className="oe-mono">2026-05-15</span></td>
            </tr>
            <tr className="oe-row-group"><td colSpan="5">Future · 1</td></tr>
            <tr>
              <td><span className="oe-mono">P-349</span></td>
              <td>Achieve 90% Enterprise Dataset Catalog Coverage</td>
              <td><span className="oe-pill oe-pill--future">Future</span></td>
              <td><span className="oe-chip oe-chip--med">Medium</span></td>
              <td><span className="oe-mono" style={{ color: 'var(--ink-4)' }}>—</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* CHART comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div>
          <div className="oe-meta" style={{ marginBottom: 10, color: 'var(--status-overdue-fg)' }}>Before · 14+ random hues</div>
          <div style={{ height: 180, background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            {[60,90,30,110,40,80,50,100,70,55,85,45,95,65].map((h, i) => (
              <div key={i} style={{ flex: 1, height: h, background: ['#e76f51','#a16ae0','#f4a261','#264653','#2a9d8f','#e9c46a','#bc6c25','#606c38','#283618','#dda15e','#fb8500','#219ebc','#8ecae6','#ffb703'][i], borderRadius: '2px 2px 0 0' }}></div>
            ))}
          </div>
        </div>

        <div>
          <div className="oe-meta" style={{ marginBottom: 10, color: 'var(--sage-700)' }}>After · 8 hues + Other</div>
          <div style={{ height: 180, background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            {[60,90,30,110,40,80,50,100,70,55,85,45,95,65].map((h, i) => {
              const palette = ['#1f3b6b','#8aa050','#b85630','#8a4c70','#4a7fae','#3d2e55','#d4bc7a','#c89500'];
              return <div key={i} style={{ flex: 1, height: h, background: i < 8 ? palette[i] : 'var(--data-other)', borderRadius: '2px 2px 0 0' }}></div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SpecComponents, SpecTableViz });
