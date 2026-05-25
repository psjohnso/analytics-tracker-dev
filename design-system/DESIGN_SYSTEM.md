# DESIGN_SYSTEM.md — Design Handoff for the Project Tracker

> **Purpose:** let a designer (or an AI assistant) change how this app *looks* without breaking how it *works*.
> **Scope:** editing this app's live styles/markup (`src/app.css`, `index.html`, `src/**`). For brand boundaries (palette, fonts, logo, contrast) see **`COT_DESIGN.md`**. For deep architecture see **`PROJECT_REFERENCE.md`**.
> **Stack:** vanilla HTML/CSS/JS — no framework, no build step. Classic scripts share one global scope; most UI is built as HTML strings inside JS and injected into the page.
> **Paths** in this doc are relative to the **repo root** (this file lives in `design-system/`; `COT_DESIGN.md` and `PROJECT_REFERENCE.md` are at the root, `../`).

---

## 0. The two rules that prevent 95% of breakage

1. **Style through tokens — never hardcode a hex color in new CSS.** Every theme (including dark mode and the colorblind palette) works by *overriding CSS variables*. A hardcoded `#hex` won't flip and will look wrong/illegible in dark mode. Use `var(--token)`.
2. **Changing CSS *properties* is safe. Renaming/removing *classes, IDs, `data-` attributes*, or restructuring DOM is risky** — JavaScript hooks onto those. Before you rename one, **grep the repo for it** (`src/**` + `index.html`). If nothing references it, it's cosmetic and free to change.

Everything below is detail on those two rules.

---

## 1. Where things live

| File | What |
|---|---|
| `src/app.css` | **All styles** (~2,900 lines). Design tokens are the `:root{…}` block at the very top. |
| `index.html` | Page shell + all the static body/modal HTML + an inline boot script. Global UI helpers live here too: `showToast`, `showUndoToast`, `btnPending`, `confirmDialog`. |
| `src/render.js` | The router: `currentTab`, `switchTab`, sidebar filters, and the shared toolbar/count plumbing. |
| `src/tabs/*.js`, `src/modals/*.js` | Per-screen markup builders (HTML strings). This is where most visible UI is generated. |
| `src/icons.js` | Vendored Phosphor SVG sprite + the `icon()` helper. |
| `COT_DESIGN.md` | City of Tucson brand guide — the official City boundaries (see its redesign note). |
| `src/theme-oe.css` | **OE Redesign** token layer (themes `oe` / `oe-dark`) — loaded after `app.css`. Alias-bridges Laura's tokens onto ours; see §3. |
| `design_handoff/` | Laura Sharp's full OE Redesign handoff (source for the above). |

---

## 2. Design tokens — the safe knobs (`src/app.css` `:root`)

Change these to re-theme globally. Grouped by role:

**Brand colors**
| Token | Value | Role |
|---|---|---|
| `--navy` | `#002669` | Primary anchor (Innovation Blue). Also re-colored per theme. |
| `--orange` | `#C24200` | Action/energy (Sunset Orange). |
| `--yellow` | `#FFDB22` | Highlight only — **use sparingly** (active tab, one CTA). |
| `--green` | `#83AC16` | Positive / Saguaro Green. |
| `--sky` | `#0088FF` | Links / interactive. |
| `--cactus`, `--sand`, `--night` | … | Secondary accents. |

**Surfaces & text**
| Token | Value | Role |
|---|---|---|
| `--surface` | `#F7F5EF` | Page background. |
| `--surface-2` / `--bg-surface` | `#F3F1EB` | Recessed insets (table headers, hovers, panels). |
| `--white` | `#FFFFFF` | Card/control background (becomes dark grey in dark mode). |
| `--border` / `--gray-light` | `#E1E2DD` | Borders, dividers. |
| `--text-body` / `--text-dark` | `#002855` | Body/heading text. |
| `--text-muted` | `#6B7280` | Secondary text. |

**Layout & shape**
| Token | Value | Role |
|---|---|---|
| `--header-h` | `64px` | Top header height (used by sticky offsets — see §5). |
| `--sidebar-w` | `280px` | Filter sidebar width. |
| `--radius` / `--radius-btn` | `16px` / `6px` | Corner rounding. |
| `--card-padding` | `28px` | Card inner spacing. |

**Pill pairs** — pastel chip backgrounds with matching text, e.g. `--pill-blue-bg` / `--pill-blue-fg` (also `orange`, `green`, `purple`, `amber`, `cyan`). Use a *pair* so chips stay legible in every theme.

---

## 3. The theming contract (light · 4 alt themes · dark · colorblind)

The app ships **five palettes** plus a colorblind mode, all driven by tokens:

- **Alt themes:** `body[data-theme="sonoran" | "twilight" | "pueblo" | "saguaro"]` — each overrides `--navy` / `--orange` / `--surface` (text tokens stay constant for contrast).
- **Dark mode:** `body[data-theme="dark"]` — overrides the *structural* tokens (`--surface`, `--white`, `--border`, text, pills) so anything tokenized flips automatically.
- **Colorblind:** `body.cb-safe` — swaps status/priority colors to a CB-safe set.
- **OE Redesign** *(in progress)*: `body[data-theme="oe" | "oe-dark"]` — a **second token layer** in `src/theme-oe.css` (loaded after `app.css`). It transcribes Laura Sharp's tokens (`design_handoff/`) and **alias-bridges** them onto the token names above (`--navy → var(--navy-500)`, `--surface → var(--ink-0)`, etc.), so the same screens recolor with no edits. Deviates from `COT_DESIGN.md` (different fonts + subdued palette) — pending brand sign-off. See `README.md` for status/phases.
- Applied at runtime by `setTheme(id)` → `applyTheme()` (Settings → Appearance). New theme ids must also be added to the `allowed` list in `applyTheme()` (index.html) or they're ignored.

**What this means for you**
- ✅ New color → `var(--token)`. It themes for free.
- ❌ New color → `#3a7bd5`. It won't flip; in dark mode it'll be wrong or unreadable. (The app has a known backlog of exactly these hardcoded-hex spots — don't add more.)
- For status/priority chips, reuse the existing `.status-*` / `.priority-*` classes (they already have dark + cb-safe variants) instead of inventing new colored chips.
- **Icons:** use the Phosphor sprite via `class="icon"` (it inherits `currentColor`, so it themes automatically). Per brand + this codebase, **never use emoji as functional icons**.
- **Motion:** `prefers-reduced-motion` is globally honored — don't add animations that ignore it.

Quick test: make your change, then in Settings flip to **dark** and one **alt theme** and confirm it still reads. (Or set `document.body.dataset.theme='dark'` in the console.)

---

## 4. Component inventory (restyle these freely — keep the class names)

| Component | Classes / hooks |
|---|---|
| **Buttons** | `.btn` + variant: `.btn-primary`, `.btn-secondary`, `.btn-quiet`, `.btn-cta`, `.btn-accent.acc-{green,orange,yellow}`; size `.btn-sm`; states via `:hover` / `:focus-visible` / `[disabled]`. |
| **Pending button** | `.is-pending` + `.btn-spinner` (driven by `btnPending()`). |
| **Status / priority chips** | `.status-{Active,Complete,Future,Pending,On.Hold,Waiting,Scheduled,…}`, `.priority-{High,Medium,Low}` — *names are load-bearing* (cb-safe & dark variants key off them). |
| **Forms** | `.fm-field`, `.fm-label`, `.fm-input`, `.fm-select`, `.fm-textarea`, `.fm-field-err`, `.req`; error state `.err`. |
| **Confirm dialog** | `.confirm-backdrop`, `.confirm-dialog` (+ `.danger`), `.confirm-btn-{cancel,primary,danger}` (driven by `confirmDialog()`). |
| **Toasts** | `#app-toast` (status), `#app-undo-toast` + `.undo-toast-btn` (undo). |
| **Top chrome** | `.app-header`, `.tab-bar.primary-bar` (`.primary-tab`), `.sub-bar` (`.sub-tab`), `.toolbar`, `.mywork-sticky-header`, `.sidebar` (`.collapsed`). |
| **Bulk action bar** | `#bulk-bar`. |
| **Icons** | `.icon`, `.icon-lg` (Phosphor sprite). |

You can change padding, color, radius, shadows, typography on any of these. Keep the **class names** and the element's `id`/`onclick`/`data-` attributes.

---

## 5. The "don't break it" contract — load-bearing hooks

These are read by JavaScript. **Rename or remove one and its feature stops working silently.**

**IDs the JS reads (`getElementById`)** — examples, not exhaustive:
- `#content-area` — the **main render target**; every tab draws its body here.
- `#result-count` — the shared "N projects/tasks" count; written from ~15 places.
- `#app-toast`, `#app-undo-toast`, `#bulk-bar`, `#sub-bar`, `#form-modal-backdrop`, `#search-input`, `#sort-select`, and every `#fm-*` form field id (`#fm-title-val`, `#fm-status`, …).

**Classes used as JS selectors / state flags** (toggled by JS, not just styled):
- `.primary-tab`, `.sub-tab` — tab routing (`switchTab` / `switchPrimaryGroup`).
- `.sidebar` + `.collapsed` — sidebar show/hide (persisted in `UserPrefs`).
- `.active`, `.on` — selected states applied by JS.
- `.err`, `.is-pending` — validation / pending states.
- `.icon` — sprite styling (must stay for icons to size/theme).

**`data-` attributes** — e.g. `data-group` (maps a sub-tab to its primary group), the `body[data-theme]` / `body.cb-safe` theming flags, `data-search-group`. Don't drop these.

**Inline `onclick="fn()"`** — most buttons are real `<button>`s whose `onclick` calls a global function (`switchTab(...)`, `openFormModal(...)`, `handleFormSubmit()`, …). Restyle the button all you like; **keep the `onclick`** (and don't rename the JS function without updating every call site).

### Safe vs. risky at a glance
| Action | Verdict |
|---|---|
| Change color / spacing / radius / font / shadow in `app.css` | ✅ Safe |
| Add a new token or a new cosmetic class | ✅ Safe |
| Rename/remove a class, `id`, or `data-` attribute | ⚠️ Grep first |
| Rename a JS function used in `onclick=` | ⚠️ Grep first |
| Restructure the DOM of a JS-rendered area | ⚠️ Read the render function first |
| Hardcode a hex color; use emoji as an icon; remove a focus ring | ❌ Don't |

**How to check before renaming anything:** search the whole repo for the exact token —
e.g. `grep -rn "result-count" src/ index.html`. No matches outside CSS → cosmetic, safe to change. Matches in `.js`/`.html` → it's wired up; update those too or leave it.

---

## 6. Safe editing workflow

1. Edit `src/app.css` (or the relevant markup builder in `src/**`).
2. **Preview locally:** `python -m http.server 8000` in the repo root → open `http://localhost:8000` (this app needs OAuth, registered for `localhost:8000`; `file://` won't work).
3. **Verify across themes:** Settings → Appearance, flip to **dark** + one **alt theme** + toggle **colorblind**. Confirm contrast and legibility.
4. (Optional) Run the smoke-test harness: append `?test=1` to the URL.
5. **Ship:** bump `APP_VERSION` in `src/constants.js` (rules in `CLAUDE.md`), run `node scripts/stamp-version.js` (rewrites cache-bust `?v=` tokens), commit, push. *(The standalone `dataprogram.html` is not auto-stamped — bump its `?v=` by hand if you touched `constants.js`/`dataprogram-lite.js`.)*

---

## 7. Hard "don'ts" (brand + accessibility)

- No hardcoded hex in new styles — use tokens (so dark/alt/CB modes keep working).
- No emoji as functional icons — use the `.icon` Phosphor sprite.
- Don't remove `:focus-visible` focus rings.
- Don't go below **13px** body text or **4.5:1** contrast (1.5× / 3:1 for large text).
- **Sun Yellow** is a highlight, never a text color on white and never a background fill.
- Innovation Blue (`--navy`) is the anchor — keep it dominant.
- Don't add motion that ignores `prefers-reduced-motion`.
