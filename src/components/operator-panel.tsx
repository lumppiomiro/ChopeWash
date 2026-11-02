"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, RefreshCw, WashingMachine, CheckCircle2 } from "lucide-react";
import { Toaster } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useLaundryStore, type Machine } from "@/lib/laundry-store";
import { collectedMachines, collectionTargets, hasMachineAdminAccess } from "@/lib/machine-admin";

export function OperatorPanel() {
  const { state, ready, hasData, error, refresh, clearMachines } = useLaundryStore();
  const [selection, setSelection] = useState<Machine[] | null>(null);
  const [confirmedEmpty, setConfirmedEmpty] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [success, setSuccess] = useState("");
  const allowed = hasMachineAdminAccess(state, ready);
  const finished = collectedMachines(state.machines);
  const select = (machines: Machine[]) => { setSelection(machines); setConfirmedEmpty(false); setFailure(""); setSuccess(""); };
  const clear = async () => {
    if (!selection || !confirmedEmpty || !allowed || pending) return;
    setPending(true); setFailure("");
    try {
      await clearMachines(selection.map(machine => machine.id));
      setSuccess(`${selection.length} ${selection.length === 1 ? "machine released" : "machines released"}. Waiting residents may receive offers immediately.`);
      setSelection(null); setConfirmedEmpty(false);
    } catch (cause) { setFailure(cause instanceof Error ? cause.message : "Could not clear machines. Please try again."); }
    finally { setPending(false); }
  };
  return <main className="min-h-dvh bg-canvas px-4 py-6 text-ink sm:px-8 sm:py-10">
    <Toaster position="top-center" richColors />
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-center justify-between gap-4"><BrandMark /><Link href="/" className="text-sm font-bold text-primary">Back to laundry</Link></header>
      <div className="mt-8 flex items-center gap-2 text-sm font-bold text-primary"><ShieldCheck className="size-5" />Miro only</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Machine admin panel</h1>
      {!ready ? <section role="status" className="mt-6 rounded-3xl border bg-white p-6"><h2 className="font-bold">{error ? "Live connection required" : "Checking administrator access…"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{error || (hasData ? "Saved data cannot authorize admin actions. Checking the backend…" : "Verifying your signed-in account with the backend.")}</p><Button variant="outline" className="mt-4" onClick={()=>void refresh()}><RefreshCw className="size-4" />Retry</Button></section>
        : !allowed ? <section className="mt-6 rounded-3xl border bg-white p-6"><h2 className="text-xl font-bold">Miro administrator access required</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Only the Miro account can clear machines. Other residents cannot access these controls.</p><Link href="/" className="mt-5 inline-block font-bold text-primary">Return to sign in</Link></section>
        : <>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Clear a finished machine only after checking that it is empty. This updates the shared backend and resolves the completed booking or queue stage. Running cycles and future reservations stay protected.</p>
          <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-primary/15 bg-secondary p-5"><div><p className="font-extrabold">{finished.length} finished {finished.length === 1 ? "machine" : "machines"} can be cleared</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Released machines become available or are held for the next waiting resident.</p></div><Button disabled={!finished.length || pending} className="min-h-11 rounded-xl" onClick={()=>select(finished)}>Clear all collected machines</Button></section>
          {success && <p role="status" className="mt-5 flex items-start gap-2 rounded-2xl bg-mint p-4 text-sm font-bold text-emerald-900"><CheckCircle2 className="size-5 shrink-0" />{success}</p>}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">{state.machines.map(machine => {
            const group = collectionTargets(machine, state.machines);
            const canClear = machine.status === "finished" ? group.length > 0 : machine.status === "offline" && !machine.held;
            const status = machine.held ? "Held for check-in" : machine.status === "finished" ? "Awaiting collection" : machine.status === "running" ? `Running · ${machine.minutesLeft} min left` : machine.status === "offline" ? "Out of service" : "Available";
            return <article key={machine.id} className="min-w-0 rounded-3xl border bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-extrabold">{machine.name}</h2><WashingMachine className="size-6 shrink-0 text-primary" /></div><p className="mt-3 text-sm font-bold">{status}</p>
              {machine.status === "finished" && group.length > 1 && <p className="mt-3 rounded-xl bg-surface p-3 text-xs leading-5">Linked collection: {group.map(item=>item.name).join(" + ")}. Both machines will be released together.</p>}
              {machine.status === "finished" && !group.length && <p className="mt-3 text-xs leading-5 text-muted-foreground">A linked machine is still running or held. Wait until the entire stage is finished.</p>}
              <Button disabled={!canClear || pending} variant="outline" className="mt-5 min-h-11 w-full whitespace-normal rounded-xl" onClick={()=>select(machine.status === "offline" ? [machine] : group)}>{machine.status === "offline" ? "Return to service" : machine.status === "running" ? "Cycle running — cannot clear" : machine.held ? "Reserved for check-in" : machine.status === "available" ? "Already available" : "Clear collected machine"}</Button>
            </article>;
          })}</div>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">Every successful admin change is recorded in the backend audit log. The laundry dashboard refreshes automatically for other residents.</p>
        </>}
    </div>
    <AlertDialog open={selection !== null} onOpenChange={open=>{if(!open && !pending){setSelection(null);setFailure("");}}}>
      <AlertDialogContent className="max-h-[calc(100dvh_-_2rem)] overflow-y-auto" style={{ width: "calc(100vw - 2rem)", maxWidth: "28rem" }}><AlertDialogHeader><AlertDialogTitle>Confirm these machines are empty</AlertDialogTitle><AlertDialogDescription>This releases the listed machines for other residents. Finished bookings and queue stages will be marked collected; upcoming reservations remain booked.</AlertDialogDescription></AlertDialogHeader>
        <ul className="space-y-1 rounded-xl bg-surface p-3 text-sm font-bold">{selection?.map(machine=><li key={machine.id}>{machine.name}</li>)}</ul>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmedEmpty} disabled={pending} onChange={event=>setConfirmedEmpty(event.target.checked)} className="mt-1.5 size-4 shrink-0 accent-primary" />I have physically checked that every listed machine is empty.</label>
        {failure && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{failure}</p>}
        {!ready && <p role="alert" className="text-sm text-amber-900">Reconnect to the backend before clearing machines.</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><AlertDialogAction disabled={pending || !confirmedEmpty || !allowed} onClick={()=>void clear()}>{pending ? "Clearing…" : "Confirm and clear"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
