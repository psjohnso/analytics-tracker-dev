// ============================================================
// SHARED TOP BAR — used across all three hero screens
// Replaces: yellow numbers on navy, rainbow stripe, mixed buttons
// ============================================================

function OETopBar({ activeTab = 'My Work', stats }) {
  const defaultStats = stats || [
    { label: 'Active', value: '41' },
    { label: 'Open tasks', value: '135' },
    { label: 'Complete', value: '187' },
    { label: 'Total', value: '405' },
  ];
  const tabs = ['Overview', 'My Work', 'Portfolio', 'Capacity', 'Analytics', 'More'];

  return (
    <div style={{ background: 'var(--ink-paper)', borderBottom: '1px solid var(--ink-2)' }}>
      {/* Top row: brand + stats + account */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 28px', gap: 28, borderBottom: '1px solid var(--ink-2)' }}>
        {/* Brand lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto' }}>
          {/* Tucson civic seal abstracted as monogram (placeholder respectful of brand) */}
          <div style={{ width: 36, height: 36, background: 'var(--navy-500)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-paper)', fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1 }}>T</div>
          <div>
            <div className="oe-meta" style={{ color: 'var(--ink-5)', marginBottom: 1 }}>City of Tucson</div>
            <div className="oe-h4" style={{ color: 'var(--ink-7)', letterSpacing: '-0.005em' }}>Office of Equity</div>
          </div>
        </div>

        <div style={{ height: 32, width: 1, background: 'var(--ink-2)' }}></div>

        <div className="oe-body-sm" style={{ color: 'var(--ink-5)' }}>
          Project &amp; Task Tracker
          <span className="oe-mono" style={{ marginLeft: 10, padding: '2px 6px', background: 'var(--ink-1)', borderRadius: 3, fontSize: 10, color: 'var(--ink-5)' }}>v1.61.2.2</span>
        </div>

        <div className="oe-spacer"></div>

        {/* Stats — calmed, mono numerals, no yellow */}
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
          {defaultStats.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 18px', borderLeft: i === 0 ? 'none' : '1px solid var(--ink-2)' }}>
              <div className="oe-mono" style={{ fontSize: 18, color: 'var(--ink-7)', lineHeight: 1.1 }}>{s.value}</div>
              <div className="oe-meta" style={{ marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ height: 32, width: 1, background: 'var(--ink-2)' }}></div>

        {/* Account */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="oe-avatar" style={{ background: 'var(--steel-100)', color: 'var(--steel-700)' }}>LS</span>
          <div>
            <div className="oe-h4" style={{ fontSize: 13, color: 'var(--ink-7)' }}>Laura Sharp</div>
            <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>ADMIN</div>
          </div>
          <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ marginLeft: 6 }}><i className="ph ph-sign-out"></i></button>
        </div>
      </div>

      {/* Tabs + action row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', padding: '0 28px', gap: 28 }}>
        <div className="oe-tabs" style={{ flex: 1, borderBottom: 'none' }}>
          {tabs.map(t => (
            <button key={t} className="oe-tab" aria-selected={t === activeTab ? 'true' : 'false'}>
              {t}
              {t === 'More' && <span className="oe-tab-count">10</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
          <button className="oe-btn oe-btn--ghost oe-btn--sm"><i className="ph ph-bell"></i></button>
          <button className="oe-btn oe-btn--secondary oe-btn--sm"><i className="ph ph-arrow-clockwise"></i>Refresh</button>
          <button className="oe-btn oe-btn--primary oe-btn--sm"><i className="ph ph-plus"></i>New project</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OETopBar });
