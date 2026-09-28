# Pollard Properties — Call Hygiene Dashboard

Static SPA (Vite + vanilla JS + Chart.js) for ops review of Ultatel PBX misses, 24-hour callback hygiene, and HireSuper open loops.

**Live:** https://pollard22.github.io/Phone-dashboard/

GitHub Actions builds `dist/` on every push to `main` and deploys it with `actions/deploy-pages`. Pages source is GitHub Actions.

## Local preview

```bash
npm ci
npm run build
npm run preview
```

Dev server with HMR:

```bash
npm run dev
```

The Vite `base` is `/Phone-dashboard/` so asset URLs match the project Pages site.

## Data refresh

Until an Ultatel API exists, refresh is manual. Replace the files under `public/data/` and push to `main`. The next Actions run rebuilds and redeploys. No application code changes are required for a data-only refresh.

1. Export Ultatel Call Details (Last 7 Days / chosen window) from aig.ultatel.com.
2. Pull HireSuper Reporting + Activity (Action Required).
3. Regenerate `latest.json` and the CSVs (see `scripts/rebuild-data.md`).
4. Copy artifacts into `public/data/`:
   - `latest.json`
   - `Missed_ownership_A_no_callback.csv`
   - `Missed_ownership_B_called_back.csv`
   - `open_loops_super.csv`
   - `callback_hygiene_ultatel.csv`
   - `exclusions_method.csv`
   - `Overview.csv` (optional reference)
5. Commit and push to `main`.

The built site fetches `data/latest.json` and the CSVs at runtime (paths relative to the Pages base). Current pack: Ultatel window Sep 20–26, 2026.

## 24h callback rule

An unanswered / missed inbound counts as **no-callback** if there is no matching company **OUT-Bound** to that caller’s 10-digit number within **24 hours** after the miss (Ultatel Call Details only). Personal cell, AppFolio notes, and Super SMS/email without an Ultatel dial are not visible in this join.

## Sections

| Nav | Source |
|-----|--------|
| Overview | `latest.json` → `kpis`, `meta` |
| Missed ownership | `miss_by_extension` + A/B CSVs |
| Open loops (Super) | `open_loops_super.csv` |
| Callback hygiene | KPI strip + callback CSV |
| Method & exclusions | `exclusions_method.csv` + `meta.caveats` |

The overview does not show the Ultatel OUT-Bound volume block (300 total / 266 answered / 34 no answer). Those aggregates stay in the data pack and are not displayed. Callback hygiene still uses company OUT-Bound only as the 24-hour join rule.

## Drill-downs

Click a headline number to open a detail panel. On Missed ownership, a chart bar or extension row filters the event table. On Open loops, the total / overlap / Super-only pills filter that list. Close, Esc, the backdrop, or **Back to overview** leaves the panel.

Row lists are filtered from the files already in `public/data/`. If a metric is only an aggregate, the panel says **Detail not in this export** and shows the overview summary line. It does not invent callers.

Call and open-loop lists lead with **Caller**, **Who they called**, **Date**, and **Time**.

| List | Who they called | Date and time |
|------|-----------------|---------------|
| Missed events, including extension filters | `Who should have taken it` | Split from `Miss datetime (PT)` |
| No-callback 141 and the 43 untagged union | `Last extension tried` | Split from `Last miss (PT)` |
| Never dialed 98 | Same extension, looked up from the action list | Split from `Last miss (PT)` |
| Open loops | Action-list extension when the caller is on it | Last Ultatel miss, when present |

Super-only open loops with no Ultatel destination or time show **Not in this export** in those cells. Cells that have month and day only use the year from the Ultatel export window, and the table says so.

| Block | What opens |
|-------|------------|
| No-callback 141 | Action list in `callback_hygiene_ultatel.csv` |
| Never dialed 98 | Never-dialed section of that CSV |
| Dialed earlier only 28, dialed after 24h 15 | Count only. The file does not tag callers. A related view lists the 43 action-list callers who are not in the never-dialed set (the union, not either bucket). |
| Cleaned inbound NO ANSWER 447 | `Missed_ownership_A_no_callback.csv` (347) + `Missed_ownership_B_called_back.csv` (100) |
| IN no answer 472 | Those 447 cleaned events, plus the note that 25 company/self From legs are excluded and not listed call by call |
| Misses by extension | Same missed rows, filtered on `Who should have taken it` (keys match `miss_by_extension`) |
| Open loops 15 / overlap 7 / Super-only 8 | `open_loops_super.csv`, split on `In Ultatel no-callback list?` |
| IN-Bound 860, IN answered 388 | Aggregates in `latest.json` `kpis` and `overview_rows` only |
| AI inbound 135, transferred 40, needs human help 71, talk time, actions 179, SMS 20 | HireSuper Reporting aggregates in `overview_rows` only |
| Self-number event counts | The exclusion total row in `exclusions_method.csv`. Call legs for that From number are not in the pack. |

## Stack

- Vite 8, vanilla ES modules
- Chart.js (bar chart only)
- No backend; GitHub Pages serves the static `dist/`
