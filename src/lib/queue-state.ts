import type { DemoState, Machine, MachineKind, QueueEntry } from "./demo-store";

export const isActiveQueue = (entry: QueueEntry) => ["waiting", "offered", "claimed"].includes(entry.status);
export function queueTarget(entry: QueueEntry, machine?: Machine) {
  if (entry.status === "claimed") return Date.parse(entry.cycleEndsAt ?? entry.joinedAt);
  if (entry.status === "offered") return Date.parse(entry.offerExpiresAt ?? entry.joinedAt);
  return entry.estimatedReadyAt ? Date.parse(entry.estimatedReadyAt) : Date.parse(entry.joinedAt) + ((machine?.status === "running" ? machine.minutesLeft : 0) + Math.max(0, entry.position - 1) * 45) * 60_000;
}
export function joinQueueState(state: DemoState, kind: MachineKind, now: number, id: string) {
  const existing = state.queueEntries.find((entry) => entry.kind === kind && isActiveQueue(entry));
  if (existing) return { state, entry: existing };
  const machine = state.machines.find((item) => item.kind === kind && item.mode === "queue");
  if (!machine || machine.status === "offline") throw new Error("This machine is out of service.");
  const offered = machine.status === "available" && machine.queueLength === 0;
  const entry: QueueEntry = { id, kind, position: machine.queueLength + 1, joinedAt: new Date(now).toISOString(), status: offered ? "offered" : "waiting", estimatedReadyAt: new Date(now + ((machine.status === "running" ? machine.minutesLeft : 0) + machine.queueLength * 45) * 60_000).toISOString(), offerExpiresAt: offered ? new Date(now + 5 * 60_000).toISOString() : undefined };
  return { entry, state: { ...state, queueEntries: [entry, ...state.queueEntries], machines: state.machines.map((item) => item.id === machine.id ? { ...item, queueLength: item.queueLength + 1 } : item) } };
}
export function leaveQueueState(state: DemoState, kind: MachineKind) {
  const removed = state.queueEntries.filter((entry) => entry.kind === kind && isActiveQueue(entry));
  if (!removed.length) return state;
  return { ...state, queueEntries: state.queueEntries.filter((entry) => !removed.some((item) => item.id === entry.id)), machines: state.machines.map((machine) => machine.kind === kind && machine.mode === "queue" ? { ...machine, status: removed.some((item) => item.status === "claimed") ? "available" as const : machine.status, minutesLeft: removed.some((item) => item.status === "claimed") ? 0 : machine.minutesLeft, queueLength: Math.max(0, machine.queueLength - removed.filter((item) => item.status !== "claimed").length) } : machine) };
}
export function claimQueueState(state: DemoState, id: string, duration: 30 | 45 | 60, now: number) {
  const entry = state.queueEntries.find((item) => item.id === id);
  const machine = state.machines.find((item) => item.kind === entry?.kind && item.mode === "queue");
  if (!entry || entry.status !== "offered" || queueTarget(entry, machine) <= now || machine?.status !== "available") throw new Error("This offer is no longer available. Return to the queue to check your status.");
  const cycleEndsAt = new Date(now + duration * 60_000).toISOString();
  return { ...state, queueEntries: state.queueEntries.map((item) => item.id === id ? { ...item, status: "claimed" as const, startedAt: new Date(now).toISOString(), cycleEndsAt } : item), machines: state.machines.map((item) => item.id === machine.id ? { ...item, status: "running" as const, minutesLeft: duration, queueLength: Math.max(0, item.queueLength - 1) } : item) };
}
export function advanceQueueState(state: DemoState, now: number) {
  let next = state;
  // Earlier builds allowed the same resident to join a queue twice. Keep their earliest place.
  const kept = new Map<MachineKind, QueueEntry>();
  const duplicates: QueueEntry[] = [];
  for (const entry of [...state.queueEntries].sort((a, b) => a.position - b.position)) {
    if (!isActiveQueue(entry)) continue;
    if (kept.has(entry.kind)) duplicates.push(entry);
    else kept.set(entry.kind, entry);
  }
  if (duplicates.length) next = { ...state, queueEntries: state.queueEntries.filter((entry) => !duplicates.some((item) => item.id === entry.id)), machines: state.machines.map((machine) => machine.mode === "queue" ? { ...machine, queueLength: Math.max(0, machine.queueLength - duplicates.filter((entry) => entry.kind === machine.kind && entry.status !== "claimed").length) } : machine) };
  for (const entry of next.queueEntries) {
    const machine = next.machines.find((item) => item.kind === entry.kind && item.mode === "queue");
    if (entry.status === "offered" && queueTarget(entry, machine) <= now) {
      next = { ...next, queueEntries: next.queueEntries.map((item) => item.id === entry.id ? { ...item, status: "expired" as const } : item.kind === entry.kind && item.status === "waiting" ? { ...item, position: Math.max(1, item.position - 1) } : item), machines: next.machines.map((item) => item.id === machine?.id ? { ...item, queueLength: Math.max(0, item.queueLength - 1) } : item) };
    } else if (entry.status === "claimed" && entry.cycleEndsAt && queueTarget(entry, machine) <= now) {
      if (machine?.status === "running") next = { ...next, machines: next.machines.map((item) => item.id === machine.id ? { ...item, status: "finished" as const, minutesLeft: 0 } : item) };
    } else if (entry.status === "claimed" && entry.cycleEndsAt && machine?.status === "running") {
      const minutesLeft = Math.max(0, Math.ceil((queueTarget(entry, machine) - now) / 60_000));
      if (minutesLeft !== machine.minutesLeft) next = { ...next, machines: next.machines.map((item) => item.id === machine.id ? { ...item, minutesLeft } : item) };
    } else if (entry.status === "waiting" && entry.position === 1 && machine?.status === "available") {
      next = { ...next, queueEntries: next.queueEntries.map((item) => item.id === entry.id ? { ...item, status: "offered" as const, offerExpiresAt: new Date(now + 5 * 60_000).toISOString() } : item) };
    }
  }
  return next;
}
