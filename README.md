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

GitHub merge alone **does not currently ship production**.

- `www.innerturn.com.au` already runs a **manual / historically Git-linked Netlify deploy** that is **ahead of GitHub `main`**: live `dash.html` / `dash.js` talk to `/api/desk-board`, `/api/desk-status`, `/api/desk-state`, `/api/desk-unlock`, `/api/desk-intakes`. GitHub `main` was an editorial publish and did not contain those functions.
- Confirm the Netlify site is linked to this repo and that production deploys from the GitHub production branch (or a successful merge + production publish). If the site is still on a locked manual deploy, merge this PR then **trigger a production deploy in Netlify** (or `npx netlify deploy --prod` from a machine with site credentials).
- After this lands, production `dash.html` must be **this** file (Today → board → margin → quota → pipeline). Do not leave the live page on the old `inner-turn.css` copy that still loads leftover `film.js` / `site.v7.js`.
- Identity stays Invite-only. Desk APIs return `{"ok":false,"error":"identity"}` without an allow-listed bearer token.
