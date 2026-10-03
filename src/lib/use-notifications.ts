"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DemoState } from "@/lib/demo-store";
import { notificationEvents, type LaundryNotice, type NoticeGroup } from "@/lib/notification-events";

type Preferences = Record<NoticeGroup, boolean> & { device: boolean };
type Inbox = { notices: LaundryNotice[]; seen: string[]; preferences: Preferences; queueSnapshot?: DemoState["queueEntries"] };
const defaults: Inbox = { notices: [], seen: [], preferences: { bookings: true, queue: true, cycles: true, device: false } };
function readInbox(key: string): Inbox {
  try { const saved = JSON.parse(localStorage.getItem(key) ?? "null"); return saved ? { ...defaults, ...saved, preferences: { ...defaults.preferences, ...saved.preferences } } : defaults; }
  catch { return defaults; }
}

export async function deviceNotice(notice: Pick<LaundryNotice, "id" | "title" | "body" | "view">) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active) throw new Error("Alerts are still preparing. Please try again.");
  await registration.showNotification(notice.title, { body: notice.body, icon: "/icons/app-192.png", badge: "/icons/app-192.png", tag: notice.id, data: { url: `/?view=${notice.view}` } });
}

export function useNotifications(state: DemoState, active: boolean, username: string, navigate: (view: "bookings" | "queue") => void) {
  const key = `chopewash-inbox-v1-${username}`;
  const [inbox, setInbox] = useState<Inbox>(defaults);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const loadedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const initial = loadedKey.current !== key;
      const stored = readInbox(key);
      const now = Date.now();
      const candidates = notificationEvents(state, now);
      for (const old of stored.queueSnapshot ?? []) {
        if (state.queueEntries.some((entry) => entry.id === old.id)) continue;
        // Ignore old duplicate entries removed during migration and simulator resets.
        if (!state.machines.length || state.queueEntries.some((entry) => entry.kind === old.kind && ["waiting", "offered", "claimed"].includes(entry.status))) continue;
        if (old.status === "waiting" || old.status === "offered") candidates.push({ id: `${old.id}:left`, title: "You’ve left the queue", body: `Your place in the ${old.kind} queue has been released. You can join again anytime.`, time: now, group: "queue", view: "queue" });
      }
      const fresh = candidates.filter((notice) => !stored.seen.includes(notice.id) && stored.preferences[notice.group]);
      const next = { ...stored, seen: [...new Set([...stored.seen, ...fresh.map((notice) => notice.id)])], notices: [...fresh, ...stored.notices].sort((a, b) => b.time - a.time).slice(0, 100), queueSnapshot: state.queueEntries };
      localStorage.setItem(key, JSON.stringify(next));
      setInbox(next);
      setPermission("Notification" in window ? Notification.permission : "unsupported");
      if (!initial) for (const notice of fresh) {
        if (document.visibilityState === "visible") toast(notice.title, { description: notice.body, duration: notice.urgent ? 8000 : 5000, action: { label: notice.view === "queue" ? "View queue" : "View booking", onClick: () => navigate(notice.view) } });
        else if (stored.preferences.device) void deviceNotice(notice).catch(() => {});
      }
      loadedKey.current = key;
    };
    // Keep the initial pass quiet; refreshes should never re-alert old events.
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 5000);
    const wake = () => tick();
    window.addEventListener("focus", wake);
    return () => { window.clearTimeout(first); window.clearInterval(interval); window.removeEventListener("focus", wake); };
  }, [active, key, navigate, state]);
  const change = useCallback((update: (current: Inbox) => Inbox) => {
    const next = update(readInbox(key)); localStorage.setItem(key, JSON.stringify(next)); setInbox(next);
  }, [key]);
  return {
    notices: inbox.notices, unread: inbox.notices.filter((notice) => !notice.read).length, preferences: inbox.preferences, permission,
    markRead: (id?: string) => change((current) => ({ ...current, notices: current.notices.map((notice) => !id || notice.id === id ? { ...notice, read: true } : notice) })),
    setPreference: (name: keyof Preferences, value: boolean) => change((current) => ({ ...current, preferences: { ...current.preferences, [name]: value } })),
    enableDevice: async () => {
      if (!("Notification" in window)) throw new Error("This browser doesn’t support device alerts. On iPhone, install ChopeWash and open it from your Home Screen first.");
      if (!("serviceWorker" in navigator) || !window.isSecureContext) throw new Error("Device alerts need a supported browser and a secure connection. Your in-app updates are still available.");
      const result = await Notification.requestPermission(); setPermission(result);
      if (result !== "granted") throw new Error(result === "denied" ? "Notifications are blocked. You can change this in your browser or phone settings." : "Notifications weren’t enabled. Your in-app updates are still available.");
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration?.active) throw new Error("Device alerts are still preparing. Please try enabling them again in a moment.");
      change((current) => ({ ...current, preferences: { ...current.preferences, device: true } }));
    },
  };
}
