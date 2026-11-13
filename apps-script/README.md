# Shared resolutions (Google Sheet)

The call hygiene page stores “Mark resolved” for the whole team in a Google Sheet. `public/config.json` points `resolutionsEndpoint` at the deployed web app. If that URL is empty or the sheet cannot be reached, the page saves marks in the browser only and says so above the table.

A new daily data pack uses a new `pack_id` (the data window plus `meta.generated_at` from `latest.json`). Older rows stay in the sheet for history and no longer show on the page.

## Sheet

Create a Google Sheet. The script adds a tab named `resolutions` on the first write if it is missing.

| Column | Meaning |
|---|---|
| `pack_id` | Window label and generated timestamp, joined with `\|` |
| `row_key` | Caller phone digits and last-missed ISO time, joined with `\|` |
| `resolved` | `TRUE` or `FALSE` (an undo appends `FALSE`) |
| `note` | Optional, at most 500 characters |
| `resolved_by` | Optional name from the page, at most 80 characters |
| `resolved_at_iso` | Time the script saved the row (UTC) |

Each save appends a row. A read returns the latest row for each `row_key` in that `pack_id`.

## Deploy the web app

1. Open the spreadsheet. Choose **Extensions → Apps Script**.
2. Replace the default `Code.gs` with the contents of `apps-script/Code.gs` in this repo. Save.
3. Choose **Deploy → New deployment**. Click the gear and choose **Web app**.
4. Set **Execute as** to **Me**.
5. Set **Who has access** to **Anyone**. The GitHub Pages site has no Google login, so “Anyone with a Google account” would block the page. The web app URL is public once it is pasted into `config.json`. Anyone who can open the dashboard can mark rows resolved.
6. Deploy, authorize the requested Sheet access, and copy the **Web app URL** (it ends in `/exec`).
7. Put that URL in `public/config.json`:

```json
{
  "resolutionsEndpoint": "https://script.google.com/macros/s/…/exec"
}
```

8. Commit and deploy the dashboard. The page loads `config.json` with caching disabled.

After you edit `Code.gs`, open **Deploy → Manage deployments**, edit the web app, choose **New version**, and deploy. The `/exec` URL stays the same.

## How the page talks to it

- **Read:** `GET ?pack_id=…` returns `{ "resolutions": [ … ] }`. The page also accepts JSONP: `&callback=name`. JSONP is there because the Apps Script redirect often hides CORS headers from `fetch`.
- **Write:** `POST` a JSON body `{ "pack_id", "row_key", "resolved", "note", "resolved_by" }` with `Content-Type: text/plain;charset=utf-8` so the browser does not send a CORS preflight. The script adds `resolved_at_iso`. The response is `{ "ok": true }`.

The page loads resolutions on open and again every 60 seconds. Save and undo update the table immediately, then the next read confirms the sheet.
