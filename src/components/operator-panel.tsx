"use client";

import Link from "next/link";
import { RotateCcw, Settings2, Wifi } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type MachineStatus, useDemoStore } from "@/lib/demo-store";

const statuses: { value: MachineStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "running", label: "Running" },
  { value: "finished", label: "Finished" },
  { value: "offline", label: "Offline" },
];

export function OperatorPanel() {
  const { state, updateMachine, reset } = useDemoStore();

  return (
    <main className="min-h-dvh bg-canvas px-5 py-7 text-ink sm:px-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="flex items-center justify-between"><BrandMark /><Link href="/display" className={cn(buttonVariants({ variant: "outline" }), "rounded-2xl")}>Open room display</Link></header>
        <section className="mt-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><Badge className="rounded-full bg-coral text-white hover:bg-coral">Hidden demo route</Badge><h1 className="mt-3 text-4xl font-black tracking-[-0.055em]">Machine simulator</h1><p className="mt-2 max-w-2xl text-muted-foreground">Change machine states during testing. These controls stand in for future ESP32 vibration events.</p></div>
          <Button variant="outline" className="rounded-2xl" onClick={reset}><RotateCcw className="size-4" /> Reset demo</Button>
        </section>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {state.machines.map((machine) => (
            <Card key={machine.id} className="rounded-[28px] border-white bg-white p-5 shadow-[0_12px_36px_rgba(28,39,76,0.07)]">
              <div className="flex items-start justify-between"><div><p className="text-xl font-black">{machine.name}</p><p className="mt-1 text-sm text-muted-foreground capitalize">{machine.kind} · {machine.mode}</p></div><Badge className={machine.status === "running" ? "bg-primary" : machine.status === "available" ? "bg-mint text-emerald-900" : "bg-surface text-ink"}>{machine.status}</Badge></div>
              <div className="mt-6"><Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{statuses.map((status) => <button key={status.value} onClick={() => updateMachine(machine.id, { status: status.value, minutesLeft: status.value === "running" && machine.minutesLeft === 0 ? 30 : machine.minutesLeft })} className={`rounded-xl border px-3 py-2 text-xs font-bold ${machine.status === status.value ? "border-primary bg-secondary text-primary" : "hover:bg-surface"}`}>{status.label}</button>)}</div></div>
              <div className="mt-5 grid grid-cols-2 gap-3"><div><Label htmlFor={`minutes-${machine.id}`}>Minutes left</Label><Input id={`minutes-${machine.id}`} type="number" value={machine.minutesLeft} min={0} max={60} onChange={(event) => updateMachine(machine.id, { minutesLeft: Number(event.target.value) })} className="mt-2 h-11 rounded-xl" /></div><div><Label htmlFor={`queue-${machine.id}`}>Queue length</Label><Input id={`queue-${machine.id}`} type="number" value={machine.queueLength} min={0} max={20} disabled={machine.mode !== "queue"} onChange={(event) => updateMachine(machine.id, { queueLength: Number(event.target.value) })} className="mt-2 h-11 rounded-xl" /></div></div>
            </Card>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-3 rounded-[22px] border border-primary/15 bg-secondary p-4"><Wifi className="size-5 text-primary" /><p className="text-sm"><strong>Sensor adapter placeholder:</strong> POST future ESP32 events to update a machine’s status and remaining time.</p></div>
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Settings2 className="size-3.5" /> Route: /ops · intentionally absent from resident navigation</p>
      </div>
    </main>
  );
}
