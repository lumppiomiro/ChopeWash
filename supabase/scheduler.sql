-- Run in Supabase SQL Editor AFTER the shared-backend migration.
-- Install Supabase Cron (pg_cron) in Integrations first.
select cron.schedule('rc4-laundry-tick','30 seconds','select public.rc4_tick();');

-- Optional closed-app Web Push. Enable pg_net, and create two Vault secrets
-- through Supabase's Vault UI (never commit their values):
-- rc4_push_url = https://chope-wash.vercel.app/api/notifications/dispatch
-- rc4_cron_secret = the same CRON_SECRET configured privately in Vercel.
-- Then run ONLY the following block:
/*
select cron.schedule('rc4-web-push','30 seconds',$job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='rc4_push_url'),
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
     (select decrypted_secret from vault.decrypted_secrets where name='rc4_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 10000
 );
$job$);
*/
