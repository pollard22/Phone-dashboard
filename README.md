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
| Not called back yet | `summary.not_called_back` |
| Callback on each row | Called back when `first_outbound_after_miss_ct` is set, otherwise Not called back yet |
| How the counts relate | `summary.definitions.reconcile`, when that sentence does not describe a time window |
| Call-group filters and the caller table | `not_called_back_by_group`, `not_called_back[]` |
| Footer definitions and freshness | `summary.definitions`, `summary.export_end_ct`, `summary.source`, `meta.generated_at` |

Nothing else in the file is shown. A definition is skipped when its text is about a 24-hour callback window. Older CSV packs stay in `public/data/` so existing links do not 404.

Optional fields render only when this export includes them:

- `summary.transfer_failed_callers` and `summary.transfer_failed_calls` — a line under callers not answered
- `summary.transfer_failed_by_group`, or a top-level `transfer_failed_by_group` — chips for those counts
- `not_called_back[].missed_type` — a “What happened” column (`Super transfer not answered` or `Rang, not answered`)

Headline numbers are not hardcoded.

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
