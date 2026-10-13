"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requireSupabase, getSupabaseClient } from "@/lib/supabase";
import type { BookingRequest } from "@/lib/booking-planner";
import { clearSnapshotCache, readSnapshotCache, snapshotCacheKey, snapshotIsFresh, writeSnapshotCache } from "@/lib/laundry-cache";

export type MachineKind = "washer" | "dryer";
export type MachineMode = "booking" | "queue" | "pool";
export type QueueRequest = { quantity?: 1 | 2; duration?: 30 | 45 | 60; dryerQuantity?: 0 | 1 | 2; dryerDuration?: 30 | 45 | 60 };
export type MachineStatus = "available" | "running" | "finished" | "offline";

export type Machine = {
  id: string;
  name: string;
  kind: MachineKind;
  mode: MachineMode;
  status: MachineStatus;
  minutesLeft: number;
  queueLength: number;
  held?: boolean;
  collectionGroup?: string[];
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
  machineId?: string;
  machineName?: string;
  startedAt?: string;
  createdAt?: string;
};

export type QueueEntry = {
  id: string;
  kind: MachineKind;
  position: number;
  quantity?: number;
  duration?: 30 | 45 | 60;
  machineIds?: string[];
  dryerQuantity?: number;
  dryerDuration?: 30 | 45 | 60;
  dryerStartsAt?: string;
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
  intervals?: { machineId?: string; kind?: MachineKind; quantity?: number; startsAt: string; endsAt: string }[];
  schemaVersion?: number;
  role?: "resident" | "operator";
  serverTime?: string;
};

// Empty until the shared backend responds. Never fabricate availability.
export const emptyLaundryState: LaundryState = { machines: [], bookings: [], queueEntries: [] };
export function useLaundryStore() {
  const [state, setState] = useState<LaundryState>(emptyLaundryState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const owner = useRef<string | null | undefined>(undefined);
  const verifiedAt = useRef(0);
  const pendingRefresh = useRef<{ epoch: number; promise: Promise<void> } | null>(null);
  const cacheKey = snapshotCacheKey(process.env.NEXT_PUBLIC_SUPABASE_URL || "unconfigured");
  const sessionEpoch = useRef(0);
  const snapshotEpoch = useRef(0);
  const accept = useCallback((next: LaundryState) => {
    const now = Date.now();
    verifiedAt.current = now;
    setState(next); setReady(true); setError(""); setLastUpdatedAt(now);
    try { writeSnapshotCache(window.localStorage, cacheKey, owner.current || null, next, now); } catch { /* Storage disabled. */ }
  }, [cacheKey]);
  const refresh = useCallback((): Promise<void> => {
    if (owner.current === undefined) return Promise.resolve();
    if (!navigator.onLine) { verifiedAt.current = 0; setReady(false); setError("You’re offline."); return Promise.resolve(); }
    const epoch = sessionEpoch.current;
    if (pendingRefresh.current?.epoch === epoch) return pendingRefresh.current.promise;
    const revision = snapshotEpoch.current;
    const promise = (async () => {
      try {
        const { data, error } = await requireSupabase().rpc("rc4_snapshot").abortSignal(AbortSignal.timeout(12_000));
        if (error) throw error;
        if (epoch !== sessionEpoch.current || revision !== snapshotEpoch.current) return;
        if (data?.schemaVersion !== 3) throw new Error("The shared-pool database migration is required for this app version.");
        accept(data as LaundryState);
      } catch (failure) {
        if (epoch !== sessionEpoch.current || revision !== snapshotEpoch.current) return;
        verifiedAt.current = 0;
        setReady(false);
        setError(failure instanceof Error ? failure.message : "Could not refresh RC4 availability.");
      } finally {
        if (pendingRefresh.current?.epoch === epoch) pendingRefresh.current = null;
      }
    })();
    pendingRefresh.current = { epoch, promise };
    return promise;
  }, [accept]);
  useEffect(() => {
    const lifecycleEpoch = sessionEpoch;
    let mounted = true;
    const poll = () => { if (mounted && document.visibilityState !== "hidden" && navigator.onLine) void refresh(); };
    const timer = window.setInterval(poll, 5000);
    const wake = () => {
      if (!navigator.onLine) { offline(); return; }
      if (!snapshotIsFresh(verifiedAt.current)) setReady(false);
      poll();
    };
    const offline = () => { verifiedAt.current = 0; setReady(false); setError("You’re offline."); };
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", wake);
    const applyOwner = (nextOwner: string | null) => {
      if (!mounted || owner.current === nextOwner) return;
      const previousOwner = owner.current;
      owner.current = nextOwner;
      sessionEpoch.current++;
      verifiedAt.current = 0;
      setState(emptyLaundryState); setReady(false); setError(""); setLastUpdatedAt(null);
      try {
        if ((previousOwner && previousOwner !== nextOwner) || !nextOwner) clearSnapshotCache(window.localStorage, cacheKey);
        const cached = readSnapshotCache(window.localStorage, cacheKey, nextOwner);
        if (cached) { setState(cached.state); setLastUpdatedAt(cached.savedAt); }
      } catch { /* Storage disabled: fetch normally. */ }
      // Never call Supabase asynchronously inside its auth callback lock.
      window.setTimeout(wake, 0);
    };
    const client = getSupabaseClient();
    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      applyOwner(session?.user.id || null);
    }).data.subscription;
    if (!client) { owner.current = null; window.setTimeout(wake, 0); }
    return () => {
      mounted = false; lifecycleEpoch.current++; owner.current = undefined; verifiedAt.current = 0;
      clearInterval(timer); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", wake); subscription?.unsubscribe();
    };
  }, [refresh, cacheKey]);
  const action = useCallback(async (name: string, payload: object) => {
    if (!ready || state.schemaVersion !== 3 || !snapshotIsFresh(verifiedAt.current) || !navigator.onLine) {
      void refresh();
      throw new Error("Refreshing RC4 availability. Please try again once connected.");
    }
    const epoch = sessionEpoch.current;
    snapshotEpoch.current++;
    const { data, error } = await requireSupabase().rpc("rc4_action", { action: name, payload });
    if (error) throw new Error(error.message);
    const next = data as LaundryState;
    if (next.schemaVersion !== 3) throw new Error("The shared-pool database migration is required.");
    if (epoch !== sessionEpoch.current) throw new Error("Your session changed. Refresh and sign in again.");
    snapshotEpoch.current++;
    accept(next); return next;
  }, [ready, state.schemaVersion, accept, refresh]);
  const addBooking = useCallback(async (booking: BookingRequest) => { await action("book", booking); }, [action]);
  const joinQueue = useCallback(async (kind: MachineKind, request: QueueRequest = {}) => {
    const next = await action("joinQueue", { kind, ...request });
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
  return { state, ready, hasData: state.schemaVersion === 3, lastUpdatedAt, error, refresh, addBooking, joinQueue, leaveQueue, claimQueue, updateMachine, checkIn, cancelBooking, collectBooking };
}
