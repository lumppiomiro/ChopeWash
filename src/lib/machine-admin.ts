import type { LaundryState, Machine } from "./laundry-store";

export function hasMachineAdminAccess(state: LaundryState, ready: boolean) {
  return ready && state.machineAdmin === true && state.role === "operator";
}

// Linked queue stages must be confirmed as one collection group.
export function collectionTargets(machine: Machine, machines: Machine[]): Machine[] {
  const ids = machine.collectionGroup?.length ? machine.collectionGroup : [machine.id];
  const targets = ids.map(id => machines.find(item => item.id === id));
  if (targets.some(item => !item || item.status !== "finished" || item.held)) return [];
  return targets as Machine[];
}

export function collectedMachines(machines: Machine[]) {
  return machines.filter(machine => machine.status === "finished" && collectionTargets(machine, machines).length > 0);
}
