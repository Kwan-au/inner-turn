# Netlify desk and form settings

Identity is for the private desk only. In Netlify, keep registration set to **Invite only** and invite only `desk@innerturn.com.au` plus the nominated recovery Gmail account. Keep Identity out of the public navigation. The browser uses `@netlify/identity`; every desk API independently validates the bearer token against Netlify Identity and checks the email allow-list.

## Unlock phrase

The optional second phrase is salted with the allow-listed Identity email (`sha256(email + "\n" + phrase)`) and stored only as a SHA-256 hash in Netlify Blobs (key `unlock`, value `{ hash }`). The phrase is never logged or emailed.

Successful **set** and **unlock** calls create a random 12-hour server-side session. Eight failed unlocks lock the client address for 15 minutes. The login UI pauses for one minute after five failed Identity attempts; Netlify Identity remains the authority for credential verification.

If the unlock phrase is forgotten, an allow-listed Identity user uses **Forgot unlock phrase? Reset it** (`POST /api/desk-unlock` action `wipe`). That deletes the hash so GET returns `set: false` and the form switches to set-new-phrase mode. Do not use Identity password recovery for the unlock phrase.

`POST /api/desk-unlock` actions:

- `set` — first-time (or after a wipe) 12+ character phrase
- `unlock` — check the current phrase and issue a session
- `wipe` — allow-listed Identity only; clears the unlock blob (primary recover path)
- `change` — current phrase plus a new 12+ character phrase (optional rotation)

## Forms

For the `manager-enquire` form, configure a Netlify form-submission email notification to `desk@innerturn.com.au`. The form supplies a `subject` field in the pattern `suburb + beds + checkout time`. Submissions create a `LEAD` only. They never confirm a booking, dispatch a contractor, or persist access credentials. Keep the `cleaner-file` notification and workflow separate.

## Release QA

- Submit one real-looking manager lead and confirm the Netlify submission and email notification arrive once.
- Confirm apex and Netlify-host marketing URLs return a single 301 to the matching `www.innerturn.com.au` path.
- Confirm deploy previews are redirected to production and do not become indexable duplicates.
- Check the browser console on public pages: CSP permits local assets and the areas map, with no unexpected scripts.
- Confirm `/login`, `/dash.html`, and desk APIs return no-store/noindex headers.
- Confirm public signup is off, both allow-listed recovery paths work, and no Identity link appears in public navigation.
- Confirm a forged or unsigned bearer token gets 401 and a valid Identity token without the second session cannot read or write desk state.
- After Identity, confirm a forgotten phrase can be wiped and a new 12+ character phrase set.
- Confirm the success page says lead received, not a booking, and tells the manager to email once rather than resubmit.
