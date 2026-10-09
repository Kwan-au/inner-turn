# Production overlay for the Netlify git remote

**Do not merge GitHub PR #1 into `main` expecting www.innerturn.com.au to update.**

Live `www.innerturn.com.au` is a different tree from GitHub `Kwan-au/inner-turn`:

| | GitHub `main` / PR #1 | Live production |
|---|---|---|
| Login client | Identity widget + parchment `styles.css` | `@netlify/identity` via `/vendor/netlify-identity.js` + `inner-turn.css` |
| Marketing site | Editorial parchment homepage | Full Inner Turn site (`/pricing`, `/areas`, …) |
| Unlock API | Recreated in this PR | Already live at `POST /api/desk-unlock` (`set` / `unlock` only) |
| Deploy remote | `github.com/Kwan-au/inner-turn` | Historically `git.netlify.com/innerturn-melbourne/inner-turn` |

This agent could not authenticate to Netlify CLI or `git.netlify.com`, so it cannot ship wipe to production from here. Merging the GitHub PR would publish the parchment site, not the live desk.

## Primary recover flow (use this)

After allow-listed Identity sign-in, on the unlock step:

1. **Forgot unlock phrase? Reset it**
2. Confirm
3. Set a new 12+ character phrase

Do **not** use Identity password recovery for the unlock phrase (rate-limited; phrase is never emailed).

## Files to copy onto the Netlify remote

Drop these onto the live tree (paths relative to site root):

| Overlay file | Live destination | What it does |
|---|---|---|
| `login.html` | `login.html` | Adds wipe control on the existing lock form |
| `login.js` | `login.js` | Confirm → `POST { action: "wipe" }` → set-new-phrase mode |
| `NETLIFY_DESK.md` | `NETLIFY_DESK.md` | Documents wipe |
| `netlify/functions/desk-unlock.mjs` | same | Full handler with `wipe` (and optional `change`) |
| `netlify/lib/desk-auth.mjs` | same | Identity allow-list |
| `netlify/lib/desk-unlock-core.mjs` | same | Hash `sha256(email + "\\n" + phrase)`, Blobs key `unlock` |

Minimal diffs vs today’s live HTML/JS are `login.html.diff` and `login.js.diff`.

If `netlify/functions/desk-unlock.mjs` **already exists** on the Netlify remote, prefer inserting the wipe branch from `INSERT_WIPE_INTO_EXISTING_FUNCTION.md` so the existing Blobs store / session keys stay untouched. Replacing the function with the overlay copy uses store name `desk` and key `unlock`. If that store name does not match production, GET will look unset and Kwan can set a new phrase without wipe; if it matches, use **Forgot unlock phrase? Reset it**.

## Push sketch (from a checkout of the Netlify git remote)

```bash
git remote add netlify https://git.netlify.com/innerturn-melbourne/inner-turn
git fetch netlify
git checkout -b desk-unlock-wipe netlify/main   # use the live default branch name

# copy overlay files onto that checkout, then:
git add login.html login.js NETLIFY_DESK.md netlify/functions/desk-unlock.mjs netlify/lib/desk-auth.mjs netlify/lib/desk-unlock-core.mjs
git commit -m "Add desk unlock-phrase wipe for forgotten passphrase"
git push netlify HEAD
```

After deploy: Identity sign-in → **Forgot unlock phrase? Reset it** → set a new 12+ character phrase.
