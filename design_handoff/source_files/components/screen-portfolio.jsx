// ============================================================
// HERO SCREEN — PORTFOLIO (project list with filters)
// ============================================================

function ScreenPortfolio() {
  const rows = [
    { group: 'Active · On hold · Waiting (1)' },
    { id: 'P-187', name: 'ADA Accessibility Compliance — Hub Sites', status: 'active', priority: 'med', category: 'Strategic Planning & Architecture', lead: 'VB', due: '2026-05-15', tasks: 29 },
    { group: 'Future · Scheduled (1)' },
    { id: 'P-349', name: 'Achieve 90% Enterprise Dataset Catalog Coverage', status: 'future', priority: 'med', category: 'Documentation & Knowledge', lead: 'AS', due: null, tasks: 0 },
    { group: 'Complete · Canceled (22)' },
    { id: 'P-083', name: '2025 AI Roadmap Implementation', status: 'complete', priority: 'med', category: 'AI Enablement, Automation', lead: 'KC', due: '2025-04-14', tasks: 1 },
    { id: 'P-164', name: '2026 AI Governance Strategy Evaluation', status: 'canceled', priority: 'med', category: 'AI Enablement, Automation', lead: 'KC', due: '2026-03-31', tasks: 0 },
    { id: 'P-250', name: 'ACA BEAD Program Map', status: 'complete', priority: 'med', category: 'Spatial Data Services & GIS', lead: 'VB', due: null, tasks: 1 },
    { id: 'P-317', name: 'ADA Accessibility Compliance — City GIS Sites', status: 'complete', priority: 'high', category: 'Spatial Data Services & GIS', lead: 'JF', due: '2026-04-30', tasks: 5 },
    { id: 'P-007', name: 'ADOR data in TimeXtender', status: 'complete', priority: 'low', category: 'Data Processing, Integration', lead: 'AS', due: '2024-03-13', tasks: 1 },
    { id: 'P-043', name: 'ADOR Query Dashboards', status: 'complete', priority: 'med', category: 'Data Analysis, Reporting', lead: 'AS', due: '2024-09-05', tasks: 9 },
    { id: 'P-288', name: 'Affidavit of Sales Workbench 2024 Update', status: 'complete', priority: 'low', category: 'Data Processing, Integration', lead: 'VB', due: null, tasks: 0 },
    { id: 'P-072', name: 'AHP Analysis Tool Code Fix', status: 'complete', priority: 'low', category: 'Data Analysis, Reporting', lead: 'VB', due: '2024-08-22', tasks: 3 },
  ];

  const teamMembers = [
    { name: 'Adam Sliva', count: 1, hue: 'var(--data-6)' },
    { name: 'Andrew Sutton', count: 13, hue: 'var(--data-4)' },
    { name: 'Daniel Jackson-Reeves', count: 2, hue: 'var(--data-7)' },
    { name: 'James McGinnis', count: 25, hue: 'var(--data-5)' },
    { name: 'Jay Smith', count: 1, hue: 'var(--data-8)' },
    { name: 'JeanPaul NduwayoNtore', count: 4, hue: 'var(--data-1)' },
    { name: 'Jessica Fraver', count: 21, hue: 'var(--data-2)' },
    { name: 'Joseph Ahumada', count: 8, hue: 'var(--data-3)' },
    { name: 'Kate Carter', count: 17, hue: 'var(--data-1)' },
    { name: 'Vladimir Berg', count: 12, hue: 'var(--data-5)' },
  ];

  return (
    <div className="oe" data-screen-label="02 Portfolio" style={{ width: '100%', height: '100%', overflow: 'auto', background: 'var(--ink-0)' }}>
      <OETopBar activeTab="Portfolio" />

      <div style={{ padding: '24px 28px 64px' }}>
        {/* Page title row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div className="oe-meta" style={{ color: 'var(--navy-300)', marginBottom: 6 }}>All teams · City of Tucson</div>
            <h1 className="oe-h1">Portfolio</h1>
          </div>

          {/* Sub-tabs Projects/Tasks */}
          <div className="oe-tabs" style={{ borderBottom: 'none' }}>
            <button className="oe-tab" aria-selected="true">Projects <span className="oe-tab-count">405</span></button>
            <button className="oe-tab" aria-selected="false">Tasks <span className="oe-tab-count">1,607</span></button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="oe-btn oe-btn--secondary oe-btn--sm"><i className="ph ph-funnel"></i>Filters</button>
          <button className="oe-btn oe-btn--secondary oe-btn--sm"><i className="ph ph-lightbulb"></i>Review ideas <span className="oe-tab-count">2</span></button>
          <button className="oe-btn oe-btn--secondary oe-btn--sm"><i className="ph ph-folder-open"></i>Open projects</button>

          <div className="oe-spacer"></div>

          <div className="oe-body-sm" style={{ color: 'var(--ink-5)' }}>
            <span className="oe-mono" style={{ color: 'var(--ink-7)' }}>11</span> of <span className="oe-mono">405</span> shown
          </div>

          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--ink-3)', borderRadius: 'var(--r-2)', overflow: 'hidden' }}>
            {['list','grid','board','calendar'].map((v, i) => (
              <button key={v} className="oe-btn oe-btn--ghost oe-btn--sm" style={{ borderRadius: 0, padding: '6px 10px', background: v === 'list' ? 'var(--ink-1)' : 'transparent', borderLeft: i === 0 ? 'none' : '1px solid var(--ink-3)' }}>
                <i className={`ph ph-${v === 'list' ? 'list-bullets' : v === 'grid' ? 'squares-four' : v === 'board' ? 'kanban' : 'calendar-blank'}`}></i>
              </button>
            ))}
          </div>

          <select className="oe-input" style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
            <option>Sort · Title A→Z</option>
            <option>Sort · Due date</option>
            <option>Sort · Priority</option>
          </select>
        </div>

        {/* Views row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, padding: '10px 14px', background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 'var(--r-2)' }}>
          <span className="oe-meta" style={{ marginRight: 6 }}>Views</span>
          {[
            { label: 'All', active: true },
            { label: 'My work', active: false },
            { label: 'Open', active: false },
            { label: 'Overdue', active: false },
            { label: 'High priority', active: false },
          ].map(v => (
            <button key={v.label} className="oe-btn oe-btn--ghost oe-btn--sm" style={{ background: v.active ? 'var(--navy-50)' : 'transparent', color: v.active ? 'var(--navy-500)' : 'var(--ink-6)', fontWeight: v.active ? 600 : 500 }}>
              {v.label}
            </button>
          ))}
          <div className="oe-spacer"></div>
          <button className="oe-btn oe-btn--ghost oe-btn--sm"><i className="ph ph-floppy-disk"></i>Save view</button>
        </div>

        {/* Main grid: filters + table */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 18 }}>
          {/* Filter sidebar */}
          <div className="oe-card" style={{ padding: 0, alignSelf: 'flex-start', position: 'sticky', top: 16 }}>
            <div style={{ padding: 16, borderBottom: '1px solid var(--ink-2)' }}>
              <div className="oe-search" style={{ marginBottom: 14 }}>
                <span className="oe-search-icon"><i className="ph ph-magnifying-glass"></i></span>
                <input className="oe-input" placeholder="Search by name, P-001…" />
              </div>

              {/* Active filters */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                <FilterChip>Status: Active, Scheduled +4</FilterChip>
                <FilterChip>Member: Laura Sharp</FilterChip>
              </div>
              <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ padding: '2px 0', color: 'var(--navy-500)' }}>Clear all</button>
            </div>

            <FilterGroup title="Team member" count={1} open>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {teamMembers.slice(0, 7).map(m => (
                  <button key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'transparent', border: 0, cursor: 'pointer', borderRadius: 4, textAlign: 'left' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.hue, flex: '0 0 auto' }}></span>
                    <span className="oe-body-sm" style={{ flex: 1, color: 'var(--ink-7)', fontSize: 12 }}>{m.name}</span>
                    <span className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>{m.count}</span>
                  </button>
                ))}
                <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ marginTop: 4, justifyContent: 'flex-start', color: 'var(--navy-500)' }}>+ 131 more</button>
              </div>
            </FilterGroup>

            <FilterGroup title="Project status" />
            <FilterGroup title="Priority" />
            <FilterGroup title="Category" />
            <FilterGroup title="Partner department" />
            <FilterGroup title="Unit" />

            <div style={{ padding: 16, borderTop: '1px solid var(--ink-2)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-6)' }}>
                <input type="checkbox" /> Data program only <span className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>(90)</span>
              </label>
            </div>
          </div>

          {/* Table */}
          <div className="oe-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="oe-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}><input type="checkbox" /></th>
                  <th style={{ width: 70 }}>ID <i className="ph ph-caret-up-down" style={{ fontSize: 10, opacity: 0.5 }}></i></th>
                  <th>Project ↑</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th style={{ width: 90 }}>Priority</th>
                  <th>Category</th>
                  <th style={{ width: 100 }}>Lead</th>
                  <th style={{ width: 100 }}>Due</th>
                  <th style={{ width: 60, textAlign: 'right' }}>Tasks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => r.group ? (
                  <tr key={i} className="oe-row-group"><td colSpan="9">{r.group}</td></tr>
                ) : (
                  <tr key={r.id}>
                    <td><input type="checkbox" /></td>
                    <td><span className="oe-mono" style={{ fontSize: 11, color: 'var(--ink-5)' }}>{r.id}</span></td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td><StatusPill kind={r.status} /></td>
                    <td><PriorityChip kind={r.priority} /></td>
                    <td className="oe-body-sm" style={{ color: 'var(--ink-5)' }}>{r.category}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="oe-avatar oe-avatar--sm">{r.lead}</span>
                        <span className="oe-body-sm" style={{ color: 'var(--ink-6)' }}>{leadName(r.lead)}</span>
                      </div>
                    </td>
                    <td><span className="oe-mono" style={{ fontSize: 11, color: r.due ? 'var(--ink-6)' : 'var(--ink-4)' }}>{r.due || '—'}</span></td>
                    <td style={{ textAlign: 'right' }}><span className="oe-mono" style={{ fontSize: 11, color: r.tasks ? 'var(--ink-7)' : 'var(--ink-4)' }}>{r.tasks}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function leadName(initials) {
  const map = { VB: 'Vladimir Berg', AS: 'Andrew Sutton', KC: 'Kate Carter', JF: 'Jessica Fraver' };
  return map[initials] || initials;
}

function FilterChip({ children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px 3px 8px', background: 'var(--navy-50)', color: 'var(--navy-700)', borderRadius: 4, fontSize: 11 }}>
      {children}
      <button style={{ border: 0, background: 'transparent', color: 'var(--navy-500)', cursor: 'pointer', padding: 0, marginLeft: 2, display: 'inline-flex' }}><i className="ph ph-x" style={{ fontSize: 11 }}></i></button>
    </span>
  );
}

function FilterGroup({ title, count, open, children }) {
  return (
    <div style={{ borderBottom: '1px solid var(--ink-2)' }}>
      <button style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '12px 16px', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}>
        <span className="oe-meta" style={{ flex: 1 }}>{title}</span>
        {count != null && <span style={{ background: 'var(--navy-500)', color: 'var(--ink-paper)', borderRadius: 999, fontSize: 10, padding: '1px 6px', marginRight: 8, fontFamily: 'var(--font-mono)' }}>{count}</span>}
        <i className={`ph ph-caret-${open ? 'down' : 'right'}`} style={{ fontSize: 12, color: 'var(--ink-5)' }}></i>
      </button>
      {open && children && <div style={{ padding: '0 12px 12px' }}>{children}</div>}
    </div>
  );
}

function StatusPill({ kind }) {
  return <span className={`oe-pill oe-pill--${kind}`}>{kind.charAt(0).toUpperCase() + kind.slice(1)}</span>;
}
function PriorityChip({ kind }) {
  const label = { high: 'High', med: 'Medium', low: 'Low' }[kind];
  return <span className={`oe-chip oe-chip--${kind}`}>{label}</span>;
}

Object.assign(window, { ScreenPortfolio });
