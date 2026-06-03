<!-- Fill out each section. Delete the prompts in italics after you write the real content. -->

## Summary

_One sentence: what changes for the user._

## Type

<!-- Tick the one that matches. Determines the version bump. -->

- [ ] **Feature** (`MINOR +1` → PATCH = 0, BUILD = 0)
- [ ] **Fix** (`PATCH +1`, `BUILD +1`)
- [ ] **Refinement** / same-feature follow-up (`BUILD +1` only)
- [ ] **Tooling / docs / chore** (`BUILD +1`; no app-behavior change)
- [ ] **Revert** of a previous feature (`MINOR +1`)

## Why

_Optional. Link to the discussion, screenshot, memory note, or external request that motivated this. Skip if it's self-evident from the summary._

## How tested

_Concrete steps the reviewer can replay. "Loaded the app, opened project X, edited the title, saved, verified the change persisted on hard-refresh" is enough for most things._

## Checklist (author)

- [ ] `APP_VERSION` bumped per the rules in [`CONTRIBUTING.md`](../blob/main/CONTRIBUTING.md#versioning-rules)
- [ ] Ran `node scripts/stamp-version.js`
- [ ] `node --check` clean on every modified JS file
- [ ] Screenshot attached (for any UI change)
- [ ] Migration notebook included (for any AGOL schema change)

---

## Reviewer QA — fill out before approving

_See [`CONTRIBUTING.md` § Reviewer's QA playbook](../blob/main/CONTRIBUTING.md#reviewers-qa-playbook) for what each box means and when it applies._

**Always**

- [ ] Pulled and ran the branch locally (`pwsh scripts/qa-pr.ps1 <PR>`)
- [ ] Walked through the author's "How tested" steps and confirmed they pass
- [ ] Hard-refreshed and re-tested once

**Applies to this PR**

- [ ] (UI) Checked both themes / dark mode / smaller viewport as relevant
- [ ] (Schema) Migration notebook is idempotent; load-time normalizer handles missing values
- [ ] (Data write) Targets the right records; preview / dry-run output looks sane
- [ ] (Tooling) Doesn't break the deployed app; runs as described
- [ ] No regressions on adjacent surfaces I happened to check

**Concerns?**

_Anything that gave you pause but isn't blocking — note it for the next iteration. If something IS blocking, request changes instead of approving._
