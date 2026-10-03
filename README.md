# ChopeWash

ChopeWash is a mobile-first laundry booking and virtual queue prototype for RC4 residents. It reduces wasted trips by showing live machine status, supporting advance bookings, and reserving separate machines for spontaneous queue use.

## Prototype routes

- `/` — resident sign-in, room status, booking, queue, and reservations
- `/display` — laundry-room display with machine status and QR check-in
- `/check-in` — QR/NFC-style arrival and cycle-start flow
- `/ops` — hidden operator simulator for usability tests

The app runs in demo mode without configuration. Demo state is stored in the browser so the resident, display, and operator routes can be tested immediately on one device. The operator screen simulates the future ESP32 vibration-sensor events.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The pre-filled prototype credentials are `tessa` / `prototype`; `miro` / `1234` also works. Testers can create device-local prototype accounts from the sign-in screen.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and add the project URL and publishable key. Never commit `.env.local` or use a service-role/secret key in a public variable.
4. Create pilot users with synthetic emails in the form `username@chopewash.rc4`; the UI converts usernames to this address before calling Supabase Auth.

The schema includes profiles, dedicated booking/queue machines, collision-safe bookings, queue entries, RLS policies, and a machine-event table for future ESP32 integration. The current UI deliberately keeps its browser demo adapter until Supabase credentials are available.

## Booking model

- Reservations are available 14 days ahead in 15-minute intervals.
- Cycles can be 30, 45, or 60 minutes.
- Check-in has a 15-minute grace period.
- Washer 01 and Dryer 01 are bookable.
- Washer 02 and Dryer 02 are queue-only.
- Queue offers are intended to expire after five minutes.

## Deployment

Import this repository into Vercel. Add the two Supabase environment variables in Vercel when the database is connected. No other build configuration is required.

See [SECURITY.md](SECURITY.md) for safe team setup, credential handling, and the prototype's authentication limitations.

Installation is available from App options. The bell opens real booking/queue/cycle updates with category preferences and optional device alerts. See [NOTIFICATIONS.md](NOTIFICATIONS.md) for triggers, testing, and the current limitation: alerts while the app is closed require backend Web Push delivery, which is not connected yet.
