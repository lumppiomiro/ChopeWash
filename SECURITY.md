# Security and team setup

ChopeWash is a public usability-test prototype. Use fictional test data only.

## Credentials

- Keep values in `.env.local` locally and Vercel Environment Variables for deployments. Commit only the empty `.env.example`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are intended to be visible to browsers. A legacy anon key is also supported.
- Never put Supabase secret/service-role keys, JWT signing secrets, database passwords/URLs, GitHub tokens, or private keys in source files or any `NEXT_PUBLIC_` variable.
- The Next.js configuration rejects recognizable privileged Supabase keys, private keys, and database credentials in public variables before bundling. This is a guardrail, not a complete secret scanner.
- Enable GitHub secret scanning and push protection under the repository's security settings. Review changes before merging, including config files and screenshots.
- If a credential is committed, revoke/rotate it immediately in its provider. Deleting the file in a later commit does not remove it from history. Coordinate any history rewrite with the team.

## Prototype boundaries

- `tessa / prototype` and `miro / 1234` are public demonstration credentials, not protected accounts. Do not reuse these passwords for real accounts.
- Device-local prototype accounts and the localStorage session are not secure authentication. Bookings and queues are stored in that browser and are not isolated by username.
- `/ops` is an unauthenticated simulator route. Hiding it from navigation does not restrict access. Its controls currently modify browser-local demo data, not Supabase machine data.
- Before connecting real resident data or shared machine control, enforce Supabase authentication and authorization on the backend, isolate user records, and restrict operator actions.
- `supabase/schema.sql` enables Row Level Security on the supplied tables. Inspect the policies in the actual Supabase project before storing real data; the SQL file alone does not verify the deployed database. In particular, resident profile updates must not allow changing the operator role.

## Audit record

On 4 October 2026, the fetched Git history (6 commits, 73 unique file blobs) and the public home page's 11 JavaScript assets were checked for common credential patterns. No privileged credentials were detected. The live browser bundle contained one Supabase publishable key, which is expected. The only environment file in Git history was the empty `.env.example`.

This check did not audit GitHub issues, pull requests, Actions logs/artifacts, or private Vercel/Supabase settings and database policies. Pattern scans cannot prove the absence of every possible secret.
