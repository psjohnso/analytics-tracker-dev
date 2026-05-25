# Design System — Project Tracker

Everything needed to understand, preview, and safely evolve the visual design of the City of Tucson Project Tracker. Hand this folder (or a single file from it) to a designer or to Claude when you want to change how the app *looks* without breaking how it *works*.

> **Paths in these docs are relative to the repo root.** The live, canonical styles live in `src/app.css`; this folder is the design-system layer on top of it.

## What's in here

| File | What it is | Canonical? |
|---|---|---|
| **[components.html](components.html)** | **Live, themeable component gallery.** Open it in a browser to see every token and component rendered with the *real* app styles, and flip through all 5 themes + colorblind mode. Always accurate — it imports `../src/app.css`. | ✅ reflects live CSS |
| **[tokens.css](tokens.css)** | The design tokens (colors, surfaces, text, spacing, pill pairs) for all themes, documented in one readable place. | 🔁 mirror of `src/app.css` `:root` |
| **[tokens.json](tokens.json)** | The same tokens, machine-readable — for tooling, theming experiments, or AI. | 🔁 mirror |
| **[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)** | The **safe-edit contract**: the two rules, the component class inventory, and the load-bearing JS hooks you must not rename. Read this before editing. | — |
| `../COT_DESIGN.md` | The City of Tucson **brand guide** — **legacy** standard for this app (superseded by the OE Redesign; still the City-wide reference). | 🗄️ legacy |
| `../src/theme-oe.css` | The **OE Redesign** tokens, integrated as two selectable themes (`oe`, `oe-dark`). See the section below. | ✅ OE impl |
| `../design_handoff/` | Laura Sharp's full **OE Redesign handoff** — its own README, tokens, and 5 hero screens. The source for the redesign. | ✅ OE source |

Related (outside this folder): `../PROJECT_REFERENCE.md` (deep architecture), `../CLAUDE.md` (versioning & deploy).

## Two visual languages, one app (read this)

The **OE Redesign is the app's design standard going forward**, replacing the old City-brand look. During the migration the app carries both:

1. **OE Redesign** — **the adopted standard** (Laura Sharp's system, `../design_handoff/`): Hanken Grotesk + Instrument Serif + JetBrains Mono, a **subdued** palette, status-driven color. New/changed UI should target this. It supersedes `COT_DESIGN.md` for this app (see the note at the top of that file).
2. **Tucson Classic** — the **legacy** theme being replaced, grounded in the official City brand: Lato + Cardo, saturated Innovation Blue. Still the *default* only until the OE migration lands; `tokens.css` / `tokens.json` here document it.

**OE status & how it's wired:** selectable via **Settings → Appearance → "OE Redesign" / "… · Dark"** (app `v1.62.0.0`, dev line). Token-layer migration so far (`../src/theme-oe.css`): Laura's tokens transcribed, alias-bridged onto the tokens our screens already consume, plus `.status-*`/`.priority-*` overrides — **no screens rebuilt yet,** which is why Tucson Classic stays the default for now. `components.html` here includes the OE themes in its switcher so you can preview them in the gallery.

**Migration phases** (Laura's order): ✅ 1 tokens (`v1.62.0.0`) → ✅ 2 typography (`v1.62.0.1`) → ◐ 3 components (`v1.62.0.2` — priority chips + button refinements + pill shape; status-pill **color/dot** deferred to phase 5, see below) → ✅ 4 top bar (`v1.62.0.3` — light "paper" header with dark text + mono stats; primary tabs use a navy underline instead of the yellow fill) → ⬜ 5 screen-by-screen → **then flip OE to the default.** Desktop-first, dark in scope.

> **Status-pill caveat:** the project/task list pills are drawn with inline `STATUS_COLOR` styles (not the `.status-*` classes), so their bg/fg/dot can't be re-themed by CSS at AA contrast. Re-rendering them to Laura's tinted-bg + dark-fg + saturated-dot model happens during the phase-5 per-screen rebuild.

## How to use it

1. **Look first:** open `components.html` and switch themes. This is the fastest way to understand the system and to sanity-check a restyle in light / dark / an alt theme / colorblind.
2. **Read the rules:** `DESIGN_SYSTEM.md` — especially *"style through tokens, never hardcode hex"* and the "don't break it" list.
3. **Change tokens to retheme globally:** edit the `:root` (and theme) variables in `src/app.css`. `tokens.css` / `tokens.json` here document what each one does.
4. **Preview & ship:** `python -m http.server 8000` → `http://localhost:8000`, verify across themes, then bump `APP_VERSION` (`src/constants.js`) and run `node scripts/stamp-version.js`. See `../CLAUDE.md`.

## Source of truth & keeping in sync

`src/app.css` `:root` is the **live source of truth** for tokens — the running app reads from there. `tokens.css` and `tokens.json` in this folder are a **readable mirror** for handoff/tooling. If you change a token in `src/app.css`, update the mirror here too (or ask Claude to). `components.html` never drifts because it loads the live CSS directly.

> Want true single-source tokens (where `src/app.css` *consumes* `tokens.css`)? That's a small refactor — ask and it can be wired up, with the cache-bust caveat handled.
