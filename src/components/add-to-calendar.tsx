"use client";

import { CalendarPlus, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calendarFile, googleCalendarUrl, type LaundryCalendarEvent } from "@/lib/booking-calendar";

const eventTime = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const endTime = new Intl.DateTimeFormat("en-SG", {timeZone:"Asia/Singapore",hour:"2-digit",minute:"2-digit"});
const singaporeDay = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Singapore",year:"numeric",month:"2-digit",day:"2-digit"});

function timeRange(event: LaundryCalendarEvent): string {
  const start = new Date(event.startsAt), end = new Date(event.endsAt);
  return `${eventTime.format(start)} – ${singaporeDay.format(start) === singaporeDay.format(end) ? endTime.format(end) : eventTime.format(end)}`;
}

export function AddToCalendar({ events }: { events: LaundryCalendarEvent[] }) {
  if (!events.length) return null;
  const download = () => {
    const blob = new Blob([calendarFile(events)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chopewash-plan-${events[0].startsAt.slice(0, 10)}.ics`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return <details className="mt-4 min-w-0 rounded-2xl border border-primary/15 bg-secondary/40 p-4">
    <summary className="flex cursor-pointer items-center gap-2 text-sm font-extrabold text-primary"><CalendarPlus className="size-4 shrink-0"/>Add plan to calendar<span className="ml-auto text-xs font-medium">{events.length} events</span></summary>
    <div className="mt-4 space-y-4">
      <p className="text-xs leading-5 text-muted-foreground">One event per machine, including simultaneous cycles. Times below are Singapore time; your calendar converts them to its time zone.</p>
      <div className="space-y-2"><Button variant="outline" className="h-auto w-full whitespace-normal rounded-xl bg-white py-3" onClick={download}><Download className="size-4 shrink-0"/>Apple Calendar / download whole plan</Button>
        <p className="text-xs leading-5 text-muted-foreground">Import the .ics file into Apple Calendar. On Mac, open it with Calendar and choose a calendar. Mobile support varies; if your phone only previews the file, import on a computer into your synced calendar.</p></div>
      <div><h3 className="text-sm font-bold">Google Calendar</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Open and save each event, or import the whole-plan file on a computer via Settings → Import &amp; export.</p>
        <Button variant="ghost" className="mt-2 h-auto w-full whitespace-normal rounded-xl py-2 text-xs text-primary" onClick={download}>Download whole plan for Google import</Button>
        <ul className="mt-2 space-y-2">{events.map(event => <li key={event.id}><a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 rounded-xl border bg-white p-3 text-sm hover:border-primary"><div className="min-w-0 flex-1"><p className="break-words font-bold">{event.title.replace("ChopeWash · ", "")}</p><p className="mt-1 text-xs text-muted-foreground">{timeRange(event)}</p></div><ExternalLink className="size-4 shrink-0 text-primary"/><span className="sr-only">Add event to Google Calendar (opens a new tab)</span></a></li>)}</ul>
      </div>
      <p className="rounded-xl bg-white/70 p-3 text-xs leading-5 text-muted-foreground">Calendar events are copies, not live bookings. Changes, check-in delays and cancellations won’t sync. Update or remove old events manually; importing again may create duplicates. Calendar reminder settings depend on your calendar app.</p>
    </div>
  </details>;
}
