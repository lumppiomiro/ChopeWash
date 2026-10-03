# Installation and laundry updates

Install ChopeWash from App options (the sliders button in the header). Supported browsers open their native install prompt; others show a platform-specific guide. iPhone installation uses the browser's Share menu. The manifest and PNG icons support Home Screen installation and standalone launch. The service worker does not cache laundry pages or claim offline functionality.

## Notification plan

| Event | Message and action |
| --- | --- |
| Booking created | Confirmation with machine, date, time and paired dryer time |
| Booking starts in 10 minutes | Prepare laundry; view booking |
| Slot starts | Head downstairs; 15-minute check-in window |
| 2 minutes left to check in | Last call; view booking |
| Check-in window missed | Choose another slot |
| Queue joined | Position confirmation; view queue |
| First in line, current run has 5 minutes or less | Prepare, but wait for a confirmed offer |
| Machine offered | Head downstairs; five-minute claim window |
| 1 minute left to claim | Urgent reminder; view queue |
| Offer expires | Join again when ready |
| Queued machine goes offline | Check queue or leave |
| Queue left | Confirm the place was released |
| Cycle starts | Follow the timer on Home |
| Cycle has 5 minutes remaining | Prepare to collect |
| Cycle finishes | Collect laundry |

An estimate reaching zero does not generate a machine-ready alert. Readiness requires an offered queue entry. The operator simulator can change availability and queue length to exercise this flow.

## Current delivery

- A persistent, per-username notification inbox with unread counts, action links, and category preferences.
- Toasts for new events while viewing the app. Initial loading and refreshes populate the inbox quietly; event IDs prevent repeated reminders. Only the current reminder stage is generated when returning after a long absence, rather than replaying every missed warning.
- Optional system notifications when permission is granted and the page continues executing in the background. Enable and test these in Notifications. iPhone requires an installed Home Screen web app and supported OS/browser. Browser timers may be suspended, so this is not reliable delivery while closed or suspended.
- No Web Push subscriptions or server scheduler are connected yet. Installation and notification permission alone do not enable closed-app alerts.

## Background delivery follow-up

Move booking/queue ownership and timestamps from localStorage into authenticated Supabase records. Store each user's opted-in Web Push subscription with RLS, generate server-side scheduled/event-based notifications, and send Web Push from a backend worker using server-only VAPID credentials. Use stable event IDs, expiry times, and cancellation checks so a user who leaves or checks in never receives stale reminders. Add service-worker push handling and notification-click routing, then validate on physical iOS and Android devices. A cron job's frequency must be sufficient for the one-minute claim warning; a once-daily scheduler is insufficient.

Do not expose an unauthenticated send-notification endpoint or upload browser demo state as trusted backend data.
