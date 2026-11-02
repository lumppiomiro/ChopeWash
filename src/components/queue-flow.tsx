"use client";

import { QueueDashboard } from "@/components/queue-dashboard";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { LaundryState, MachineKind, QueueEntry, QueueRequest } from "@/lib/laundry-store";

export function QueueFlow({ open, onOpenChange, state, ready, onJoin, onLeave }: { open: boolean; onOpenChange: (open: boolean) => void; state: LaundryState; ready: boolean; onJoin: (kind: MachineKind, request?: QueueRequest) => Promise<QueueEntry>; onLeave: (kind: MachineKind) => Promise<void> }) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="gap-0 overflow-hidden rounded-none border-0 data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:sm:max-w-[760px] sm:rounded-l-[28px] [&>[data-slot=sheet-close]]:top-[max(0.75rem,env(safe-area-inset-top))]">
      <SheetHeader className="shrink-0 border-b bg-white px-5 pb-4 pr-14 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pr-14">
        <SheetTitle className="text-2xl font-black tracking-tight sm:text-3xl">Your next machine</SheetTitle>
        <SheetDescription>Choose your laundry plan. Every machine serves both reservations and the queue.</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5 [&_button]:h-auto [&_button]:min-h-9 [&_button]:min-w-0 [&_button]:whitespace-normal [&_button]:px-2">
        <QueueDashboard state={state} ready={ready} onJoin={onJoin} onLeave={onLeave} />
      </div>
    </SheetContent>
  </Sheet>;
}
