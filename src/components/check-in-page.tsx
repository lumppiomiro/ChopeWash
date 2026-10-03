"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Clock3, ScanLine } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLaundryStore } from "@/lib/laundry-store";

export function CheckInPage({ bookingId, source, entryId }: { bookingId?: string; source?: string; entryId?: string }) {
  const { state, ready, checkIn, claimQueue } = useLaundryStore();
  const queueMode = source === "queue";
  const booking = queueMode ? undefined : bookingId ? state.bookings.find((item) => item.id === bookingId) : undefined;
  const entry = state.queueEntries.find((item) => item.id === entryId);
  const [duration, setDuration] = useState<30 | 45 | 60>(45);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    setPending(true);
    try {
      if (queueMode) {
        if (!entry) throw new Error("No active queue offer selected. Return to your queue.");
        await claimQueue(entry.id, duration);
      } else if (booking) await checkIn(booking.id);
      else throw new Error("Sign in and select your reservation or queue offer from Home.");
      setComplete(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not start the cycle."); }
    finally { setPending(false); }
  };
  const machine = queueMode ? entry ? entry.kind === "dryer" ? "Dryer 02" : "Washer 02" : "Queue check-in" : booking ? booking.kind === "dry" ? "Dryer 01" : "Washer 01" : "Room check-in";
  const validQueueOffer = entry?.status === "offered";
  return <main className="grid min-h-dvh place-items-center bg-ink px-5 py-8 text-white"><div className="w-full max-w-[460px]">
    <div className="mb-8 [&_span:last-child]:text-white [&_span:last-child_span]:text-lime"><BrandMark /></div>
    <div className="overflow-hidden rounded-[32px] bg-white text-ink shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
      {complete ? <div className="px-7 py-12 text-center"><div className="mx-auto grid size-20 place-items-center rounded-[26px] bg-lime"><Check className="size-9" strokeWidth={3} /></div><h1 className="mt-6 text-3xl font-black tracking-tight">{booking || queueMode ? "Cycle started." : "You’re checked in."}</h1><p className="mt-3 leading-6 text-muted-foreground">{booking || queueMode ? "Follow your cycle timer on Home. Come back when it’s time to collect your laundry." : "Open your queue or booking to start a cycle."}</p><Link href="/" className={cn(buttonVariants(), "mt-8 h-12 w-full rounded-2xl font-bold")}>Return to ChopeWash</Link></div> : <>
        <div className="bg-primary px-7 py-8 text-white"><ScanLine className="size-8" /><p className="mt-8 text-sm font-bold text-white/70">RC4 · Level 1</p><h1 className="mt-1 text-3xl font-black tracking-tight">Ready to check in?</h1></div>
        <div className="space-y-5 p-7"><div className="rounded-[22px] bg-surface p-5"><p className="font-extrabold">{machine}</p><p className="mt-1 text-sm text-muted-foreground">{queueMode ? validQueueOffer ? "Your machine is held for five minutes." : "No active offer. Return to the queue to check your turn." : booking ? `${booking.dateLabel} · ${booking.startTime}` : "Scan the room QR code or select a reservation."}</p></div>
          {queueMode && validQueueOffer && <fieldset><legend className="mb-3 font-bold">Cycle length</legend><div className="grid grid-cols-3 gap-2">{([30, 45, 60] as const).map((value) => <Button key={value} aria-pressed={duration === value} variant={duration === value ? "default" : "outline"} onClick={() => setDuration(value)}>{value} min</Button>)}</div></fieldset>}
          <div className="flex gap-3 rounded-[20px] border p-4"><Clock3 className="mt-0.5 size-5 shrink-0 text-primary" /><p className="text-sm leading-5">{queueMode || booking ? `${queueMode ? duration : booking?.duration}-minute cycle. The timer starts when you confirm downstairs.` : "Use Home to follow your laundry status."}</p></div>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button disabled={pending || !ready || (queueMode ? !validQueueOffer : booking?.status !== "confirmed")} className="h-12 w-full rounded-2xl font-extrabold" onClick={confirm}>{booking || queueMode ? "Confirm and start cycle" : "Confirm room arrival"}</Button><Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "w-full rounded-2xl")}>Back to ChopeWash</Link>
        </div>
      </>}
    </div>
  </div></main>;
}
