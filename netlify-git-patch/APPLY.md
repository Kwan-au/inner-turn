# Apply event-bar redesign overlay

Production (`www.innerturn.com.au`) deploys from the **Netlify remote / upload tree**, not GitHub `main`. GitHub `main` still holds the older parchment homepage (`styles.css`). Live public pages load `/inner-turn.js` and `/inner-turn.css` site-wide.

**Do not deploy GitHub `main` as-is** — that would overwrite the live multi-page site with the parchment homepage.

## What this overlay changes

Site-wide `#event-bar` / `.event-bar` announcement strip only (injected by `inner-turn.js` when `sessionStorage it-event-bar` is unset).

### Design

- Premium dark bar (`#1a1a1a`) with gold accent on **Event weeks +25%**
- Clear hierarchy: surcharge rule → next windows as distinct chips → single CTA
- Comfortable padding; single row on wide screens; graceful wrap on mobile
- CTA is a dedicated `.event-bar-cta` link to `/policies#events` (no orphan gold underline on random text)
- Dismiss × and `sessionStorage` behaviour unchanged
- Same factual content and dates (GF / Cup / AO / F1); no new rates

### Preserved

- `--muted: #4a4740` and other light-surface contrast work
- Hero, proof strip, nav, footer, and all non–event-bar layout

## Copy onto the live tree

On a checkout of the live production tree (`git.netlify.com/innerturn-melbourne/inner-turn` or equivalent upload):

1. Replace `/inner-turn.js` with `netlify-git-patch/inner-turn.js`
2. Replace `/inner-turn.css` with `netlify-git-patch/inner-turn.css`
3. Publish (digest deploy preferred so desk functions stay attached)

Optional cache bust: if HTML pins `?v=…`, bump that query after publish.

## Smoke after publish

- `/` — event bar readable; chips separated; CTA underline only under “Event windows”
- Mobile width — rule wraps as its own line; chips wrap as units; dismiss still works
- Dismiss once — bar gone for the session (`it-event-bar`)
- `/policies#events` — CTA lands on Event weeks section
- Hero / proof strip / `--muted` light surfaces unchanged
