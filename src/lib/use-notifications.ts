"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { LaundryState } from "@/lib/laundry-store";
import type { LaundryNotice, NoticeGroup } from "@/lib/notification-events";
import { requireSupabase } from "@/lib/supabase";
type Preferences = Record<NoticeGroup, boolean> & { device: boolean };
const defaults: Preferences = { bookings: true, queue: true, cycles: true, device: false };
export async function deviceNotice(notice: Pick<LaundryNotice, "id" | "title" | "body" | "view">) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active) throw new Error("Alerts are still preparing. Please try again.");
  await registration.showNotification(notice.title, { body: notice.body, icon: "/branding/icon-192.png", tag: notice.id, data: { url: `/?view=${notice.view}` } });
}
async function syncPush(preferences: Preferences) {
  const client = requireSupabase();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Sign in before enabling device alerts.");
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  if (!preferences.device) {
    const result = await client.from("rc4_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    if (result.error) throw result.error;
    await subscription.unsubscribe();
    return;
  }
  const result = await client.from("rc4_push_subscriptions").upsert({
    endpoint: subscription.endpoint, user_id: data.user.id, subscription: subscription.toJSON(),
    preferences: { bookings: preferences.bookings, queue: preferences.queue, cycles: preferences.cycles },
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (result.error) throw result.error;
}
export async function disconnectPush() {
  if (!("serviceWorker" in navigator)) return;
  await syncPush({ ...defaults, device: false });
}
export function useNotifications(_state: LaundryState, active: boolean, username: string, navigate: (view: "bookings" | "queue") => void) {
  const [notices, setNotices] = useState<LaundryNotice[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const seen = useRef<Set<string> | null>(null);
  const key = `chopewash-notification-preferences-${username}`;
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let pending = false;
    seen.current = null;
    const tick = async () => {
      if (pending) return; pending = true;
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
        const prefs = { ...defaults, ...saved } as Preferences;
        if (prefs.device && "serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.getRegistration("/");
          if (!await registration?.pushManager?.getSubscription()) prefs.device = false;
        }
        const { data, error } = await requireSupabase().from("rc4_notifications").select("id,title,body,category,view,created_at,read_at").order("created_at", { ascending: false }).limit(100);
        if (error || !mounted) return;
        const all: LaundryNotice[] = (data ?? []).map(row => ({ id: row.id, title: row.title, body: row.body, group: row.category as NoticeGroup, view: row.view as LaundryNotice["view"], time: Date.parse(row.created_at), read: Boolean(row.read_at) }));
        const visible = all.filter(notice => prefs[notice.group]);
        if (seen.current && document.visibilityState === "visible") for (const notice of visible) {
          if (!seen.current.has(notice.id)) toast(notice.title, { description: notice.body, action: { label: "View", onClick: () => navigate(notice.view) } });
        }
        seen.current = new Set(all.map(notice => notice.id));
        setNotices(visible); setPreferences(prefs);
        setPermission("Notification" in window ? Notification.permission : "unsupported");
      } catch { /* Shared-state connection banner reports outages; never fabricate events. */ }
      finally { pending = false; }
    };
    void tick();
    const timer = window.setInterval(tick, 5000);
    return () => { mounted = false; clearInterval(timer); };
  }, [active, key, navigate]);
  const change = useCallback(async (name: keyof Preferences, value: boolean) => {
    const next = { ...preferences, [name]: value };
    try {
      if ("serviceWorker" in navigator) await syncPush(next);
      localStorage.setItem(key, JSON.stringify(next)); setPreferences(next);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save notification preferences."); }
  }, [key, preferences]);
  return {
    notices, unread: notices.filter(notice => !notice.read).length, preferences, permission,
    markRead: async (id?: string) => {
      const result = await requireSupabase().rpc("rc4_action", { action: "readNotifications", payload: id ? { id } : {} });
      if (result.error) { toast.error("Could not mark notifications read."); return; }
      setNotices(current => current.map(notice => !id || notice.id === id ? { ...notice, read: true } : notice));
    },
    setPreference: (name: keyof Preferences, value: boolean) => { void change(name, value); },
    enableDevice: async () => {
      if (!("Notification" in window) || !("PushManager" in window)) throw new Error("This browser doesn't support Web Push. On iPhone, install ChopeWash and open it from the Home Screen first.");
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Closed-app alerts need backend setup. Ask the project owner to configure Web Push. Your in-app inbox already works.");
      const result = await Notification.requestPermission(); setPermission(result);
      if (result !== "granted") throw new Error("Notifications weren't enabled. Check your browser notification settings.");
      const registration = await navigator.serviceWorker.ready;
      const decoded = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
      const applicationServerKey = Uint8Array.from(decoded, char => char.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      try {
        const next = { ...preferences, device: true };
        await syncPush(next);
        localStorage.setItem(key, JSON.stringify(next)); setPreferences(next);
      } catch (error) { await subscription.unsubscribe(); throw error; }
    },
  };
}
