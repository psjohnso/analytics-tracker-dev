# Public Views Migration Checklist

Context: the AGO migration consolidated 12 legacy FeatureServers down to 3 (`datateam_portfolio`, `datateam_capacity`, `datateam_tracker_admin`). The authenticated paths already point at the new services. The three **public read-only views** still wrap the LEGACY services and need to be recreated over the new ones before the legacy services can be retired.

Anonymous viewers (lobby-display TV, public dashboard links) and the slideshow's auto-refresh both depend on these views.

---

## Step 1 — Inspect the existing views (before recreating)

Capture anything you don't want to lose when you build the replacements. For each of the three views below, open it in AGO and note:

- **Definition query / filter** (e.g., `public_visibility = 'Public'`, `deleted_at IS NULL`)
- **Field visibility** (which columns are exposed vs hidden)
- **Sharing settings** (Public / Org / specific groups)
- **Item metadata** (description, tags, thumbnail) — copy over to keep continuity

| Role | Current view in AGO | Current Item ID |
|---|---|---|
| Projects | **projects view** (owner: pjohnson) | `8d28b20af78d4e01bffbac8abd9dd8ed` |
| Tasks | **tasks view** (owner: pjohnson) | `1b24f6c11021452e938747ff18cd5340` |
| App Config | **Analytics Tracker - App Configuration view** (owner: pjohnson) | `693882a97ea84c92ad2b41f7d35fa529` |

---

## Step 2 — Create the new views

| New view | Source FeatureServer (layer) | Constant in code |
|---|---|---|
| projects_ro_view | `datateam_portfolio/FeatureServer/0` | `publicProjectsUrl` |
| tasks_ro_view | `datateam_portfolio/FeatureServer/1` | `publicTasksUrl` |
| app_configuration_ro_view | `datateam_tracker_admin/FeatureServer/0` | `publicConfigUrl` |

Apply the filter you captured in Step 1 (if any) when defining the view.

**Done 2026-05-16** — the three views above were created by pjohnson and the
code switched from Item-ID resolution to direct URLs in `ARCGIS_CONFIG`.

---

## Step 3 — Expose the required fields on each new view

### Projects view — required fields

Identifiers:
- `objectId`, `project_number`, `title`, `description`

Status / workflow:
- `status`, `priority`, `actual_end`, `working_due`
- `start_date`, `end_date`
- `deleted_at` (so the client can filter soft-deletes)

People / org:
- `contact`, `other_members`, `partner_dept`, `itd_team`

Categorization:
- `category`, `project_size`

Data Program:
- `is_data_program`, `data_program_team`, `dp_goal`, `primary_dp_goal`

Strategic alignment:
- `wwc_practice`, `wwc_criteria`
- `it_initiative`, `city_initiative`, `it_priority_project`

Public-facing:
- `leadership_title`, `leadership_summary`, `public_visibility`

### Tasks view — required fields

- `objectId`, `task_number`, `project_number`, `title`
- `status`, `priority`, `assignee`
- `start_date`, `due_date`, `working_due`, `actual_end`
- `deleted_at`

### App Configuration view — required fields

- `objectId`, `config_key`, `config_value`

(Only `partner_depts` is consumed publicly today via [index.html:1557-1561](index.html#L1557-L1561) → `applyAppConfig`, but expose the whole key/value pair so we can grow without revisiting the view.)

---

## Step 4 — Update the code

Edit the three URL constants in [src/agol.js:34-39](src/agol.js#L34-L39):

```js
publicProjectsUrl: '<NEW PROJECTS VIEW URL — must include layer index>',
publicTasksUrl:    '<NEW TASKS VIEW URL — must include layer index>',
publicConfigUrl:   '<NEW CONFIG VIEW URL — must include layer index>',
```

Bump cache-bust on `agol.js` in [index.html](index.html), and bump `APP_VERSION` in [src/constants.js](src/constants.js). If you also touched [index.html's loadPublicData](index.html#L1514) or [slideshow.js's refresh tick](src/tabs/slideshow.js), bump those cache-busts too.

---

## Step 5 — Smoke test (anonymous)

Open the app in an **incognito / private window** (no sign-in) and verify:

- [ ] Overview tab loads without errors (check console).
- [ ] Projects count and Tasks count in the header are non-zero.
- [ ] Open the Slideshow tab — within a few seconds the header shows `· Data: HH:MM` (confirms `agolQueryPublic` is reaching the new views).
- [ ] Data Program slide shows non-zero per-team counts on every team tile.
- [ ] After 5 minutes, the `Data: HH:MM` timestamp ticks forward and the Data Program slide reflects any project edits made in the meantime.

If the Data Program team tiles show 0 (like in the bug we hit on 2026-05-15), the most likely cause is that `data_program_team` isn't exposed on the new projects view — re-check Step 3.

---

## Step 6 — Retire the legacy views

Only after Step 5 passes:

- Verify nothing else (other apps, dashboards, embedded maps) references the old public view Item IDs.
- Delete or unshare the legacy views.

---

## Rollback

If anything goes wrong, revert the three Item ID changes in [src/agol.js](src/agol.js) and bump the cache-bust. The legacy views remain available until Step 6, so rollback is a 30-second code revert.
