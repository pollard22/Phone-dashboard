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

## Stack

- Vite 8, vanilla ES modules
- Chart.js (bar chart only)
- No backend; GitHub Pages serves the static `dist/`
