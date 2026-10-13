import type { Booking, Machine, QueueEntry } from "./laundry-store";

export type LaundryCalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description: string;
};

const location = "RC4 laundry room";
const appUrl = "https://chope-wash.vercel.app/?view=bookings";

export function bookingCalendarEvents(bookings: Booking[], queuedWash?: QueueEntry, machines: Machine[] = []): LaundryCalendarEvent[] {
  const events: LaundryCalendarEvent[] = [];
  const append = (id: string, label: string, start: string, duration: number, checkedIn: boolean) => {
    const timestamp = Date.parse(start);
    if (!Number.isFinite(timestamp) || ![30, 45, 60].includes(duration)) return;
    events.push({
      id, title: `ChopeWash · ${label}`,
      startsAt: new Date(timestamp).toISOString(),
      endsAt: new Date(timestamp + duration * 60_000).toISOString(),
      description: `${duration}-minute laundry cycle at RC4. ${checkedIn ? "Time is based on your actual check-in." : "Check in within 15 minutes of the reserved start. The actual cycle starts at check-in; the machine is assigned then."}\nCollect your laundry when the cycle finishes.\nCalendar copies do not update automatically. Check ChopeWash for changes or cancellations.\n${appUrl}`,
    });
  };
  const counts = { wash: 0, dry: 0 };
  for (const booking of bookings) {
    if (booking.status === "cancelled" || booking.status === "missed") continue;
    const kind = booking.kind === "dry" ? "dry" : "wash";
    counts[kind]++;
    append(`booking-${booking.id}`, booking.machineName || `${kind === "dry" ? "Dryer" : "Washer"} ${counts[kind]} (assigned at check-in)`,
      booking.startedAt || `${booking.dateIso}T${booking.startTime}:00+08:00`, booking.duration, !!booking.startedAt);
  }
  // A claimed queue washing stage can share its plan ID with reserved dryers.
  // Waiting/offered estimates are not reservations and must never be exported.
  if (queuedWash?.kind === "washer" && queuedWash.status === "claimed" && queuedWash.startedAt) {
    for (let index = 0; index < (queuedWash.quantity || 1); index++) {
      const machineId = queuedWash.machineIds?.[index];
      const name = machines.find(machine => machine.id === machineId)?.name || `Washer ${index + 1}`;
      append(`queue-${queuedWash.id}-${index}`, name, queuedWash.startedAt, 30, true);
    }
  }
  return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}

function timestamp(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// RFC 5545 folds content lines at 75 UTF-8 octets, not 75 characters.
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let result = "", width = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (width + bytes > 75) { result += "\r\n "; width = 1; }
    result += character; width += bytes;
  }
  return result;
}

export function calendarFile(events: LaundryCalendarEvent[], exportedAt = new Date().toISOString()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ChopeWash//RC4 Laundry//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:ChopeWash laundry plan"];
  for (const event of events) {
    lines.push("BEGIN:VEVENT", `UID:${encodeURIComponent(event.id)}@chopewash.vercel.app`, `DTSTAMP:${timestamp(exportedAt)}`,
      `DTSTART:${timestamp(event.startsAt)}`, `DTEND:${timestamp(event.endsAt)}`,
      `SUMMARY:${escapeText(event.title)}`, `DESCRIPTION:${escapeText(event.description)}`, `LOCATION:${location}`, "STATUS:CONFIRMED", "CLASS:PRIVATE", `URL:${appUrl}`);
    if (Date.parse(event.startsAt) > Date.parse(exportedAt) + 10 * 60_000) {
      lines.push("BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(event.title)}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(event: LaundryCalendarEvent): string {
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${timestamp(event.startsAt)}/${timestamp(event.endsAt)}`, details: event.description, location, ctz: "Asia/Singapore" });
  return `https://calendar.google.com/calendar/render?${params}`;
}
