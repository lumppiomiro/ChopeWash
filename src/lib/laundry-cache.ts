import type { LaundryState } from "./laundry-store";

export const SNAPSHOT_CACHE_TTL = 6 * 60 * 60 * 1000;
export const SNAPSHOT_FRESHNESS = 15_000;
type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function snapshotCacheKey(project: string): string {
  return `chopewash:snapshot:v1:${project}`;
}

export function snapshotIsFresh(verifiedAt: number, now = Date.now()): boolean {
  return verifiedAt > 0 && now >= verifiedAt && now - verifiedAt < SNAPSHOT_FRESHNESS;
}

export function readSnapshotCache(storage: CacheStorage, key: string, owner: string | null, now = Date.now()): { state: LaundryState; savedAt: number } | null {
  try {
    const raw = storage.getItem(key);
    if (!raw || !owner) return null;
    const cached = JSON.parse(raw);
    if (cached.version !== 1 || cached.owner !== owner) return null;
    if (!Number.isFinite(cached.savedAt) || now < cached.savedAt || now - cached.savedAt >= SNAPSHOT_CACHE_TTL) { storage.removeItem(key); return null; }
    const state = cached.state;
    if (state?.schemaVersion !== 3 || !Number.isFinite(Date.parse(state.serverTime)) || !Array.isArray(state.machines) || !Array.isArray(state.bookings) || !Array.isArray(state.queueEntries)) return null;
    // Treat browser storage as untrusted: malformed records should cause a cache
    // miss, never a broken screen or a successful local booking.
    if (!state.machines.every((m: LaundryState["machines"][number]) => m && typeof m.id === "string" && typeof m.name === "string" && ["washer", "dryer"].includes(m.kind) && ["available", "running", "finished", "offline"].includes(m.status) && Number.isFinite(m.minutesLeft) && Number.isFinite(m.queueLength))) return null;
    if (!state.bookings.every((b: LaundryState["bookings"][number]) => b && typeof b.id === "string" && typeof b.dateLabel === "string" && ["wash", "dry", "both"].includes(b.kind) && ["confirmed", "checked-in", "complete", "cancelled", "missed"].includes(b.status) && [30,45,60].includes(b.duration) && Number.isFinite(Date.parse(`${b.dateIso}T${b.startTime}:00+08:00`)) && (!b.startedAt || Number.isFinite(Date.parse(b.startedAt))))) return null;
    if (!state.queueEntries.every((q: LaundryState["queueEntries"][number]) => q && typeof q.id === "string" && ["washer", "dryer"].includes(q.kind) && ["waiting", "offered", "claimed", "expired"].includes(q.status) && Number.isFinite(q.position) && Number.isFinite(Date.parse(q.joinedAt)))) return null;
    for (const row of [...state.bookings, ...state.queueEntries]) {
      for (const field of ["startedAt", "estimatedReadyAt", "offerExpiresAt", "cycleEndsAt", "dryerStartsAt"]) if (row[field] !== undefined && row[field] !== null && (typeof row[field] !== "string" || !Number.isFinite(Date.parse(row[field])))) return null;
      for (const field of ["pairId", "machineId", "machineName"]) if (row[field] !== undefined && row[field] !== null && typeof row[field] !== "string") return null;
      if (row.machineIds !== undefined && (!Array.isArray(row.machineIds) || !row.machineIds.every((id: unknown) => typeof id === "string"))) return null;
    }
    if (state.intervals !== undefined && !Array.isArray(state.intervals)) return null;
    // Operator access must always be established by a fresh server response.
    return { state: { ...state, role: "resident" }, savedAt: cached.savedAt };
  } catch { return null; }
}

export function writeSnapshotCache(storage: CacheStorage, key: string, owner: string | null, state: LaundryState, now = Date.now()): void {
  try {
    if (!owner) { storage.removeItem(key); return; }
    storage.setItem(key, JSON.stringify({ version: 1, owner, savedAt: now, state: { ...state, role: "resident" } }));
  } catch { /* Storage may be unavailable or full; live data still works. */ }
}

export function clearSnapshotCache(storage: CacheStorage, key: string): void {
  try { storage.removeItem(key); } catch { /* Private browsing can deny storage. */ }
}
