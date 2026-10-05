"use client";

import { QueueDashboard } from "@/components/queue-dashboard";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { LaundryState, MachineKind, QueueEntry, QueueRequest } from "@/lib/laundry-store";

export function QueueFlow({ open, onOpenChange, state, onJoin, onLeave }: { open: boolean; onOpenChange: (open: boolean) => void; state: LaundryState; onJoin: (kind: MachineKind, request?: QueueRequest) => Promise<QueueEntry>; onLeave: (kind: MachineKind) => Promise<void> }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full overflow-y-auto rounded-l-[28px] border-0 sm:max-w-[760px]"><SheetHeader className="border-b px-6 pb-5 pt-7"><SheetTitle className="text-3xl font-black tracking-tight">Your next machine</SheetTitle><SheetDescription>Choose your laundry plan. Every machine serves both reservations and the queue.</SheetDescription></SheetHeader><div className="p-5"><QueueDashboard state={state} onJoin={onJoin} onLeave={onLeave} /></div></SheetContent></Sheet>;
}
