import assert from "node:assert/strict";
import test from "node:test";
import {
  answerLine,
  buildDeskBoard,
  buildNextActions,
  daysToGrandFinal
} from "./desk-board-core.mjs";

test("Grand Final countdown uses Melbourne calendar date", () => {
  assert.equal(daysToGrandFinal(new Date("2026-09-21T02:00:00Z")), 5);
  assert.equal(daysToGrandFinal(new Date("2026-09-25T16:00:00Z")), 0);
  assert.equal(daysToGrandFinal(new Date("2026-09-26T14:00:00Z")), -1);
});

test("answer line is pack, then FILE cleaner, then ready", () => {
  assert.equal(answerLine({ executablePacks: 0, fileReady: 0 }), "Need lot pack");
  assert.equal(answerLine({ executablePacks: 0, fileReady: 2 }), "Need lot pack");
  assert.equal(answerLine({ executablePacks: 1, fileReady: 0 }), "Need FILE cleaner");
  assert.equal(answerLine({ executablePacks: 1, fileReady: 1 }), "Ready to book");
});

test("today strip canDispatch needs both an executable pack and a FILE-ready cleaner", () => {
  const empty = buildDeskBoard({}, { now: new Date("2026-09-21T02:00:00Z") });
  assert.equal(empty.today.canDispatch, false);
  assert.equal(empty.today.executablePacks, 0);
  assert.equal(empty.today.fileReady, 0);
  assert.equal(empty.today.answerLine, "Need lot pack");
  assert.equal(empty.today.daysToGrandFinal, 5);

  const ready = buildDeskBoard({
    lotPacks: [{ id: "p1", contactName: "Bedspoke", executable: true, status: "FILE" }],
    cleanerFiles: [{ id: "c1", namedPerson: "Sharon Rai", status: "FILE" }]
  });
  assert.equal(ready.today.canDispatch, true);
  assert.equal(ready.today.answerLine, "Ready to book");
});

test("nextActions come from real gaps only and cap at 5", () => {
  const actions = buildNextActions({
    lotPacks: [
      { id: "p1", contactName: "Bedspoke", executable: false, missingFields: ["suburb", "beds"], status: "LEAD" }
    ],
    cleanerFiles: [
      { id: "c1", namedPerson: "Dean Kleen", status: "LEAD", missingFields: ["written rates", "ABN"] },
      { id: "c2", namedPerson: "EcoQuick", status: "LEAD", missingFields: ["named person"] }
    ],
    parties: [
      { id: "x1", contactName: "Oasis Stay", lane: "Managers", status: "HOLD", note: "chase Tue/Wed" }
    ]
  });
  assert.equal(actions.length <= 5, true);
  assert.equal(actions[0].title, "Bedspoke");
  assert.equal(actions[0].reason, "Incomplete pack: suburb, beds");
  assert.deepEqual(actions[0].missingFields, ["suburb", "beds"]);
  assert.ok(actions.some((row) => row.title === "Dean Kleen"));
  assert.ok(actions.some((row) => row.title === "Oasis Stay" && row.lane === "Managers"));
  assert.ok(!actions.some((row) => String(row.title).includes("Invented")));
});

test("nextActions hard-cap is 5 even when more gaps exist", () => {
  const lotPacks = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`,
    contactName: `Manager ${i}`,
    executable: false,
    missingFields: ["suburb"],
    status: "LEAD"
  }));
  const actions = buildNextActions({ lotPacks, cleanerFiles: [], parties: [] });
  assert.equal(actions.length, 5);
  assert.equal(actions[0].title, "Manager 0");
});

test("LEAD cleaners rank above pack gaps when a pack is already executable", () => {
  const actions = buildNextActions({
    lotPacks: [{ id: "p1", contactName: "Live pack", executable: true, status: "FILE" }],
    cleanerFiles: [{ id: "c1", namedPerson: "Dean Kleen", status: "LEAD", missingFields: ["CoC"] }]
  });
  assert.equal(actions[0].kind, "cleaner");
  assert.equal(actions[0].reason, "LEAD cleaner: CoC");
});

test("empty board does not invent packs, rates, or names", () => {
  const board = buildDeskBoard({ lotPacks: [], cleanerFiles: [], parties: [] });
  assert.deepEqual(board.lotPacks, []);
  assert.deepEqual(board.cleanerFiles, []);
  assert.deepEqual(board.parties, []);
  assert.equal(board.nextActions[0].title, "Need lot pack");
  assert.equal(board.nextActions[1].title, "Need FILE cleaner");
  assert.ok(!JSON.stringify(board).includes("$110"));
});

test("FILE-ready counts FILE and LIVE only", () => {
  const board = buildDeskBoard({
    lotPacks: [{ id: 1, executable: true }],
    cleanerFiles: [
      { id: "a", status: "LEAD" },
      { id: "b", status: "FILE" },
      { id: "c", status: "HOLD" },
      { id: "d", status: "LIVE" },
      { id: "e", status: "DEAD" }
    ]
  });
  assert.equal(board.summary.fileReady, 2);
  assert.equal(board.today.canDispatch, true);
});
