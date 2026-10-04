"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Droplets, Sparkles } from "lucide-react";
import { Toaster } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import type { LaundryState } from "@/lib/laundry-store";
import { addDateDays, bookingSlots, dateLabel, GRACE_MINUTES, MINUTE, singaporeDate, singaporeTime, slotTimestamp, suggestDryer, validateBooking, type BookingRequest, type CycleDuration, type Slot } from "@/lib/booking-planner";

const card = "min-w-0 rounded-[26px] border border-ink/8 bg-white p-5 shadow-[0_8px_30px_rgba(28,39,76,0.04)] sm:p-6";
const label = "text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground";
const groups = [
  { name: "Morning", from: 6, to: 12, hours: "06:00–11:45" },
  { name: "Afternoon", from: 12, to: 18, hours: "12:00–17:45" },
  { name: "Evening", from: 18, to: 24, hours: "18:00–23:45" },
  { name: "Overnight", from: 0, to: 6, hours: "00:00–05:45" },
];
function CalendarPicker({ value, today, onChange, name }: { value: string; today: string; onChange: (date: string) => void; name: string }) {
  const [shownMonth, setShownMonth] = useState("");
  const month = shownMonth || value.slice(0, 7);
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const lastDate = addDateDays(today, 13);
  const shiftMonth = (amount: number) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + amount, 1, 12)).toISOString().slice(0, 7);
  return <section aria-label={`${name} calendar`} className="min-w-0">
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="font-extrabold">{new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}</h3>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => { setShownMonth(today.slice(0, 7)); onChange(today); }} className="min-h-10 rounded-xl px-2 text-xs font-bold text-primary">Today</button>
        <button type="button" aria-label={`Previous month for ${name}`} disabled={month <= today.slice(0, 7)} onClick={() => setShownMonth(shiftMonth(-1))} className="grid size-10 place-items-center rounded-xl hover:bg-surface disabled:opacity-25"><ChevronLeft className="size-4" /></button>
        <button type="button" aria-label={`Next month for ${name}`} disabled={month >= lastDate.slice(0, 7)} onClick={() => setShownMonth(shiftMonth(1))} className="grid size-10 place-items-center rounded-xl hover:bg-surface disabled:opacity-25"><ChevronRight className="size-4" /></button>
      </div>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center">
      {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => <span key={i} className="pb-2 text-xs font-bold text-muted-foreground" aria-hidden="true">{day}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`space-${i}`} />)}
      {Array.from({ length: days }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, "0")}`;
        const selected = date === value;
        return <button type="button" key={date} aria-label={`${name}: ${dateLabel(date)}`} aria-pressed={selected} disabled={date < today || date > lastDate} onClick={() => onChange(date)} className={`relative min-h-11 min-w-0 rounded-xl text-sm font-bold transition disabled:text-ink/20 ${selected ? "bg-primary text-white shadow-sm" : "hover:bg-secondary enabled:bg-surface/60"}`}>
          {i + 1}{date === today && <span className={`absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full ${selected ? "bg-lime" : "bg-primary"}`} />}
        </button>;
      })}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Book today through {dateLabel(lastDate)} · Singapore time</p>
  </section>;
}
function TimePicker({ slots, value, onChange, name }: { slots: Slot[]; value: string; onChange: (time: string) => void; name: string }) {
  const firstAvailable = slots.find(slot => slot.available);
  const selectedHour = Number((value || firstAvailable?.time || "06:00").split(":")[0]);
  return <section aria-label={`${name} start times`} className="min-w-0 space-y-2">
    {groups.map(group => {
      const options = slots.filter(slot => { const hour = Number(slot.time.slice(0, 2)); return hour >= group.from && hour < group.to; });
      const count = options.filter(slot => slot.available).length;
      return <details key={group.name} open={selectedHour >= group.from && selectedHour < group.to} className="group rounded-2xl border border-ink/8">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1"><span className="text-sm font-extrabold">{group.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{group.hours}</span></div>
          <span className="text-xs font-bold text-primary">{count} free</span><ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-4 gap-2 px-3 pb-3">
          {options.map(slot => <button type="button" key={slot.time} disabled={!slot.available} aria-label={`${name} ${slot.time}${slot.reason ? `: ${slot.reason}` : ", available"}`} aria-pressed={value === slot.time} onClick={() => onChange(slot.time)} className={`min-h-14 min-w-0 rounded-xl border px-1 py-2 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface disabled:text-muted-foreground/40 ${value === slot.time && slot.available ? "border-primary bg-primary text-white" : "border-ink/10 bg-white hover:border-primary"}`}>
            {slot.time}<span className="mt-1 block text-[9px] font-medium leading-tight">{slot.reason === "Before wash finishes" ? "Too early" : slot.reason || (value === slot.time ? "Selected" : "Available")}</span>
          </button>)}
        </div>
      </details>;
    })}
    <p className="pt-1 text-xs leading-5 text-muted-foreground">15-minute start intervals. Availability includes the cycle and a 15-minute check-in grace period.</p>
  </section>;
}
function DryerDuration({ value, onChange }: { value: CycleDuration; onChange: (duration: CycleDuration) => void }) {
  return <fieldset className="min-w-0"><legend className="mb-3 text-sm font-bold">Dryer cycle length</legend><div className="grid grid-cols-3 gap-2">{([30, 45, 60] as const).map(duration => <button type="button" key={duration} aria-pressed={value === duration} onClick={() => onChange(duration)} className={`min-h-12 rounded-xl border text-sm font-extrabold ${value === duration ? "border-primary bg-primary text-white" : "bg-white hover:bg-surface"}`}>{duration} min</button>)}</div></fieldset>;
}
function ReservationSummary({ request }: { request: BookingRequest }) {
  const rows = request.kind === "both" ? [
    { name: "Washer 01", date: request.dateIso, time: request.startTime, duration: 30, wash: true },
    { name: "Dryer 01", date: request.dryerDateIso!, time: request.dryerTime!, duration: request.dryerDuration!, wash: false },
  ] : [{ name: request.kind === "wash" ? "Washer 01" : "Dryer 01", date: request.dateIso, time: request.startTime, duration: request.duration, wash: request.kind === "wash" }];
  return <div className="space-y-3">{rows.map(row => {
    const start = slotTimestamp(row.date, row.time);
    const Icon = row.wash ? Droplets : Sparkles;
    return <div key={row.name} className="rounded-[22px] bg-surface p-4"><div className="flex items-center gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${row.wash ? "bg-secondary text-primary" : "bg-orange-100 text-orange-700"}`}><Icon className="size-5" /></span><div><h3 className="font-extrabold">{row.name}</h3><p className="text-xs text-muted-foreground">{row.duration}-minute cycle</p></div></div><p className="mt-4 text-xl font-black">{row.time} <span className="text-sm font-semibold text-muted-foreground">→ {singaporeTime(start + row.duration * MINUTE)}</span></p><p className="mt-1 text-sm font-bold">{dateLabel(row.date)}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">Check in {row.time}–{singaporeTime(start + GRACE_MINUTES * MINUTE)}. Cycle timing starts when you check in.</p></div>;
  })}</div>;
}

export function BookingFlow({ state, ready, connectionError, onConfirm }: { state: LaundryState; ready: boolean; connectionError: string; onConfirm: (request: BookingRequest) => Promise<void> }) {
  const [clientNow, setClientNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setClientNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const today = singaporeDate(state.serverTime || clientNow);
  const [kind, setKind] = useState<BookingRequest["kind"]>("both");
  const [washDate, setWashDate] = useState("");
  const [washTime, setWashTime] = useState("");
  const [dryDate, setDryDate] = useState("");
  const [dryTime, setDryTime] = useState("");
  const [dryDuration, setDryDuration] = useState<CycleDuration>(45);
  const [manualDryer, setManualDryer] = useState(false);
  const [editingDryer, setEditingDryer] = useState(false);
  const [stage, setStage] = useState<"edit" | "review" | "success">("edit");
  const [reviewed, setReviewed] = useState<BookingRequest | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const washerDate = washDate || today;
  const washStart = slotTimestamp(washerDate, washTime);
  const suggestion = kind === "both" ? suggestDryer(state, washStart, dryDuration) : null;
  const dryerDate = kind === "both" && !manualDryer ? suggestion?.dateIso || washerDate : dryDate || today;
  const dryerTime = kind === "both" && !manualDryer ? suggestion?.time || "" : dryTime;
  const primaryDate = kind === "dry" ? dryerDate : washerDate;
  const primaryTime = kind === "dry" ? dryerTime : washTime;
  const primaryDuration = kind === "dry" ? dryDuration : 30;
  const primarySlots = bookingSlots(state, primaryDate, kind === "dry" ? "dryer-book" : "washer-book", primaryDuration);
  const dryerSlots = bookingSlots(state, dryerDate, "dryer-book", dryDuration, Number.isFinite(washStart) ? washStart + 45 * MINUTE : 0);
  const request: BookingRequest = { kind, dateIso: primaryDate, startTime: primaryTime, duration: primaryDuration, ...(kind === "both" ? { dryerDateIso: dryerDate, dryerTime, dryerDuration: dryDuration } : {}) };
  const invalid = validateBooking(state, request);
  const review = () => { if (!ready || invalid) { setError(invalid || "Wait for shared availability."); return; } setReviewed(request); setError(""); setStage("review"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const confirm = async () => {
    if (!reviewed) return;
    const changed = validateBooking(state, reviewed);
    if (!ready || changed) { setError(changed || "The connection is unavailable. Please try again."); setStage("edit"); return; }
    setPending(true); setError("");
    try { await onConfirm(reviewed); setStage("success"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not reserve these slots."); setStage("edit"); }
    finally { setPending(false); }
  };
  const customiseDryer = () => { setDryDate(dryerDate); setDryTime(dryerTime); setManualDryer(true); setEditingDryer(true); };
  return <main className="min-h-dvh bg-canvas text-ink">
    <Toaster position="top-center" richColors />
    <div className="mx-auto w-full max-w-[1080px] px-4 pb-40 pt-5 sm:px-8 sm:pt-8">
      <header className="flex items-center justify-between gap-3"><Link href="/" aria-label="ChopeWash home"><BrandMark /></Link><Link href="/" className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-muted-foreground"><ArrowLeft className="size-4" />Back</Link></header>
      {stage === "success" && reviewed ? <section className="mx-auto mt-10 max-w-lg text-center"><span className="mx-auto grid size-20 place-items-center rounded-[26px] bg-lime"><Check className="size-9" /></span><p className="mt-6 text-sm font-bold text-primary">Reservation confirmed</p><h1 className="mt-2 text-4xl font-black tracking-tight">Your time is choped.</h1><p className="mb-7 mt-3 text-muted-foreground">Saved to your account and reserved for you at RC4.</p><div className="text-left"><ReservationSummary request={reviewed} /></div><Link href="/?view=bookings" className="mt-7 flex min-h-12 items-center justify-center rounded-2xl bg-primary px-4 font-bold text-white">View my bookings<ArrowRight className="ml-2 size-4" /></Link></section> : <>
        <section className="mb-7 mt-7 sm:mt-10"><p className={label}>RC4 · Level 1 · Book ahead</p><h1 className="mt-2 text-[2rem] font-black leading-tight tracking-[-0.055em] sm:text-5xl">{stage === "review" ? "One last look." : "Plan your laundry."}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{stage === "review" ? "Check each machine, start time and cycle length before reserving." : "Find a washer time that suits you. We’ll help the dryer fit around it."}</p></section>
        {!ready && <p role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{connectionError ? "Shared RC4 availability is unavailable. You can browse the calendar, but reservations need a working backend." : "Connecting to shared RC4 availability…"}</p>}
        {error && <p role="alert" className="mb-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p>}
        {stage === "review" && reviewed ? <section className="mx-auto max-w-xl"><ReservationSummary request={reviewed} /><p className="mt-5 rounded-2xl bg-white p-4 text-sm leading-6 text-muted-foreground">{reviewed.kind === "both" ? "Both slots will be reserved together. If either has been taken, neither will be partially booked. " : ""}You have 15 minutes to check in for each machine. Please collect your laundry promptly after the cycle.</p><Button variant="outline" className="mt-5 min-h-12 w-full rounded-2xl" disabled={pending} onClick={() => { setStage("edit"); setError(""); }}>Edit my plan</Button></section> :
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="min-w-0 space-y-5">
              <section className={card}><h2 className={label}>01 · What do you need?</h2><div className="mt-4 grid grid-cols-3 gap-2">{([{ value: "wash", text: "Wash", detail: "30 min", Icon: Droplets }, { value: "dry", text: "Dry", detail: "Choose length", Icon: Sparkles }, { value: "both", text: "Wash + dry", detail: "Plan a pair", Icon: Clock3 }] as const).map(item => <button type="button" key={item.value} aria-pressed={kind === item.value} onClick={() => { setKind(item.value); setError(""); }} className={`min-w-0 rounded-2xl border p-3 text-left transition sm:p-4 ${kind === item.value ? "border-primary bg-secondary ring-1 ring-primary" : "hover:bg-surface"}`}><item.Icon className="mb-3 size-5 text-primary" /><span className="block text-sm font-extrabold">{item.text}</span><span className="mt-1 block text-[10px] text-muted-foreground sm:text-xs">{item.detail}</span></button>)}</div><div className="mt-5">{kind === "dry" ? <DryerDuration value={dryDuration} onChange={setDryDuration} /> : <p className="flex items-center gap-2 rounded-xl bg-surface px-3 py-3 text-sm"><Droplets className="size-4 text-primary" /><strong>30-minute wash</strong><span className="text-muted-foreground">· fixed cycle</span></p>}</div></section>
              <section className={card}><h2 className={label}>02 · {kind === "dry" ? "Dryer" : "Washer"} date</h2><div className="mt-5"><CalendarPicker name={kind === "dry" ? "Dryer" : "Washer"} value={primaryDate} today={today} onChange={date => { if (kind === "dry") { setDryDate(date); setDryTime(""); } else { setWashDate(date); setWashTime(""); } setError(""); }} /></div></section>
              <section className={card}><h2 className={label}>03 · {kind === "dry" ? "Dryer" : "Washer"} start time</h2><p className="mb-4 mt-2 font-extrabold">{dateLabel(primaryDate)}{primaryTime && <span className="ml-2 text-primary">· {primaryTime}</span>}</p><TimePicker key={`${kind}-${primaryDate}`} name={kind === "dry" ? "Dryer" : "Washer"} slots={primarySlots} value={primaryTime} onChange={time => { if (kind === "dry") setDryTime(time); else setWashTime(time); setError(""); }} /></section>
              {kind === "both" && <section className={card}><h2 className={label}>04 · Make the dryer fit</h2><div className="mt-4"><DryerDuration value={dryDuration} onChange={setDryDuration} /></div><div className="mt-5 rounded-[22px] bg-[#f3f6e9] p-4"><div className="flex items-start gap-3"><Sparkles className="mt-1 size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-muted-foreground">{manualDryer ? "Your dryer choice" : "Suggested dryer slot"}</p><p className="mt-1 text-xl font-black">{dryerTime ? `${dryerTime} · ${dateLabel(dryerDate)}` : primaryTime ? "No available pairing" : "Choose a wash time first"}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">The earliest free dryer after your 30-minute wash and a 15-minute buffer. You can choose a later time or another day.</p></div></div>{dryerTime && <Button variant="outline" className="mt-4 min-h-11 w-full rounded-xl bg-white" onClick={customiseDryer}>Change dryer time</Button>}{!dryerTime && primaryTime && <Button variant="outline" className="mt-4 w-full" onClick={customiseDryer}>Browse dryer times</Button>}{manualDryer && suggestion && <button type="button" className="mt-3 min-h-10 w-full text-sm font-bold text-primary" onClick={() => { setManualDryer(false); setEditingDryer(false); setError(""); }}>Use suggested {suggestion.time} on {dateLabel(suggestion.dateIso)}</button>}</div>{editingDryer && <div className="mt-6 space-y-5 border-t pt-5"><CalendarPicker name="Dryer" value={dryerDate} today={today} onChange={date => { setDryDate(date); setDryTime(""); setManualDryer(true); setError(""); }} /><TimePicker key={`dryer-${dryerDate}`} name="Dryer" slots={dryerSlots} value={dryerTime} onChange={time => { setDryTime(time); setManualDryer(true); setError(""); }} /></div>}</section>}
            </div>
            <aside className={`${card} lg:sticky lg:top-6`}><h2 className={label}>Your laundry plan</h2>{primaryTime && !invalid ? <div className="mt-4"><ReservationSummary request={request} /></div> : <div className="mt-4 space-y-3"><p className="text-xl font-black">A little planning,<br />a lot less waiting.</p><p className="text-sm leading-6 text-muted-foreground">{primaryTime && invalid ? invalid : "Pick a date and a free start time to build your plan."}</p></div>}<div className="mt-5 border-t pt-4"><p className="flex gap-2 text-xs font-semibold"><Clock3 className="size-4 shrink-0 text-primary" />15-minute check-in grace for each slot</p><p className="mt-3 text-xs leading-5 text-muted-foreground">Slots are shared with all RC4 residents. They’re held only after you confirm.</p></div></aside>
          </div>}
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-white/95 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur"><div className="mx-auto flex w-full max-w-[1016px] items-center gap-3 sm:gap-6"><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{stage === "review" ? "Ready to reserve?" : primaryTime ? `${dateLabel(primaryDate)} · ${primaryTime}` : "Choose your start time"}</p><p className="mt-1 text-xs text-muted-foreground">{kind === "both" ? "Washer + dryer · two reserved slots" : kind === "wash" ? "Washer · 30-minute cycle" : `Dryer · ${dryDuration}-minute cycle`}</p></div><Button className="min-h-12 shrink-0 rounded-2xl px-4 text-sm font-bold sm:px-7" disabled={pending || !ready || (stage === "edit" && Boolean(invalid))} onClick={() => { if (stage === "review") void confirm(); else review(); }}>{pending ? "Reserving…" : stage === "review" ? "Confirm booking" : "Review booking"}<ArrowRight className="size-4" /></Button></div></footer>
      </>}
    </div>
  </main>;
}
