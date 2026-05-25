// ============================================================
// SPEC SHEET — Forms, modals, drawers
// ============================================================

function SpecFormsModals() {
  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>08 · Forms, modals, drawers</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>The shapes that <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>collect input</span>.</h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 580, marginBottom: 28 }}>
        Labels sit above their inputs. Required is denoted with a small navy dot, not an asterisk. Errors are inline and specific. Modals use the same shadow as cards, just amplified.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        {/* FIELDS */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Form fields</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <FormField label="Project name" required>
              <input className="oe-input" defaultValue="ADA Accessibility Compliance — Hub Sites" />
            </FormField>
            <FormField label="Description" hint="Markdown supported.">
              <textarea className="oe-input" rows="3" defaultValue="Bring all 47 public Hub Sites into WCAG 2.1 AA conformance ahead of the federal Title II deadline." style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Start date">
                <div className="oe-search" style={{ position: 'relative' }}>
                  <input className="oe-input" defaultValue="2026-01-08" style={{ paddingLeft: 32, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                  <i className="ph ph-calendar-blank" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-5)' }}></i>
                </div>
              </FormField>
              <FormField label="Due date" error="Due date must be after start date.">
                <div className="oe-search" style={{ position: 'relative' }}>
                  <input className="oe-input" defaultValue="2026-01-04" style={{ paddingLeft: 32, fontFamily: 'var(--font-mono)', fontSize: 12, borderColor: 'var(--status-overdue-dot)' }} />
                  <i className="ph ph-calendar-blank" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--status-overdue-fg)' }}></i>
                </div>
              </FormField>
            </div>
            <FormField label="Lead">
              <div style={{ position: 'relative' }}>
                <select className="oe-input" style={{ appearance: 'none', paddingRight: 32 }}>
                  <option>Vladimir Berg</option>
                  <option>Jessica Fraver</option>
                </select>
                <i className="ph ph-caret-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-5)', pointerEvents: 'none' }}></i>
              </div>
            </FormField>
            <FormField label="Status">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['active','future','hold','complete','canceled'].map((s, i) => (
                  <button key={s} className={`oe-pill oe-pill--${s}`} style={{ cursor: 'pointer', border: i === 0 ? '1px solid var(--status-active-dot)' : '1px solid transparent', padding: i === 0 ? '2px 7px' : '3px 8px 3px 7px' }}>
                    {cap(s)}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Tags">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, border: '1px solid var(--ink-3)', borderRadius: 5, flexWrap: 'wrap' }}>
                {['accessibility', 'public-facing', 'title-ii'].map(t => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--navy-50)', color: 'var(--navy-500)', borderRadius: 3, fontSize: 12 }}>
                    {t}
                    <i className="ph ph-x" style={{ fontSize: 11, cursor: 'pointer' }}></i>
                  </span>
                ))}
                <input style={{ flex: 1, minWidth: 80, border: 0, outline: 'none', padding: '3px 6px', fontSize: 13, background: 'transparent' }} placeholder="Add a tag..." />
              </div>
            </FormField>
          </div>
        </div>

        {/* MODAL */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Modal · confirm action</div>
          {/* Modal mock */}
          <div style={{ position: 'relative', background: 'rgba(30, 28, 20, 0.35)', borderRadius: 8, padding: 28, height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 380, background: 'var(--ink-paper)', borderRadius: 'var(--r-4)', boxShadow: 'var(--shadow-3)', padding: 24 }}>
              <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--status-overdue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-overdue-fg)', marginBottom: 14 }}>
                <i className="ph ph-warning" style={{ fontSize: 18 }}></i>
              </div>
              <div className="oe-h2" style={{ marginBottom: 8 }}>Cancel this project?</div>
              <p className="oe-body" style={{ color: 'var(--ink-5)', marginBottom: 20, fontSize: 13 }}>
                <span style={{ color: 'var(--ink-7)', fontWeight: 600 }}>P-187</span> has 4 active tasks and 184 logged hours. Canceling will keep the record but stop allocation reporting. This can be undone within 30 days.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="oe-btn oe-btn--secondary oe-btn--sm">Keep project</button>
                <button className="oe-btn oe-btn--sm" style={{ background: 'var(--status-overdue-dot)', color: 'var(--ink-paper)' }}>Cancel project</button>
              </div>
            </div>
          </div>

          {/* Drawer hint */}
          <div className="oe-meta" style={{ margin: '24px 0 14px' }}>Drawer · right-side · 480px</div>
          <div style={{ position: 'relative', background: 'var(--ink-1)', borderRadius: 8, height: 160, overflow: 'hidden', border: '1px solid var(--ink-2)' }}>
            <div style={{ position: 'absolute', inset: '0 0 0 35%', background: 'var(--ink-paper)', borderLeft: '1px solid var(--ink-2)', padding: 14, boxShadow: '-4px 0 16px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <div className="oe-meta">Task details</div>
                <div className="oe-spacer"></div>
                <i className="ph ph-x" style={{ color: 'var(--ink-5)' }}></i>
              </div>
              <div className="oe-h4" style={{ fontSize: 13, marginBottom: 6 }}>Update Hub Site template — color contrast tokens</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span className="oe-pill oe-pill--active" style={{ fontSize: 10 }}>Active</span>
                <span className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)', padding: '3px 0' }}>Due 2026-05-30</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, required, hint, error, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-7)', letterSpacing: '-0.005em' }}>{label}</label>
        {required && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--navy-500)' }}></span>}
        {hint && <span style={{ fontSize: 11, color: 'var(--ink-5)', fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>{hint}</span>}
      </div>
      {children}
      {error && <div style={{ fontSize: 11, color: 'var(--status-overdue-fg)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><i className="ph ph-warning-circle" style={{ fontSize: 12 }}></i>{error}</div>}
    </div>
  );
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ============================================================
// SPEC SHEET — Menus, dropdowns, popovers
// ============================================================

function SpecMenus() {
  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>09 · Menus &amp; popovers</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>Where the <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>options</span> live.</h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 580, marginBottom: 28 }}>
        Dropdowns reuse the card surface; menu items get hover + selected states. Destructive actions are separated and tinted, never visually weighted equal to the rest.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, alignItems: 'flex-start' }}>
        {/* Kebab menu */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Row action menu</div>
          <div style={{ background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 6, boxShadow: 'var(--shadow-2)', padding: 4, width: 220 }}>
            <MenuItem icon="pencil-simple" label="Edit" />
            <MenuItem icon="copy" label="Duplicate" shortcut="⌘D" />
            <MenuItem icon="arrow-right" label="Move to project…" />
            <MenuItem icon="archive" label="Archive" />
            <div style={{ height: 1, background: 'var(--ink-2)', margin: '4px 6px' }}></div>
            <MenuItem icon="trash" label="Delete" danger />
          </div>
        </div>

        {/* Status changer */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Status changer popover</div>
          <div style={{ background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 6, boxShadow: 'var(--shadow-2)', padding: 8, width: 220 }}>
            <div className="oe-meta" style={{ padding: '4px 8px 8px', borderBottom: '1px solid var(--ink-2)', marginBottom: 6 }}>Change status</div>
            {['active','future','hold','complete','canceled'].map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', background: i === 0 ? 'var(--ink-1)' : 'transparent' }}>
                <span className={`oe-pill oe-pill--${s}`}>{cap(s)}</span>
                {i === 0 && <i className="ph ph-check" style={{ marginLeft: 'auto', color: 'var(--navy-500)' }}></i>}
              </div>
            ))}
          </div>
        </div>

        {/* User combobox */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Combobox · assign person</div>
          <div style={{ background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 6, boxShadow: 'var(--shadow-2)', width: 260 }}>
            <div style={{ padding: 8, borderBottom: '1px solid var(--ink-2)' }}>
              <div className="oe-search">
                <span className="oe-search-icon"><i className="ph ph-magnifying-glass"></i></span>
                <input className="oe-input" defaultValue="ja" style={{ padding: '6px 8px 6px 30px', fontSize: 12 }} />
              </div>
            </div>
            <div style={{ padding: 4, maxHeight: 200 }}>
              {[
                { i: 'JA', n: 'Joseph Ahumada', t: 'Data Intelligence', hl: 'Ja' },
                { i: 'JF', n: 'Jessica Fraver', t: 'Spatial Data', hl: null },
                { i: 'JM', n: 'James McGinnis', t: 'Business Analytics', hl: null },
                { i: 'JN', n: 'JeanPaul N.', t: 'Data Intelligence', hl: 'J' },
              ].map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', background: i === 0 ? 'var(--navy-50)' : 'transparent' }}>
                  <span className="oe-avatar oe-avatar--sm">{p.i}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink-7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.hl ? <><span style={{ background: 'var(--status-hold-bg)', borderRadius: 2 }}>{p.hl}</span>{p.n.slice(p.hl.length)}</> : p.n}
                    </div>
                    <div className="oe-body-sm" style={{ fontSize: 11, color: 'var(--ink-5)' }}>{p.t}</div>
                  </div>
                  {i === 0 && <i className="ph ph-check" style={{ color: 'var(--navy-500)' }}></i>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon, label, shortcut, danger }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', color: danger ? 'var(--status-overdue-fg)' : 'var(--ink-7)' }}>
      <i className={`ph ph-${icon}`} style={{ fontSize: 14, color: danger ? 'var(--status-overdue-fg)' : 'var(--ink-5)' }}></i>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      {shortcut && <span className="oe-mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>{shortcut}</span>}
    </div>
  );
}

// ============================================================
// SPEC SHEET — Empty states, toasts, loading, tooltips
// ============================================================

function SpecStates() {
  return (
    <div className="oe" style={{ padding: 40, background: 'var(--ink-0)', height: '100%' }}>
      <div className="oe-meta" style={{ marginBottom: 8 }}>10 · States &amp; feedback</div>
      <h2 className="oe-display-3" style={{ margin: '0 0 8px' }}>The <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>quieter</span> moments.</h2>
      <p className="oe-body" style={{ color: 'var(--ink-5)', maxWidth: 580, marginBottom: 28 }}>
        Empty states should feel intentional, not apologetic. Toasts are brief and dismissible. Skeletons mimic the shape of content, not vague gray blocks.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        {/* Empty state */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Empty state · with affordance</div>
          <div className="oe-card" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--ink-1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-5)', marginBottom: 16 }}>
              <i className="ph ph-folder-open" style={{ fontSize: 22 }}></i>
            </div>
            <div className="oe-display-3" style={{ fontSize: 22, marginBottom: 8 }}>
              No tasks <span className="oe-italic-serif" style={{ fontStyle: 'italic' }}>yet</span>.
            </div>
            <p className="oe-body-sm" style={{ color: 'var(--ink-5)', maxWidth: 280, margin: '0 auto 18px' }}>
              When you add tasks they'll appear here, grouped by phase.
            </p>
            <button className="oe-btn oe-btn--primary oe-btn--sm"><i className="ph ph-plus"></i>Add the first task</button>
          </div>
        </div>

        {/* Toasts */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Toasts · stacked, dismissible</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Toast tone="sage" icon="check-circle" title="Project saved" body="Last edit captured 2s ago." />
            <Toast tone="navy" icon="info" title="5 tasks moved" body="To phase: Implementation." undo />
            <Toast tone="sunset" icon="warning-circle" title="Could not connect to TimeXtender" body="Working from cached data." />
          </div>
        </div>

        {/* Tooltip */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Tooltip · 11px, dark</div>
          <div style={{ position: 'relative', padding: '40px 14px 14px', background: 'var(--ink-paper)', border: '1px solid var(--ink-2)', borderRadius: 6, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              <i className="ph ph-info" style={{ fontSize: 16, color: 'var(--ink-5)' }}></i>
              <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', background: 'var(--ink-7)', color: 'var(--ink-paper)', fontSize: 11, padding: '5px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                Overdue tasks not yet rescheduled
                <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid var(--ink-7)' }}></span>
              </div>
            </div>
          </div>
        </div>

        {/* Skeleton */}
        <div>
          <div className="oe-meta" style={{ marginBottom: 14 }}>Loading · skeleton matches content shape</div>
          <div className="oe-card" style={{ padding: 16 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 3 ? '1px solid var(--ink-2)' : 'none' }}>
                <div style={{ width: 16, height: 16, borderRadius: 3, background: 'var(--ink-1)' }}></div>
                <div style={{ width: 44, height: 10, borderRadius: 2, background: 'var(--ink-1)' }}></div>
                <div style={{ flex: 1, height: 10, borderRadius: 2, background: 'var(--ink-1)', maxWidth: 240 - i * 20 }}></div>
                <div style={{ width: 60, height: 16, borderRadius: 10, background: 'var(--ink-1)' }}></div>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ink-1)' }}></div>
              </div>
            ))}
          </div>
          <style>{`
            @keyframes oe-shimmer {
              0% { background-position: -200px 0; }
              100% { background-position: 200px 0; }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}

function Toast({ tone, icon, title, body, undo }) {
  const tones = {
    sage:   { border: 'var(--sage-500)', bg: 'var(--ink-paper)', iconColor: 'var(--sage-700)' },
    navy:   { border: 'var(--navy-500)', bg: 'var(--ink-paper)', iconColor: 'var(--navy-500)' },
    sunset: { border: 'var(--tucson-sunset)', bg: 'var(--ink-paper)', iconColor: 'var(--status-overdue-fg)' },
  };
  const t = tones[tone] || tones.navy;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: t.bg, borderRadius: 6, boxShadow: 'var(--shadow-2)', borderLeft: `3px solid ${t.border}` }}>
      <i className={`ph ph-${icon}`} style={{ fontSize: 18, color: t.iconColor, flex: '0 0 auto' }}></i>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="oe-h4" style={{ fontSize: 13 }}>{title}</div>
        <div className="oe-body-sm" style={{ color: 'var(--ink-5)', marginTop: 2 }}>{body}</div>
      </div>
      {undo && <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ padding: '2px 8px', color: 'var(--navy-500)' }}>Undo</button>}
      <i className="ph ph-x" style={{ fontSize: 14, color: 'var(--ink-5)', cursor: 'pointer', flex: '0 0 auto' }}></i>
    </div>
  );
}

Object.assign(window, { SpecFormsModals, SpecMenus, SpecStates });
