import type { Machine, QueueEntry } from "./laundry-store";
export const isActiveQueue = (entry: QueueEntry) => ["waiting", "offered", "claimed"].includes(entry.status);
export function queueTarget(entry: QueueEntry, machine?: Machine) {
  void machine;
  if (entry.status === "claimed") return Date.parse(entry.cycleEndsAt ?? entry.joinedAt);
  if (entry.status === "offered") return Date.parse(entry.offerExpiresAt ?? entry.joinedAt);
  return entry.estimatedReadyAt ? Date.parse(entry.estimatedReadyAt) : NaN;
}
