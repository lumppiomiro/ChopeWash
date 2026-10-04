import assert from "node:assert/strict";
import { bookingSlots, slotTimestamp, suggestDryer, validateBooking, singaporeDate, addDateDays } from "../src/lib/booking-planner.ts";
const state = {
 serverTime: "2026-10-04T00:00:00+08:00",
 machines: [{ id: "washer-book", status: "available" }, { id: "dryer-book", status: "available" }],
 intervals: [], bookings: [], queueEntries: [],
};
assert.equal(singaporeDate("2026-10-03T23:30:00Z"), "2026-10-04");
assert.equal(addDateDays("2026-10-31", 1), "2026-11-01");
assert.equal(bookingSlots(state, "2026-10-04", "washer-book", 30).length, 96);
assert.equal(suggestDryer(state, slotTimestamp("2026-10-04", "10:00"), 45).time, "10:45");
state.intervals = [{ machineId: "dryer-book", startsAt: "2026-10-04T10:30:00+08:00", endsAt: "2026-10-04T11:30:00+08:00" }];
assert.equal(suggestDryer(state, slotTimestamp("2026-10-04", "10:00"), 45).time, "11:30");
assert.equal(bookingSlots(state, "2026-10-04", "washer-book", 30).find(slot => slot.time === "10:00").available, true);
const plan = { kind: "both", dateIso: "2026-10-04", startTime: "10:00", duration: 30, dryerDateIso: "2026-10-04", dryerTime: "11:30", dryerDuration: 60 };
assert.equal(validateBooking(state, plan), null);
assert.match(validateBooking(state, { ...plan, duration: 45 }), /always 30/);
assert.match(validateBooking(state, { ...plan, dryerTime: "10:30" }), /dryer slot/);
state.intervals = [];
assert.deepEqual(suggestDryer(state, slotTimestamp("2026-10-04", "23:30"), 45), { dateIso: "2026-10-05", time: "00:15", startsAt: slotTimestamp("2026-10-05", "00:15") });
assert.equal(suggestDryer(state, slotTimestamp("2026-10-17", "23:30"), 45), null);
state.machines[1].status = "offline";
assert.equal(suggestDryer(state, slotTimestamp("2026-10-04", "10:00"), 45), null);
console.log("PASS: 15-minute slots, shared availability, fixed wash, editable dryer, midnight, month boundaries and horizon.");
