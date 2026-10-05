# ChopeWash

A mobile-first shared laundry system for RC4. All residents share two washers and two dryers. Every machine supports advance reservations and gap-filling queue offers.

## Setup

1. Run `supabase/migrations/202610040001_rc4_shared.sql`, then `supabase/migrations/202610040002_booking_redesign.sql` then `supabase/migrations/202610050001_shared_pools.sql` **once, in order** in the correct Supabase project. Review and approve the first migration's production permission changes: legacy records stay intact, but their old public/resident API access is revoked. The second migration corrects cycle lengths. The third converts upcoming reservations to pooled capacity (machine assignment at check-in), preserves running machines/history, and adds multi-machine plans. Review all changes before production; deploy the matching app only after migration. The app refuses incompatible older snapshots.
2. For pilot username/password accounts, disable **Confirm email** in Supabase Authentication configuration. Internal addresses use `username@chopewash.rc4`; there is no actual email inbox. This does not verify residency or provide email password recovery.
3. Set the Supabase URL and publishable key privately in `.env.local` and Vercel. Commit only the empty `.env.example`. Deploy the matching code after the migration.
4. Enable Supabase Cron and run the first statement in `supabase/scheduler.sql` for a 30-second server tick. Without it, transitions happen on the next page refresh.
5. Create accounts from the app, using passwords of at least eight characters. Old local accounts/demo passwords, reservations and queue positions are not migrated.
6. Only grant an operator role to an explicitly approved account in SQL Editor: `update public.rc4_profiles set role='operator' where username='APPROVED_USERNAME';`

## Rules

- Book today through the next 13 days in 15-minute start intervals, Singapore time. No opening-hour restriction is assumed.
- Washer cycles are always 30 minutes, including queue claims. Dryer cycles are 30, 45 or 60 minutes. Reservations block cycle length **plus 15 minutes** for the check-in grace period.
- Plans reserve one or two washers (together or staggered) and one or two dryers atomically. Suggest the earliest free dryer after the latest washer start + 45 minutes. Residents may edit the dryer date, time and duration independently, but cannot start it before that buffer. Each segment has its own check-in and collection.
- Up to eight active machine cycles per resident, including queue requests and any paired drying. Each washer/dryer counts separately. All writes lock the shared machine ledger; concurrent requests cannot exceed pooled capacity.
- Cancel upcoming reservations; all still-confirmed segments of the same pair are released.
- Queue order is server-issued. Request one or two machines together and choose dryer duration before joining. Optional paired drying is held only when the washer offer is real, then converted to a reservation at check-in. Duplicate joins retain the existing request and place. Offers expire after five minutes.
- Queue offers require a complete gap: arrival window + cycle + 15-minute buffer. Later requests backfill only if they finish before an earlier waiting request’s earliest feasible start. Estimates show earliest capacity, not a guaranteed turn. Collection delays may invalidate estimates; users are never told a cycle started when it did not.
- Only the owner can check in during their booking/offer window.
- Completion keeps a machine occupied until collection is confirmed. An operator can release finished machines after checking collection, but cannot interrupt a running cycle. Linked queue machines are released together only when every cycle is finished; the operator sees the collection group before confirming.
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

Tests create a fresh database in this disposable container; they cannot connect to production. They cover paired atomicity, overlapping slots, simultaneous competitors, shared pools, multi-machine concurrency, gap protection, backfill fairness, duplicates, ownership, grace expiry, collection and authorization. Remove the named container afterwards.

For isolated mobile layout testing, run `node scripts/booking-layout-fixture.mjs`, then start Next with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4011` and a fictional `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_layout_fixture_not_a_real_key`. Visit `/book`. The fixture serves fictional availability only; authentication and reservation writes are disabled. Never use these overrides for deployment. Planner tests use Node's native TypeScript support (Node 22.18+).

See [SECURITY.md](SECURITY.md) and [NOTIFICATIONS.md](NOTIFICATIONS.md). Closed-app alerts need additional push credentials and scheduling; installation alone does not enable them.
