"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, Users, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { MachineIllustration } from "@/components/machine-illustration";
import { Button, buttonVariants } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import type { DemoState, MachineKind, QueueEntry } from "@/lib/demo-store";
import { countdown } from "@/lib/laundry-events";
import { isActiveQueue, queueTarget } from "@/lib/queue-state";
import { cn } from "@/lib/utils";

export function QueueDashboard({ state, onJoin, onLeave }: { state: DemoState; onJoin: (kind: MachineKind) => QueueEntry; onLeave: (kind: MachineKind) => void }) {
  const [now, setNow] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<MachineKind | null>(null);
  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);
  const join = (kind: MachineKind) => {
    try { const entry = onJoin(kind); toast.success(entry.status === "offered" ? "Your machine is ready. Check in within five minutes." : `You’re #${entry.position} in the ${kind} queue`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not join the queue."); }
  };
  return <>
    <div className="grid gap-5 md:grid-cols-2">
      {state.machines.filter((machine) => machine.mode === "queue").map((machine) => {
        const entry = state.queueEntries.filter((item) => item.kind === machine.kind && isActiveQueue(item)).sort((a, b) => a.position - b.position)[0];
        const offered = entry?.status === "offered";
        const claimed = entry?.status === "claimed";
        const target = entry ? queueTarget(entry, machine) : 0;
        const finished = claimed && now !== null && target <= now;
        const ahead = entry ? Math.max(0, entry.position - 1) : machine.queueLength;
        const estimate = (machine.status === "running" ? machine.minutesLeft : 0) + ahead * 45;
        const offline = machine.status === "offline";
        const expired = !entry && state.queueEntries.some((item) => item.kind === machine.kind && item.status === "expired");
        return <article key={machine.id} aria-label={`${machine.name} queue`} className={`overflow-hidden rounded-[28px] border bg-white shadow-[0_12px_36px_rgba(28,39,76,0.07)] ${entry ? "border-primary/25" : "border-white"}`}>
          <div className={`flex items-center gap-3 px-5 py-4 ${machine.kind === "washer" ? "bg-[#f1f4ff]" : "bg-[#fff5ee]"}`}>
            <div className="w-[125px] shrink-0"><MachineIllustration kind={machine.kind} status={machine.status} /></div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{machine.kind === "washer" ? "Washing" : "Drying"}</p><h2 className="mt-1 text-2xl font-black tracking-tight">{machine.name}</h2><p className="mt-2 text-sm font-bold">{offline ? "Out of service" : machine.status === "available" ? "Available" : machine.status === "finished" ? "Awaiting collection" : `${machine.minutesLeft} min left`}</p></div>
          </div>
          <div className="p-5">
            {entry ? <>
              <div className={`rounded-[22px] p-5 ${offered || finished ? "bg-lime text-ink" : "bg-ink text-white"}`}>
                <p className="text-sm font-bold opacity-70">{offered ? "Your machine is ready · claim within" : claimed ? finished ? "Cycle complete" : "Your cycle finishes in" : "Estimated turn in"}</p>
                <p role="timer" aria-label={`${machine.name} ${claimed ? "cycle timer" : offered ? "claim timer" : "estimated wait"}`} className="mt-2 font-mono text-[2.5rem] font-bold leading-tight tracking-[-0.065em] tabular-nums">{now === null ? "—" : finished ? "Collect now" : target > now ? countdown(target, now) : "Waiting"}</p>
                {!claimed && <p className={`mt-2 font-bold ${offered ? "text-ink" : "text-lime"}`}>You’re #{entry.position}{!offered && ` · ${ahead} ${ahead === 1 ? "person" : "people"} ahead`}</p>}
              </div>
              {!claimed && <div className="mt-5"><p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your place in line</p><ol aria-label="Queue order" className="flex items-center gap-2 overflow-x-auto pb-2"><li className="shrink-0 rounded-xl bg-surface px-3 py-3 text-xs font-bold">{machine.status === "running" ? "Running" : machine.status === "finished" ? "Collecting" : "Machine"}</li><ArrowRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />{Array.from({ length: Math.min(ahead, 3) }, (_, i) => <li key={i} className="grid size-10 shrink-0 place-items-center rounded-xl border text-sm font-bold text-muted-foreground">{i + 1}</li>)}{ahead > 3 && <li className="shrink-0 text-xs text-muted-foreground">+{ahead - 3}</li>}<li aria-current="step" className="rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-white">You</li></ol></div>}
              <p className="my-4 text-sm leading-6 text-muted-foreground">{offline ? "The machine is unavailable. You can leave this queue and try the other option." : offered ? "Head to RC4 Level 1. Scan the room QR code or check in below before the timer ends." : claimed ? finished ? "Your laundry is ready. Please collect it so the next person can start." : "Your cycle has started. Come back when the timer ends to collect your laundry." : "You can wait in your room. Check back here for your turn; the estimate may change."}</p>
              {offered && !offline && <Link href={`/check-in?source=queue&entry=${entry.id}`} className={cn(buttonVariants(), "h-12 w-full rounded-2xl font-bold")}><ScanLine className="size-4" />Check in downstairs</Link>}
              {claimed && finished && <Button className="h-12 w-full rounded-2xl" onClick={() => { onLeave(machine.kind); toast.success("Laundry collected. Thank you!"); }}>I’ve collected my laundry</Button>}
              {!claimed && <Button variant="outline" className="mt-2 h-11 w-full rounded-2xl text-muted-foreground" onClick={() => setLeaving(machine.kind)}>Leave {machine.kind} queue</Button>}
            </> : <>
              {expired && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Your claim window ended. You can join again when you’re ready.</p>}
              <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-surface p-4"><Users className="size-4 text-primary" /><p className="mt-3 text-3xl font-black">{ahead}</p><p className="mt-1 text-xs text-muted-foreground">{ahead === 1 ? "person" : "people"} ahead</p></div><div className="rounded-2xl bg-surface p-4"><Clock3 className="size-4 text-primary" /><p className="mt-3 text-2xl font-black">{offline ? "—" : estimate > 0 ? `~${estimate} min` : machine.status === "available" ? "Now" : "Soon"}</p><p className="mt-1 text-xs text-muted-foreground">estimated wait</p></div></div>
              <p className="my-4 text-sm leading-6 text-muted-foreground">{offline ? "This machine is currently unavailable." : "Join from your room. When it’s your turn, you’ll have five minutes to check in downstairs."}</p>
              <Button disabled={offline} className="h-12 w-full rounded-2xl font-bold" onClick={() => join(machine.kind)}>Join {machine.kind} queue <ArrowRight className="size-4" /></Button>
            </>}
          </div>
        </article>;
      })}
    </div>
    <p className="mt-5 rounded-[22px] border bg-white p-4 text-sm leading-6 text-muted-foreground">RC4 · Level 1. Washing and drying have separate queues. Wait estimates assume 45-minute cycles ahead of you; your place is held until you leave or miss your claim window.</p>
    <AlertDialog open={leaving !== null} onOpenChange={(open) => { if (!open) setLeaving(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Leave the {leaving} queue?</AlertDialogTitle><AlertDialogDescription>You’ll lose your place. If you join again, you’ll start at the back of the queue.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="outline" onClick={() => setLeaving(null)}>Keep my place</Button><Button variant="destructive" onClick={() => { if (leaving) onLeave(leaving); setLeaving(null); toast.success("You’ve left the queue"); }}>Leave queue</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
