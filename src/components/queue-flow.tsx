"use client";

import { QueueDashboard } from "@/components/queue-dashboard";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { DemoState, MachineKind, QueueEntry } from "@/lib/demo-store";

export function QueueFlow({ open, onOpenChange, state, onJoin, onLeave }: { open: boolean; onOpenChange: (open: boolean) => void; state: DemoState; onJoin: (kind: MachineKind) => QueueEntry; onLeave: (kind: MachineKind) => void }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full overflow-y-auto rounded-l-[28px] border-0 sm:max-w-[760px]"><SheetHeader className="border-b px-6 pb-5 pt-7"><SheetTitle className="text-3xl font-black tracking-tight">Your next machine</SheetTitle><SheetDescription>Choose washing or drying, then follow your place in line.</SheetDescription></SheetHeader><div className="p-5"><QueueDashboard state={state} onJoin={onJoin} onLeave={onLeave} /></div></SheetContent></Sheet>;
}
