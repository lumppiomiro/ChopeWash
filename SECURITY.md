# Security and pilot boundaries

The shared-backend version uses Supabase password authentication and owner-checked PostgreSQL functions. Use fictional pilot data until the deployed settings and policies are verified.

## Secrets

Only the Supabase URL, publishable/anon key and VAPID **public** key belong in public browser variables. Service-role keys, VAPID private keys, cron tokens, signing secrets and database passwords must stay in ignored `.env.local` or private Vercel/Vault settings. Never commit them or expose them in screenshots. The committed `.env.example` contains empty values.

The dispatcher reads secrets only in its server route. Next.js configuration rejects recognizable privileged secrets in public variables. Enable GitHub secret scanning/push protection; rotate any leaked secret immediately. Removing a later file does not erase Git history.

## Authorization

- Demo passwords and localStorage session flags no longer grant access.
- Residents cannot write machine, booking, queue or role tables directly. RPCs derive ownership from `auth.uid()`, not supplied user IDs.
- Machine locks serialize the small shared RC4 ledger. Exclusion constraints independently prevent overlap, and paired reservations commit together.
- Public snapshots expose machine state, queue counts and anonymous occupied intervals. Personal records and inboxes are owner-only.
- Operator checks run in SQL. Residents cannot change their own role. Role grants require an explicitly approved account.
- Legacy records are preserved while their prototype API grants are revoked.
- Push subscriptions have owner-only RLS. Internal scheduler/dispatch functions are limited to the service role.
- The push worker requires a private token, leases events, checks expiry and restricts destination hosts.

## Prototype limits

Username signup with synthetic addresses does not verify RC4 residency or offer email recovery. Do not reuse important passwords. QR codes are navigation, not proof of physical presence. Machines are not controlled or sensed; check-in and collection are user-reported. Delayed collection can block the next booking.

Scheduler/VAPID setup and real-device push tests are separate requirements; committed code does not prove they are live. Public signup and anonymous polling need abuse/rate-limit review before broader deployment.

## Verification

The earlier source/history and public-bundle check found no privileged credentials. That pattern-based audit did not prove every possible secret absent or inspect all external artifacts.

Local PostgreSQL tests cover overlap, paired atomicity, simultaneous competitors, FIFO, ownership, grace expiry, collection, private snapshots and authorization. Deployment must separately verify migration execution, account configuration and scheduled push.

The shared-pool migration adds anonymous kind/quantity occupancy intervals, never other residents’ identities. Capacity is checked under a common machine-row lock. Internal pool helpers and the legacy mutation RPC are not executable by residents or anonymous clients. The matching app requires schema version 3; apply the reviewed migration before deploying it. Historical/running assignments are preserved, while upcoming reservations move to pooled capacity.

The existing shadcn generator was moved to development dependencies without changing its version. Runtime dependency audit reported zero advisories. Development-tool advisories remain and should be reviewed separately rather than applying forced major upgrades.
