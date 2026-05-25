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
| `../COT_DESIGN.md` | The City of Tucson **brand guide** — palette, fonts, logo, accessibility. The non-negotiable boundaries. | ✅ brand source |

Related (outside this folder): `../PROJECT_REFERENCE.md` (deep architecture), `../CLAUDE.md` (versioning & deploy).

## How to use it

1. **Look first:** open `components.html` and switch themes. This is the fastest way to understand the system and to sanity-check a restyle in light / dark / an alt theme / colorblind.
2. **Read the rules:** `DESIGN_SYSTEM.md` — especially *"style through tokens, never hardcode hex"* and the "don't break it" list.
3. **Change tokens to retheme globally:** edit the `:root` (and theme) variables in `src/app.css`. `tokens.css` / `tokens.json` here document what each one does.
4. **Preview & ship:** `python -m http.server 8000` → `http://localhost:8000`, verify across themes, then bump `APP_VERSION` (`src/constants.js`) and run `node scripts/stamp-version.js`. See `../CLAUDE.md`.

## Source of truth & keeping in sync

`src/app.css` `:root` is the **live source of truth** for tokens — the running app reads from there. `tokens.css` and `tokens.json` in this folder are a **readable mirror** for handoff/tooling. If you change a token in `src/app.css`, update the mirror here too (or ask Claude to). `components.html` never drifts because it loads the live CSS directly.

> Want true single-source tokens (where `src/app.css` *consumes* `tokens.css`)? That's a small refactor — ask and it can be wired up, with the cache-bust caveat handled.
