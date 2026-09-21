# Minimal wipe insert (preferred if the live function already exists)

In the live `POST` handler, after Identity allow-list checks and JSON parse, handle `wipe` **before** phrase verification. Do not log `phrase`. Blobs key remains `unlock` (`{ hash }`).

```js
if (action === "wipe") {
  await store.delete("unlock");
  // If sessions are stored as separate keys, delete those too so an old
  // X-Desk-Session cannot keep the desk open after a forgotten-phrase reset.
  return json({ ok: true, set: false }, 200);
}
```

Client: allow-listed Identity only; body is `{ "action": "wipe" }` (no phrase). GET afterwards must return `set: false` so the login form switches to set-new-phrase mode.
