<!--
  PR TEMPLATE — every section has guidance inline; you don't need to
  click through to CONTRIBUTING.md to fill this out. Delete the
  italicized prompts and the HTML comments as you fill in real
  content; keep the headings and checkboxes so the structure is
  consistent across PRs.
-->

## Summary

_One sentence: what changes for the user (or, for tooling-only PRs, what changes for the maintainer)._

_Examples:_
- _"Adds a Contributors picker to the task form below the Assignee row."_
- _"Fixes the OE Waiting-for-Response timeline bars showing the same color as Scheduled."_
- _"Reverts the task-status migration to the old four-status vocabulary; see PR #N."_

## Type

<!--
  Tick the ONE box that matches. Determines the version bump
  (see CONTRIBUTING.md § Versioning rules):

    Feature       → MINOR +1, PATCH = 0, BUILD = 0     (e.g. 1.77.0.0 → 1.78.0.0)
    Fix           → PATCH +1, BUILD +1                 (e.g. 1.77.0.2 → 1.77.1.3)
    Refinement    → BUILD +1 only                      (e.g. 1.77.0.2 → 1.77.0.3)
    Tooling/docs  → BUILD +1                           (same as refinement)
    Revert        → MINOR +1                           (treated as a feature change)

  If you're not sure which applies, ask before opening the PR — the
  wrong bump is annoying to correct after merge.
-->

- [ ] **Feature** — a new capability the user (or maintainer) didn't have before
- [ ] **Fix** — corrects a bug; should include a repro in "How tested"
- [ ] **Refinement** — polish on something that already exists (color tweak, spacing, copy edit)
- [ ] **Tooling / docs / chore** — no app behavior change for end users (scripts, READMEs, CI, dependencies)
- [ ] **Revert** — undoes a prior change; note which PR is being reverted

## Why

<!--
  Optional, but include if any of these apply:
  - Links to the discussion, screenshot, or external request that
    motivated this
  - The non-obvious reason behind a design decision in the diff
  - Trade-offs the reviewer should know about

  Skip when the change is self-evident from the Summary (a typo fix,
  a one-color swap, etc.).
-->

_Why this change, beyond what the summary already says._

## How tested

<!--
  Concrete steps the reviewer can replay. Don't just say "tested it" —
  spell out the actual click-paths. Three things make a good "How
  tested":

    1. The setup state ("with PR #N's contributors field added in
       AGOL, signed in as psjohnso…")
    2. The exact actions ("opened project DI-2026-014, clicked the
       edit pencil on the lead chip, picked Maria, clicked Save")
    3. The expected observation ("the People sidebar updated; the
       task list showed Maria's avatar next to the assignee chip")

  Include any edge cases you specifically checked (empty data,
  permissions, dark theme, narrow viewport). If you tested via the
  console / a notebook / a curl, note the command.
-->

_Concrete steps the reviewer can replay to verify the change works._

---

## Author checklist

<!--
  Tick after you've done each, before opening the PR for review. If
  any box can't be checked, explain why in the PR comments rather
  than leaving it blank.
-->

- [ ] **`APP_VERSION` bumped** per the rules in [`CONTRIBUTING.md`](../blob/main/CONTRIBUTING.md#versioning-rules)
  - _If you forgot, fix it now — the version in the commit subject must match `src/constants.js`._
- [ ] **`node scripts/stamp-version.js` ran** after the bump
  - _This rewrites every `?v=` cache-buster in `index.html`. Forgetting it means stale assets in production._
- [ ] **`node --check` clean** on every modified JS file
  - _Quick syntax safety net. Run `node --check src/<file>.js` for anything you edited._
- [ ] **Screenshot attached** for UI changes
  - _Drag-drop into the PR description below. Before/after side-by-side is best for visual tweaks._
- [ ] **Migration notebook included** for AGOL schema changes
  - _Live in `notebooks/`. Must be idempotent — running twice should be safe. Document a rollback section._
- [ ] **No secrets / credentials** in the diff
  - _Visually scan the diff. AGOL tokens, API keys, passwords — check for any of these accidentally committed._

---

## Reviewer QA — fill out before approving

<!--
  Don't approve the diff if you haven't actually tested the change.
  Each checkbox represents real work — ticking them all without
  doing the work defeats the point. If a box doesn't apply, write
  "N/A" next to it rather than silently leaving it unchecked.

  The CONTRIBUTING.md Reviewer's QA playbook has the long version of
  each item; the inline notes here are the short version that should
  be enough most of the time.
-->

### Always (these apply to every PR)

- [ ] **Pulled the branch and ran the app locally**
  - _The fastest path:_ `pwsh scripts/qa-pr.ps1 <PR-number>`. _Approving from the diff alone misses runtime bugs that pass syntax checks._
- [ ] **Walked through the author's "How tested" steps**
  - _Actually click the click-paths they described. Approving means you saw it work._
- [ ] **Hard-refreshed and re-tested once**
  - _Sometimes a stale browser cache hides what the new code is actually doing. Ctrl+Shift+R to bypass it._

### Applies to this PR (mark "N/A" if not relevant)

- [ ] **(UI) Checked both themes / dark mode / smaller viewport**
  - _If the change touches color tokens or layout, toggle to dark mode AND resize the browser to ~800px to spot responsive regressions._
- [ ] **(Schema) Migration notebook is idempotent + load-time normalizer handles missing values**
  - _Re-run the Step 1 "check if exists" cell — it should report 'already added.' Records that pre-date the field should read as a sensible default (empty string, false, 0)._
- [ ] **(Data write) Targets the right records; preview / dry-run output looks sane**
  - _Console-command migrations should have a two-step pattern: `findX()` previews, separate `flagX()` applies. Verify the preview before approval; the apply step happens after merge._
- [ ] **(Tooling) Doesn't break the deployed app; runs as described**
  - _`node --check` on any modified JS; load the app once after pulling to confirm nothing broke at the app level._
- [ ] **No regressions on adjacent surfaces**
  - _Quick sanity sweep of the surfaces near the change. Form change? Click into the other form too. Status logic? Click through the few statuses you didn't directly touch._

### Concerns

<!--
  Anything that gave you pause but isn't blocking — flag for the next
  iteration here. If something IS blocking (broken behavior, security
  worry, wrong design direction) — request changes in the GitHub
  review UI instead of approving.
-->

_Anything to surface for the next iteration._
