"use client";

import { useCallback, useEffect, useState } from "react";

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
};

export type QueueEntry = {
  id: string;
  kind: MachineKind;
  position: number;
  joinedAt: string;
  status: "waiting" | "offered" | "claimed";
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
    save((current) => ({ ...current, bookings: [booking, ...current.bookings] }));
  }, [save]);

  const joinQueue = useCallback((kind: MachineKind) => {
    const machine = state.machines.find((item) => item.kind === kind && item.mode === "queue");
    const entry: QueueEntry = {
      id: crypto.randomUUID(),
      kind,
      position: (machine?.queueLength ?? 0) + 1,
      joinedAt: new Date().toISOString(),
      status: "waiting",
    };
    save((current) => ({
      ...current,
      queueEntries: [entry, ...current.queueEntries],
      machines: current.machines.map((item) => item.id === machine?.id ? { ...item, queueLength: item.queueLength + 1 } : item),
    }));
    return entry;
  }, [save, state.machines]);

  const updateMachine = useCallback((id: string, patch: Partial<Machine>) => {
    save((current) => ({
      ...current,
      machines: current.machines.map((machine) => machine.id === id ? { ...machine, ...patch } : machine),
    }));
  }, [save]);

  const checkIn = useCallback((id: string) => {
    save((current) => ({
      ...current,
      bookings: current.bookings.map((booking) => booking.id === id ? { ...booking, status: "checked-in" } : booking),
    }));
  }, [save]);

  const reset = useCallback(() => save(defaultDemoState), [save]);

  return { state, ready, addBooking, joinQueue, updateMachine, checkIn, reset };
}
