"use client";

import { useState } from "react";
import { BellRing, Check, Droplets, ScanLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { MachineKind, QueueEntry } from "@/lib/demo-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function QueueFlow({
  open,
  onOpenChange,
  onJoin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoin: (kind: MachineKind) => QueueEntry;
}) {
  const [kind, setKind] = useState<MachineKind>("washer");
  const [entry, setEntry] = useState<QueueEntry | null>(null);
  const waiting = kind === "washer" ? 2 : 0;
  const estimate = kind === "washer" ? "about 28 min" : "available now";

  const join = () => {
    const next = onJoin(kind);
    setEntry(next);
    toast.success(`You’re #${next.position} in the ${kind} queue`);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setTimeout(() => setEntry(null), 200); }}>
      <SheetContent side="right" className="w-full overflow-y-auto rounded-l-[28px] border-0 sm:max-w-[500px]">
        {entry ? (
          <div className="flex min-h-full flex-col px-7 py-10">
            <div className="flex items-center justify-between">
              <Badge className="rounded-full bg-lime text-ink hover:bg-lime">Queue joined</Badge>
              <span className="text-sm font-bold text-muted-foreground">{kind === "washer" ? "Washer 02" : "Dryer 02"}</span>
            </div>
            <div className="mt-14 text-center">
              <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-primary">Your position</p>
              <p className="mt-2 text-[7rem] font-black leading-none tracking-[-0.09em]">{entry.position}</p>
              <p className="mt-3 text-lg text-muted-foreground">Estimated wait: <span className="font-extrabold text-ink">{estimate}</span></p>
            </div>
            <Progress value={entry.position === 1 ? 78 : 45} className="mt-10 h-3" />
            <div className="mt-9 space-y-3">
              <div className="flex gap-4 rounded-[22px] bg-surface p-4"><BellRing className="mt-0.5 size-5 text-primary" /><div><p className="font-extrabold">We’ll alert you</p><p className="mt-1 text-sm leading-5 text-muted-foreground">You’ll get a five-minute claim window when the machine is ready.</p></div></div>
              <div className="flex gap-4 rounded-[22px] bg-surface p-4"><ScanLine className="mt-0.5 size-5 text-primary" /><div><p className="font-extrabold">Claim it downstairs</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Scan the room QR code or tap the NFC tag to start your cycle.</p></div></div>
            </div>
            <Button className="mt-auto h-12 rounded-2xl font-extrabold" variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <>
            <SheetHeader className="border-b px-6 pb-5 pt-7">
              <Badge className="mb-3 w-fit rounded-full bg-lime text-ink hover:bg-lime">Live queue</Badge>
              <SheetTitle className="text-3xl font-black tracking-[-0.055em]">Get the next machine</SheetTitle>
              <SheetDescription>Join from your room. We’ll hold the machine for five minutes when it is ready.</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-6 py-6">
              <div className="grid grid-cols-2 gap-3">
                {(["washer", "dryer"] as const).map((value) => {
                  const Icon = value === "washer" ? Droplets : Sparkles;
                  return (
                    <button key={value} onClick={() => setKind(value)} className={`rounded-[24px] border p-5 text-left transition ${kind === value ? "border-primary bg-secondary ring-2 ring-primary/15" : "bg-white hover:bg-surface"}`}>
                      <Icon className={`size-6 ${kind === value ? "text-primary" : "text-muted-foreground"}`} />
                      <p className="mt-8 text-xl font-black capitalize">{value}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{value === "washer" ? "Washer 02" : "Dryer 02"}</p>
                    </button>
                  );
                })}
              </div>
              <div className="overflow-hidden rounded-[26px] bg-ink p-6 text-white">
                <p className="text-sm font-bold text-white/58">Right now</p>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <div><p className="text-4xl font-black tracking-[-0.06em]">{waiting}</p><p className="text-sm text-white/68">people ahead</p></div>
                  <div className="text-right"><p className="text-2xl font-black text-lime">{estimate}</p><p className="text-sm text-white/68">estimated wait</p></div>
                </div>
              </div>
              <div className="rounded-[22px] border p-4">
                <div className="flex items-start gap-3"><Check className="mt-0.5 size-5 text-emerald-600" /><p className="text-sm leading-6"><strong>No booking needed.</strong> Queue machines stay available for spontaneous laundry.</p></div>
              </div>
            </div>
            <SheetFooter className="sticky bottom-0 border-t bg-white/95 p-5 backdrop-blur">
              <Button className="h-12 rounded-2xl text-base font-extrabold" onClick={join}>Join {kind} queue</Button>
              <p className="text-center text-xs text-muted-foreground">Leave anytime with no penalty in this prototype.</p>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
