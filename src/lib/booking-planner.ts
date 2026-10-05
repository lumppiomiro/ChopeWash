import type { LaundryState } from "./laundry-store";

export type CycleDuration = 30 | 45 | 60;
export type BookingRequest = {
  kind: "wash" | "dry" | "both";
  dateIso: string;
  startTime: string;
  duration: CycleDuration;
  washerCount?: 1 | 2;
  dryerCount?: 1 | 2;
  secondWasherDateIso?: string;
  secondWasherTime?: string;
  dryerDateIso?: string;
  dryerTime?: string;
  dryerDuration?: CycleDuration;
};
export type Slot = { time: string; startsAt: number; available: boolean; reason: string };
export const MINUTE = 60_000;
export const WASH_MINUTES = 30;
export const GRACE_MINUTES = 15;
export function singaporeDate(time: number | string) {
  const parts = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(time));
  const part = (name: string) => parts.find(value => value.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addDateDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
export function slotTimestamp(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(time)) return NaN;
  const timestamp = Date.parse(`${date}T${time}:00+08:00`);
  return Number.isFinite(timestamp) && singaporeDate(timestamp) === date ? timestamp : NaN;
}
export function singaporeTime(time: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(time);
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`));
}
export function poolFits(state: LaundryState, kind: "washer" | "dryer", startsAt: number, endsAt: number, quantity = 1, extra: { kind: "washer" | "dryer"; startsAt: number; endsAt: number; quantity: number }[] = []) {
  const capacity = state.machines.filter(m => m.kind === kind && m.status !== "offline").length;
  const intervals = [...(state.intervals || []).map(i => ({ kind: i.kind || state.machines.find(m => m.id === i.machineId)?.kind, startsAt: Date.parse(i.startsAt), endsAt: Date.parse(i.endsAt), quantity: i.quantity || 1 })), ...extra].filter(i => i.kind === kind && i.startsAt < endsAt && i.endsAt > startsAt);
  const boundaries = [startsAt, ...intervals.filter(i => i.startsAt >= startsAt).map(i => i.startsAt)];
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt > startsAt && quantity > 0 && boundaries.every(t => quantity + intervals.filter(i => i.startsAt <= t && i.endsAt > t).reduce((sum,i) => sum+i.quantity,0) <= capacity);
}
export function bookingSlots(state: LaundryState, date: string, machineId: string, duration: CycleDuration, earliest = 0, quantity = 1): Slot[] {
  const now = Date.parse(state.serverTime ?? "");
  const today = Number.isFinite(now) ? singaporeDate(now) : "";
  const kind = machineId.startsWith("dryer") ? "dryer" : "washer";
  const machines = state.machines.filter(item => item.kind === kind);
  return Array.from({ length: 96 }, (_, index) => {
    const time = `${String(Math.floor(index / 4)).padStart(2, "0")}:${String(index % 4 * 15).padStart(2, "0")}`;
    const startsAt = slotTimestamp(date, time);
    const endsAt = startsAt + (duration + GRACE_MINUTES) * MINUTE;
    let reason = "";
    if (!Number.isFinite(now) || !state.intervals || !machines.length) reason = "Connecting";
    else if (!Number.isFinite(startsAt) || date < today || date > addDateDays(today, 13)) reason = "Outside booking window";
    else if (startsAt <= now) reason = "Past";
    else if (startsAt < earliest) reason = "Before wash finishes";
    else if (machines.every(machine => machine.status === "offline")) reason = "Offline";
    else if (!poolFits(state, kind, startsAt, endsAt, quantity)) reason = "Booked";
    return { time, startsAt, available: !reason, reason };
  });
}
export function suggestDryer(state: LaundryState, washStart: number, duration: CycleDuration, quantity = 1) {
  if (!Number.isFinite(washStart) || !state.serverTime) return null;
  const earliest = washStart + (WASH_MINUTES + GRACE_MINUTES) * MINUTE;
  const lastDate = addDateDays(singaporeDate(state.serverTime), 13);
  for (let date = singaporeDate(earliest); date <= lastDate; date = addDateDays(date, 1)) {
    const slot = bookingSlots(state, date, "dryer-book", duration, earliest, quantity).find(item => item.available);
    if (slot) return { dateIso: date, time: slot.time, startsAt: slot.startsAt };
  }
  return null;
}
export function validateBooking(state: LaundryState, request: BookingRequest) {
  if (![1,2].includes(request.washerCount || 1) || ![1,2].includes(request.dryerCount || 1)) return "Choose one or two machines.";
  if (request.washerCount === 2 && request.secondWasherDateIso && !request.secondWasherTime) return "Choose the second washer start time.";
  if (request.kind !== "dry" && request.duration !== WASH_MINUTES) return "Washing cycles are always 30 minutes.";
  const primary = bookingSlots(state, request.dateIso, request.kind === "dry" ? "dryer-book" : "washer-book", request.duration, 0, request.kind === "dry" ? request.dryerCount || 1 : request.secondWasherTime ? 1 : request.washerCount || 1).find(slot => slot.time === request.startTime);
  if (!primary?.available) return "Choose an available start time.";
  const secondStart = request.secondWasherTime ? slotTimestamp(request.secondWasherDateIso || request.dateIso, request.secondWasherTime) : primary.startsAt;
  if (request.kind !== "dry" && request.washerCount === 2 && request.secondWasherTime) {
    const second = bookingSlots(state, request.secondWasherDateIso || request.dateIso, "washer-book", 30).find(slot => slot.time === request.secondWasherTime);
    if (!second?.available || !poolFits(state, "washer", secondStart, secondStart + 45 * MINUTE, 1, [{kind:"washer",startsAt:primary.startsAt,endsAt:primary.startsAt+45*MINUTE,quantity:1}])) return "Choose two washer starts that both fit the shared pool.";
  }
  if (request.kind === "both") {
    if (!request.dryerDateIso || !request.dryerTime || !request.dryerDuration) return "Choose your dryer time and cycle length.";
    const dryer = bookingSlots(state, request.dryerDateIso, "dryer-book", request.dryerDuration, Math.max(primary.startsAt, secondStart) + 45 * MINUTE, request.dryerCount || 1).find(slot => slot.time === request.dryerTime);
    if (!dryer?.available) return "Choose an available dryer slot after washing and the 15-minute buffer.";
  }
  return null;
}
