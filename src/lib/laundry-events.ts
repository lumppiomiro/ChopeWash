import type { LaundryState } from "./laundry-store";
import { isActiveQueue, queueTarget } from "./queue-state";

export type LaundryEvent = {
  id: string;
  title: string;
  detail: string;
  label: string;
  target: number;
  action: "booking" | "queue" | "check-in";
  bookingId?: string;
  active: boolean;
  progress?: number;
};

const MINUTE = 60_000;

export function countdown(target: number, now: number) {
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`;
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function getLaundryEvents(state: LaundryState, now: number): LaundryEvent[] {
  const events: LaundryEvent[] = [];
  for (const booking of state.bookings) {
    if (!["confirmed", "checked-in"].includes(booking.status)) continue;
    // RC4 reservations always use Singapore time, regardless of the viewer's timezone.
    const starts = Date.parse(`${booking.dateIso}T${booking.startTime}:00+08:00`);
    if (!Number.isFinite(starts)) continue;
    const stage = state.bookings.filter(b => b.pairId === booking.pairId && b.kind === booking.kind && b.dateIso === booking.dateIso && b.startTime === booking.startTime && b.status === booking.status && b.startedAt === booking.startedAt);
    if (booking.pairId && stage[0]?.id !== booking.id) continue;
    const title = stage.length > 1 ? stage.every(b=>b.machineName) ? stage.map(b=>b.machineName).join(" + ") : `${stage.length} ${booking.kind === "dry" ? "dryers" : "washers"} together` : booking.machineName || (booking.kind === "dry" ? "Dryer pool" : "Washer pool");
    const detail = `${booking.dateLabel} · ${booking.startTime} · ${booking.duration} min${booking.dryerTime ? ` · Dryer at ${booking.dryerTime}` : ""}`;
    const base = { id: booking.id, title, detail, bookingId: booking.id };
    if (booking.status === "checked-in") {
      const start = booking.startedAt ? Date.parse(booking.startedAt) : starts;
      if (!Number.isFinite(start)) continue;
      const ends = start + booking.duration * MINUTE;
      events.push({ ...base, label: ends > now ? `${booking.kind === "dry" ? "Drying" : "Washing"} finishes in` : "Cycle finished · collect your laundry", target: ends, action: "booking", active: true, progress: Math.max(0, Math.min(100, (now - start) / (ends - start) * 100)) });
    } else if (now <= starts + 15 * MINUTE) {
      const due = starts <= now;
      events.push({ ...base, label: due ? "Your slot is ready · check in within" : "Your booking starts in", target: due ? starts + 15 * MINUTE : starts, action: due ? "check-in" : "booking", active: due });
    }
  }
  for (const entry of state.queueEntries) {
    if (!isActiveQueue(entry)) continue;
    const machine = state.machines.find((item) => entry.machineIds?.includes(item.id) || item.kind === entry.kind);
    const target = queueTarget(entry, machine);
    const hasEstimate = Number.isFinite(target);
    const offered = entry.status === "offered";
    const claimed = entry.status === "claimed";
    events.push({ id: entry.id, title: `${entry.machineIds?.map(id=>state.machines.find(m=>m.id===id)?.name || id).join(" + ") || `${entry.quantity || 1} ${entry.kind}(s)`}${claimed ? "" : ` · Queue #${entry.position}`}`, detail: claimed ? "Your cycle · see your queue status" : offered ? "Head downstairs and check in to claim your machine" : `${Math.max(0, entry.position - 1)} ahead of you · wait times may change`, label: offered ? "Your machine is ready · claim within" : claimed ? target > now ? "Your cycle finishes in" : "Cycle finished · collect your laundry" : target > now ? "Earliest possible capacity in" : "Waiting for a complete cycle gap", target: hasEstimate ? target : now, action: "queue", active: offered || claimed, progress: claimed && target <= now ? 100 : undefined });
  }
  return events.sort((a, b) => Number(b.active) - Number(a.active) || a.target - b.target);
}
