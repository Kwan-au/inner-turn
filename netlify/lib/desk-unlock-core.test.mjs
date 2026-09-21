import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { allowedEmail, hashUnlockPhrase, requireIdentity } from "./desk-auth.mjs";
import {
  FAIL_LIMIT,
  SESSION_PREFIX,
  UNLOCK_KEY,
  handleDeskUnlock
} from "./desk-unlock-core.mjs";

const EMAIL = "desk@innerturn.com.au";
const PHRASE = "first-unlock-12";
const NEXT = "second-unlock12";

function memoryStore() {
  const map = new Map();
  return {
    async getJSON(key) {
      return map.has(key) ? JSON.parse(map.get(key)) : null;
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async list(prefix) {
      return [...map.keys()].filter((key) => key.startsWith(prefix));
    },
    map
  };
}

function call(store, extra = {}) {
  return handleDeskUnlock({
    email: EMAIL,
    ip: "203.0.113.10",
    store,
    now: 1_700_000_000_000,
    ...extra
  });
}

function expectedHash(email, phrase) {
  return createHash("sha256").update(`${email}\n${phrase}`, "utf8").digest("hex");
}

test("hash is sha256(email + newline + phrase) and never the phrase", () => {
  const hash = hashUnlockPhrase(EMAIL, PHRASE);
  assert.equal(hash, expectedHash(EMAIL, PHRASE));
  assert.notEqual(hash, PHRASE);
  assert.equal(hash.length, 64);
  assert.ok(allowedEmail(EMAIL));
  assert.ok(allowedEmail("kwan.ajak87@gmail.com"));
  assert.equal(allowedEmail("stranger@example.com"), false);
});

test("GET without identity is rejected by requireIdentity", async () => {
  const ident = await requireIdentity(new Request("https://innerturn.com.au/api/desk-unlock"));
  assert.equal(ident.ok, false);
  assert.equal(ident.error, "identity");
});

test("set then unlock, wipe returns set-mode, then a new phrase works", async () => {
  const store = memoryStore();

  const unset = await call(store, { method: "GET" });
  assert.deepEqual(unset.body, { ok: true, set: false, unlocked: false });

  const created = await call(store, { method: "POST", body: { action: "set", phrase: PHRASE } });
  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);
  assert.ok(created.body.token);
  assert.equal(JSON.stringify(created.body).includes(PHRASE), false);
  assert.equal((await store.getJSON(UNLOCK_KEY)).hash, expectedHash(EMAIL, PHRASE));

  const unlocked = await call(store, {
    method: "GET",
    sessionToken: created.body.token
  });
  assert.equal(unlocked.body.unlocked, true);

  const wiped = await call(store, { method: "POST", body: { action: "wipe" } });
  assert.equal(wiped.status, 200);
  assert.deepEqual(wiped.body, { ok: true, set: false });
  assert.equal(await store.getJSON(UNLOCK_KEY), null);
  assert.equal((await store.list(SESSION_PREFIX)).length, 0);

  const status = await call(store, { method: "GET", sessionToken: created.body.token });
  assert.deepEqual(status.body, { ok: true, set: false, unlocked: false });

  const again = await call(store, { method: "POST", body: { action: "set", phrase: NEXT } });
  assert.equal(again.body.ok, true);
  assert.equal((await store.getJSON(UNLOCK_KEY)).hash, expectedHash(EMAIL, NEXT));

  const old = await call(store, { method: "POST", body: { action: "unlock", phrase: PHRASE } });
  assert.equal(old.body.ok, false);
  const fresh = await call(store, { method: "POST", body: { action: "unlock", phrase: NEXT } });
  assert.equal(fresh.body.ok, true);
});

test("change replaces the hash when the current phrase is known", async () => {
  const store = memoryStore();
  await call(store, { method: "POST", body: { action: "set", phrase: PHRASE } });

  const wrong = await call(store, {
    method: "POST",
    body: { action: "change", phrase: "not-the-phrase-12", next: NEXT }
  });
  assert.equal(wrong.body.ok, false);

  const changed = await call(store, {
    method: "POST",
    body: { action: "change", phrase: PHRASE, next: NEXT }
  });
  assert.equal(changed.body.ok, true);
  assert.equal((await store.getJSON(UNLOCK_KEY)).hash, expectedHash(EMAIL, NEXT));

  const stale = await call(store, { method: "POST", body: { action: "unlock", phrase: PHRASE } });
  assert.equal(stale.body.ok, false);
});

test("eight failed unlocks lock the client for 15 minutes", async () => {
  const store = memoryStore();
  await call(store, { method: "POST", body: { action: "set", phrase: PHRASE } });
  let last;
  for (let i = 0; i < FAIL_LIMIT; i += 1) {
    last = await call(store, {
      method: "POST",
      body: { action: "unlock", phrase: "wrong-phrase-12" }
    });
  }
  assert.equal(last.status, 429);
  assert.equal(last.body.error, "locked");
  const still = await call(store, { method: "POST", body: { action: "unlock", phrase: PHRASE } });
  assert.equal(still.body.error, "locked");
});

test("wipe is allowed without the current phrase", async () => {
  const store = memoryStore();
  await call(store, { method: "POST", body: { action: "set", phrase: PHRASE } });
  const wiped = await call(store, { method: "POST", body: { action: "wipe" } });
  assert.equal(wiped.body.set, false);
  assert.equal(JSON.stringify(wiped).includes(PHRASE), false);
});

test("responses never echo the phrase", async () => {
  const store = memoryStore();
  const secret = "do-not-leak-me-12";
  const created = await call(store, { method: "POST", body: { action: "set", phrase: secret } });
  const failed = await call(store, { method: "POST", body: { action: "unlock", phrase: "xxxxxxxxxxxxxxxx" } });
  const dumped = JSON.stringify({ created, failed, blob: [...store.map.entries()] });
  assert.equal(dumped.includes(secret), false);
});
