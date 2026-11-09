# Apply light-surface text contrast overlay

Production (`www.innerturn.com.au`) deploys from the **Netlify remote / upload tree**, not GitHub `main`. GitHub `main` still holds the older parchment homepage (`styles.css`). Live public pages load:

| Stylesheet | Used on |
|---|---|
| `/inner-turn.css` | All public marketing pages (home, areas, suburbs, …) |
| `/brand.v1.css` | Most inner pages (`body.film`) + login/app chrome |
| `/styles.css` / `styles.v7.css` | Desk / legacy parchment only — not the live marketing chrome |

**Do not deploy GitHub `main` as-is** — that would overwrite the live multi-page site with the parchment homepage.

## What this overlay changes

Light-surface muted/body text only. Gold accents, layout, map, hero photo, and mobile proof-strip rules are untouched. Dark surfaces (hero, coverage map, footer on ink, rate-foot, desk) keep their existing light-on-dark colours.

### `inner-turn.css`

- `--muted`: `#716f68` → `#4a4740` (~8.9:1 on `--paper`, ~8.1:1 on `--cream`)
- `.eyebrow.dark`: `#726b5b` → `var(--muted)`
- `.rate-head`: `#747169` → `#4a4740`
- `.drawer-kicker`, `.pack-grid figcaption`, `.faq summary:after`: hardcoded `#716f68` → `var(--muted)`
- `.login-wrap` lede/note/fine/kicker: `#6b6560` / `#8a8378` → `var(--muted)`
- `.areas-hero .lede`: new rule uses `var(--muted)` so areas body copy stays readable without relying on an inline style (hero `.lede` stays `#e0ded8`)

### `brand.v1.css`

- `--mute`: `#6B6560` → `#4a4740` (feeds `body.film .lede`, `.note`, `.slate`, `.em-fine`, slabs extras, site-ruler)

## Copy onto the live tree

On a checkout of the live production tree (`git.netlify.com/innerturn-melbourne/inner-turn` or equivalent upload):

1. Replace `/inner-turn.css` with `netlify-git-patch/inner-turn.css`
2. Replace `/brand.v1.css` with `netlify-git-patch/brand.v1.css`
3. Publish (digest deploy preferred so desk functions stay attached)

Optional cache bust: if HTML pins `?v=…`, bump that query after publish.

## GitHub parchment

Root `styles.css` also darkens `--muted` to `#4a4740` for the editorial/public pages that still ship from this repo (`index.html`, `login.html`, `thanks.html`). That does **not** update live www until the Netlify overlay above is applied.

## Smoke after publish

- `/areas` — COVERAGE eyebrow + paragraph under “Is the building in range?” readable on paper
- `/` — process intro, pricing notes, FAQ answers darker; hero lede and coverage-map copy still light-on-dark
- `/pricing`, `/how-it-works`, `/trust`, `/terms` — film ledes via `brand.v1.css`
- Mobile drawer kickers readable on `#fbfaf6`
- Footer / hero / dark coverage unchanged
