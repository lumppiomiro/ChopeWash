"use client";

import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { CalendarDays, Check, Clock3, Droplets, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Booking, LaundryState } from "@/lib/laundry-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type BookingKind = Booking["kind"];

const startTimes = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, "0")}:${String(index % 4 * 15).padStart(2, "0")}`);

function addMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function BookingFlow({
  open,
  onOpenChange,
  onConfirm,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (booking: Booking) => Promise<void>;
  state: LaundryState;
}) {
  const singaporeDate = state.serverTime ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(state.serverTime)) : "2000-01-01";
  const dates = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(new Date(`${singaporeDate}T12:00:00`), index)), [singaporeDate]);
  const [kind, setKind] = useState<BookingKind>("both");
  const [dateIndex, setDateIndex] = useState(0);
  const [duration, setDuration] = useState<30 | 45 | 60>(45);
  const [startTime, setStartTime] = useState("09:15");
  const [confirmed, setConfirmed] = useState(false);
  const selectedDate = dates[dateIndex];
  const dryerTime = addMinutes(startTime, duration + 15);

  const [pending, setPending] = useState(false);
  const unavailable = (time: string) => {
    const start = Date.parse(`${format(selectedDate, "yyyy-MM-dd")}T${time}:00+08:00`);
    const segments = kind === "both" ? [{ id: "washer-book", start }, { id: "dryer-book", start: start + (duration + 15) * 60000 }] : [{ id: kind === "dry" ? "dryer-book" : "washer-book", start }];
    return !state.intervals || start <= Date.parse(state.serverTime ?? "") || (kind === "both" && dateIndex === 13 && startTimes.indexOf(time) * 15 + duration + 15 >= 1440) || segments.some(segment =>
      state.machines.some(m => m.id === segment.id && m.status === "offline") ||
      state.intervals?.some(slot => slot.machineId === segment.id && segment.start < Date.parse(slot.endsAt) && segment.start + (duration + 15) * 60000 > Date.parse(slot.startsAt)));
  };
  const confirm = async () => {
    setPending(true);
    try {
    const booking: Booking = {
      id: crypto.randomUUID(),
      kind,
      dateIso: format(selectedDate, "yyyy-MM-dd"),
      dateLabel: format(selectedDate, "EEE, d MMM"),
      startTime,
      duration,
      dryerTime: kind === "both" ? dryerTime : undefined,
      status: "confirmed",
    };
    await onConfirm(booking);
    setConfirmed(true);
    toast.success("Laundry time reserved", { description: `${booking.dateLabel} at ${booking.startTime}` });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not reserve this slot."); }
    finally { setPending(false); }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setTimeout(() => setConfirmed(false), 200); }}>
      <SheetContent side="right" className="w-full overflow-y-auto rounded-l-[28px] border-0 sm:max-w-[520px]">
        {confirmed ? (
          <div className="flex min-h-full flex-col items-center justify-center px-7 py-14 text-center">
            <div className="grid size-20 place-items-center rounded-[26px] bg-lime text-ink shadow-[0_16px_40px_rgba(163,196,60,0.28)]">
              <Check className="size-9" strokeWidth={3} />
            </div>
            <Badge className="mt-7 rounded-full bg-mint text-emerald-900 hover:bg-mint">Confirmed</Badge>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.055em]">Your time is choped.</h2>
            <p className="mt-3 max-w-sm leading-6 text-muted-foreground">
              {kind === "both" ? `Washer 01 at ${startTime}, followed by Dryer 01 at ${dryerTime}.` : `${kind === "wash" ? "Washer" : "Dryer"} 01 at ${startTime}.`}
            </p>
            <div className="mt-8 w-full rounded-[24px] bg-surface p-5 text-left">
              <div className="flex items-center gap-3"><CalendarDays className="size-5 text-primary" /><span className="font-bold">{format(selectedDate, "EEEE, d MMMM")}</span></div>
              <div className="mt-3 flex items-center gap-3"><Clock3 className="size-5 text-primary" /><span>{duration}-minute cycle · 15-minute check-in grace</span></div>
            </div>
            <Button className="mt-7 h-12 w-full rounded-2xl font-bold" onClick={() => onOpenChange(false)}>Back to home</Button>
          </div>
        ) : (
          <>
            <SheetHeader className="border-b px-6 pb-5 pt-7">
              <Badge className="mb-3 w-fit rounded-full bg-secondary text-secondary-foreground hover:bg-secondary">Book ahead</Badge>
              <SheetTitle className="text-3xl font-black tracking-[-0.055em]">Plan your laundry</SheetTitle>
              <SheetDescription>Reserve washing, drying, or a suggested pair up to 14 days ahead.</SheetDescription>
            </SheetHeader>
            <div className="space-y-7 px-6 py-6">
              <fieldset>
                <legend className="mb-3 text-sm font-extrabold">1. What do you need?</legend>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["wash", "Wash", Droplets],
                    ["dry", "Dry", Sparkles],
                    ["both", "Both", Clock3],
                  ] as const).map(([value, label, Icon]) => (
                    <button key={value} onClick={() => setKind(value)} className={`rounded-[20px] border p-4 text-left transition ${kind === value ? "border-primary bg-secondary ring-2 ring-primary/15" : "bg-white hover:bg-surface"}`}>
                      <Icon className={`mb-3 size-5 ${kind === value ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-extrabold">{label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-sm font-extrabold">2. Pick a day</legend>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {dates.map((date, index) => (
                    <button key={date.toISOString()} onClick={() => setDateIndex(index)} className={`min-w-[68px] rounded-[18px] border px-3 py-3 text-center transition ${dateIndex === index ? "border-ink bg-ink text-white" : "bg-white hover:bg-surface"}`}>
                      <span className="block text-xs font-bold opacity-60">{index === 0 ? "Today" : format(date, "EEE")}</span>
                      <span className="mt-1 block text-lg font-black">{format(date, "d")}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-sm font-extrabold">3. Cycle length</legend>
                <div className="grid grid-cols-3 gap-2">
                  {([30, 45, 60] as const).map((value) => (
                    <button key={value} onClick={() => setDuration(value)} className={`h-12 rounded-2xl border font-extrabold transition ${duration === value ? "border-primary bg-primary text-white" : "bg-white hover:bg-surface"}`}>{value} min</button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-sm font-extrabold">4. Start time</legend>
                <div className="grid grid-cols-4 gap-2">
                  {startTimes.map((time) => {
                    const taken = unavailable(time);
                    return (
                      <button key={time} disabled={taken || pending} onClick={() => setStartTime(time)} className={`h-11 rounded-xl border text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted-foreground/45 ${startTime === time ? "border-ink bg-ink text-white" : "bg-white hover:bg-surface"}`}>
                        {time}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {kind === "both" && (
                <div className="rounded-[22px] border border-primary/15 bg-secondary p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white"><Sparkles className="size-5" /></div>
                    <div><p className="font-extrabold">Dryer reservation: {dryerTime}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Reserves both machines together, with a 15-minute transfer buffer.</p></div>
                  </div>
                </div>
              )}
            </div>
            <SheetFooter className="sticky bottom-0 border-t bg-white/95 p-5 backdrop-blur">
              <Button disabled={pending || unavailable(startTime)} className="h-12 rounded-2xl text-base font-extrabold" onClick={() => void confirm()}>{pending ? "Reserving…" : "Confirm booking"}</Button>
              <p className="text-center text-xs text-muted-foreground">Check in within 15 minutes of each slot. Slots include the grace period; all times are Singapore time.</p>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
