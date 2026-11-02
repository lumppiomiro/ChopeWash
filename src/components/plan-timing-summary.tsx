import { Clock3 } from "lucide-react";
import type { BookingRequest } from "@/lib/booking-planner";
import { dateLabel, singaporeDate, singaporeTime } from "@/lib/booking-planner";
import { durationLabel, planTiming } from "@/lib/laundry-planning";

export function PlanTimingSummary({ request }: { request: BookingRequest }) {
  const timing = planTiming(request);
  if (!timing) return null;
  const finishDate = singaporeDate(timing.finishesAt);
  const lateDate = singaporeDate(timing.allowUntil);
  return <section aria-label="Whole plan timing" className="rounded-[22px] border border-primary/15 bg-secondary p-4">
    <p className="flex items-center gap-2 text-xs font-bold text-primary"><Clock3 className="size-4" />Your whole plan · Singapore time</p>
    <h3 className="mt-3 text-sm font-bold">Expected collection</h3>
    <p className="mt-1 text-3xl font-black tracking-tight">{singaporeTime(timing.finishesAt)}</p>
    <p className="mt-1 text-sm font-bold">{dateLabel(finishDate)}</p>
    <p className="mt-2 text-sm">{durationLabel(timing.elapsedMinutes)} from first start to collection</p>
    <ol aria-label="Laundry timeline" className="my-4 space-y-3 border-y border-primary/10 py-4">
      {timing.stages.map((stage, index) => <li key={`${stage.name}-${index}`}>
        <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs"><span className="font-bold">{stage.name}</span><span>{singaporeTime(stage.startsAt)}–{singaporeTime(stage.endsAt)}{singaporeDate(stage.startsAt) !== singaporeDate(timing.startsAt) ? ` · ${dateLabel(singaporeDate(stage.startsAt))}` : ""}</span></div>
        <div aria-hidden="true" className="mt-1.5 h-2 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${stage.kind === "wash" ? "bg-primary" : "bg-emerald-600"}`} style={{ marginLeft: `${(stage.startsAt-timing.startsAt)/(timing.elapsedMinutes*60000)*100}%`, width: `${(stage.endsAt-stage.startsAt)/(timing.elapsedMinutes*60000)*100}%` }} /></div>
      </li>)}
    </ol>
    {timing.transferMinutes > 0 && <p className="mb-2 text-xs leading-5">Includes {durationLabel(timing.transferMinutes)} between the last wash and drying for transfer / waiting.</p>}
    <p className="text-xs font-bold leading-5">Allow until {singaporeTime(timing.allowUntil)}{lateDate !== finishDate ? ` · ${dateLabel(lateDate)}` : ""} if you check in late.</p>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">Assumes each cycle starts at its booked time. Late check-in can add up to 15 minutes. Collection delays or machine issues can take longer.</p>
  </section>;
}
