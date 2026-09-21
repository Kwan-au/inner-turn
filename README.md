Inner Turn — Melbourne changeover desk. Live: https://www.innerturn.com.au

## Desk APIs (this branch)

Authenticated with Netlify Identity (allow-listed `desk@innerturn.com.au` / recovery Gmail). No secrets in the client. `dash.html` stays behind `requireDesk`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/desk-board` | Lot packs, cleaner files, parties, Today strip, `nextActions` (max 5) |
| POST | `/api/desk-status` | Set `LEAD/FILE/LIVE/HOLD/DEAD` on `lot_packs`, `cleaner_files`, `parties` |
| GET/POST | `/api/desk-state` | Pipeline + quota in Netlify Blobs (`desk` store, key `state`) |

Board records are read from the `desk` Blobs store (`lot_packs`, `cleaner_files`, `parties`). If `NETLIFY_DATABASE_URL` / `NETLIFY_DB_URL` is present at runtime, existing SQL tables with those names are preferred. The API does not invent packs, rates, or names.

`canDispatch` is true only when there is ≥1 executable lot pack **and** ≥1 FILE/LIVE cleaner. Answer line: `Need lot pack` → `Need FILE cleaner` → `Ready to book`. Grand Final countdown is Melbourne calendar days to **26 Sep 2026**.

## Tests

```bash
npm test
```

Covers next-action derivation, FILE-ready / dispatch rules, status allow-list, Identity 401, and Blobs round-trip.

## Deploy note (www.innerturn.com.au)

**Production deploys from Netlify git, not GitHub merge:** `git.netlify.com/innerturn-melbourne/inner-turn`.

GitHub `main` is the editorial parchment site and is behind the live ops tree (`inner-turn.css`, `vendor/netlify-identity.js`, `/api/desk-board`). Merging this GitHub PR will not ship `www.innerturn.com.au`.

To ship the Today strip and live board, overlay **`netlify-git-patch/`** onto the live Netlify git checkout (see `netlify-git-patch/APPLY.md`) and push that remote. Do not copy GitHub parchment files onto production.
