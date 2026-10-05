"use client";

import Link from "next/link";
import { Droplets, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { LaundryState } from "@/lib/laundry-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LaundryPlans({ state, onCancel, onCollect }: { state: LaundryState; onCancel: (id: string) => Promise<void>; onCollect: (id: string) => Promise<void> }) {
  const groups = new Map<string, LaundryState["bookings"]>();
  for (const booking of state.bookings) {
    const key = booking.pairId || booking.id;
    groups.set(key, [...(groups.get(key) || []), booking]);
  }
  const now = Date.parse(state.serverTime || "");
  const act = async (callback: () => Promise<void>, message: string) => {
    try { await callback(); toast.success(message); } catch (error) { toast.error(error instanceof Error ? error.message : "Please try again."); }
  };
  return <>{Array.from(groups.entries()).map(([id, bookings]) => {
    const washers = bookings.filter(b=>b.kind!=="dry");
    const dryers = bookings.filter(b=>b.kind==="dry");
    const queuedWash = state.queueEntries.find(q=>q.id===id && q.status==="claimed");
    const upcoming = bookings.find(b=>b.status==="confirmed");
    const active = bookings.some(b=>b.status==="checked-in") || !!queuedWash;
    return <article key={id} className="min-w-0 rounded-[28px] border border-white bg-white p-5 shadow-[0_12px_36px_rgba(28,39,76,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black">Your laundry plan</h2><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">{active ? "In progress" : upcoming ? "Reserved" : "Past plan"}</span></div>
      <p className="mt-2 text-sm text-muted-foreground">{queuedWash ? `${queuedWash.quantity || 1} washers from queue` : washers.length ? `${washers.length} washer${washers.length>1 ? "s" : ""}` : "Dry only"}{dryers.length ? ` → ${dryers.length} dryer${dryers.length>1 ? "s" : ""}` : ""}</p>
      {queuedWash && <Link href="/?view=queue" className="mt-3 block rounded-xl bg-mint p-3 text-sm font-bold text-emerald-900">Follow your washing stage in Queue</Link>}
      <ol className="mt-5 space-y-3">{bookings.map((b,index)=>{
        const Icon = b.kind==="dry" ? Sparkles : Droplets;
        const start = Date.parse(`${b.dateIso}T${b.startTime}:00+08:00`);
        const firstOfStage = bookings.find(x=>x.kind===b.kind && x.startTime===b.startTime && x.dateIso===b.dateIso && x.status==="confirmed")?.id===b.id;
        const canCheckIn = now>=start && now<start+15*60000;
        const canCollect = b.status==="checked-in" && !!b.startedAt && now>=Date.parse(b.startedAt)+b.duration*60000;
        return <li key={b.id} className="rounded-2xl border bg-surface/50 p-4"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-primary"><Icon className="size-4"/></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{b.machineName || `${b.kind==="dry" ? "Dryer" : "Washer"} · assigned at check-in`}</p><p className="mt-1 text-sm font-bold">{b.dateLabel} · {b.startTime}</p><p className="mt-1 text-xs text-muted-foreground">{b.duration} min · {b.status==="checked-in" ? canCollect ? "Ready to collect" : "Cycle running" : b.status}</p></div><span className="text-xs font-bold text-muted-foreground">{index+1}</span></div>
          {b.status==="confirmed" && firstOfStage && (canCheckIn ? <Link href={`/check-in?booking=${b.id}`} className={cn(buttonVariants({variant:"outline"}),"mt-3 w-full rounded-xl bg-white")}>Check in this stage</Link> : <p className="mt-3 text-xs text-muted-foreground">Check-in opens at {b.startTime} (Singapore time)</p>)}
          {canCollect && <Button className="mt-3 w-full rounded-xl" onClick={()=>void act(()=>onCollect(b.id),"Machine released. Thank you!")}>Collected from {b.machineName || "this machine"}</Button>}
        </li>;
      })}</ol>
      {bookings.some(b=>b.status==="missed") && upcoming && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5">A stage was missed. Remaining stages stay reserved; cancel them if you no longer need them.</p>}
      {upcoming && <Button variant="ghost" className="mt-3 w-full" onClick={()=>{if(window.confirm("Cancel all upcoming stages of this plan? Running cycles will continue.")) void act(()=>onCancel(upcoming.id),"Upcoming plan stages cancelled");}}>Cancel upcoming stages</Button>}
    </article>;
  })}</>;
}
