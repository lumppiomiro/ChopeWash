"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Clock3, ScanLine, Waves } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDemoStore } from "@/lib/demo-store";

export function CheckInPage({ bookingId, source }: { bookingId?: string; source?: string }) {
  const { state, checkIn } = useDemoStore();
  const booking = state.bookings.find((item) => item.id === bookingId) ?? state.bookings[0];
  const [complete, setComplete] = useState(false);

  const confirm = () => {
    if (booking) checkIn(booking.id);
    setComplete(true);
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-5 py-8 text-white">
      <div className="w-full max-w-[460px]">
        <div className="mb-8 [&_span:last-child]:text-white [&_span:last-child_span]:text-lime"><BrandMark /></div>
        <div className="overflow-hidden rounded-[32px] bg-white text-ink shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
          {complete ? (
            <div className="px-7 py-12 text-center"><div className="mx-auto grid size-20 place-items-center rounded-[26px] bg-lime"><Check className="size-9" strokeWidth={3} /></div><Badge className="mt-7 rounded-full bg-mint text-emerald-900 hover:bg-mint">Checked in</Badge><h1 className="mt-4 text-3xl font-black tracking-[-0.055em]">Cycle started.</h1><p className="mt-3 leading-6 text-muted-foreground">We’ll let you know when the machine is nearly done and when it is time to collect.</p><Link href="/" className={cn(buttonVariants(), "mt-8 h-12 w-full rounded-2xl font-bold")}>Return to ChopeWash</Link></div>
          ) : (
            <><div className="bg-primary px-7 py-8 text-white"><ScanLine className="size-8" /><p className="mt-8 text-sm font-bold text-white/60">RC4 laundry room verified</p><h1 className="mt-1 text-3xl font-black tracking-[-0.055em]">Ready to check in?</h1></div><div className="space-y-5 p-7"><div className="rounded-[22px] bg-surface p-5"><div className="flex items-center gap-3"><Waves className="size-5 text-primary" /><div><p className="font-extrabold">{booking ? (booking.kind === "dry" ? "Dryer 01" : "Washer 01") : "Room check-in"}</p><p className="text-sm text-muted-foreground">{booking ? `${booking.dateLabel} · ${booking.startTime}` : "No booking selected · queue claim mode"}</p></div></div></div><div className="flex gap-3 rounded-[20px] border p-4"><Clock3 className="mt-0.5 size-5 text-primary" /><p className="text-sm leading-5">{booking ? `${booking.duration}-minute cycle. The timer starts when you confirm.` : source ? "Open ChopeWash on your phone first, then join a queue or select your booking." : "This prototype accepts room QR and NFC-style check-ins."}</p></div><Button className="h-12 w-full rounded-2xl font-extrabold" onClick={confirm}>{booking ? "Confirm and start cycle" : "Confirm room arrival"}</Button><Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "w-full rounded-2xl")}>Not ready yet</Link></div></>
          )}
        </div>
      </div>
    </main>
  );
}
