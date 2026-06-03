# CONTRIBUTING — analytics-tracker

For maintainers landing in the repo for the first time. Read this once,
then keep it bookmarked for the version-bump rules, the day-to-day
workflow, and the review-side QA playbook at the bottom.

## Who can do what

| Role | Push to `main` directly | Open PRs | Approve PRs | Merge PRs |
|---|---|---|---|---|
| Repository admin (Peter) | No (blocked by ruleset) | Yes | Yes | Yes — admin bypass |
| Maintainer (you) | No | Yes | No (on your own PRs) | No — must wait for Peter |

**All changes go through PRs.** `main` is protected. If you run
`git push origin main` the push gets rejected. That's not a
misconfiguration — it's the safety net working.

---

## First-time setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/tucsonaz/analytics-tracker.git
   cd analytics-tracker
   ```

2. **Set your git identity** (so commits attribute correctly)

   ```bash
   git config user.name "Your Name"
   git config user.email "your.work.email@tucsonaz.gov"
   ```

3. **Install dependencies**
   - **Node.js 18+** — needed for `scripts/stamp-version.js` and `node --check`
   - **Python 3** (any modern version) — for the local server (`python -m http.server`)
   - **GitHub CLI** — `gh` for opening PRs and the QA helper. Install: `winget install --id GitHub.cli`, then `gh auth login`

4. **Verify you can run the app locally**

   ```bash
   python -m http.server 8000
   ```

   Open <http://localhost:8000>. The app should load and prompt sign-in via ArcGIS Online. Use your `cotgis` account.

   `file://` does not work — the app requires HTTP for OAuth. Don't bother trying.

5. **Read these once**
   - [`CLAUDE.md`](CLAUDE.md) — coding principles (simplicity, surgical changes, no speculative refactoring)
   - [`PROJECT_REFERENCE.md`](PROJECT_REFERENCE.md) — architecture and module map

---

## Day-to-day workflow

Every change, no matter how small, follows this loop:

1. **Sync main** — `git checkout main && git pull origin main`
2. **Branch off** — `git checkout -b feature/short-description` (or `fix/…`, `tooling/…`, `revert/…`, `chore/…`)
3. **Make your changes** — keep them surgical (see *What's safe to ship*)
4. **Test locally** — load `http://localhost:8000`, click through the affected UI, confirm the change behaves
5. **Bump `APP_VERSION`** in [`src/constants.js`](src/constants.js) per the table below
6. **Run the stamp script** — `node scripts/stamp-version.js` (rewrites every `?v=` cache-buster in `index.html`)
7. **Syntax-check any JS you touched** — `node --check src/<your-file>.js`
8. **Commit** with a subject line matching `APP_VERSION`: `v1.77.0.2 — short summary`
9. **Push the branch** — `git push -u origin <branch-name>`
10. **Open the PR** — `gh pr create --fill` (fills from your commit message) or via the GitHub UI
11. **Wait for Peter's review.** Don't try to merge — the ruleset will block it.
12. **Address review comments** by pushing more commits to the same branch.
13. **Once Peter approves and merges**, you're done. `main` auto-deploys to GitHub Pages within ~1 minute.

---

## Versioning rules

`APP_VERSION` is `MAJOR.MINOR.PATCH.BUILD`. Bump by **scope of your change**:

| Your change is a… | Bump |
|---|---|
| Milestone / breaking change / major architectural shift | `MAJOR +1` → MINOR, PATCH, BUILD = 0 |
| New feature or system (one bump **per feature**, not per sub-step) | `MINOR +1` → PATCH = 0, BUILD = 0 |
| Bug fix / small one-off correction | `PATCH +1`, `BUILD +1` |
| Refinement / same-feature follow-up (neither feature nor fix) | `BUILD +1` (PATCH unchanged) |

- `BUILD` is the count of commits since this `MINOR` opened. Resets to 0 when `MINOR` or `MAJOR` bumps.
- Example sequence: `1.77.0.0` (revert) → `1.77.0.1` (tooling) → `1.77.0.2` (refinement) → `1.77.1.3` (fix: PATCH bumps to 1, BUILD increments to 3).
- **Never retro-renumber shipped versions.**

If you're unsure which bump applies, ask Peter before opening the PR.

---

## What's safe to ship

**Safe to attempt on your own** *(open a PR and let Peter review)*

- Bug fixes with a clear repro
- Copy / text / spacing tweaks
- Adding a missing icon, fixing a broken link
- Color / font-size / padding adjustments
- Adding a missing field to an existing form (no AGOL schema change)
- Documentation updates (README, CLAUDE.md, this file)
- Style touch-ups within an OE tab

**Ask Peter before starting**

- Anything touching `auth.js`, AGOL service URLs, or OAuth config
- New feature flags or beta features
- New AGOL schema (fields, layers, tables)
- Changes to how data is written to AGOL — one bad write can corrupt production records for the whole team
- New dependencies / scripts in [`scripts/`](scripts/)
- Versioning convention changes
- Anything that touches the slideshow's notebook pipeline

**Don't do**

- Force-push to a shared branch (`--force` / `--force-with-lease` on anything beyond your own work-in-progress)
- Commit credentials, API keys, or anything sensitive
- "Refactor adjacent code while you're in there" — it bloats the diff and obscures the intent of the PR
- Skip the `stamp-version.js` step
- Delete branches that were merged but might be needed for a hotfix later — let Peter clean up

---

## When something goes wrong

- **App breaks locally after an AGOL change** → sign out, hard-refresh, sign back in. If still broken, ping Peter.
- **Production is broken after your merge** → tell Peter immediately. Don't try to revert solo unless he asks.
- **You forgot `stamp-version.js` before merge** → open a follow-up PR that just runs the script + bumps BUILD by 1.
- **You typo'd `APP_VERSION` and shipped it** → open a fix PR that corrects it. Don't try to rewrite history on `main`.
- **A merge conflict against `main`** → rebase your branch onto the latest `main` (`git fetch origin && git rebase origin/main`), resolve, force-push to *your branch* (not main), ping Peter to re-review.

---

## Reviewer's QA playbook

When you're the reviewer (this is Peter for now, eventually the backup
on certain PRs), tick the QA checklist in the PR template only after
you've actually performed the relevant checks. The PR template lists
the boxes; this section explains what each one means.

### Always

Every PR, regardless of type:

1. **Pull the branch and run the app locally.** Don't approve from the
   diff alone. Use the helper:

   ```powershell
   pwsh scripts/qa-pr.ps1 <PR-number>
   ```

   This stashes any in-flight work, checks out the PR, opens the
   browser to `http://localhost:8000`. Ctrl+C cleans up.

   For concurrent previews (testing two PRs side-by-side), use a
   different port for each:

   ```powershell
   pwsh scripts/qa-pr.ps1 5 -Port 8001
   ```

   Ports 8000–8003 are registered AGOL OAuth redirect URIs. Anything
   else will fail OAuth sign-in.

2. **Walk through the author's "How tested" steps.** If they say
   "added a task, set status to Active, saved, verified the bar turned
   green" — actually do that. Approving means you saw it work.

3. **Hard-refresh and re-test once after pulling.** Sometimes a stale
   cache hides what the new code is actually doing.

### For UI changes

- Check **both themes** — toggle to OE if the change is on a Classic
  surface, or vice versa. Pure-OE pages are fine to skip Classic.
- Check **dark mode** if the change touches color tokens, pill styles,
  or theme-bridged components.
- Spot-check on a **smaller viewport** (resize the browser to ~800px
  wide) if the change touches layout / grids / responsive sections.
- Look for **regressions on adjacent surfaces** — if the change is on
  the task form, also click into a project form to confirm you didn't
  accidentally affect it.

### For schema changes (new AGOL field / layer)

- Confirm the migration notebook is **idempotent** — running it twice
  should be safe. The Step 1 / Step 2 "check if exists then add"
  pattern is the convention.
- Check that `agolTaskToLocal` / `agolProjectToLocal` (in
  [`src/agol.js`](src/agol.js)) **gracefully handle missing values**
  for records that pre-date the field. Pre-existing records read as
  `undefined`; normalize to a sensible default.
- Spot-check the **rollback section** — every schema notebook should
  document how to delete the field if needed.

### For data writes (anything that calls `DataStore.update*` or `agolApplyEdits`)

- Confirm the write **targets the right records.** A bad `where`
  clause can silently corrupt hundreds of rows.
- Spot-check the **author's preview / dry-run output.** Console-command
  migrations should have a "find candidates → review → apply" two-step
  pattern, not a single "apply everything" call.
- After the write, query AGOL directly to verify the changes match
  what was intended.

### For tooling-only changes (scripts, docs, notebooks)

- Confirm the **change does what the description says** by running it
  if practical.
- Verify it **doesn't break the deployed app** — `node --check` on any
  JS, browser-load if any UI code is touched.
- No further surface-area testing needed — tooling changes don't ship
  to end-users.

### Things that should make you ask questions before approving

- Big diffs touching many unrelated files
- Files changed that don't match the PR's stated scope (e.g., a "fix
  typo" PR that also modifies `auth.js`)
- Version bump that doesn't match the change type per the rules above
- Missing or trivial "How tested" section in the PR description
- The author force-pushed mid-review (re-read the diff from scratch)

When in doubt: leave a comment, request changes, don't merge.

---

## Where to look first

- [`CLAUDE.md`](CLAUDE.md) — coding principles. Read this before your first PR.
- [`PROJECT_REFERENCE.md`](PROJECT_REFERENCE.md) — architecture, module map, file conventions.
- [`README.md`](README.md) — high-level overview.
- This file — process and review rules.
- Peter — anything ambiguous, or anything in the *Ask Peter before starting* list.

When in doubt, ask. A 30-second message saves an hour of rework.
