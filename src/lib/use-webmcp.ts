"use client";

import { useEffect } from "react";
import type { Booking, LaundryState, MachineKind, QueueEntry } from "@/lib/laundry-store";

type ModelTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};

type ModelContext = {
  registerTool: (tool: ModelTool, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

export function useChopeWashTools({
  state,
  addBooking,
  joinQueue,
  showQueue,
  showBookings,
}: {
  state: LaundryState;
  addBooking: (booking: Booking) => Promise<void>;
  joinQueue: (kind: MachineKind) => Promise<QueueEntry>;
  showQueue: () => void;
  showBookings: () => void;
}) {
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: ModelTool) => {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.warn("WebMCP registration failed", error);
      });
    };

    register({
      name: "list_laundry_machines",
      title: "List laundry machines",
      description: "Read current ChopeWash machine availability, timers, and queue lengths.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => state.machines.map(({ id, name, kind, mode, status, minutesLeft, queueLength }) => ({ id, name, kind, mode, status, minutesLeft, queueLength })),
    });

    register({
      name: "join_laundry_queue",
      title: "Join a laundry queue",
      description: "Join the queue-only washer or dryer and open the queue view.",
      inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["washer", "dryer"] } }, required: ["kind"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const kind = (input as { kind?: unknown }).kind;
        if (kind !== "washer" && kind !== "dryer") throw new Error("kind must be washer or dryer");
        const entry = await joinQueue(kind);
        showQueue();
        return { id: entry.id, kind: entry.kind, position: entry.position, status: entry.status };
      },
    });

    register({
      name: "create_laundry_booking",
      title: "Create a laundry booking",
      description: "Create a 30, 45, or 60 minute shared RC4 booking and open the bookings view.",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["wash", "dry", "both"] },
          dateIso: { type: "string" },
          startTime: { type: "string" },
          duration: { type: "integer", enum: [30, 45, 60] },
        },
        required: ["kind", "dateIso", "startTime", "duration"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const value = input as { kind?: unknown; dateIso?: unknown; startTime?: unknown; duration?: unknown };
        if (!(["wash", "dry", "both"] as unknown[]).includes(value.kind) || typeof value.dateIso !== "string" || typeof value.startTime !== "string" || !([30, 45, 60] as unknown[]).includes(value.duration)) throw new Error("Invalid booking details");
        const booking: Booking = {
          id: crypto.randomUUID(), kind: value.kind as Booking["kind"], dateIso: value.dateIso,
          dateLabel: value.dateIso, startTime: value.startTime, duration: value.duration as Booking["duration"], status: "confirmed",
        };
        await addBooking(booking);
        showBookings();
        return { status: "confirmed", message: "Reserved in RC4. Read your bookings for server IDs." };
      },
    });

    return () => lifecycle.abort();
  }, [addBooking, joinQueue, showBookings, showQueue, state.machines]);
}
