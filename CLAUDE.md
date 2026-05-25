# CLAUDE.md — analytics-tracker

Project-specific guidance. Layers on top of the global `~/.claude/CLAUDE.md` coding principles.

## Versioning & cache-busting

`APP_VERSION` in `src/constants.js` is the single source of truth, format `MAJOR.MINOR.PATCH.BUILD`. The four segments are **connected** — BUILD is a sub-counter of the current MINOR, not a free-floating global counter. Bump by **scope** on every commit:

| Commit is a… | Bump |
|---|---|
| Milestone / breaking change / major architectural shift | MAJOR +1 → MINOR, PATCH, BUILD = 0 |
| New feature or system (one bump **per feature**, not per sub-phase) | MINOR +1 → PATCH = 0, BUILD = 0 |
| Bug fix / small one-off correction | PATCH +1, BUILD +1 |
| Refinement / same-feature follow-up (neither feature nor fix) | BUILD +1 (PATCH unchanged) |

- **BUILD** = commits since this MINOR opened: 0-indexed, **unpadded** integer, +1 on every commit, resets to 0 whenever MINOR or MAJOR bumps.
- BUILD only diverges from PATCH on refinement commits, e.g. `1.62.0.0` (feature) → `1.62.0.1` (follow-up) → `1.62.1.2` (fix: PATCH=1, BUILD=2).
- Never retro-renumber already-shipped versions.

### Deploy workflow (index.html cache-busting is automated)

1. Make code changes.
2. Bump `APP_VERSION` in `src/constants.js` per the table above.
3. Run `node scripts/stamp-version.js` — rewrites every local `src/` `?v=` in `index.html` to the new `APP_VERSION`. One token busts all caches at once, so you can't forget to bump a file.
4. Commit and push. Pushing to `main` auto-deploys via GitHub Pages.

`dataprogram.html` is standalone and is **not** touched by `stamp-version.js` — when `constants.js` or `dataprogram-lite.js` change, bump their per-file `?v=` in `dataprogram.html` by hand.

See `PROJECT_REFERENCE.md` for full architecture and module layout.
