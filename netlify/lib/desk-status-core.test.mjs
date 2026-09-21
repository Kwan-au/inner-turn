import assert from "node:assert/strict";
import test from "node:test";
import { applyStatus, parseStatusUpdate } from "./desk-status-core.mjs";
import { mapCleanerFile, mapLotPack, mapParty } from "./desk-store.mjs";
import { jsonResponse, requireIdentity } from "./desk-auth.mjs";
import boardHandler from "../functions/desk-board.mjs";
import statusHandler from "../functions/desk-status.mjs";
import stateHandler from "../functions/desk-state.mjs";

test("status update only accepts board tables and LEAD/FILE/LIVE/HOLD/DEAD", () => {
  assert.equal(parseStatusUpdate({ table: "lot_packs", id: "p1", status: "FILE" }).ok, true);
  assert.equal(parseStatusUpdate({ table: "cleaner_files", id: "c1", status: "LEAD" }).listKey, "cleanerFiles");
  assert.equal(parseStatusUpdate({ table: "parties", id: "x1", status: "HOLD" }).table, "parties");
  assert.equal(parseStatusUpdate({ table: "intakes", id: "i1", status: "LEAD" }).error, "table");
  assert.equal(parseStatusUpdate({ table: "lot_packs", id: "p1", status: "BOOKED" }).error, "status");
  assert.equal(parseStatusUpdate({ table: "lot_packs", status: "LIVE" }).error, "id");
});

test("applyStatus changes only the matching row", () => {
  const { found, rows } = applyStatus(
    [{ id: "p1", status: "LEAD" }, { id: "p2", status: "FILE" }],
    "p1",
    "HOLD"
  );
  assert.equal(found, true);
  assert.equal(rows[0].status, "HOLD");
  assert.equal(rows[1].status, "FILE");
  assert.equal(applyStatus([{ id: "p1" }], "missing", "DEAD").found, false);
});

test("store mappers keep source fields and do not invent rates", () => {
  const pack = mapLotPack({
    id: 9,
    contact_name: "Clifton",
    missing_fields: '["access"]',
    executable: false,
    status: "LEAD"
  });
  assert.equal(pack.contactName, "Clifton");
  assert.deepEqual(pack.missingFields, ["access"]);
  assert.equal(pack.executable, false);

  const cleaner = mapCleanerFile({
    id: "c1",
    named_person: "Sharon Rai",
    rate_1bed: 129,
    pay_lock_ok: true,
    status: "LEAD"
  });
  assert.equal(cleaner.namedPerson, "Sharon Rai");
  assert.equal(cleaner.rate1bed, 129);
  assert.equal(cleaner.payLockOk, true);
  assert.equal(mapCleanerFile({ id: "c2", status: "LEAD" }).rate1bed, undefined);

  const party = mapParty({ id: "x1", name: "Flair", lane: "Managers", status: "LEAD" });
  assert.equal(party.contactName, "Flair");
  assert.equal(party.lane, "Managers");
});

test("requireIdentity rejects missing or disallowed tokens", async () => {
  const noToken = await requireIdentity(new Request("https://www.innerturn.com.au/api/desk-board"));
  assert.equal(noToken.ok, false);
  assert.equal(noToken.error, "identity");
  assert.equal(noToken.status, 401);

  const denied = await requireIdentity(
    new Request("https://www.innerturn.com.au/api/desk-board", {
      headers: { Authorization: "Bearer test" }
    }),
    {
      fetchImpl: async () => new Response(JSON.stringify({ email: "stranger@example.com" }), { status: 200 })
    }
  );
  assert.equal(denied.ok, false);

  const allowed = await requireIdentity(
    new Request("https://www.innerturn.com.au/api/desk-board", {
      headers: { Authorization: "Bearer test" }
    }),
    {
      fetchImpl: async () => new Response(JSON.stringify({ email: "desk@innerturn.com.au" }), { status: 200 })
    }
  );
  assert.equal(allowed.ok, true);
  assert.equal(allowed.email, "desk@innerturn.com.au");
});

test("json responses are no-store JSON", () => {
  const res = jsonResponse({ ok: false, error: "identity" }, 401);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Content-Type"), "application/json");
  assert.equal(res.headers.get("Cache-Control"), "no-store, max-age=0");
});

test("board APIs return identity 401 without a bearer token", async () => {
  const board = await boardHandler(new Request("https://www.innerturn.com.au/api/desk-board"));
  const status = await statusHandler(new Request("https://www.innerturn.com.au/api/desk-status", { method: "POST" }));
  const state = await stateHandler(new Request("https://www.innerturn.com.au/api/desk-state"));
  assert.equal(board.status, 401);
  assert.equal(status.status, 401);
  assert.equal(state.status, 401);
  assert.deepEqual(await board.json(), { ok: false, error: "identity" });
});
