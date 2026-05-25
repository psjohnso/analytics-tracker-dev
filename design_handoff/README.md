# Office of Equity — Project &amp; Task Tracker Redesign

A complete design system + 5 hero screens for migrating the City of Tucson Project &amp; Task Tracker to a new visual language. Built around three principles:

> **01 · Type before color.** Hierarchy comes from scale and weight first. Color is reserved for status and a single primary action.
> **02 · Status is the only color rule.** Pills, dots, and left-border accents map to real states. Everything else stays neutral.
> **03 · Density without noise.** A power-user tool, calmed. More data per fold, less ornament.

When making implementation choices, lean on these. If you find yourself adding a new color without a semantic reason, stop.

---

## ⚠️ Read this first

The files in `source_files/` are **design references**, not production code.

They are HTML/JSX prototypes built to demonstrate the intended look, color, typography, spacing, and component patterns. **Do not copy them verbatim.** Your task is to recreate them inside the existing codebase using its framework, component library, state management, and routing patterns.

**The one exception:** `source_files/styles/tokens.css` — those token values (hex codes, spacing scale, type ramp) ARE meant to be transcribed exactly into the app's theming layer.

To preview the design locally: open `source_files/Design System.html` in a browser. No build step needed.

---

## Fidelity

**High.** All colors, type, spacing, and component states are final — match them exactly. Layout grids and densities are also final. Intentional placeholders:

- The "T" monogram in the top bar (replace with the official City of Tucson seal SVG)
- Mock data inside tables (replace with real API data)
- Mobile breakpoint covers Dashboard only — other screens use the same patterns at narrow widths

---

## Tech stack — please confirm before starting

I need to know the app's current stack before picking the right form for these tokens. Likely options:

| Stack | Tokens land as |
|---|---|
| **React + Tailwind** | `tailwind.config.js` theme extension + a `globals.css` for CSS custom properties |
| **React + CSS-in-JS** (styled-components / Emotion) | A `theme.ts` exported object passed to ThemeProvider |
| **React + plain CSS / CSS Modules** | The `tokens.css` file as-is, imported once at app root |
| **Vue / Svelte / Other** | Translate the CSS variables literally |

If unsure, ask the user. The CSS-variable form (`source_files/styles/tokens.css`) is the **canonical source** — every other form is derived from it.

---

## What's in `source_files/`

```
source_files/
├── Design System.html         ← entry point — load this to see everything
├── design-canvas.jsx          ← canvas shell for presentation. DO NOT port.
├── styles/
│   ├── tokens.css             ← CANONICAL TOKEN SOURCE (light + dark)
│   └── base.css               ← all .oe-* component styles
└── components/
    ├── topbar.jsx                       — shared app header
    ├── screen-dashboard.jsx             — "My Work" home
    ├── screen-portfolio.jsx             — project list + filters
    ├── screen-capacity.jsx              — team load + chart
    ├── screen-project-detail.jsx        — densest screen
    ├── spec-cover-color.jsx             — reference cards
    ├── spec-type-spacing-icons.jsx
    ├── spec-components.jsx
    ├── spec-forms-menus-states.jsx
    └── spec-dark-motion-mobile.jsx
```

---

## Design Tokens

All values below are also in `source_files/styles/tokens.css` as CSS custom properties — **that file is the source of truth.** Re-read it if any value below differs.

### Color — Primary structure

Subdued by design. Used for app chrome, headings, primary action.

| Token | Hex | Use |
|---|---|---|
| `--navy-50` | `#eaeef5` | Active-tab background tint |
| `--navy-100` | `#d2dbeb` | Avatar background |
| `--navy-200` | `#9fb1cf` | On-navy secondary text |
| `--navy-300` | `#5d78a3` | Subtitle accent, meta on navy |
| `--navy-500` | `#1f3b6b` | **Primary action, headings, active tab underline** |
| `--navy-700` | `#0e2240` | Dark hero cards, header bg variant |
| `--navy-900` | `#060f1e` | Deepest navy — used as dark-mode page bg |
| `--steel-500` | `#3d5878` | Secondary blue (rare) |
| `--sage-500` | `#4a6b48` | Confirmation, "good" metrics |

### Color — Tucson brand accents (subdued)

Roughly 55% saturation of the official Tucson palette. Used **only** for status and data-viz.

| Token | Subdued | Official | Use |
|---|---|---|---|
| `--tucson-innovation` | `#1f3b6b` | `#002669` | Data-viz · same as navy-500 |
| `--tucson-sky` | `#4a7fae` | `#0088FF` | Status: Future. Data-viz. |
| `--tucson-saguaro` | `#8aa050` | `#83AC16` | Status: Active. Data-viz. |
| `--tucson-sunset` | `#b85630` | `#C24200` | Status: Overdue. Priority: High. Data-viz. |
| `--tucson-sun` | `#c89500` | `#FFDB22` | Status: On hold. Priority: Medium. Data-viz. |
| `--tucson-cactus` | `#8a4c70` | `#9E0059` | **Status: Complete.** Data-viz. |
| `--tucson-night` | `#3d2e55` | `#140233` | Data-viz only |
| `--tucson-sand` | `#d4bc7a` | `#E5D086` | Data-viz only |
| `--tucson-monsoon` | `#b8b9b3` | `#E1E2DD` | Status: Canceled. Data-viz: "Other". |

**Critical rule:** never use saturated brand fills for buttons, links, headers, dividers, or backgrounds. Brand color belongs to the semantic layer.

### Color — Status pills

Each status pill = **tinted bg + dark fg + saturated brand-color dot.** The dot is where the saturation lives — never the background. Pills must be visually distinct from each other; do NOT consolidate hues.

| Status | bg | fg | dot |
|---|---|---|---|
| Active | `#eaefd9` | `#4d6310` | `#8aa050` (saguaro) |
| Future | `#dfe8f0` | `#2a4d70` | `#4a7fae` (sky) |
| Complete | `#ebe2eb` | `#4d2a4d` | `#8a4c70` (cactus plum) |
| On hold | `#f5ecc7` | `#6e5200` | `#c89500` (sun) |
| Canceled | `#e8e8e4` | `#5a5d52` | `#b8b9b3` (monsoon) |
| Overdue | `#f3dccc` | `#6e2a0a` | `#b85630` (sunset) |

### Color — Priority chips

Smaller than pills, no dot, uppercase letter-spaced text, sharp corners (3px). Always one of: `--high`, `--med`, `--low`.

| Priority | bg | fg |
|---|---|---|
| High | `#f3dccc` | `#6e2a0a` |
| Medium | `#f5ecc7` | `#6e5200` |
| Low | `#eaefd9` | `#4d6310` |

### Color — Neutrals (warm "ink" scale)

Slightly warm — pulls toward the Sonoran context, avoids cold Bootstrap-gray feel.

| Token | Hex | Use |
|---|---|---|
| `--ink-0` | `#faf8f3` | Page background |
| `--ink-1` | `#f3efe6` | Surface raised, hover |
| `--ink-2` | `#e8e2d3` | Divider strong |
| `--ink-3` | `#d9d1bf` | Input border, divider muted |
| `--ink-4` | `#a89e88` | Placeholder, disabled |
| `--ink-5` | `#6b6354` | Secondary text |
| `--ink-6` | `#3a3528` | Body text |
| `--ink-7` | `#1e1c14` | Primary text |
| `--ink-paper` | `#ffffff` | Card background |

### Color — Data viz (8 categorical + Other)

```
1. Innovation  #1f3b6b
2. Saguaro     #8aa050
3. Sunset      #b85630
4. Cactus      #8a4c70
5. Sky         #4a7fae
6. Night Sky   #3d2e55
7. Sand        #d4bc7a
8. Sun         #c89500
9. Other       #b8b9b3   ← always for the "rest" bucket
```

**Anything past rank 8 must collapse into "Other."** No exceptions — that was the cardinal sin of the old chart (14+ rainbow hues).

### Dark mode

Dark mode is a complete token override scoped to `[data-theme="dark"]`. It is **not** a simple invert — it's a deep-navy stack so the theme reads as "City after sunset" rather than warm-brown. Status pills retain their hue identity but their backgrounds become navy-tinted instead of warm-tinted.

Surfaces: `--ink-0: #060f1e` (navy-900) → progressively lighter navy tints for elevated cards. Primary navy lifts to `#7d9bcc` so it reads as a "lit" primary on the dark surface.

See `tokens.css` for the full override block.

---

## Typography

Three families, hosted via Google Fonts (or self-host equivalents):

```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

| Family | Role |
|---|---|
| **Instrument Serif** | Editorial display only — page titles ("Good morning, *Laura*"), empty-state poetry, italic accents. Used at large sizes (32px+). **Never** in tables, lists, or UI controls. |
| **Hanken Grotesk** | UI workhorse — every button, label, heading, body, nav item. Weights 400/500/600/700. |
| **JetBrains Mono** | Numerical data — project IDs (P-187), dates (2026-05-15), hour counts (363h), version numbers, KPI values. Always `tabular-nums`. |

### Type ramp

| Token | Size / line-height | Family | Weight | Notes |
|---|---|---|---|---|
| `display-1` | 64 / 1.05 | Serif | 400 | -0.01em tracking |
| `display-2` | 44 / 1.05 | Serif | 400 | -0.01em tracking |
| `display-3` | 32 / 1.05 | Serif | 400 | -0.01em tracking |
| `h1` | 28 / 1.2 | Sans | 600 | |
| `h2` | 22 / 1.2 | Sans | 600 | |
| `h3` | 17 / 1.2 | Sans | 600 | |
| `h4` | 14 / 1.2 | Sans | 600 | |
| `body` | 14 / 1.55 | Sans | 400 | |
| `body-sm` | 13 / 1.55 | Sans | 400 | color `--ink-5` |
| `ui` | 13 / 1.3 | Sans | 500 | |
| `meta` | 11 / 1.3 | Sans | 600 | uppercase, 0.08em tracking |
| `mono` | 12 | Mono | 400 | tabular-nums |

### Editorial italic accent pattern

When using `display-*` for greetings/titles, one key word is wrapped in italic Instrument Serif and colored `--navy-500`. Example: `Good morning, _Laura_.` — see `screen-dashboard.jsx`.

---

## Spacing, radii, elevation, motion

| Spacing | Radii | Elevation |
|---|---|---|
| `--s-1` 4 | `--r-1` 3 (chips) | `--shadow-1` subtle |
| `--s-2` 8 | `--r-2` 5 (buttons, inputs) | `--shadow-2` cards/popovers |
| `--s-3` 12 | `--r-3` 8 (cards) | `--shadow-3` modals |
| `--s-4` 16 | `--r-4` 12 (modals, panels) | |
| `--s-5` 24 | `--r-pill` 999 (pills, avatars) | |
| `--s-6` 32 | | |
| `--s-7` 48 | | |
| `--s-8` 64 | | |

A single 4-based scale, applied everywhere — no off-scale values.

Shadows are warm-toned (`rgba(30, 28, 20, …)`), not cool-gray. Most cards are flat-bordered (`1px solid --ink-2`), no shadow. Shadow is reserved for modals/popovers.

**Motion:** one easing curve (`--ease-out: cubic-bezier(0.2, 0.7, 0.3, 1)`). Three durations: `--dur-fast 120ms` (hovers), `--dur-base 200ms` (popovers, status changes), `--dur-slow 320ms` (drawers, modals, page transitions). No bouncing or overshoot — government tool, not marketing site. Respect `prefers-reduced-motion`.

---

## Iconography

**Phosphor Icons — Regular weight only.**

```html
<script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>
```

Or install: `npm install @phosphor-icons/react` for React usage.

Icons inherit `currentColor` and sit inside text hierarchy — they don't have their own color. Default sizes: 14, 16, 20, 24, 32 px. In buttons: 16px. In nav/tab: 14–16px.

Common mappings (see screens for full coverage):

| Phosphor icon | Used for |
|---|---|
| `house` / `briefcase` / `folder-open` / `chart-bar` / `chart-line-up` | Top-nav tabs |
| `users-three` / `calendar-blank` / `clock-counter-clockwise` | Team / time |
| `magnifying-glass` / `funnel` / `plus` / `arrow-clockwise` | Toolbar actions |
| `pencil-simple` / `dots-three` / `dots-three-vertical` | Edit / overflow |
| `caret-down` / `caret-right` / `arrow-up-right` | Disclosure / external |
| `check` / `check-circle` / `warning-circle` / `x-circle` | Status reinforcement |

---

## Components

Reproduce these as **actual components** in your framework rather than as one-off styles. Source: `source_files/styles/base.css` for the visual treatment, the JSX files for layout and interaction patterns.

### Buttons

- `--primary` — bg `--navy-500`, white text. **One per view.** Hover: `--navy-700`.
- `--secondary` — paper bg, ink-3 border. Hover: ink-1 bg, ink-4 border.
- `--ghost` — transparent. Hover: ink-1 bg.
- `--sm` modifier: smaller padding, 12px font.
- `--icon` modifier: square padding, no text.

### Pills (status)

Inline-flex, 999px radius, 3/8px padding. Includes a `::before` 6px dot at `currentColor`. Use the color table above for each variant's bg/fg/dot.

### Chips (priority)

Inline-flex, 3px radius, 2/7px padding, uppercase 10px text with 0.06em tracking. **No dot.** Three variants: `--high`, `--med`, `--low`.

### Inputs

```
border 1px ink-3, radius 5px, padding 8/12px, font 13px
focus: border-color navy-500, box-shadow 0 0 0 3px rgba(31,59,107,0.12)
placeholder: ink-4
checkbox accent-color: navy-500
```

Search variant: 34px left padding, magnifying-glass icon absolute at 10px from left.

### Form fields

Label above input. Required = small navy dot (NOT asterisk). Hints in italic Instrument Serif, ink-5. Errors below the input, ink-color from `--status-overdue-fg`, with `warning-circle` icon. Date inputs use mono font.

### Tabs

24px gap, 1px ink-2 bottom border. Active tab: text `--navy-500`, 2px navy underline. Inactive: ink-5. Count badge: mono 11px, 1/6px padding, ink-1 bg; active version uses navy-50 bg + navy-500 text.

### Cards

```
background: --ink-paper
border: 1px solid --ink-2
border-radius: 8px
no shadow by default
```

Variants:
- **Left-accent** (overdue/status emphasis): 3px solid colored border-left, asymmetric border-radius `4px 8px 8px 4px`
- **Dark hero** (e.g. "This week" on Dashboard): bg `--navy-700`, white text, no border

### Avatars

Circular. Default: navy-100 bg + navy-700 text. Sizes: `--sm` 22px, default 28px, `--lg` 36px. Alternate tints from sage / steel / data-viz palette to differentiate team members.

### Tables

```
thead th: meta type (11/600/0.08em uppercase), ink-5 text, ink-1 bg, sticky top
tbody td: 12/12px padding, ink-2 bottom border, body-sm size
tr:hover td: bg ink-1
tr.row-group td: spans all columns, meta type, ink-1 bg — for section groupings like "Active · 1"
```

IDs and dates use mono. Project name column: weight 500.

### Filter sidebar

260px sticky. Collapsed sections: meta-cap title + count badge (navy-500 fill, white text, mono). Expanded sections: clickable rows with 7px colored dot, name, count. Active filter chips at top: navy-50 bg + navy-700 text + X icon.

### Menus &amp; popovers

Reuse card surface + `--shadow-2`. Menu items: 6/8px padding, 4px radius, icon + label + optional shortcut (mono, ink-5). Destructive items: ink color `--status-overdue-fg`, separated by a 1px ink-2 divider. Active item: ink-1 bg. Selected item (in dropdowns): navy-50 bg + check icon.

### Modals &amp; drawers

- **Modals:** 380–480px wide, centered, on rgba(30,28,20,0.35) backdrop. Card surface + `--shadow-3`. Header icon (e.g. `warning` for destructive) in a 36px tinted square. Title h2, body 13px ink-5. Footer: right-aligned button group, primary action last.
- **Drawers:** 480px right-side. Left border 1px ink-2. Boxed shadow `-4px 0 16px rgba(0,0,0,0.05)`. Header: meta-label + close X.

### States &amp; feedback

- **Empty state:** 40px padding, centered. 48px square ink-1 tile with icon → display-3 italic title ("No tasks *yet*.") → body-sm helper text → primary CTA.
- **Toasts:** 3px left-border-color carries the tone (sage = success, navy = info, sunset = error). Icon + title + body + optional Undo + X. Card surface + `--shadow-2`.
- **Tooltip:** ink-7 bg, white text, 11px, 5/8px padding, 4px radius. 8px gap from anchor. Triangle pointer.
- **Skeletons:** match content shape, ink-1 fill. Optional shimmer animation.

---

## Screens

### 1. Dashboard ("My Work") — `screen-dashboard.jsx`

Personal landing. Layout (max-width 1320, padding 40/28):

1. **Greeting row** — display-1 "Good morning, *Laura*." with date meta above. Right: filter shortcut buttons.
2. **Hero week strip + Achievements** — 1.4fr / 1fr grid. Left: navy-700 card with "0/40h" mono and 5-column day strip. Right: 4 achievements (icon + mono value + meta label).
3. **KPI row** — 5 equal cards: Active projects, Open tasks, Overdue, Due this week, Utilization.
4. **Two columns** — "My Projects" (sub-sections like "Leading · 2", "Supporting · 0") and "My Tasks." Empty rows use italic Instrument Serif.

### 2. Portfolio — `screen-portfolio.jsx`

Master project list. Layout:

1. **Header** — h1 "Portfolio" + Projects / Tasks sub-tabs.
2. **Toolbar** — Filters, Review ideas, Open projects buttons; "11 of 405 shown" count; list/grid/board/calendar view toggle; sort select.
3. **Views row** — saved-view chips (active = navy-50 bg + navy-500 text), Save view on the right.
4. **Main grid** — 260px filter sidebar (sticky) + table. Table has section-group rows. Columns: checkbox, ID (mono), Project, Status pill, Priority chip, Category, Lead (avatar + name), Due (mono), Tasks (mono, right-aligned).

### 3. Capacity — `screen-capacity.jsx`

Team load + weekly chart. Layout:

1. **Header** — h1 "Capacity" + Resources / Forecast / Insights sub-tabs.
2. **Two-column** — 260px team sidebar (scrollable, each row: avatar + name + 3px util bar + mono %, active row = navy-50 bg + 3px navy left border) + main content.
3. **Main** — Summary / Edit allocations inner tabs → member detail card (avatar + display-3 italic name + 4-up KPI grid) → stacked bar chart with 22.7h capacity reference line and 8-color + Other legend.

### 4. Project detail — `screen-project-detail.jsx`

The densest screen. Layout:

1. **Breadcrumb** — Portfolio › Active › Project Name
2. **Header** — ID + status pill + priority chip + category, then display-2 with one italic word, then description ≤720px. Right: Share / Edit / Add task + kebab. "Last edited 4h ago" meta below.
3. **Progress strip** — full-width card: "43% · 9 of 21 tasks complete or in progress" + segmented bar by status + legend.
4. **Two-column body** — 1fr main + 320px sidebar.
   - **Main:** Tasks / Activity / Comments / Files / Allocations tabs → toolbar (search, filters, group by) → grouped task table with checkboxes and current-row highlight → "Recent activity" feed (avatar + action + optional comment in ink-1 quoted block).
   - **Sidebar:** People, Schedule, Effort (with progress bar), Links cards. Each: meta-cap title + label/value rows where label is 100px wide ink-5 11px.

### 5. Mobile dashboard — `spec-dark-motion-mobile.jsx`

380px phone frame. Demonstrates the system at narrow widths. Mobile is **not yet designed** for Portfolio / Capacity / Project detail. Until it is:

- < 768px → filter sidebars become drawers triggered by the Filters button
- Dashboard sections stack vertically
- Tables → consider a card-per-row view at narrow widths
- Top bar collapses brand + stats; tabs become a hamburger or bottom nav

**Don't ship a half-baked mobile pass — gate the redesign to desktop first.**

---

## State management

Whatever state library the app uses, the redesign needs:

- **Filters** (Portfolio &amp; Capacity sidebars) — multi-select arrays per facet + search string. Persist to URL params so views are shareable.
- **Active view** (Portfolio saved-view chips) — controlled selection. User-scoped.
- **Selected team member** (Capacity) — single-select; drives the right pane.
- **Tab state** (top-level &amp; sub-tabs) — URL-driven (route per tab).
- **Sort &amp; pagination** (tables) — server-side for the 1,607-task / 405-project lists.
- **Theme** — `[data-theme="dark"]` on `<html>`; persist to localStorage. Honor `prefers-color-scheme` on first visit.

---

## Accessibility

- All color pairs targeted WCAG AA contrast for normal text. Verify with a contrast checker — especially the muted Sun yellow `#c89500` against white (intended for chart fills only, not text).
- **Focus rings:** 2px solid `--navy-500` + 3px halo, applied to all interactive elements. Visible against any background.
- **Hit targets:** 32px minimum on desktop, 44px on touch. Icon-only buttons get padding to reach this even when the glyph is smaller.
- Status is conveyed by both color AND text — never color alone. Keep it that way.
- Tables: proper `<th scope>` attributes. Row groupings via `<tr role="rowgroup">` or `<tbody>` sections.

---

## Recommended migration order

This is a 405-project live tool — don't flip it all at once.

1. **Tokens first** — drop in `tokens.css` (or its translation). Most of the visual change shows up immediately, with minimal structural risk.
2. **Typography** — load the three fonts; replace the old serif with Hanken Grotesk for UI.
3. **Buttons + pills + chips** — small, contained components.
4. **Top bar** — high visibility, ripples through every screen.
5. **One screen per sprint** — Dashboard → Portfolio → Capacity → Project detail → long tail.
6. **Behind a feature flag** for at least one sprint so power-users can toggle back.

---

## Assets to source separately

- **City of Tucson seal SVG** — replaces placeholder "T" monogram in top bar
- **Favicon &amp; app icon**
- **Real team-member avatar photos** (if used; current mock uses initial monograms)

---

## Questions to confirm with the user before starting

1. What is the app's tech stack? (React + Tailwind / React + CSS Modules / Vue / something else)
2. Is there an existing component library (shadcn, Radix, Headless UI, MUI) in use that we should adapt these patterns onto?
3. Are the fonts allowed to load from Google Fonts CDN, or do they need to be self-hosted (some gov environments restrict this)?
4. Is dark mode in scope for v1 launch, or post-launch?
5. Is mobile in scope for v1, or post-launch?
6. Is the migration behind a feature flag, or a hard cutover?
