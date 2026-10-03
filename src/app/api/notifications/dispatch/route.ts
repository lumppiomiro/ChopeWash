import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function allowedEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) || url.hostname.endsWith(".push.apple.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(authorization) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!url || !key || !publicKey || !privateKey || !subject) return Response.json({ error: "Push backend is not configured" }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const tick = await db.rpc("rc4_tick");
  if (tick.error) return Response.json({ error: "Database scheduler failed" }, { status: 503 });
  const batch = await db.rpc("rc4_claim_notifications");
  if (batch.error) return Response.json({ error: "Notification queue unavailable" }, { status: 503 });
  let sent = 0;
  for (const notice of batch.data ?? []) {
    // Refresh after claiming: never send an invalidated booking/queue offer.
    const current = await db.from("rc4_notifications").select("valid_until").eq("id", notice.id).single();
    if (current.error) continue;
    if (current.data.valid_until && Date.parse(current.data.valid_until) <= Date.now()) continue;
    const subscriptions = await db.from("rc4_push_subscriptions").select("*").eq("user_id", notice.user_id);
    if (subscriptions.error) continue;
    let retry = false;
    for (const device of subscriptions.data ?? []) {
      if (device.preferences?.[notice.category] === false) continue;
      if (!allowedEndpoint(device.endpoint) || device.subscription?.endpoint !== device.endpoint) {
        await db.from("rc4_push_subscriptions").delete().eq("endpoint", device.endpoint);
        continue;
      }
      try {
        await webpush.sendNotification(device.subscription, JSON.stringify({ id: notice.id, title: notice.title, body: notice.body, url: `/?view=${notice.view}` }), {
          TTL: notice.valid_until ? Math.max(0, Math.min(3600, Math.floor((Date.parse(notice.valid_until) - Date.now()) / 1000))) : 3600,
          urgency: notice.category === "queue" ? "high" : "normal",
          timeout: 10000,
        });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("rc4_push_subscriptions").delete().eq("endpoint", device.endpoint);
        else retry = true;
      }
    }
    if (!retry) await db.from("rc4_notifications").update({ delivered_at: new Date().toISOString(), lease_until: null }).eq("id", notice.id);
    else await db.from("rc4_notifications").update({ lease_until: new Date(Date.now() + 60000).toISOString() }).eq("id", notice.id);
  }
  return Response.json({ sent });
}
