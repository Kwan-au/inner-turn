# Apply this overlay on the LIVE Netlify git tree

Production deploys from **Netlify git**, not GitHub merge:

`git.netlify.com/innerturn-melbourne/inner-turn`

This folder is a drop-in for that live tree (`inner-turn.css`, `vendor/netlify-identity.js`, `/api/desk-board`, unlock, intakes). **Do not copy GitHub `main` parchment files** (`styles.css`, editorial `index.html`, widget `auth.js`).

## Copy order

On a checkout of the live Netlify git repo:

1. **Add** `netlify/lib/desk-board-core.mjs`  
   New helper. `today` + `nextActions` (max 5). Does not invent packs or rates.

2. **Replace** `netlify/functions/desk-board.mjs`  
   Same `/api/desk-board` path and Identity 401. After load, response includes `today` and `nextActions`.  
   It reuses a live loader if one exists (`desk-board-data`, `desk-db`, `desk-data`, `desk-records`, or `desk-store`).  
   **If the live function currently inlines the Postgres query**, do not lose it: keep that query, then:

   ```js
   import { buildDeskBoard } from "../lib/desk-board-core.mjs";
   // records = { lotPacks, cleanerFiles, parties, intakes }
   return jsonResponse(buildDeskBoard(records));
   ```

   Keep the live Identity / `X-Desk-Session` checks already on that handler.

3. **Add** `desk-today.css` next to live `inner-turn.css`  
   Today strip, status chips, collapsed year-plan. Does not replace `inner-turn.css`.

4. **Replace** `dash.html`  
   Live ops chrome kept: `inner-turn.css`, `dash-boot.js` module, second lock, Trust/Rules, footer, `site.v6.js` / `site.v7.js`, intake agent, live margin card (`trial −$15`, same-day +$40/+ $50/+ $60/+ $70).  
   Order after login: **Today → Live board (lots + cleaners + parties) → Margin → Quota → Pipeline → intake**. Ranked / 90-day / regulation collapsed.  
   **`film.js` removed** (leftover public-form helper).

5. **Replace** `dash.js`  
   Still `import { deskHeaders, signOutDesk } from "/auth.js"`. Blob pipeline, `/api/desk-status`, `/api/desk-intakes` unchanged. Adds Today, parties lane, LEAD/FILE/LIVE/HOLD/DEAD chips, 60s refresh while the tab is visible.

## Do not copy

- GitHub `styles.css`, `index.html`, `auth.js`, `login.html`
- `desk-status.mjs`, `desk-state.mjs`, `desk-unlock.mjs`, `desk-intakes.mjs`
- `vendor/netlify-identity.js`, `inner-turn.css`

Optional: delete live `film.js` after deploy; it is unused once `dash.html` no longer references it.

## After push to Netlify git

Confirm `www.innerturn.com.au/dash.html` shows Today first, no `film.js` in the document, and `GET /api/desk-board` (allow-listed Identity + unlock session) returns `today.canDispatch` and `nextActions`.
