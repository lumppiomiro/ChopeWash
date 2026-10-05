"use client";

import { useEffect } from "react";
import type { LaundryState, MachineKind, QueueEntry, QueueRequest } from "@/lib/laundry-store";
import type { BookingRequest } from "@/lib/booking-planner";

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
  addBooking: (booking: BookingRequest) => Promise<void>;
  joinQueue: (kind: MachineKind, request?: QueueRequest) => Promise<QueueEntry>;
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
      description: "Request one or two shared washers or dryers; optionally pair dryers with washing.",
      inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["washer", "dryer"] }, quantity: {type:"integer",enum:[1,2]}, duration:{type:"integer",enum:[30,45,60]}, dryerQuantity:{type:"integer",enum:[0,1,2]}, dryerDuration:{type:"integer",enum:[30,45,60]} }, required: ["kind"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const kind = (input as { kind?: unknown }).kind;
        if (kind !== "washer" && kind !== "dryer") throw new Error("kind must be washer or dryer");
        const entry = await joinQueue(kind, input as QueueRequest);
        showQueue();
        return { id: entry.id, kind: entry.kind, position: entry.position, status: entry.status };
      },
    });

    register({
      name: "create_laundry_booking",
      title: "Create a laundry booking",
      description: "Reserve a fixed 30-minute wash, a 30/45/60-minute dry, or both with explicit independent dryer details.",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["wash", "dry", "both"] },
          dateIso: { type: "string" },
          startTime: { type: "string" },
          duration: { type: "integer", enum: [30, 45, 60] },
          washerCount:{type:"integer",enum:[1,2]}, dryerCount:{type:"integer",enum:[1,2]}, secondWasherDateIso:{type:"string"}, secondWasherTime:{type:"string"},
          dryerDateIso: { type: "string" }, dryerTime: { type: "string" }, dryerDuration: { type: "integer", enum: [30, 45, 60] },
        },
        required: ["kind", "dateIso", "startTime", "duration"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const value = input as Partial<BookingRequest>;
        if (!(["wash", "dry", "both"] as unknown[]).includes(value.kind) || typeof value.dateIso !== "string" || typeof value.startTime !== "string" || !([30, 45, 60] as unknown[]).includes(value.duration)) throw new Error("Invalid booking details");
        if (value.kind !== "dry" && value.duration !== 30) throw new Error("Washing is always 30 minutes.");
        if (value.kind === "both" && (!value.dryerDateIso || !value.dryerTime || !value.dryerDuration)) throw new Error("Paired reservations require explicit dryer date, time and duration.");
        const booking = value as BookingRequest;
        await addBooking(booking);
        showBookings();
        return { status: "confirmed", message: "Reserved in RC4. Read your bookings for server IDs." };
      },
    });

    return () => lifecycle.abort();
  }, [addBooking, joinQueue, showBookings, showQueue, state.machines]);
}
