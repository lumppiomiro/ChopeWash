"use client";

import { useState } from "react";
import { Bell, BellRing, CheckCheck, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { deviceNotice, type useNotifications } from "@/lib/use-notifications";

export function NotificationCentre({ notifications, navigate, openOptions }: { notifications: ReturnType<typeof useNotifications>; navigate: (view: "bookings" | "queue") => void; openOptions: () => void }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const enable = async () => {
    setPending(true); setMessage("");
    try { await notifications.enableDevice(); setMessage("Device alerts enabled. Background delivery requires the RC4 scheduler to be configured."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not enable device alerts."); }
    finally { setPending(false); }
  };
  const test = async () => {
    try { await deviceNotice({ id: "chopewash-test", title: "ChopeWash alerts are ready", body: "Your booking and queue updates can appear here even when the app is closed.", view: "queue" }); setMessage("Test alert sent. Your phone or browser may silence it based on its settings."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not display the test alert."); }
  };
  const deviceEnabled = notifications.preferences.device && notifications.permission === "granted";
  return <div className="space-y-6 p-5">
    <section className="rounded-[22px] border bg-surface p-4"><div className="flex items-start gap-3"><BellRing className="mt-1 size-5 shrink-0 text-primary" /><div><h3 className="font-extrabold">Stay in the loop</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Your booking, queue and cycle updates appear here automatically. Optional Web Push can notify you even when the app is closed, once the RC4 backend scheduler is configured. Delivery depends on your device settings.</p></div></div>
      <div className="mt-4 flex flex-wrap gap-2">{deviceEnabled ? <><Button size="sm" variant="outline" onClick={() => void test()}>Send test alert</Button><Button size="sm" variant="ghost" onClick={() => notifications.setPreference("device", false)}>Turn device alerts off</Button></> : <Button size="sm" disabled={pending} onClick={() => void enable()}>{pending ? "Enabling…" : "Enable device alerts"}</Button>}<Button size="sm" variant="ghost" onClick={openOptions}>Install help</Button></div>
      {message && <p role="status" className="mt-3 text-xs leading-5 text-muted-foreground">{message}</p>}
    </section>
    <section aria-label="Notification preferences" className="space-y-4">{([
      ["bookings", "Booking reminders", "10 minutes before, slot start, deadline and missed check-in"],
      ["queue", "Queue updates", "Your turn, claim deadline and missed offers"],
      ["cycles", "Cycle updates", "5 minutes remaining and ready to collect"],
    ] as const).map(([name, title, detail]) => <div key={name} className="flex items-center justify-between gap-4"><div><label htmlFor={`notice-${name}`} className="text-sm font-bold">{title}</label><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div><Switch id={`notice-${name}`} checked={notifications.preferences[name]} onCheckedChange={(checked) => notifications.setPreference(name, checked)} /></div>)}</section>
    <section aria-label="Notification history"><div className="mb-3 flex items-center justify-between"><h3 className="font-extrabold">Your updates</h3>{notifications.unread > 0 && <Button variant="ghost" size="sm" onClick={() => notifications.markRead()}><CheckCheck className="size-4" />Mark all read</Button>}</div>
      {notifications.notices.length === 0 ? <div className="rounded-[22px] border border-dashed p-7 text-center"><Bell className="mx-auto size-6 text-primary" /><p className="mt-3 font-bold">You’re all caught up</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Book a slot or join a queue to start receiving laundry updates.</p></div> : <div className="space-y-3">{notifications.notices.map((notice) => <button key={notice.id} onClick={() => { notifications.markRead(notice.id); navigate(notice.view); }} className={`w-full rounded-[22px] border p-4 text-left ${notice.read ? "bg-white" : notice.urgent ? "border-primary/20 bg-secondary" : "bg-surface"}`}><div className="flex items-start gap-2"><p className="flex-1 text-sm font-extrabold">{notice.title}</p>{!notice.read && <span aria-label="Unread" className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}<ArrowUpRight className="size-4 shrink-0 text-muted-foreground" /></div><p className="mt-2 text-sm leading-5 text-muted-foreground">{notice.body}</p><p className="mt-3 text-[11px] text-muted-foreground">{new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(notice.time)}</p></button>)}</div>}
    </section>
  </div>;
}
