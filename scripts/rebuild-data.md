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

## Caveats to keep in meta

- Ultatel has no VOICEMAIL flag (ANSWERED / NO ANSWER only).
- Personal cell / AppFolio / Super SMS without Ultatel OUT are invisible.
- Super inbound ≠ Ultatel CDR legs 1:1.
- Document Super Activity window if narrower than Ultatel.
