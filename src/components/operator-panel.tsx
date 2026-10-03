"use client";
import Link from "next/link";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useLaundryStore } from "@/lib/laundry-store";
export function OperatorPanel() {
  const { state, ready, error, updateMachine } = useLaundryStore();
  if (!ready || state.role !== "operator") return <main className="min-h-dvh bg-canvas p-8"><BrandMark /><h1 className="mt-8 text-2xl font-black">RC4 operator access required</h1><p className="mt-3">{error || "Sign in with an account granted the operator role by the project owner."}</p><Link href="/" className="mt-5 block text-primary">Back to sign in</Link></main>;
  return <main className="min-h-dvh bg-canvas p-8"><div className="mx-auto max-w-3xl"><BrandMark /><h1 className="mt-8 text-3xl font-black">RC4 machine operations</h1><p className="mt-3 text-muted-foreground">These controls affect every resident. Queue counts are calculated automatically; running machines cannot be manually released. Only release a finished machine after physically checking that laundry has been collected.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{state.machines.map(machine => <article key={machine.id} className="rounded-3xl bg-white p-6"><h2 className="text-xl font-bold">{machine.name}</h2><p className="my-4 capitalize">{machine.status}</p><Button disabled={machine.status === "running"} onClick={async () => { try { if (machine.status === "finished" && !window.confirm("Have you physically confirmed the laundry has been collected? This releases the machine for the next resident.")) return; await updateMachine(machine.id, { status: ["offline", "finished"].includes(machine.status) ? "available" : "offline" }); toast.success("Shared machine status updated"); } catch (error) { toast.error(error instanceof Error ? error.message : "Update failed"); } }}>{machine.status === "finished" ? "Confirm collected and release" : machine.status === "offline" ? "Return to service" : "Take offline"}</Button></article>)}</div><Link href="/" className="mt-6 block text-primary">Back to ChopeWash</Link></div></main>;
}
