// ============================================================
// HERO SCREEN — PROJECT DETAIL
// The densest screen in the app. Sets patterns for: layout shell,
// breadcrumbs, inline-editable metadata, tabbed sub-content,
// task list, activity feed, comments, allocations.
// ============================================================

function ScreenProjectDetail() {
  const tasks = [
    { group: 'Discovery · 5 of 5 done' },
    { id: 'T-1402', title: 'Audit existing public hub sites for WCAG violations', status: 'complete', assignee: 'JF', due: '2026-02-14', est: '8h' },
    { id: 'T-1403', title: 'Interview content authors about workflow friction', status: 'complete', assignee: 'KC', due: '2026-02-21', est: '6h' },
    { id: 'T-1404', title: 'Survey screen-reader users from civic partners', status: 'complete', assignee: 'JF', due: '2026-02-28', est: '10h' },
    { group: 'Implementation · 7 of 13 done' },
    { id: 'T-1418', title: 'Update Hub Site template — color contrast tokens', status: 'active', assignee: 'VB', due: '2026-05-30', est: '12h', current: true },
    { id: 'T-1419', title: 'Replace decorative imagery with semantic alternatives', status: 'active', assignee: 'JF', due: '2026-06-06', est: '16h' },
    { id: 'T-1420', title: 'Add skip-navigation links to all 47 hub sites', status: 'hold', assignee: 'VB', due: '2026-06-13', est: '4h' },
    { id: 'T-1421', title: 'Run automated axe-core regression across portfolio', status: 'future', assignee: 'KC', due: '2026-06-20', est: '6h' },
    { group: 'Review & QA · 0 of 3 done' },
    { id: 'T-1430', title: 'Procure third-party accessibility audit', status: 'future', assignee: '—', due: '2026-07-01', est: '—' },
  ];

  return (
    <div className="oe" data-screen-label="04 Project Detail" style={{ width: '100%', height: '100%', overflow: 'auto', background: 'var(--ink-0)' }}>
      <OETopBar activeTab="Portfolio" />

      {/* Breadcrumb + back */}
      <div style={{ padding: '14px 28px 0', maxWidth: 1440, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-5)', fontSize: 12 }}>
          <a style={{ color: 'var(--ink-5)', textDecoration: 'none' }}>Portfolio</a>
          <i className="ph ph-caret-right" style={{ fontSize: 10 }}></i>
          <a style={{ color: 'var(--ink-5)', textDecoration: 'none' }}>Active</a>
          <i className="ph ph-caret-right" style={{ fontSize: 10 }}></i>
          <span style={{ color: 'var(--ink-7)' }}>ADA Accessibility Compliance — Hub Sites</span>
        </div>
      </div>

      {/* Project header */}
      <div style={{ padding: '20px 28px 24px', maxWidth: 1440, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span className="oe-mono" style={{ fontSize: 12, color: 'var(--ink-5)', letterSpacing: '0.04em' }}>P-187</span>
              <span className="oe-pill oe-pill--active">Active</span>
              <span className="oe-chip oe-chip--med">Medium</span>
              <span className="oe-body-sm" style={{ color: 'var(--ink-5)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i className="ph ph-folder-open" style={{ fontSize: 12 }}></i>
                Strategic Planning &amp; Architecture
              </span>
            </div>
            <h1 className="oe-display-2" style={{ margin: 0, color: 'var(--ink-7)', lineHeight: 1.05 }}>
              ADA Accessibility Compliance — <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>Hub Sites</span>
            </h1>
            <p className="oe-body" style={{ marginTop: 14, color: 'var(--ink-6)', maxWidth: 720, lineHeight: 1.6 }}>
              Bring all 47 public Hub Sites into WCAG 2.1 AA conformance ahead of the federal Title II deadline. Coordinated with City Manager's Office and ITSD.
            </p>
          </div>

          {/* Action cluster */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="oe-btn oe-btn--ghost oe-btn--sm"><i className="ph ph-share"></i>Share</button>
              <button className="oe-btn oe-btn--secondary oe-btn--sm"><i className="ph ph-pencil-simple"></i>Edit</button>
              <button className="oe-btn oe-btn--primary oe-btn--sm"><i className="ph ph-plus"></i>Add task</button>
              <button className="oe-btn oe-btn--ghost oe-btn--icon"><i className="ph ph-dots-three-vertical"></i></button>
            </div>
            <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>Last edited 4h ago by Laura S.</div>
          </div>
        </div>
      </div>

      {/* Progress strip */}
      <div style={{ padding: '0 28px', maxWidth: 1440, margin: '0 auto', marginBottom: 24 }}>
        <ProgressStrip />
      </div>

      {/* Two-column body */}
      <div style={{ padding: '0 28px 64px', maxWidth: 1440, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32 }}>
        {/* MAIN COL */}
        <div>
          <div className="oe-tabs" style={{ marginBottom: 18 }}>
            <button className="oe-tab" aria-selected="true">Tasks <span className="oe-tab-count">21</span></button>
            <button className="oe-tab" aria-selected="false">Activity <span className="oe-tab-count">142</span></button>
            <button className="oe-tab" aria-selected="false">Comments <span className="oe-tab-count">18</span></button>
            <button className="oe-tab" aria-selected="false">Files <span className="oe-tab-count">7</span></button>
            <button className="oe-tab" aria-selected="false">Allocations</button>
          </div>

          {/* Task filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div className="oe-search" style={{ width: 240 }}>
              <span className="oe-search-icon"><i className="ph ph-magnifying-glass"></i></span>
              <input className="oe-input" placeholder="Search tasks" />
            </div>
            <button className="oe-btn oe-btn--secondary oe-btn--sm"><i className="ph ph-funnel"></i>Status: Open</button>
            <button className="oe-btn oe-btn--secondary oe-btn--sm"><i className="ph ph-users-three"></i>Anyone</button>
            <div className="oe-spacer"></div>
            <span className="oe-body-sm" style={{ color: 'var(--ink-5)' }}>Group by</span>
            <select className="oe-input" style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              <option>Phase</option>
              <option>Status</option>
              <option>Assignee</option>
            </select>
          </div>

          {/* Task list */}
          <div className="oe-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="oe-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th style={{ width: 70 }}>ID</th>
                  <th>Task</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 80 }}>Owner</th>
                  <th style={{ width: 100 }}>Due</th>
                  <th style={{ width: 60, textAlign: 'right' }}>Est</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => t.group ? (
                  <tr key={i} className="oe-row-group"><td colSpan="7">{t.group}</td></tr>
                ) : (
                  <tr key={t.id} style={t.current ? { background: 'var(--navy-50)' } : null}>
                    <td>
                      <input type="checkbox" defaultChecked={t.status === 'complete'} />
                    </td>
                    <td><span className="oe-mono" style={{ fontSize: 11, color: 'var(--ink-5)' }}>{t.id}</span></td>
                    <td style={{ fontWeight: t.current ? 600 : 500, color: t.status === 'complete' ? 'var(--ink-5)' : 'var(--ink-7)', textDecoration: t.status === 'complete' ? 'line-through' : 'none' }}>
                      {t.title}
                    </td>
                    <td><span className={`oe-pill oe-pill--${t.status}`}>{cap(t.status)}</span></td>
                    <td>{t.assignee === '—' ? <span style={{ color: 'var(--ink-4)' }}>—</span> : <span className="oe-avatar oe-avatar--sm">{t.assignee}</span>}</td>
                    <td><span className="oe-mono" style={{ fontSize: 11, color: 'var(--ink-6)' }}>{t.due}</span></td>
                    <td style={{ textAlign: 'right' }}><span className="oe-mono" style={{ fontSize: 11, color: 'var(--ink-6)' }}>{t.est}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: 12, borderTop: '1px solid var(--ink-2)' }}>
              <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ color: 'var(--navy-500)' }}><i className="ph ph-plus"></i>Add a task</button>
            </div>
          </div>

          {/* Pinned comment / activity teaser */}
          <div style={{ marginTop: 28 }}>
            <div className="oe-meta" style={{ marginBottom: 12 }}>Recent activity</div>
            <ActivityItem who="Vladimir Berg" initials="VB" action="moved" target="T-1418 to Active" time="2h" />
            <ActivityItem who="Jessica Fraver" initials="JF" comment="Audit report is in the shared drive. Two surprising findings on the elections sub-site — flagged for review on Thursday." time="6h" />
            <ActivityItem who="Kate Carter" initials="KC" action="marked complete" target="T-1404 · Survey screen-reader users" time="yesterday" />
            <div style={{ marginTop: 10 }}>
              <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ color: 'var(--navy-500)' }}>View all activity →</button>
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <SidebarCard title="People">
            <SidebarField label="Lead">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="oe-avatar oe-avatar--sm" style={{ background: 'var(--navy-500)', color: 'var(--ink-paper)' }}>VB</span>
                <span style={{ fontSize: 13, color: 'var(--ink-7)' }}>Vladimir Berg</span>
              </div>
            </SidebarField>
            <SidebarField label="Supporting">
              <div style={{ display: 'flex', gap: -6, marginRight: 8 }}>
                <span className="oe-avatar oe-avatar--sm" style={{ marginRight: -8, border: '2px solid var(--ink-paper)' }}>JF</span>
                <span className="oe-avatar oe-avatar--sm" style={{ marginRight: -8, border: '2px solid var(--ink-paper)', background: 'var(--sage-100)', color: 'var(--sage-700)' }}>KC</span>
                <span className="oe-avatar oe-avatar--sm" style={{ marginRight: -8, border: '2px solid var(--ink-paper)', background: 'var(--steel-100)', color: 'var(--steel-700)' }}>AS</span>
                <span className="oe-avatar oe-avatar--sm" style={{ border: '2px solid var(--ink-paper)', background: 'var(--ink-1)', color: 'var(--ink-5)' }}>+2</span>
              </div>
            </SidebarField>
            <SidebarField label="Partner dept.">
              <span style={{ fontSize: 13 }}>City Manager's Office</span>
            </SidebarField>
          </SidebarCard>

          <SidebarCard title="Schedule">
            <SidebarField label="Started"><span className="oe-mono" style={{ fontSize: 12 }}>2026-01-08</span></SidebarField>
            <SidebarField label="Due"><span className="oe-mono" style={{ fontSize: 12 }}>2026-05-15</span></SidebarField>
            <SidebarField label="Time remaining">
              <span style={{ fontSize: 13, color: 'var(--status-overdue-fg)', fontWeight: 600 }}>
                <span className="oe-mono">10 days</span>
              </span>
            </SidebarField>
          </SidebarCard>

          <SidebarCard title="Effort">
            <SidebarField label="Logged"><span className="oe-mono" style={{ fontSize: 12 }}>184h</span></SidebarField>
            <SidebarField label="Estimated"><span className="oe-mono" style={{ fontSize: 12 }}>240h</span></SidebarField>
            <SidebarField label="Capacity used">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <div style={{ flex: 1, height: 4, background: 'var(--ink-1)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: '77%', height: '100%', background: 'var(--sage-500)' }}></div>
                </div>
                <span className="oe-mono" style={{ fontSize: 11 }}>77%</span>
              </div>
            </SidebarField>
          </SidebarCard>

          <SidebarCard title="Links">
            <SidebarLink icon="link" label="Project charter (Google Doc)" />
            <SidebarLink icon="git-branch" label="GitHub: tucson-hub-a11y" />
            <SidebarLink icon="file-text" label="WCAG audit (PDF)" />
            <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ color: 'var(--navy-500)', padding: '4px 0', marginTop: 4 }}><i className="ph ph-plus"></i>Add link</button>
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function ProgressStrip() {
  // 21 tasks: 5 complete, 4 active, 1 hold, 11 future
  const segments = [
    { count: 5, color: 'var(--status-complete-dot)', label: 'Complete' },
    { count: 4, color: 'var(--status-active-dot)', label: 'Active' },
    { count: 1, color: 'var(--status-hold-dot)', label: 'On hold' },
    { count: 11, color: 'var(--ink-2)', label: 'Future' },
  ];
  return (
    <div className="oe-card" style={{ padding: '14px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div>
          <div className="oe-meta" style={{ marginBottom: 4 }}>Progress</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="oe-mono" style={{ fontSize: 22, color: 'var(--ink-7)' }}>43%</span>
            <span className="oe-body-sm" style={{ color: 'var(--ink-5)' }}>9 of 21 tasks complete or in progress</span>
          </div>
        </div>
        <div style={{ flex: 1, marginLeft: 16 }}>
          <div style={{ display: 'flex', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden' }}>
            {segments.map((s, i) => (
              <div key={i} style={{ flex: s.count, background: s.color }} title={s.label}></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            {segments.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }}></span>
                <span className="oe-body-sm" style={{ color: 'var(--ink-6)', fontSize: 11 }}>{s.label} <span className="oe-mono" style={{ color: 'var(--ink-5)' }}>{s.count}</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarCard({ title, children }) {
  return (
    <div className="oe-card" style={{ padding: 18 }}>
      <div className="oe-meta" style={{ marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}
function SidebarField({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="oe-body-sm" style={{ color: 'var(--ink-5)', width: 100, fontSize: 11, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
function SidebarLink({ icon, label }) {
  return (
    <a style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', color: 'var(--ink-7)', textDecoration: 'none', fontSize: 13, cursor: 'pointer' }}>
      <i className={`ph ph-${icon}`} style={{ fontSize: 14, color: 'var(--ink-5)' }}></i>
      <span style={{ flex: 1 }}>{label}</span>
      <i className="ph ph-arrow-up-right" style={{ fontSize: 11, color: 'var(--ink-4)' }}></i>
    </a>
  );
}

function ActivityItem({ who, initials, action, target, comment, time }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--ink-2)' }}>
      <span className="oe-avatar oe-avatar--sm" style={{ flex: '0 0 auto' }}>{initials}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-7)', lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>{who}</span>
          {action && <> <span style={{ color: 'var(--ink-5)' }}>{action}</span> <span className="oe-mono" style={{ fontSize: 11 }}>{target}</span></>}
        </div>
        {comment && (
          <div style={{ marginTop: 6, padding: 10, background: 'var(--ink-1)', borderRadius: 6, fontSize: 13, color: 'var(--ink-6)', lineHeight: 1.5, borderLeft: '2px solid var(--navy-200)' }}>
            {comment}
          </div>
        )}
        <div className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)', marginTop: 4 }}>{time} ago</div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenProjectDetail });
