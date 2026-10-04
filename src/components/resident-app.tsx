"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  ExternalLink,
  ListOrdered,
  LogIn,
  LogOut,
  QrCode,
  Settings2,
  WashingMachine,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { MachineIllustration } from "@/components/machine-illustration";
import { YourLaundry } from "@/components/your-laundry";
import { QueueFlow } from "@/components/queue-flow";
import { QueueDashboard } from "@/components/queue-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLaundryStore } from "@/lib/laundry-store";
import { cn } from "@/lib/utils";
import { createResidentAccount, getSupabaseClient, signInWithUsername } from "@/lib/supabase";
import { useChopeWashTools } from "@/lib/use-webmcp";
import { disconnectPush, useNotifications } from "@/lib/use-notifications";
import { NotificationCentre } from "@/components/notification-centre";
import { InstallApp } from "@/components/install-app";

type View = "home" | "bookings" | "queue";

function statusLabel(status: string, minutes: number) {
  if (status === "running") return `${minutes} min left`;
  if (status === "finished") return "Collect now";
  if (status === "offline") return "Offline";
  return "Available";
}

export function ResidentApp() {
  const { state, ready, error: backendError, addBooking, joinQueue, leaveQueue, cancelBooking, collectBooking } = useLaundryStore();
  const [signedIn, setSignedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [view, setView] = useState<View>("home");
  const router = useRouter();
  const [queueOpen, setQueueOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const apply = (email?: string) => {
      setUsername(email?.split("@")[0] ?? "");
      setSignedIn(Boolean(email));
      const linkedView = new URLSearchParams(window.location.search).get("view");
      if (linkedView === "queue" || linkedView === "bookings") setView(linkedView);
    };
    void client.auth.getSession().then(({ data }) => apply(data.session?.user.email));
    const { data } = client.auth.onAuthStateChange((_event, session) => apply(session?.user.email));
    return () => data.subscription.unsubscribe();
  }, []);

  const availableCount = useMemo(() => state.machines.filter((machine) => machine.status === "available").length, [state.machines]);
  const showQueue = useCallback(() => setView("queue"), []);
  const showBookings = useCallback(() => setView("bookings"), []);
  const navigateFromNotice = useCallback((next: "bookings" | "queue") => { setView(next); setNotificationsOpen(false); }, []);
  const notifications = useNotifications(state, ready && signedIn, username, navigateFromNotice);
  useChopeWashTools({ state, addBooking, joinQueue, showQueue, showBookings });

  const signIn = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const username = String(data.get("username") ?? "");
    const password = String(data.get("password") ?? "");
    setLoginPending(true);
    setLoginError("");
    try {
      const result = creatingAccount
        ? await createResidentAccount(username, password)
        : await signInWithUsername(username, password);
      setUsername(result.username);
      setSignedIn(true);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "That username or password didn’t work.");
    } finally {
      setLoginPending(false);
    }
  };

  if (!signedIn) {
    return (
      <main className="min-h-dvh bg-canvas px-5 py-6 sm:grid sm:place-items-center sm:py-12">
        <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_28px_80px_rgba(28,39,76,0.14)]">
          <div className="relative overflow-hidden bg-ink px-7 pb-12 pt-8 text-white">
            <div className="absolute -right-14 -top-12 size-52 rounded-full border-[28px] border-primary/40" />
            <div className="absolute -bottom-24 left-8 size-44 rounded-full bg-lime/20 blur-2xl" />
            <div className="relative [&_span:last-child]:text-white [&_span:last-child_span]:text-lime"><BrandMark /></div>
            <div className="relative mt-14">
              <Badge className="mb-4 rounded-full bg-lime px-3 py-1 text-ink hover:bg-lime">RC4 laundry</Badge>
              <h1 className="max-w-xs text-[2.65rem] font-black leading-[0.96] tracking-[-0.065em]">Less waiting.<br />More living.</h1>
              <p className="mt-4 max-w-sm text-[1rem] leading-6 text-white/68">Book ahead or join the live queue before carrying your laundry downstairs.</p>
            </div>
          </div>
          <form className="space-y-5 px-7 py-7" onSubmit={(event) => { event.preventDefault(); void signIn(event.currentTarget); }}>
            <div className="space-y-2"><Label htmlFor="username">Username</Label><Input key={`username-${creatingAccount}`} id="username" name="username" required defaultValue="" autoComplete="username" className="h-12 rounded-2xl bg-surface" /></div>
            <div className="space-y-2"><Label htmlFor="password">Password</Label><Input key={`password-${creatingAccount}`} id="password" name="password" type="password" required minLength={creatingAccount ? 8 : 1} defaultValue="" autoComplete={creatingAccount ? "new-password" : "current-password"} className="h-12 rounded-2xl bg-surface" /></div>
            {loginError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{loginError}</p>}
            <Button disabled={loginPending} className="h-12 w-full rounded-2xl text-[0.98rem] font-bold" type="submit">{loginPending ? "Please wait…" : creatingAccount ? "Create account" : "Enter laundry room"} <LogIn className="size-4" /></Button>
            <button type="button" className="w-full text-center text-sm font-bold text-primary" onClick={() => { setCreatingAccount((current) => !current); setLoginError(""); }}>
              {creatingAccount ? "Already have an account? Sign in" : "New here? Create an RC4 account"}
            </button>
            <p className="text-center text-xs leading-5 text-muted-foreground">Your account works across devices. All RC4 residents share the same four machines.</p>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <Toaster position="top-center" richColors />
      <div className="mx-auto min-h-dvh max-w-[1160px] bg-canvas sm:px-6 lg:px-10">
        <header className="flex items-center justify-between px-5 pb-4 pt-6 sm:px-0 sm:pt-8">
          <button onClick={() => setView("home")}><BrandMark /></button>
          <div className="flex items-center gap-2">
            <nav className="mr-3 hidden items-center gap-1 rounded-2xl border bg-white p-1.5 sm:flex">
              {(["home", "bookings", "queue"] as const).map((item) => (
                <button key={item} onClick={() => setView(item)} className={`rounded-xl px-4 py-2 text-sm font-bold capitalize ${view === item ? "bg-ink text-white" : "text-muted-foreground hover:bg-surface"}`}>{item}</button>
              ))}
            </nav>
            <Link href="/display" className="hidden h-11 items-center gap-2 rounded-2xl border bg-white px-4 text-sm font-bold shadow-sm lg:flex">Room display <ExternalLink className="size-4" /></Link>
            <button onClick={() => setNotificationsOpen(true)} className="relative grid size-11 place-items-center rounded-2xl border bg-white shadow-sm" aria-label={`Notifications${notifications.unread ? `, ${notifications.unread} unread` : ""}`}>
              <Bell className="size-5" />{notifications.unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white ring-2 ring-white">{notifications.unread > 9 ? "9+" : notifications.unread}</span>}
            </button>
            <button onClick={() => setOptionsOpen(true)} aria-label="App options" className="grid size-11 place-items-center rounded-2xl border bg-white shadow-sm"><Settings2 className="size-5" /></button>
          </div>
        </header>

        {backendError && <p role="alert" className="m-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800">Could not connect to the RC4 booking system. {backendError} Reservations are unavailable until the connection returns.</p>}
        {!ready && !backendError && <p className="px-5 py-3 text-sm">Connecting to RC4…</p>}
        {view === "home" && (
          <div className="animate-float-in">
            <section className="px-5 pt-4 sm:px-0">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div><p className="text-sm font-bold text-primary">{new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1 className="mt-1 text-[2.25rem] font-black leading-tight tracking-[-0.055em] sm:text-5xl">Good afternoon, {username.charAt(0).toUpperCase() + username.slice(1)}.</h1><p className="mt-2 text-base text-muted-foreground">What works for your schedule today?</p></div>
                <div className="flex gap-2 rounded-2xl border bg-white p-2 text-sm shadow-sm"><span className="rounded-xl bg-mint px-3 py-2 font-bold text-emerald-900">{availableCount} available</span><span className="px-3 py-2 font-semibold text-muted-foreground">RC4 · Level 1</span></div>
              </div>
            </section>

            <YourLaundry state={state} showBookings={showBookings} showQueue={showQueue} />

            <section className="grid gap-3 px-5 pt-7 sm:grid-cols-2 sm:px-0">
              <button disabled={!ready} onClick={() => router.push("/book")} className="group relative overflow-hidden rounded-[28px] bg-primary p-6 text-left text-white shadow-[0_18px_42px_rgba(47,77,255,0.24)] transition-transform hover:-translate-y-0.5">
                <CalendarDays className="mb-9 size-7" /><p className="text-2xl font-black tracking-[-0.04em]">Book a time</p><p className="mt-1 text-sm text-white/70">Plan washing, drying, or both.</p><ChevronRight className="absolute bottom-6 right-6 size-6 transition-transform group-hover:translate-x-1" /><div className="absolute -right-12 -top-16 size-44 rounded-full border-[24px] border-white/10" />
              </button>
              <button disabled={!ready} onClick={() => setQueueOpen(true)} className="group relative overflow-hidden rounded-[28px] bg-lime p-6 text-left text-ink shadow-[0_18px_42px_rgba(153,202,62,0.2)] transition-transform hover:-translate-y-0.5">
                <ListOrdered className="mb-9 size-7" /><p className="text-2xl font-black tracking-[-0.04em]">Join the queue</p><p className="mt-1 text-sm text-ink/65">Get the next free machine.</p><ChevronRight className="absolute bottom-6 right-6 size-6 transition-transform group-hover:translate-x-1" /><div className="absolute -bottom-20 -right-7 size-44 rounded-full border-[24px] border-ink/7" />
              </button>
            </section>

            <section className="px-5 pb-28 pt-8 sm:px-0 sm:pb-12">
              <div className="mb-4 flex items-center justify-between"><div><p className="text-xl font-black tracking-[-0.035em]">Laundry room status</p><p className="text-sm text-muted-foreground">{ready ? "Shared RC4 status · refreshes every 5 seconds" : "Connecting…"}</p></div><Button variant="ghost" onClick={() => setView("queue")} className="rounded-xl text-primary">View all</Button></div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {state.machines.map((machine) => {
                  return (
                    <Card key={machine.id} className="gap-0 overflow-hidden rounded-[24px] border-white bg-white p-3 shadow-[0_10px_30px_rgba(28,39,76,0.07)] sm:p-4">
                      <div className="flex justify-start"><Badge variant="secondary" className={`rounded-full text-xs ${machine.status === "available" ? "bg-mint text-emerald-900" : machine.status === "finished" ? "bg-amber-100 text-amber-900" : machine.status === "offline" ? "bg-surface text-muted-foreground" : "bg-secondary text-secondary-foreground"}`}>{statusLabel(machine.status, machine.minutesLeft)}</Badge></div>
                      <div className={`mt-3 flex items-center justify-center rounded-2xl ${machine.kind === "washer" ? "bg-[#f1f4ff]" : "bg-[#fff5ee]"}`}><MachineIllustration kind={machine.kind} status={machine.status} /></div>
                      <div className="pt-3"><p className="font-extrabold">{machine.name}</p><p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{machine.mode === "booking" ? "Booking machine" : `${machine.queueLength} in queue`}</p><p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className={`size-1.5 rounded-full ${machine.status === "available" ? "bg-emerald-500" : machine.status === "running" ? "bg-primary" : machine.status === "finished" ? "bg-amber-500" : "bg-slate-400"}`} />{machine.status === "running" ? machine.kind === "washer" ? "Washing" : "Drying" : machine.status === "available" ? "Ready to start" : machine.status === "finished" ? "Cycle complete" : "Out of service"}</p></div>
                    </Card>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {view === "bookings" && (
          <section className="animate-float-in px-5 pb-28 pt-5 sm:px-0 sm:pb-12">
            <div className="flex items-end justify-between"><div><p className="text-sm font-bold text-primary">Your plans</p><h1 className="text-4xl font-black tracking-[-0.055em]">Bookings</h1></div><Button disabled={!ready} onClick={() => router.push("/book")} className="rounded-2xl">New booking</Button></div>
            <div className="mt-7 grid gap-4 md:grid-cols-2">
              {state.bookings.length === 0 ? (
                <div className="col-span-full rounded-[28px] border border-dashed bg-white p-9 text-center"><CalendarDays className="mx-auto size-8 text-primary" /><p className="mt-4 text-xl font-black">Nothing choped yet</p><p className="mt-2 text-sm text-muted-foreground">Reserve a washer, dryer, or both for the next 14 days.</p><Button className="mt-5 rounded-2xl" disabled={!ready} onClick={() => router.push("/book")}>Book a time</Button></div>
              ) : state.bookings.map((booking) => (
                <Card key={booking.id} className="rounded-[28px] border-white bg-white p-5 shadow-[0_12px_36px_rgba(28,39,76,0.08)]">
                  <div className="flex items-start justify-between"><Badge className="rounded-full bg-mint text-emerald-900 hover:bg-mint">{booking.status === "checked-in" ? "In progress" : booking.status}</Badge><span className="text-sm font-bold text-muted-foreground">{booking.duration} min</span></div>
                  <p className="mt-6 text-2xl font-black capitalize tracking-[-0.04em]">{booking.kind === "both" ? "Wash + dry" : booking.kind}</p>
                  <p className="mt-2 font-bold">{booking.dateLabel} · {booking.startTime}</p>
                  {booking.dryerTime && <p className="mt-1 text-sm text-muted-foreground">Suggested dryer at {booking.dryerTime}</p>}
                  {booking.status === "confirmed" && <><Link href={`/check-in?booking=${booking.id}`} className={cn(buttonVariants({ variant: "outline" }), "mt-6 h-11 w-full rounded-2xl")}><QrCode className="size-4" /> Check in downstairs</Link><Button variant="ghost" className="mt-2 w-full" onClick={async () => { if (!window.confirm("Cancel this reservation? Any upcoming dryer in the same reservation will also be cancelled.")) return; try { await cancelBooking(booking.id); toast.success("Reservation cancelled"); } catch (error) { toast.error(error instanceof Error ? error.message : "Cancellation failed"); } }}>Cancel reservation</Button></>}
                  {booking.status === "checked-in" && booking.startedAt && Date.parse(state.serverTime ?? "") >= Date.parse(booking.startedAt) + booking.duration * 60000 && <Button className="mt-6 w-full rounded-2xl" onClick={async () => { try { await collectBooking(booking.id); toast.success("Machine released. Thank you!"); } catch (error) { toast.error(error instanceof Error ? error.message : "Collection failed"); } }}>I’ve collected my laundry</Button>}
                </Card>
              ))}
            </div>
          </section>
        )}

        {view === "queue" && (
          <section className="animate-float-in px-5 pb-28 pt-5 sm:px-0 sm:pb-12">
            <p className="text-sm font-bold text-primary">Spontaneous laundry</p><h1 className="text-4xl font-black tracking-[-0.055em]">Your next machine</h1><p className="mt-2 mb-7 text-muted-foreground">Join a queue, follow your turn, and head down when it’s ready.</p>
            <QueueDashboard state={state} onJoin={joinQueue} onLeave={leaveQueue} />
          </section>
        )}

        <nav className="fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-[420px] items-center justify-around rounded-[24px] border border-white/70 bg-ink/95 px-3 py-2 text-white shadow-[0_18px_60px_rgba(18,27,51,0.3)] backdrop-blur sm:hidden">
          {([{ label: "Home", value: "home", icon: WashingMachine }, { label: "Bookings", value: "bookings", icon: CalendarDays }, { label: "Queue", value: "queue", icon: Clock3 }] as const).map(({ label, value, icon: Icon }) => (
            <button key={label} onClick={() => setView(value)} className={`flex min-w-20 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-bold ${view === value ? "bg-white/12 text-lime" : "text-white/58"}`}><Icon className="size-4" />{label}</button>
          ))}
        </nav>
      </div>

      <QueueFlow open={queueOpen} onOpenChange={setQueueOpen} state={state} onJoin={joinQueue} onLeave={leaveQueue} />
      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto rounded-l-[28px] sm:max-w-[460px]">
          <SheetHeader className="border-b px-6 pb-5 pt-7"><SheetTitle className="text-3xl font-black tracking-[-0.05em]">Notifications</SheetTitle><SheetDescription>Updates that need your attention.</SheetDescription></SheetHeader>
          <NotificationCentre notifications={notifications} navigate={navigateFromNotice} openOptions={() => { setNotificationsOpen(false); setOptionsOpen(true); }} />
        </SheetContent>
      </Sheet>
      <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto rounded-l-[28px] sm:max-w-[420px]">
          <SheetHeader className="border-b px-6 pb-5 pt-7"><SheetTitle className="text-3xl font-black tracking-tight">App options</SheetTitle><SheetDescription>Quick access and updates, your way.</SheetDescription></SheetHeader>
          <div className="space-y-4 p-5"><InstallApp /><Button variant="outline" className="h-12 w-full justify-start rounded-2xl" onClick={() => { setOptionsOpen(false); setNotificationsOpen(true); }}><Bell className="size-4" />Notification preferences</Button>
            <button onClick={() => { void (async () => { try { await disconnectPush(); await getSupabaseClient()?.auth.signOut({ scope: "local" }); } catch { toast.error("Could not sign out safely. Please try again."); } })(); }} className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-bold text-muted-foreground hover:bg-surface"><LogOut className="size-4" /> Sign out</button>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
