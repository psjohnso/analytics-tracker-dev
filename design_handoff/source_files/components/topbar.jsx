// ============================================================
// SHARED TOP BAR — used across all three hero screens
// Replaces: yellow numbers on navy, rainbow stripe, mixed buttons
// ============================================================

function OETopBar({ activeTab = 'My Work', stats, showAccountMenu = false }) {
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

        {/* Account dropdown trigger */}
        <div style={{ position: 'relative' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 4px 4px', background: showAccountMenu ? 'var(--ink-1)' : 'transparent', border: 0, borderRadius: 6, cursor: 'pointer' }}>
            <span className="oe-avatar" style={{ background: 'var(--steel-100)', color: 'var(--steel-700)' }}>LS</span>
            <div style={{ textAlign: 'left' }}>
              <div className="oe-h4" style={{ fontSize: 13, color: 'var(--ink-7)' }}>Laura Sharp</div>
              <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>ADMIN</div>
            </div>
            <i className="ph ph-caret-down" style={{ fontSize: 11, color: 'var(--ink-5)', marginLeft: 2 }}></i>
          </button>

          {showAccountMenu && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 6, boxShadow: 'var(--shadow-3)', padding: 4, width: 240, zIndex: 50 }}>
              {/* Header */}
              <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--ink-2)', marginBottom: 4 }}>
                <div className="oe-h4" style={{ fontSize: 13 }}>Laura Sharp</div>
                <div className="oe-body-sm" style={{ fontSize: 11, color: 'var(--ink-5)' }}>laura.sharp@tucsonaz.gov</div>
              </div>
              <AccountMenuItem icon="user-circle" label="Profile &amp; preferences" />
              <AccountMenuItem icon="bell" label="Notification settings" />
              <AccountMenuItem icon="keyboard" label="Keyboard shortcuts" shortcut="?" />
              <div style={{ height: 1, background: 'var(--ink-2)', margin: '4px 6px' }}></div>
              <AccountMenuItem icon="download-simple" label="Download my data" />
              <AccountMenuItem icon="file-arrow-down" label="Export current view" hint="CSV" />
              <div style={{ height: 1, background: 'var(--ink-2)', margin: '4px 6px' }}></div>
              <AccountMenuItem icon="question" label="About this tool" />
              <AccountMenuItem icon="lifebuoy" label="Help &amp; documentation" />
              <AccountMenuItem icon="chat-circle-text" label="Send feedback" />
              <div style={{ height: 1, background: 'var(--ink-2)', margin: '4px 6px' }}></div>
              <AccountMenuItem icon="sign-out" label="Sign out" />
              {/* Footer version */}
              <div style={{ padding: '8px 10px 4px', borderTop: '1px solid var(--ink-2)', marginTop: 4 }}>
                <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>v1.61.2.2 · refreshed 2m ago</div>
              </div>
            </div>
          )}
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

function AccountMenuItem({ icon, label, hint, shortcut }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 4, cursor: 'pointer', color: 'var(--ink-7)' }}>
      <i className={`ph ph-${icon}`} style={{ fontSize: 14, color: 'var(--ink-5)' }}></i>
      <span style={{ flex: 1, fontSize: 13 }} dangerouslySetInnerHTML={{ __html: label }}></span>
      {hint && <span className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)', padding: '1px 5px', background: 'var(--ink-1)', borderRadius: 3 }}>{hint}</span>}
      {shortcut && <span className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>{shortcut}</span>}
    </div>
  );
}
