/* No page caching: bookings and queue state must not be served as stale snapshots. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let notice;
  try { notice = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(notice.title || "ChopeWash", {
    body: notice.body || "", icon: "/icons/app-192.png", badge: "/icons/app-192.png",
    tag: notice.id || "chopewash-update", data: { url: notice.url || "/" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/";
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => new URL(client.url).origin === url.origin);
    if (existing) { await existing.navigate(url.href); return existing.focus(); }
    return self.clients.openWindow(url.href);
  })());
});
