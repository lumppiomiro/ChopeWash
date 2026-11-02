import { Clock3, Users } from "lucide-react";
import type { LaundryState, MachineKind, QueueRequest } from "@/lib/laundry-store";
import { durationLabel, queuePreview } from "@/lib/laundry-planning";
import { dateLabel, singaporeDate, singaporeTime } from "@/lib/booking-planner";

export function QueueWaitPreview({ state, kind, request, ready }: { state: LaundryState; kind: MachineKind; request: QueueRequest; ready: boolean }) {
  const preview = queuePreview(state, kind, request, ready);
  const title = preview.status === "checking" ? "Live estimate unavailable"
    : preview.status === "offline" ? "Not enough machines in service"
    : preview.status === "collection" ? "Waiting for collection"
    : preview.status === "no-gap" ? "No full-cycle gap found"
    : preview.waitMinutes === 0 ? "Capacity may fit now" : `Earliest capacity: ~${durationLabel(preview.waitMinutes!)}`;
  const detail = preview.status === "checking" ? "Wait for live availability before joining."
    : preview.status === "offline" ? "Try fewer machines or book another time."
    : preview.status === "collection" ? "Wait time is unknown until previous users collect and release their machines."
    : preview.status === "no-gap" ? "Your full cycle does not currently fit in the next 14 days. Try a different selection or book ahead."
    : "This is a capacity estimate, not your queue turn. Earlier requests and collection delays can make your wait longer.";
  return <section aria-label="Wait before joining" className="rounded-2xl border border-primary/15 bg-surface p-4">
    <div className="flex items-start gap-2"><Clock3 className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0" aria-live="polite" aria-atomic="true">
      <p className="text-sm font-extrabold">{title}</p>
      {preview.earliestAt !== undefined && !!preview.waitMinutes && <p className="mt-1 text-xs font-bold text-primary">{singaporeTime(preview.earliestAt)} · {dateLabel(singaporeDate(preview.earliestAt))} · Singapore time</p>}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div></div>
    <p className="mt-3 flex items-center gap-2 border-t pt-3 text-xs font-bold"><Users className="size-4 shrink-0" />{preview.requestsAhead} {preview.requestsAhead === 1 ? "request" : "requests"} already waiting</p>
    {kind === "washer" && !!request.dryerQuantity && <p className="mt-2 text-xs leading-5 text-muted-foreground">Washer capacity only. Your dryer time is offered with the washer; it is not reserved yet.</p>}
  </section>;
}
