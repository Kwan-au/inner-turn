import test from "node:test";
import assert from "node:assert/strict";
import { loadDeskBoard, loadDeskState, saveBoardList, saveDeskState } from "./desk-store.mjs";
import { applyStatus } from "./desk-status-core.mjs";
import { buildDeskBoard } from "./desk-board-core.mjs";

function memoryStore(seed = {}) {
  const data = { ...seed };
  return {
    getJSON: async (key) => (key in data ? data[key] : null),
    setJSON: async (key, value) => {
      data[key] = value;
    },
    _data: data
  };
}

test("desk-board reads Blobs lists and does not invent rows", async () => {
  const store = memoryStore({
    lot_packs: [{ id: "p1", contactName: "Getaway PM", executable: false, missingFields: ["street"], status: "LEAD" }],
    cleaner_files: [{ id: "c1", namedPerson: "Dean Kleen", status: "LEAD", missingFields: ["ABN"] }],
    parties: [{ id: "x1", contactName: "Ready Set Stay", lane: "Managers", status: "LEAD" }]
  });
  const records = await loadDeskBoard({ store, skipSql: true });
  const board = buildDeskBoard(records, { now: new Date("2026-09-21T02:00:00Z") });
  assert.equal(board.lotPacks.length, 1);
  assert.equal(board.parties[0].lane, "Managers");
  assert.equal(board.today.canDispatch, false);
  assert.equal(board.today.answerLine, "Need lot pack");
  assert.equal(board.nextActions[0].missingFields[0], "street");
});

test("desk-status writes the new status back onto the Blobs list", async () => {
  const store = memoryStore({
    cleaner_files: [{ id: "c1", namedPerson: "Sharon Rai", status: "LEAD" }]
  });
  const records = await loadDeskBoard({ store, skipSql: true });
  const updated = applyStatus(records.cleanerFiles, "c1", "FILE");
  await saveBoardList("cleanerFiles", updated.rows, { store });
  const again = await loadDeskBoard({ store, skipSql: true });
  assert.equal(again.cleanerFiles[0].status, "FILE");
  assert.equal(buildDeskBoard(again).today.fileReady, 1);
});

test("desk-state round-trips pipeline rows", async () => {
  const store = memoryStore();
  const state = await saveDeskState({
    pipe: [{ who: "Bedspoke", kind: "manager", stage: "LEAD" }],
    quota: { day: "2026-09-21", email: 1 }
  }, { store });
  assert.equal(state.pipe[0].who, "Bedspoke");
  const loaded = await loadDeskState({ store });
  assert.equal(loaded.quota.email, 1);
});
