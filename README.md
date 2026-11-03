# Pollard Properties — Call Hygiene

One page for the owner: how many calls came in, how many were answered, how many callers were not answered, and which of those callers have not been called back.

**Live:** https://pollard22.github.io/Phone-dashboard/

GitHub Actions builds `dist/` on every push to `main` and deploys it with `actions/deploy-pages`.

## What the page shows

The page reads `public/data/latest.json` only.

| On the page | JSON |
|---|---|
| Window in the header | `summary.window_label` (Central Time) |
| Calls received, calls answered, callers not answered | `summary.total_calls`, `summary.answered_calls`, `summary.unanswered_callers` |
| Answered split, when both fields exist | `summary.answered_by_super`, `summary.answered_by_staff` |
| Called back and not called back yet | `summary.called_back`, `summary.not_called_back` |
| Called-back caller list | `called_back[]`, with `callback_ct` |
| What happened | `summary.not_called_back_by_missed_type` and `missed_type` |
| Call-group filters and the caller table | `not_called_back_by_group`, `not_called_back[]` |
| Super call link on a row | `super_link`, `super_summary_title`, `super_summary_text`, `super_link_status` |
| Footer definitions and freshness | `summary.definitions`, `summary.export_end_ct`, `summary.source`, `meta.generated_at` |

Nothing else in the file is shown. The page does not show a “never called this week” line. A definition is skipped when its text is about a 24-hour callback window. Older CSV packs stay in `public/data/` so existing links do not 404.

Optional fields render only when this export includes them:

- `summary.transfer_failed_callers` and `summary.transfer_failed_calls` — a line under callers not answered
- `summary.transfer_failed_by_group`, or a top-level `transfer_failed_by_group` — chips for those counts
- `not_called_back[].missed_type` — a “What happened” column (`Super transfer not answered` or `Rang, not answered`)

Headline numbers are not hardcoded.

## Call group names

The files keep the raw group strings. The page shows a shorter name from `groupLabel()` in `src/format.js`, on the chips, the filters, and the Call group column. Groups that share a name are added together. The counts themselves are not changed.

| In the export | On the page |
|---|---|
| Leasing, or extensions 615, 101, 102, 110 | Leasing |
| Maintenance, extension 104, or Mel 104 then Tiffany 100 | Maintenance |
| Renewals, or extension 108 | Renewals |
| Applications, or extension 106 | Applications |
| Main line, 601, or Super with no transfer target | Main line |
| Tiffany 100, or Maintenance or Renewals (Tiffany 100) | Tiffany |
| Rania 107 | Rania |
| Junior 112 | Junior |
| Any other direct line, `Direct line — Name (ext)` | That person's first name |

Labels do not include extension numbers.

## Local preview

```bash
npm ci
npm run build
npm run preview
```

Dev server:

```bash
npm run dev
```

The Vite `base` is `/Phone-dashboard/` so asset URLs match the project Pages site.

Check the page against the current pack:

```bash
node scripts/check-drills.mjs
```

## Data refresh

Replace the files under `public/data/` (including `latest.json` and `not_called_back.csv`) and push to `main`. The next Actions run rebuilds and redeploys.
