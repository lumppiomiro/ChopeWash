import type { LaundryState } from "./laundry-store";

export type NoticeGroup = "bookings" | "queue" | "cycles";
export type LaundryNotice = {
  id: string; title: string; body: string; time: number;
  group: NoticeGroup; view: "bookings" | "queue"; urgent?: boolean; read?: boolean;
};

const MINUTE = 60_000;
export function notificationEvents(state: LaundryState, now: number): LaundryNotice[] {
  const events: LaundryNotice[] = [];
  const cycle = (id: string, title: string, ends: number, view: LaundryNotice["view"], started?: number) => {
    if (!Number.isFinite(ends)) return;
    if (now >= ends) events.push({ id: `${id}:finished`, title: "Your laundry is ready", body: `${title} has finished. Head downstairs to collect your laundry.`, time: ends, group: "cycles", view, urgent: true });
    else if (ends - now <= 5 * MINUTE) events.push({ id: `${id}:finishing`, title: "Your cycle is nearly done", body: `${title} finishes in about ${Math.ceil((ends - now) / MINUTE)} minutes. Plan to collect it soon.`, time: ends - 5 * MINUTE, group: "cycles", view });
    else events.push({ id: `${id}:started`, title: "Your cycle has started", body: `${title} is running. Follow the remaining time on Home.`, time: started ?? now, group: "cycles", view });
  };
  for (const booking of state.bookings) {
    if (booking.status === "complete" || booking.status === "cancelled") continue;
    const starts = Date.parse(`${booking.dateIso}T${booking.startTime}:00+08:00`);
    if (!Number.isFinite(starts)) continue;
    const machine = booking.machineName || (booking.kind === "dry" ? "Dryer pool" : "Washer pool");
    if (booking.status === "checked-in") {
      const started = Date.parse(booking.startedAt ?? new Date(starts).toISOString());
      cycle(booking.id, machine, started + booking.duration * MINUTE, "bookings", started);
      continue;
    }
    const base = { group: "bookings" as const, view: "bookings" as const };
    if (now >= starts + 15 * MINUTE) events.push({ ...base, id: `${booking.id}:missed`, title: "Your check-in window ended", body: `${machine} at ${booking.startTime} wasn’t checked in. Choose another slot when you’re ready.`, time: starts + 15 * MINUTE });
    else if (now >= starts + 13 * MINUTE) events.push({ ...base, id: `${booking.id}:last-call`, title: "Check in before your slot expires", body: `About ${Math.ceil((starts + 15 * MINUTE - now) / MINUTE)} minutes left to check in for ${machine}.`, time: starts + 13 * MINUTE, urgent: true });
    else if (now >= starts) events.push({ ...base, id: `${booking.id}:ready`, title: "Your booking starts now", body: `${machine} is reserved for you. Head downstairs and check in within 15 minutes.`, time: starts, urgent: true });
    else if (starts - now <= 10 * MINUTE) events.push({ ...base, id: `${booking.id}:soon`, title: "Your booking is coming up", body: `${machine} starts at ${booking.startTime}. Get your laundry ready.`, time: starts - 10 * MINUTE });
    else events.push({ ...base, id: `${booking.id}:confirmed`, title: "Your laundry time is booked", body: `${machine} · ${booking.dateLabel} at ${booking.startTime}${booking.dryerTime ? ` · Dryer at ${booking.dryerTime}` : ""}.`, time: booking.createdAt ? Date.parse(booking.createdAt) : now });
  }
  for (const entry of state.queueEntries) {
    const machine = state.machines.find((item) => entry.machineIds?.includes(item.id) || item.kind === entry.kind);
    const name = entry.machineIds?.map(id=>state.machines.find(m=>m.id===id)?.name || id).join(" + ") || `${entry.quantity || 1} ${entry.kind}(s)`;
    const base = { group: "queue" as const, view: "queue" as const };
    if (entry.status === "claimed") { if (entry.cycleEndsAt) cycle(entry.id, name, Date.parse(entry.cycleEndsAt), "queue", entry.startedAt ? Date.parse(entry.startedAt) : undefined); continue; }
    if (entry.status === "expired") events.push({ ...base, id: `${entry.id}:expired`, title: "Your claim window ended", body: `${name} wasn’t claimed in time. Join the queue again when you’re ready.`, time: Date.parse(entry.offerExpiresAt ?? entry.joinedAt) });
    else if (entry.status === "offered") {
      const expires = Date.parse(entry.offerExpiresAt ?? entry.joinedAt);
      if (expires <= now) events.push({ ...base, id: `${entry.id}:expired`, title: "Your claim window ended", body: `Your offer for ${name} has ended. Check the queue for your next option.`, time: expires });
      else if (expires - now <= MINUTE) events.push({ ...base, id: `${entry.id}:last-call`, title: "One minute left to claim your machine", body: `${name} is waiting for you. Check in downstairs before your offer expires.`, time: expires - MINUTE, urgent: true });
      else events.push({ ...base, id: `${entry.id}:ready`, title: "It’s your turn", body: `${name} is ready. Head downstairs and check in before the five-minute claim window ends.`, time: expires - 5 * MINUTE, urgent: true });
    } else if (state.machines.filter(m=>m.kind===entry.kind).every(m=>m.status==="offline")) events.push({ ...base, id: `${entry.id}:offline`, title: "Your queue machine is unavailable", body: `${name} is out of service. Check your queue or leave and choose another option.`, time: now, urgent: true });
    else if (entry.position === 1 && machine?.status === "running" && machine.minutesLeft <= 5 && (entry.quantity || 1) === 1) events.push({ ...base, id: `${entry.id}:next`, title: "You’re next in line", body: `${name} is nearly done. Get ready, but wait for your machine-ready alert before checking in.`, time: now });
    else events.push({ ...base, id: `${entry.id}:joined`, title: "You’re in the queue", body: `${name} · you’re #${entry.position}. Follow pool availability in Queue; wait times are not guaranteed.`, time: Date.parse(entry.joinedAt) });
  }
  return events.filter((event) => Number.isFinite(event.time));
}
