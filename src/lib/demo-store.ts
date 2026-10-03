"use client";

import { useCallback, useEffect, useState } from "react";
import { advanceQueueState, claimQueueState, joinQueueState, leaveQueueState } from "@/lib/queue-state";

export type MachineKind = "washer" | "dryer";
export type MachineMode = "booking" | "queue";
export type MachineStatus = "available" | "running" | "finished" | "offline";

export type Machine = {
  id: string;
  name: string;
  kind: MachineKind;
  mode: MachineMode;
  status: MachineStatus;
  minutesLeft: number;
  queueLength: number;
};

export type Booking = {
  id: string;
  kind: "wash" | "dry" | "both";
  dateLabel: string;
  dateIso: string;
  startTime: string;
  duration: 30 | 45 | 60;
  dryerTime?: string;
  status: "confirmed" | "checked-in" | "complete";
  startedAt?: string;
  createdAt?: string;
};

export type QueueEntry = {
  id: string;
  kind: MachineKind;
  position: number;
  joinedAt: string;
  status: "waiting" | "offered" | "claimed" | "expired";
  estimatedReadyAt?: string;
  offerExpiresAt?: string;
  cycleEndsAt?: string;
  startedAt?: string;
};

export type DemoState = {
  machines: Machine[];
  bookings: Booking[];
  queueEntries: QueueEntry[];
};

export const defaultDemoState: DemoState = {
  machines: [
    { id: "washer-book", name: "Washer 01", kind: "washer", mode: "booking", status: "available", minutesLeft: 0, queueLength: 0 },
    { id: "dryer-book", name: "Dryer 01", kind: "dryer", mode: "booking", status: "running", minutesLeft: 12, queueLength: 0 },
    { id: "washer-queue", name: "Washer 02", kind: "washer", mode: "queue", status: "running", minutesLeft: 8, queueLength: 2 },
    { id: "dryer-queue", name: "Dryer 02", kind: "dryer", mode: "queue", status: "available", minutesLeft: 0, queueLength: 0 },
  ],
  bookings: [],
  queueEntries: [],
};

const STORAGE_KEY = "chopewash-demo-state-v1";

export function useDemoStore() {
  const [state, setState] = useState<DemoState>(defaultDemoState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setState(JSON.parse(stored) as DemoState);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setReady(true);

    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        setState(JSON.parse(event.newValue) as DemoState);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const save = useCallback((next: DemoState | ((current: DemoState) => DemoState)) => {
    setState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: JSON.stringify(value) }));
      return value;
    });
  }, []);

  const addBooking = useCallback((booking: Booking) => {
    save((current) => ({ ...current, bookings: [{ ...booking, createdAt: booking.createdAt ?? new Date().toISOString() }, ...current.bookings] }));
  }, [save]);

  const joinQueue = useCallback((kind: MachineKind) => {
    const now = Date.now();
    const id = crypto.randomUUID();
    const result = joinQueueState(state, kind, now, id);
    save((current) => joinQueueState(current, kind, now, id).state);
    return result.entry;
  }, [save, state]);

  const leaveQueue = useCallback((kind: MachineKind) => save((current) => leaveQueueState(current, kind)), [save]);
  const claimQueue = useCallback((id: string, duration: 30 | 45 | 60) => {
    const now = Date.now();
    claimQueueState(state, id, duration, now);
    save((current) => claimQueueState(current, id, duration, now));
  }, [save, state]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const next = advanceQueueState(state, Date.now());
      if (next !== state) save((current) => advanceQueueState(current, Date.now()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ready, save, state]);

  const updateMachine = useCallback((id: string, patch: Partial<Machine>) => {
    save((current) => ({
      ...current,
      machines: current.machines.map((machine) => machine.id === id ? { ...machine, ...patch } : machine),
      queueEntries: current.queueEntries.map((entry) => {
        const machine = current.machines.find((item) => item.id === id && item.mode === "queue" && item.kind === entry.kind);
        if (!machine || entry.status !== "waiting" || patch.queueLength === undefined) return entry;
        const passed = Math.max(0, machine.queueLength - Math.max(1, patch.queueLength));
        return passed ? { ...entry, position: Math.max(1, entry.position - passed), estimatedReadyAt: new Date(Math.max(Date.now(), Date.parse(entry.estimatedReadyAt ?? entry.joinedAt) - passed * 45 * 60_000)).toISOString() } : entry;
      }),
    }));
  }, [save]);

  const checkIn = useCallback((id: string) => {
    save((current) => ({
      ...current,
      bookings: current.bookings.map((booking) => booking.id === id ? { ...booking, status: "checked-in", startedAt: booking.startedAt ?? new Date().toISOString() } : booking),
    }));
  }, [save]);

  const reset = useCallback(() => save(defaultDemoState), [save]);

  return { state, ready, addBooking, joinQueue, leaveQueue, claimQueue, updateMachine, checkIn, reset };
}
