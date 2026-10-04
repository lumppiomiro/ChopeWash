# ChopeWash

A mobile-first shared laundry system for RC4. Washer 01 and Dryer 01 are bookable; Washer 02 and Dryer 02 have separate FIFO queues. All accounts share these four machines.

## Setup

1. Run `supabase/migrations/202610040001_rc4_shared.sql`, then `supabase/migrations/202610040002_booking_redesign.sql` **once, in order** in the correct Supabase project. Review and approve the first migration's production permission changes: legacy records stay intact, but their old public/resident API access is revoked. The second migration enforces corrected cycle lengths and explicit paired dryer slots; existing reservations are not rewritten.
2. For pilot username/password accounts, disable **Confirm email** in Supabase Authentication configuration. Internal addresses use `username@chopewash.rc4`; there is no actual email inbox. This does not verify residency or provide email password recovery.
3. Set the Supabase URL and publishable key privately in `.env.local` and Vercel. Commit only the empty `.env.example`. Deploy the matching code after the migration.
4. Enable Supabase Cron and run the first statement in `supabase/scheduler.sql` for a 30-second server tick. Without it, transitions happen on the next page refresh.
5. Create accounts from the app, using passwords of at least eight characters. Old local accounts/demo passwords, reservations and queue positions are not migrated.
6. Only grant an operator role to an explicitly approved account in SQL Editor: `update public.rc4_profiles set role='operator' where username='APPROVED_USERNAME';`

## Rules

- Book today through the next 13 days in 15-minute start intervals, Singapore time. No opening-hour restriction is assumed.
- Washer cycles are always 30 minutes, including queue claims. Dryer cycles are 30, 45 or 60 minutes. Reservations block cycle length **plus 15 minutes** for the check-in grace period.
- Wash + dry reserves both machines atomically. Suggest the earliest free dryer after the washer start + 45 minutes. Residents may edit the dryer date, time and duration independently, but cannot start it before that buffer. Each segment has its own check-in and collection.
- Four active reservation groups per resident. PostgreSQL rejects overlapping reservations, including simultaneous submissions.
- Cancel upcoming reservations; all still-confirmed segments of the same pair are released.
- Queue order is server-issued. Duplicate joins retain the current place. Offers expire after five minutes and promote the next resident.
- Only the owner can check in during their booking/offer window.
- Completion keeps a machine occupied until collection is confirmed. An operator can release a finished machine after checking collection, but cannot interrupt a running cycle.
- Cycles are timed from resident check-in, not ESP32 sensors. QR navigation does not prove physical presence.
- Open pages refresh every five seconds. Personal records are owner-only; room status and anonymous occupied intervals are shared.
- No demo fallback fabricates successful reservations when the backend is unavailable.

## Routes and local development

`/`: resident app. `/book`: full-width booking page with a month calendar, grouped quarter-hour times and a review step. `/display`: shared room display. `/check-in`: start the selected reservation/offer. `/ops`: protected operations.

```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npx next build --webpack
node scripts/test-booking-planner.mjs
```

## Database tests

```bash
docker run --detach --name chopewash-db-test-20261004 -e POSTGRES_PASSWORD=local-test-only postgres:17
node scripts/test-shared-backend.mjs
```

Tests create a fresh database in this disposable container; they cannot connect to production. They cover paired atomicity, overlapping slots, simultaneous competitors, FIFO, duplicates, ownership, grace expiry, collection and authorization. Remove the named container afterwards.

For isolated mobile layout testing, run `node scripts/booking-layout-fixture.mjs`, then start Next with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4011` and a fictional `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_layout_fixture_not_a_real_key`. Visit `/book`. The fixture serves fictional availability only; authentication and reservation writes are disabled. Never use these overrides for deployment. Planner tests use Node's native TypeScript support (Node 22.18+).

See [SECURITY.md](SECURITY.md) and [NOTIFICATIONS.md](NOTIFICATIONS.md). Closed-app alerts need additional push credentials and scheduling; installation alone does not enable them.
