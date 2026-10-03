# ChopeWash

A mobile-first shared laundry system for RC4. Washer 01 and Dryer 01 are bookable; Washer 02 and Dryer 02 have separate FIFO queues. All accounts share these four machines.

## Setup

1. Run `supabase/migrations/202610040001_rc4_shared.sql` **once** in the correct Supabase project. Review and approve its production permission changes: legacy records stay intact, but their old public/resident API access is revoked.
2. For pilot username/password accounts, disable **Confirm email** in Supabase Authentication configuration. Internal addresses use `username@chopewash.rc4`; there is no actual email inbox. This does not verify residency or provide email password recovery.
3. Set the Supabase URL and publishable key privately in `.env.local` and Vercel. Commit only the empty `.env.example`. Deploy the matching code after the migration.
4. Enable Supabase Cron and run the first statement in `supabase/scheduler.sql` for a 30-second server tick. Without it, transitions happen on the next page refresh.
5. Create accounts from the app, using passwords of at least eight characters. Old local accounts/demo passwords, reservations and queue positions are not migrated.
6. Only grant an operator role to an explicitly approved account in SQL Editor: `update public.rc4_profiles set role='operator' where username='APPROVED_USERNAME';`

## Rules

- Book today through the next 13 days in 15-minute start intervals, Singapore time. No opening-hour restriction is assumed.
- Cycles: 30, 45 or 60 minutes. Reservations block cycle length **plus 15 minutes** for the check-in grace period.
- Wash + dry reserves both machines atomically. The dryer starts after wash length + 15 minutes; each segment has its own check-in and collection.
- Four active reservation groups per resident. PostgreSQL rejects overlapping reservations, including simultaneous submissions.
- Cancel upcoming reservations; all still-confirmed segments of the same pair are released.
- Queue order is server-issued. Duplicate joins retain the current place. Offers expire after five minutes and promote the next resident.
- Only the owner can check in during their booking/offer window.
- Completion keeps a machine occupied until collection is confirmed. An operator can release a finished machine after checking collection, but cannot interrupt a running cycle.
- Cycles are timed from resident check-in, not ESP32 sensors. QR navigation does not prove physical presence.
- Open pages refresh every five seconds. Personal records are owner-only; room status and anonymous occupied intervals are shared.
- No demo fallback fabricates successful reservations when the backend is unavailable.

## Routes and local development

`/`: resident app. `/display`: shared room display. `/check-in`: start the selected reservation/offer. `/ops`: protected operations.

```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npx next build --webpack
```

## Database tests

```bash
docker run --detach --name chopewash-db-test-20261004 -e POSTGRES_PASSWORD=local-test-only postgres:17
node scripts/test-shared-backend.mjs
```

Tests create a fresh database in this disposable container; they cannot connect to production. They cover paired atomicity, overlapping slots, simultaneous competitors, FIFO, duplicates, ownership, grace expiry, collection and authorization. Remove the named container afterwards.

See [SECURITY.md](SECURITY.md) and [NOTIFICATIONS.md](NOTIFICATIONS.md). Closed-app alerts need additional push credentials and scheduling; installation alone does not enable them.
