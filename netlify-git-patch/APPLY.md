# Apply this overlay on the LIVE Netlify git / upload tree

Production deploys from **Netlify git or upload**, not GitHub merge.

`git.netlify.com/innerturn-melbourne/inner-turn`

This folder is a drop-in for the **current live desk2 tree** (`inner-turn.css?v=desk2`, identity widget, `/dash-boot.v2.js`, unlock-on-dash, pipe-board). **Do not copy GitHub `main` parchment files.**

## Copy order

On a checkout of the live production tree (or a digest deploy that keeps existing file SHAs):

1. **Add** `netlify/lib/desk-board-core.mjs`  
   New helper. `today` + `nextActions` (max 5). Does not invent packs or rates.

2. **Replace or restore** `netlify/functions/desk-board.mjs`  
   Same `/api/desk-board` path and Identity 401. After load, response includes `today` and `nextActions`.  
   Prefer reattaching the live function zip from deploy `6ab12041b79b6c0008395010` (digest `84c0cbce…`) so the Postgres loader stays.  
   The overlay handler reuses a live loader if one exists (`desk-board-data`, `desk-db`, `desk-data`, `desk-records`, or `desk-store`).

3. **Restore** `/api/desk-status` and `/api/desk-intakes` from the same 12:17 deploy if the current upload dropped them. Do not replace live `desk-state`, `desk-unlock`, `pageview`, or `submission-created`.

4. **Add** `desk-today.css` next to live `inner-turn.css`  
   Today strip, status chips, collapsed year-plan. Does not replace `inner-turn.css` or `styles.v7.css`.

5. **Replace** `dash.html`  
   Live desk2 chrome kept: identity widget, `auth.js?v=desk2`, `dash-boot.v2.js`, unlock form on the page, FY2027, pipe-board / search / merge import.  
   Order after login: **Today → Live board (lots + cleaners + parties) → Margin → Quota → Pipeline**. Ranked / 90-day / regulation collapsed.  
   **`film.js` is not referenced.**

6. **Replace** `dash.js`  
   Classic script (not ESM). Still uses global `deskHeaders` from `/auth.js`. Keeps Blob pipeline merge, hunt JSON import, pipe chips. Adds Today, parties lane, LEAD/FILE/LIVE/HOLD/DEAD chips, 60s refresh while the tab is visible.

## Do not copy

- GitHub `styles.css`, `index.html`, `auth.js`, `login.html`
- Live `desk-state`, `desk-unlock`, `pageview`, `submission-created` sources
- `vendor/netlify-identity.js`, `inner-turn.css`, `styles.v7.css`, `dash-boot.v2.js`

## Digest deploy (keeps live functions)

Create a new production deploy with:

- current published file SHAs for every path except `/dash.html` and `/dash.js`
- new SHA1s for `/dash.html`, `/dash.js`, `/desk-today.css`
- current function SHA256s for `desk-state`, `desk-unlock`, `pageview`, `submission-created`
- 12:17 function SHA256s for `desk-board`, `desk-status`, `desk-intakes` when still in Netlify storage

## After publish

Confirm `www.innerturn.com.au/dash.html` shows Today first (after unlock), no `film.js` in the document, unlock-on-page + pipe-board still present, and `GET /api/desk-board` (allow-listed Identity + unlock session) returns `today.canDispatch` and `nextActions`.
