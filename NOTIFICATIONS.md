# Installation and notifications

Installation lives in App options. Supported browsers offer their native prompt; others receive a guide. iPhone installation uses the browser Share menu. The service worker does not cache laundry data or support offline reservations.

## Shared inbox

The database stores owner-only, deduplicated notifications. Read status follows the account across devices. Category preferences filter the inbox and update the opted-in device's push preferences. New foreground events produce toasts; opening the app does not replay old alerts.

Implemented events: reservation confirmation; ten minutes before start; slot start; two-minute check-in warning; missed booking; queue offer; one-minute claim warning; expired offer; cycle start; five minutes remaining; ready to collect.

Successful join/leave/cancel actions also confirm directly in the UI. Estimates never generate a false machine-ready alert. Pending warnings are invalidated on check-in, cancellation or release.

## Closed-app Web Push setup

These additional steps are required beyond installation/permission:

1. Generate a VAPID pair locally with `npx web-push generate-vapid-keys`. Never commit the private half or paste it into chat.
2. Configure Vercel environment variables:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: public half, intentionally browser-visible.
   - `VAPID_PRIVATE_KEY`: private/server-only.
   - `VAPID_SUBJECT`: real project contact, such as a mailto address.
   - `SUPABASE_SERVICE_ROLE_KEY`: privileged key for the correct Supabase project, server-only.
   - `CRON_SECRET`: strong random scheduler token, server-only.
3. Redeploy so the browser receives the public VAPID key.
4. Enable Supabase Cron and its 30-second database tick from `supabase/scheduler.sql`.
5. Enable pg_net. Create Vault secrets `rc4_push_url` (the production dispatch endpoint) and `rc4_cron_secret` (matching Vercel's token). Run the commented push scheduler block in that SQL file.
6. Enable device alerts in Notifications on each test device. On iPhone, use the installed Home Screen app on a supported OS.
7. Test an actual scheduled reminder/offer with the app closed on physical iOS and Android devices. A foreground test alert verifies display permission, not background scheduling.

The POST-only worker requires the private bearer token. It leases batches, ignores expired notices, removes expired subscriptions and retries transient failures up to five attempts. Tags reduce duplicate alerts; delivery is best-effort, not exactly-once. The inbox and timers remain authoritative.

Turning device alerts off removes the subscription. Sign-out also removes this device's subscription before ending the session. Allowed HTTPS browser-push providers are restricted to prevent arbitrary HTTP destinations.

A once-daily cron is insufficient for five-minute queue offers. Verify Supabase Cron job logs. Do not expose an unauthenticated sender or treat local demo data as trusted backend records.
