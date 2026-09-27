# Rebuild data pack (one-pager)

## Inputs

1. **Ultatel Call Details CSV** — Last 7 Days (or target window) from aig.ultatel.com MyService → Call Analytics. HQ timezone UTC−5; convert display times to America/Los_Angeles.
2. **HireSuper Reporting** — Custom window matching Ultatel (Calls / Transfers / Needs Human Help / Actions / SMS).
3. **HireSuper Activity** — Action Required threads (open loops). Note feed batch coverage (e.g. Sep 24–27 only).

## Transforms (do not invent metrics)

1. Exclude company/self **From** numbers (see exclusions sheet / `exclusions_method.csv`).
2. Classify IN-Bound × Outcome → answered / NO ANSWER; cleaned NA after self-exclusions.
3. **24h join:** for each cleaned inbound NO ANSWER, scan for any company OUT-Bound to the same 10-digit To/caller within 24h → called-back vs no-callback.
4. Aggregate unique no-callback callers → Action list; split never-dialed / dialed-earlier-only / dialed-later-after-24h.
5. Build miss-by-extension from CDR Extension on cleaned NA events.
6. Match Super Action Required to Ultatel no-callback by 10-digit number → overlap / Super-only.
7. Write `data-latest.json` (`meta`, `kpis`, `miss_by_extension`, samples) + CSVs:
   - `Missed_ownership_A_no_callback.csv`
   - `Missed_ownership_B_called_back.csv`
   - `open_loops_super.csv`
   - `callback_hygiene_ultatel.csv`
   - `exclusions_method.csv`
   - `Overview.csv`

## Deploy into the site

```bash
SRC=/workspace/ultatel/web-dashboard
SITE=$SRC/site/public/data
cp "$SRC/data-latest.json" "$SITE/latest.json"
cp "$SRC"/Missed_ownership_*.csv "$SRC"/open_loops_super.csv \
   "$SRC"/callback_hygiene_ultatel.csv "$SRC"/exclusions_method.csv \
   "$SRC"/Overview.csv "$SITE/"
cd "$SRC/site" && npm run build
```

## Drill-down contract

The site filters these files in the browser. Do not add placeholder rows.

- Unique no-callback and never-dialed lists come from `callback_hygiene_ultatel.csv` (Action list, then Never dialed).
- Dialed-earlier-only and dialed-later-than-24h are verification counts only, unless a future export adds a per-caller bucket column. The UI will not guess the split. Callers on the action list who are absent from never-dialed are shown only as that untagged union.
- Cleaned NO ANSWER events are the two Missed ownership CSVs. `Who should have taken it` must match `miss_by_extension` keys.
- Raw inbound, answered inbound, outbound, and HireSuper reporting totals stay aggregates in `latest.json` / `Overview.csv` until call-level rows exist.
- Open loops, overlap, and Super-only are `open_loops_super.csv` filtered by `In Ultatel no-callback list?`.
- Excluded From numbers stay summary rows in `exclusions_method.csv` (event count, not each leg).

`node scripts/check-drills.mjs` checks those row counts against `latest.json` after a data refresh.

## Caveats to keep in meta

- Ultatel has no VOICEMAIL flag (ANSWERED / NO ANSWER only).
- Personal cell / AppFolio / Super SMS without Ultatel OUT are invisible.
- Super inbound ≠ Ultatel CDR legs 1:1.
- Document Super Activity window if narrower than Ultatel.
