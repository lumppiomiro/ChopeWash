"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Clock3, Droplets, ListOrdered, Settings2, Sparkles } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useLaundryStore } from "@/lib/laundry-store";

export function RoomDisplay() {
  const { state, ready, error } = useLaundryStore();
  const [now, setNow] = useState(new Date());
  const [origin, setOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    const first = window.setTimeout(() => setOrigin(window.location.origin), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);

  return (
    <main className="min-h-dvh bg-ink p-5 text-white sm:p-8 lg:p-10">
      <header className="mx-auto flex max-w-[1380px] items-center justify-between">
        <div className="[&_span:last-child]:text-white [&_span:last-child_span]:text-lime"><BrandMark /></div>
        <div className="text-right"><p className="text-lg font-black">RC4 · Level 1</p><p className="text-sm text-white/55">{format(now, "EEEE, d MMM · HH:mm:ss")}</p></div>
      </header>

      <div className="mx-auto mt-10 grid max-w-[1380px] gap-5 xl:grid-cols-[1fr_330px]">
        <section>
          {error && <p role="alert" className="mb-5 rounded-xl bg-red-950 p-4">Connection lost. Machine availability is not current.</p>}
          <div className="mb-5 flex items-end justify-between"><div><p className="text-sm font-extrabold uppercase tracking-[0.16em] text-lime">Laundry room status</p><h1 className="mt-1 text-4xl font-black tracking-[-0.055em] sm:text-5xl">Pick a machine at a glance.</h1></div><Badge className="hidden rounded-full bg-white/10 px-4 py-2 text-white sm:block">{ready ? "Shared RC4 status" : "Connecting…"}</Badge></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {state.machines.map((machine) => {
              const Icon = machine.kind === "washer" ? Droplets : Sparkles;
              const available = machine.status === "available";
              return (
                <Card key={machine.id} className={`min-h-[240px] overflow-hidden rounded-[30px] border-0 p-0 ${available ? "bg-lime text-ink" : machine.status === "offline" ? "bg-white/8 text-white" : "bg-white text-ink"}`}>
                  <div className="flex h-full flex-col p-6">
                    <div className="flex items-start justify-between"><div className={`grid size-12 place-items-center rounded-2xl ${available ? "bg-ink text-lime" : "bg-surface text-primary"}`}><Icon className="size-6" /></div><Badge className={machine.mode === "queue" ? "bg-coral text-white" : "bg-primary text-white"}>{machine.mode === "queue" ? "QUEUE" : "BOOKING"}</Badge></div>
                    <div className="mt-auto pt-10"><p className="text-3xl font-black tracking-[-0.05em]">{machine.name}</p>{available ? <p className="mt-2 text-2xl font-black">{machine.mode === "queue" && machine.queueLength > 0 ? "Held for queue" : "Available now"}</p> : machine.status === "finished" ? <p className="mt-2 text-2xl font-black">Awaiting collection</p> : machine.status === "offline" ? <p className="mt-2 text-xl font-bold opacity-65">Temporarily offline</p> : <div className="mt-3 flex items-end justify-between"><p className="text-4xl font-black text-primary">{machine.minutesLeft}<span className="ml-1 text-lg">min</span></p>{machine.mode === "queue" && <span className="inline-flex items-center gap-1.5 text-sm font-bold"><ListOrdered className="size-4" /> {machine.queueLength} waiting</span>}</div>}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-[30px] bg-primary p-6">
            <p className="text-sm font-bold text-white/60">Check in or claim</p><h2 className="mt-2 text-2xl font-black tracking-[-0.045em]">Scan when you arrive</h2>
            <div className="mx-auto mt-6 grid aspect-square max-w-[220px] place-items-center rounded-[24px] bg-white p-5"><QRCodeSVG value={`${origin}/?view=bookings`} size={180} bgColor="#ffffff" fgColor="#17203a" level="M" /></div>
            <p className="mt-5 text-sm leading-5 text-white/65">Use your phone camera. You’ll have a 15-minute booking grace period or a five-minute queue claim.</p>
          </div>
          <div className="rounded-[26px] border border-white/10 bg-white/6 p-5"><div className="flex gap-3"><Clock3 className="size-5 text-lime" /><div><p className="font-extrabold">Timers follow check-in</p><p className="mt-1 text-sm leading-5 text-white/55">Cycles are timed from resident check-in, not physical sensors. Collect laundry and release the machine in the app.</p></div></div></div>
          <Link href="/ops" className="mt-auto flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold text-white/25 hover:text-white/60"><Settings2 className="size-4" /> Operator</Link>
        </aside>
      </div>
    </main>
  );
}
