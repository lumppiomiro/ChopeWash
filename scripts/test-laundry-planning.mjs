import assert from "node:assert/strict";
import test from "node:test";
import { sharedMachineStatus, queuePreview, planTiming, durationLabel } from "../src/lib/laundry-planning.ts";
import { MINUTE, slotTimestamp, singaporeDate, singaporeTime } from "../src/lib/booking-planner.ts";

const now = "2026-11-03T13:00:00+08:00";
const machine = (id, kind = "washer", patch = {}) => ({ id, name: id, kind, mode: "pool", status: "available", minutesLeft: 0, queueLength: 0, ...patch });
const state = (patch = {}) => ({ schemaVersion: 3, serverTime: now, machines: [machine("w1"), machine("w2"), machine("d1", "dryer"), machine("d2", "dryer")], intervals: [], bookings: [], queueEntries: [], ...patch });
const interval = (start, end, quantity = 1, kind = "washer") => ({ kind, quantity, startsAt: `2026-11-03T${start}:00+08:00`, endsAt: `2026-11-03T${end}:00+08:00` });
const both = { kind: "both", dateIso: "2026-11-03", startTime: "13:00", duration: 30, dryerDateIso: "2026-11-03", dryerTime: "13:45", dryerDuration: 45 };

test("Shared status describes finished machines without claiming ownership", () => {
  assert.equal(sharedMachineStatus("finished", 0), "Awaiting collection");
  assert.equal(sharedMachineStatus("running", 12), "12 min left");
  assert.equal(sharedMachineStatus("offline", 0), "Offline");
  assert.equal(sharedMachineStatus("available", 0), "Available");
});
test("Free capacity can fit one or two washers now", () => {
  assert.equal(queuePreview(state(), "washer", { quantity: 1 }, true).waitMinutes, 0);
  assert.equal(queuePreview(state(), "washer", { quantity: 2 }, true).waitMinutes, 0);
});
test("Future bookings require an entire arrival/cycle/buffer gap", () => {
  const snapshot = state({ intervals: [interval("13:45", "14:30", 2)] });
  assert.equal(queuePreview(snapshot, "washer", {}, true).waitMinutes, 90); // 45 free minutes cannot fit 5+30+15.
});
test("Two-machine selection waits until both machines fit", () => {
  const snapshot = state({ intervals: [interval("13:00", "13:45", 1)], machines: [machine("w1", "washer", { status: "running" }), machine("w2")] });
  assert.equal(queuePreview(snapshot, "washer", { quantity: 1 }, true).waitMinutes, 0);
  assert.equal(queuePreview(snapshot, "washer", { quantity: 2 }, true).waitMinutes, 45);
});
test("Dryer preview changes with the selected cycle length", () => {
  const snapshot = state({ intervals: [interval("13:55", "15:00", 2, "dryer")] });
  assert.equal(queuePreview(snapshot, "dryer", { duration: 30 }, true).waitMinutes, 0);
  assert.equal(queuePreview(snapshot, "dryer", { duration: 45 }, true).waitMinutes, 120);
  assert.equal(queuePreview(snapshot, "dryer", { duration: 60 }, true).waitMinutes, 120);
});
test("Finished machines do not generate a false collection countdown", () => {
  const snapshot = state({ machines: [machine("w1", "washer", { status: "finished", queueLength: 2 })], intervals: [interval("12:00", "13:15")] });
  const preview = queuePreview(snapshot, "washer", {}, true);
  assert.equal(preview.status, "collection");
  assert.equal(preview.earliestAt, undefined);
  assert.equal(preview.waitMinutes, undefined);
  assert.equal(preview.requestsAhead, 2);
});
test("An idle machine can fit even if another awaits collection", () => {
  const snapshot = state({ machines: [machine("w1", "washer", { status: "finished" }), machine("w2")], intervals: [interval("12:00", "13:15")] });
  assert.equal(queuePreview(snapshot, "washer", { quantity: 1 }, true).waitMinutes, 0);
  assert.equal(queuePreview(snapshot, "washer", { quantity: 2 }, true).status, "collection");
});
test("Stale, absent or invalid snapshots never suggest live capacity", () => {
  for (const snapshot of [state({ serverTime: "invalid" }), state({ intervals: undefined }), state({ machines: [] })]) {
    assert.equal(queuePreview(snapshot, "washer", {}, true).status, "checking");
  }
  assert.equal(queuePreview(state(), "washer", {}, false).status, "checking");
  assert.equal(queuePreview(state({ machines: [machine("w1", "washer", { status: "running" })] }), "washer", {}, true).status, "checking");
});
test("Offline machines cannot satisfy a two-machine request", () => {
  assert.equal(queuePreview(state({ machines: [machine("w1"), machine("w2", "washer", { status: "offline" })] }), "washer", { quantity: 2 }, true).status, "offline");
});
test("A held machine is not treated as idle", () => {
  assert.equal(queuePreview(state({ machines: [machine("w1", "washer", { held: true })], intervals: [interval("13:00", "13:50")] }), "washer", {}, true).waitMinutes, 50);
});
test("Existing queue counts stay separate from a capacity lower bound", () => {
  const preview = queuePreview(state({ machines: [machine("w1", "washer", { queueLength: 7 }), machine("w2", "washer", { queueLength: 7 })] }), "washer", {}, true);
  assert.equal(preview.requestsAhead, 7); // Shared pool count must not be summed once per machine.
  assert.equal(preview.waitMinutes, 0); // Never invent seven waiting users' private durations.
});
test("No complete gap within the 14-day horizon has no invented ETA", () => {
  const snapshot = state({ intervals: [{ kind: "washer", quantity: 2, startsAt: now, endsAt: "2026-11-20T13:00:00+08:00" }] });
  assert.equal(queuePreview(snapshot, "washer", {}, true).status, "no-gap");
});
test("Legacy machine-labelled intervals are included in previews", () => {
  const snapshot = state({ intervals: [{ machineId: "w1", startsAt: now, endsAt: "2026-11-03T13:45:00+08:00" }] });
  assert.equal(queuePreview(snapshot, "washer", { quantity: 2 }, true).waitMinutes, 45);
});
test("Whole wash/dry plan includes transfer time and late-check-in allowance", () => {
  const timing = planTiming(both);
  assert.equal(singaporeTime(timing.finishesAt), "14:30");
  assert.equal(singaporeTime(timing.allowUntil), "14:45");
  assert.equal(timing.elapsedMinutes, 90);
  assert.equal(timing.transferMinutes, 15);
  assert.deepEqual(timing.stages.map(stage => stage.kind), ["wash", "dry"]);
});
test("Wash-only and dry-only totals use the correct cycles", () => {
  const wash = planTiming({ kind: "wash", dateIso: both.dateIso, startTime: "13:00", duration: 30 });
  const dry = planTiming({ kind: "dry", dateIso: both.dateIso, startTime: "13:00", duration: 60, dryerCount: 2 });
  assert.equal(wash.elapsedMinutes, 30);
  assert.equal(dry.elapsedMinutes, 60);
  assert.equal(dry.stages[0].name, "2 dryers together");
});
test("Simultaneous loads do not double elapsed time", () => {
  assert.equal(planTiming({ ...both, washerCount: 2, dryerCount: 2 }).elapsedMinutes, 90);
});
test("Staggered and out-of-order washers use earliest start and latest finish", () => {
  const timing = planTiming({ ...both, startTime: "14:00", washerCount: 2, secondWasherTime: "13:00", dryerTime: "15:00" });
  assert.equal(timing.startsAt, slotTimestamp(both.dateIso, "13:00"));
  assert.equal(timing.elapsedMinutes, 165);
  assert.equal(timing.transferMinutes, 30);
});
test("Cross-midnight plans show the correct finish date", () => {
  const timing = planTiming({ ...both, startTime: "23:30", dryerDateIso: "2026-11-04", dryerTime: "00:15", dryerDuration: 60 });
  assert.equal(singaporeDate(timing.finishesAt), "2026-11-04");
  assert.equal(singaporeTime(timing.finishesAt), "01:15");
  assert.equal(timing.elapsedMinutes, 105);
});
test("Late-check-in allowance can cross into the next day", () => {
  const timing = planTiming({ kind: "dry", dateIso: both.dateIso, startTime: "23:15", duration: 45 });
  assert.equal(timing.allowUntil - timing.finishesAt, 15 * MINUTE);
  assert.equal(singaporeDate(timing.allowUntil), "2026-11-04");
});
test("Incomplete plan selections do not render invalid totals", () => {
  assert.equal(planTiming({ ...both, startTime: "" }), null);
  assert.equal(planTiming({ ...both, dryerTime: "" }), null);
  assert.equal(planTiming({ ...both, washerCount: 2, secondWasherTime: "bogus" }), null);
});
test("Student-facing elapsed time is readable", () => {
  assert.equal(durationLabel(90), "1h 30 min");
  assert.equal(durationLabel(60), "1h");
  assert.equal(durationLabel(30), "30 min");
});
