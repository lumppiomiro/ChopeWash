import type { LaundryState, MachineKind, QueueRequest } from "./laundry-store";
import { GRACE_MINUTES, MINUTE, poolFits, slotTimestamp, type BookingRequest } from "./booking-planner.ts";

export const QUEUE_ARRIVAL_MINUTES = 5;

// Shared room cards describe the machine, never imply ownership of its laundry.
export function sharedMachineStatus(status: string, minutes: number) {
  if (status === "running") return `${minutes} min left`;
  if (status === "finished") return "Awaiting collection";
  if (status === "offline") return "Offline";
  return "Available";
}

export type QueuePreview = {
  status: "checking" | "offline" | "collection" | "capacity" | "no-gap";
  earliestAt?: number;
  waitMinutes?: number;
  requestsAhead: number;
};

// Mirrors the server's full-gap requirement (arrival + cycle + collection buffer).
// Other residents' waiting requests are private: this is a capacity lower bound,
// never a fabricated queue-turn ETA. Only the server can issue an actual offer.
export function queuePreview(state: LaundryState, kind: MachineKind, request: QueueRequest, ready: boolean): QueuePreview {
  const machines = state.machines.filter(machine => machine.kind === kind);
  const requestsAhead = Math.max(0, ...machines.map(machine => machine.queueLength));
  const result = (status: QueuePreview["status"]): QueuePreview => ({ status, requestsAhead });
  const now = Date.parse(state.serverTime || "");
  if (!ready || !Number.isFinite(now) || !state.intervals || !machines.length) return result("checking");
  const quantity = request.quantity || 1;
  if (machines.filter(machine => machine.status !== "offline").length < quantity) return result("offline");
  const minutes = (kind === "washer" ? 30 : request.duration || 45) + QUEUE_ARRIVAL_MINUTES + GRACE_MINUTES;
  const fits = (start: number) => poolFits(state, kind, start, start + minutes * MINUTE, quantity);
  const idle = machines.filter(machine => machine.status === "available" && !machine.held).length;
  if (idle >= quantity && fits(now)) return { ...result("capacity"), earliestAt: now, waitMinutes: 0 };
  // Finished cycles have no reliable release time. Their finite ledger buffers
  // must not become a countdown promising that the owner will collect.
  if (machines.some(machine => machine.status === "finished")) return result("collection");
  const relevant = state.intervals.filter(interval => (interval.kind || state.machines.find(machine => machine.id === interval.machineId)?.kind) === kind);
  // An incomplete snapshot must not invent availability for a busy machine.
  if (idle < quantity && !relevant.some(interval => Date.parse(interval.startsAt) <= now && Date.parse(interval.endsAt) > now)) return result("checking");
  const horizon = now + 14 * 24 * 60 * MINUTE;
  const candidates = [...new Set(relevant.map(interval => Date.parse(interval.endsAt)))]
    .filter(time => Number.isFinite(time) && time > now && time < horizon).sort((a, b) => a - b);
  const earliestAt = candidates.find(fits);
  return earliestAt === undefined ? result("no-gap") : { ...result("capacity"), earliestAt, waitMinutes: Math.ceil((earliestAt - now) / MINUTE) };
}

export type PlanStage = { name: string; startsAt: number; endsAt: number; kind: "wash" | "dry" };
export function planTiming(request: BookingRequest) {
  const stages: PlanStage[] = [];
  const append = (name: string, date: string, time: string, duration: number, kind: PlanStage["kind"]) => {
    const startsAt = slotTimestamp(date, time);
    stages.push({ name, startsAt, endsAt: startsAt + duration * MINUTE, kind });
  };
  if (request.kind !== "dry") {
    append(request.washerCount === 2 && !request.secondWasherTime ? "2 washers together" : "Wash", request.dateIso, request.startTime, 30, "wash");
    if (request.washerCount === 2 && request.secondWasherTime) append("Second wash", request.secondWasherDateIso || request.dateIso, request.secondWasherTime, 30, "wash");
  }
  if (request.kind !== "wash") append(request.dryerCount === 2 ? "2 dryers together" : "Dry", request.kind === "both" ? request.dryerDateIso || "" : request.dateIso,
    request.kind === "both" ? request.dryerTime || "" : request.startTime, request.kind === "both" ? request.dryerDuration || 45 : request.duration, "dry");
  if (!stages.length || stages.some(stage => !Number.isFinite(stage.startsAt) || !Number.isFinite(stage.endsAt))) return null;
  stages.sort((a, b) => a.startsAt - b.startsAt);
  const startsAt = Math.min(...stages.map(stage => stage.startsAt));
  const finishesAt = Math.max(...stages.map(stage => stage.endsAt));
  const washEnds = Math.max(...stages.filter(stage => stage.kind === "wash").map(stage => stage.endsAt));
  const dryStart = stages.find(stage => stage.kind === "dry")?.startsAt;
  return { stages, startsAt, finishesAt, allowUntil: finishesAt + GRACE_MINUTES * MINUTE,
    elapsedMinutes: (finishesAt - startsAt) / MINUTE,
    transferMinutes: dryStart === undefined || !Number.isFinite(washEnds) ? 0 : (dryStart - washEnds) / MINUTE };
}

export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : "", remainder ? `${remainder} min` : ""].filter(Boolean).join(" ") || "0 min";
}
