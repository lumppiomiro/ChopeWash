-- Miro-only machine administration. No machine state changes during migration.
begin;

-- Bind the grant to the existing, server-owned profile and its Auth identity.
-- New signups never receive this role, including a replacement Miro account.
do $$
declare miro_id uuid;
begin
 select p.user_id into strict miro_id from public.rc4_profiles p join auth.users u on u.id=p.user_id
 where p.username='miro' and lower(u.email)='miro@chopewash.rc4';
 update public.rc4_profiles set role='operator' where user_id=miro_id;
end $$;

create function public.rc4_is_machine_admin() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.rc4_profiles where user_id=auth.uid() and username='miro' and role='operator');
$$;
revoke all on function public.rc4_is_machine_admin() from public,anon,authenticated;
grant execute on function public.rc4_is_machine_admin() to authenticated,service_role;

create table public.rc4_machine_admin_events (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references auth.users(id),
 action text not null,
 machine_ids text[] not null,
 before_state jsonb not null,
 after_state jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.rc4_machine_admin_events enable row level security;
-- Audit records are intentionally accessible only through trusted DB tooling.
revoke all on public.rc4_machine_admin_events from public,anon,authenticated;
grant all on public.rc4_machine_admin_events to service_role;

-- Keep the tested shared-pool implementation intact behind restricted wrappers.
alter function public.rc4_snapshot() rename to rc4_shared_snapshot;
revoke all on function public.rc4_shared_snapshot() from public,anon,authenticated;
create function public.rc4_snapshot() returns jsonb
language sql security definer set search_path=public,pg_temp as $$
 select public.rc4_shared_snapshot() || jsonb_build_object('machineAdmin',public.rc4_is_machine_admin());
$$;
revoke all on function public.rc4_snapshot() from public,anon,authenticated;
grant execute on function public.rc4_snapshot() to anon,authenticated,service_role;

alter function public.rc4_action(text,jsonb) rename to rc4_shared_action;
revoke all on function public.rc4_shared_action(text,jsonb) from public,anon,authenticated;
create function public.rc4_action(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ids text[]; target text; before_rows jsonb; result jsonb; is_admin boolean;
begin
 is_admin:=public.rc4_is_machine_admin();
 if action in ('operator','clearMachines') then
   if not is_admin then raise exception using errcode='42501',message='Only Miro can manage machines.'; end if;
   -- Same global lock order as booking/queue writes; authorization precedes writes.
   perform id from public.rc4_machines order by id for update;
   if action='clearMachines' then
     if jsonb_typeof(payload->'machineIds') is distinct from 'array' then raise exception 'Select machines to clear.'; end if;
     select array_agg(distinct value order by value) into ids from jsonb_array_elements_text(payload->'machineIds');
     if coalesce(cardinality(ids),0) not between 1 and 4 or array_position(ids,null) is not null then raise exception 'Select one to four machines.'; end if;
     perform public.rc4_tick();
     -- Validate the entire selection before clearing any member of it.
     foreach target in array ids loop
       if not exists(select 1 from public.rc4_machines where id=target and status in ('finished','offline')) then
         raise exception 'A selected machine changed. Refresh and select only finished or offline machines.';
       end if;
       if exists(select 1 from public.rc4_bookings b where b.machine_id=target and b.status='checked-in' and b.started_at+b.duration*interval '1 minute'>now())
         or exists(select 1 from public.rc4_queue q where q.status='claimed' and target=any(q.machine_ids) and q.cycle_ends_at>now()) then
         raise exception 'Wait until every cycle finishes before clearing machines.';
       end if;
       if exists(select 1 from public.rc4_queue q where q.status='offered' and target=any(q.machine_ids)) then
         raise exception 'This machine is held for check-in. Wait for the offer to resolve.';
       end if;
       if exists(select 1 from public.rc4_queue q where q.status='claimed' and target=any(q.machine_ids)
         and (not (q.machine_ids<@ids) or exists(select 1 from public.rc4_machines m where m.id=any(q.machine_ids) and m.status<>'finished'))) then
         raise exception 'Clear every linked machine together, after all cycles finish.';
       end if;
     end loop;
   else
     select coalesce((select q.machine_ids from public.rc4_queue q where q.status='claimed' and (payload->>'id')=any(q.machine_ids) limit 1),array[payload->>'id']) into ids;
   end if;
   select jsonb_agg(jsonb_build_object('id',id,'status',status) order by id) into before_rows from public.rc4_machines where id=any(ids);
   if action='clearMachines' then
     foreach target in array ids loop
       -- A previous iteration can already have released a linked collection group.
       if exists(select 1 from public.rc4_machines where id=target and status in ('finished','offline')) then
         perform public.rc4_shared_action('operator',jsonb_build_object('id',target,'status','available'));
       end if;
     end loop;
     result:=public.rc4_snapshot();
   else
     result:=public.rc4_shared_action(action,payload);
   end if;
   insert into public.rc4_machine_admin_events(actor_id,action,machine_ids,before_state,after_state)
   select auth.uid(),action,ids,coalesce(before_rows,'[]'),coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status) order by id),'[]')
   from public.rc4_machines where id=any(ids);
   return result || jsonb_build_object('machineAdmin',is_admin);
 end if;
 return public.rc4_shared_action(action,payload) || jsonb_build_object('machineAdmin',is_admin);
end $$;
revoke all on function public.rc4_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.rc4_action(text,jsonb) to authenticated,service_role;
commit;
