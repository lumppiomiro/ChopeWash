"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import type { LaundryState } from "@/lib/laundry-store";
import { countdown, getLaundryEvents, type LaundryEvent } from "@/lib/laundry-events";

export function YourLaundry({ state, showBookings, showQueue }: { state: LaundryState; showBookings: () => void; showQueue: () => void }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, []);
  if (now === null) return null;
  const events = getLaundryEvents(state, now);
  if (!events.length) return null;
  const [next, ...others] = events;
  const action = (event: LaundryEvent, prominent = false) => {
    const classes = `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${prominent ? "bg-lime text-ink" : "bg-surface text-primary"}`;
    if (event.action === "check-in") return <Link href={`/check-in?booking=${event.bookingId}`} className={classes}>Check in <ArrowUpRight className="size-4" /></Link>;
    return <button className={classes} onClick={event.action === "queue" ? showQueue : showBookings}>{event.action === "queue" ? "View queue" : "View booking"}<ArrowUpRight className="size-4" /></button>;
  };

  return (
    <section aria-label="Your laundry" className="px-5 pt-7 sm:px-0">
      <div className="mb-3 flex items-center gap-2"><Clock3 className="size-4 text-primary" /><h2 className="text-lg font-black tracking-tight">Your laundry</h2><span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-primary">{events.length} active</span></div>
      <div className="relative overflow-hidden rounded-[28px] bg-ink p-6 text-white shadow-[0_16px_40px_rgba(28,39,76,0.15)] sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full border-[28px] border-white/5" />
        <div className="relative sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div><p className="text-sm font-bold text-lime">{next.label}</p>
            <p role="timer" aria-label={next.label} className="my-3 font-mono text-[clamp(2.6rem,10vw,4rem)] font-bold leading-none tracking-[-0.065em] tabular-nums">{next.target > now ? countdown(next.target, now) : next.progress !== undefined ? "Collect now" : next.action === "check-in" ? "Check in" : "Stay tuned"}</p>
            <p className="text-lg font-extrabold">{next.title}</p><p className="mt-1 max-w-lg text-sm leading-6 text-white/65">{next.detail}</p>
          </div>
          <div className="mt-5 shrink-0 sm:mt-0">{action(next, true)}</div>
        </div>
        {next.progress !== undefined && <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Cycle progress" aria-valuenow={Math.round(next.progress)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-lime transition-[width]" style={{ width: `${next.progress}%` }} /></div>}
      </div>
      {others.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">{others.map((event) => <div key={event.id} className="rounded-[22px] border bg-white p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-extrabold">{event.title}</p><p className="mt-1 text-xs text-muted-foreground">{event.label}</p></div><p className="shrink-0 font-mono text-sm font-bold text-primary tabular-nums">{event.target > now ? countdown(event.target, now) : event.progress !== undefined ? "Collect now" : "Pending"}</p></div><p className="my-3 text-xs leading-5 text-muted-foreground">{event.detail}</p>{action(event)}</div>)}</div>}
    </section>
  );
}
