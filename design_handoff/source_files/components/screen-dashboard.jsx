// ============================================================
// HERO SCREEN — DASHBOARD (My Work)
// "Good morning, Laura" redesigned
// ============================================================

function ScreenDashboard() {
  return (
    <div className="oe" data-screen-label="01 Dashboard" style={{ width: '100%', height: '100%', overflow: 'auto', background: 'var(--ink-0)' }}>
      <OETopBar activeTab="My Work" />

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '40px 28px 64px' }}>
        {/* Editorial greeting */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 }}>
          <div>
            <div className="oe-meta" style={{ color: 'var(--navy-300)', marginBottom: 10 }}>Monday · May 25, 2026 · Week 22</div>
            <h1 className="oe-display-1" style={{ margin: 0, color: 'var(--ink-7)' }}>
              Good morning, <span className="oe-italic-serif" style={{ fontStyle: 'italic', color: 'var(--navy-500)' }}>Laura</span>.
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="oe-btn oe-btn--ghost oe-btn--sm"><i className="ph ph-arrow-up"></i>Top</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm"><i className="ph ph-calendar-blank"></i>Week</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm"><i className="ph ph-folder-open"></i>Projects &amp; Tasks</button>
          </div>
        </div>

        {/* Hero week strip + KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* This week — editorial card */}
          <div className="oe-card" style={{ padding: 24, background: 'var(--navy-700)', border: 'none', color: 'var(--ink-paper)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div className="oe-meta" style={{ color: 'var(--navy-200)', marginBottom: 8 }}>This week · May 25 – 31</div>
                <div className="oe-display-3" style={{ color: 'var(--ink-paper)' }}>
                  No allocations <span className="oe-italic-serif" style={{ fontStyle: 'italic', color: 'var(--navy-100)' }}>yet</span>.
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="oe-mono" style={{ fontSize: 32, color: 'var(--ink-paper)', lineHeight: 1 }}>0<span style={{ color: 'var(--navy-200)' }}>/40h</span></div>
                <div className="oe-meta" style={{ color: 'var(--navy-200)', marginTop: 4 }}>5/8 schedule · Week A</div>
              </div>
            </div>

            {/* Days strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, marginTop: 16, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
              {['Mon 25','Tue 26','Wed 27','Thu 28','Fri 29'].map((d, i) => (
                <div key={d} style={{ padding: '12px 10px', background: 'var(--navy-700)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="oe-mono" style={{ fontSize: 10, color: i === 0 ? 'var(--ink-paper)' : 'var(--navy-200)' }}>{d.toUpperCase()}</div>
                  <div style={{ height: 22, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginTop: 6 }}></div>
                  <div className="oe-mono" style={{ fontSize: 10, color: 'var(--navy-200)' }}>0h</div>
                </div>
              ))}
            </div>
          </div>

          {/* Achievements — quieter */}
          <div className="oe-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div className="oe-meta">Your achievements</div>
              <a className="oe-body-sm" style={{ color: 'var(--navy-500)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>View all <i className="ph ph-arrow-right"></i></a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
              <Achievement icon="flame" value="0" label="Day streak" tone="quiet" />
              <Achievement icon="target" value="0" label="Tasks · month" tone="quiet" />
              <Achievement icon="clock-counter-clockwise" value="0h" label="This week" tone="quiet" />
              <Achievement icon="trophy" value="2" label="Projects shipped" tone="bright" />
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 36 }}>
          <KPI label="Active projects" value="0" />
          <KPI label="Open tasks" value="0" />
          <KPI label="Overdue" value="0" helpIcon />
          <KPI label="Due this week" value="0" />
          <KPI label="Utilization" value="0%" emphasis />
        </div>

        {/* Two columns: My Projects + My Tasks */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Column title="My Projects" count={2} action="+ New">
            <SectionHeader label="Leading" count={2} />
            <EmptyRow text="No leading projects in active statuses." />
            <SectionHeader label="Supporting" count={0} />
            <EmptyRow text="None yet." />
          </Column>

          <Column title="My Tasks" count={0} action="+ New">
            <EmptyRow text="No tasks assigned to you." emoji="check" />
          </Column>
        </div>
      </div>
    </div>
  );
}

function Achievement({ icon, value, label, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 6, background: tone === 'bright' ? 'var(--sage-50)' : 'var(--ink-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone === 'bright' ? 'var(--sage-700)' : 'var(--ink-5)', flex: '0 0 auto' }}>
        <i className={`ph ph-${icon}`} style={{ fontSize: 16 }}></i>
      </div>
      <div>
        <div className="oe-mono" style={{ fontSize: 22, color: tone === 'bright' ? 'var(--sage-700)' : 'var(--ink-7)', lineHeight: 1 }}>{value}</div>
        <div className="oe-meta" style={{ marginTop: 6 }}>{label}</div>
      </div>
    </div>
  );
}

function KPI({ label, value, helpIcon, emphasis }) {
  return (
    <div className="oe-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="oe-meta">{label}</div>
        {helpIcon && <i className="ph ph-info" style={{ fontSize: 11, color: 'var(--ink-4)' }}></i>}
      </div>
      <div className="oe-mono" style={{ fontSize: 28, color: emphasis ? 'var(--sage-700)' : 'var(--ink-7)', marginTop: 8, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function Column({ title, count, action, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <i className="ph ph-folder-open" style={{ fontSize: 16, color: 'var(--ink-5)' }}></i>
        <h3 className="oe-h3">{title}</h3>
        <span className="oe-tab-count">{count}</span>
        <div className="oe-spacer"></div>
        <button className="oe-btn oe-btn--ghost oe-btn--sm">{action}</button>
      </div>
      <div className="oe-card" style={{ overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

function SectionHeader({ label, count }) {
  return (
    <div style={{ padding: '10px 16px', background: 'var(--ink-1)', borderBottom: '1px solid var(--ink-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="oe-meta">{label}</span>
      <span className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>· {count}</span>
    </div>
  );
}
function EmptyRow({ text, emoji }) {
  return (
    <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--ink-5)', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15 }}>
      {text}
    </div>
  );
}

Object.assign(window, { ScreenDashboard });
