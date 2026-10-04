"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requireSupabase, getSupabaseClient } from "@/lib/supabase";
import type { BookingRequest } from "@/lib/booking-planner";

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
  status: "confirmed" | "checked-in" | "complete" | "cancelled" | "missed";
  pairId?: string;
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

export type LaundryState = {
  machines: Machine[];
  bookings: Booking[];
  queueEntries: QueueEntry[];
  intervals?: { machineId: string; startsAt: string; endsAt: string }[];
  role?: "resident" | "operator";
  serverTime?: string;
};

// Empty until the shared backend responds. Never fabricate availability.
export const emptyLaundryState: LaundryState = { machines: [], bookings: [], queueEntries: [] };
export function useLaundryStore() {
  const [state, setState] = useState<LaundryState>(emptyLaundryState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const sessionEpoch = useRef(0);
  const snapshotEpoch = useRef(0);
  const refresh = useCallback(async () => {
    const epoch = sessionEpoch.current;
    const revision = snapshotEpoch.current;
    try {
      const { data, error } = await requireSupabase().rpc("rc4_snapshot");
      if (error) throw error;
      if (epoch !== sessionEpoch.current || revision !== snapshotEpoch.current) return;
      setState(data as LaundryState); setReady(true); setError("");
    } catch (failure) {
      if (epoch !== sessionEpoch.current || revision !== snapshotEpoch.current) return;
      setReady(false);
      setError(failure instanceof Error ? failure.message : "RC4 database is not ready. Apply the shared-backend migration.");
    }
  }, []);
  useEffect(() => {
    const lifecycleEpoch = sessionEpoch;
    let mounted = true;
    let inFlight = false;
    const poll = async () => { if (!mounted || inFlight) return; inFlight = true; await refresh(); inFlight = false; };
    void poll();
    const timer = window.setInterval(poll, 5000);
    const wake = () => { void poll(); };
    window.addEventListener("focus", wake);
    const subscription = getSupabaseClient()?.auth.onAuthStateChange(() => {
      sessionEpoch.current++;
      // Drop the previous user's private records immediately on session changes.
      setState(emptyLaundryState); setReady(false);
      window.setTimeout(wake, 0);
    }).data.subscription;
    return () => { lifecycleEpoch.current++; mounted = false; clearInterval(timer); window.removeEventListener("focus", wake); subscription?.unsubscribe(); };
  }, [refresh]);
  const action = useCallback(async (name: string, payload: object) => {
    const epoch = sessionEpoch.current;
    snapshotEpoch.current++;
    const { data, error } = await requireSupabase().rpc("rc4_action", { action: name, payload });
    if (error) throw new Error(error.message);
    const next = data as LaundryState;
    if (epoch !== sessionEpoch.current) throw new Error("Your session changed. Refresh and sign in again.");
    snapshotEpoch.current++;
    setState(next); setReady(true); return next;
  }, []);
  const addBooking = useCallback(async (booking: BookingRequest) => { await action("book", booking); }, [action]);
  const joinQueue = useCallback(async (kind: MachineKind) => {
    const next = await action("joinQueue", { kind });
    const entry = next.queueEntries.find(item => item.kind === kind && ["waiting", "offered", "claimed"].includes(item.status));
    if (!entry) throw new Error("Could not load your queue position.");
    return entry;
  }, [action]);
  const leaveQueue = useCallback(async (kind: MachineKind) => { await action("leaveQueue", { kind }); }, [action]);
  const claimQueue = useCallback(async (id: string, duration: 30 | 45 | 60) => { await action("claimQueue", { id, duration }); }, [action]);
  const checkIn = useCallback(async (id: string) => { await action("checkIn", { id }); }, [action]);
  const cancelBooking = useCallback(async (id: string) => { await action("cancelBooking", { id }); }, [action]);
  const collectBooking = useCallback(async (id: string) => { await action("collectBooking", { id }); }, [action]);
  const updateMachine = useCallback(async (id: string, patch: Partial<Machine>) => { await action("operator", { id, ...patch }); }, [action]);
  return { state, ready, error, refresh, addBooking, joinQueue, leaveQueue, claimQueue, updateMachine, checkIn, cancelBooking, collectBooking };
}
