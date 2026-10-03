-- Run once in Supabase SQL Editor. New tables leave the old prototype intact.
begin;
-- Retire the old prototype API without deleting its records.
do $$ declare target text; begin
  foreach target in array array['profiles','machines','bookings','queue_entries','machine_events'] loop
    if to_regclass('public.'||target) is not null then
      execute format('revoke all on table public.%I from anon, authenticated',target);
    end if;
  end loop;
end $$;
create extension if not exists btree_gist;
create table public.rc4_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  role text not null default 'resident' check (role in ('resident','operator'))
);
create table public.rc4_machines (
  id text primary key, name text not null,
  kind text not null check(kind in ('washer','dryer')),
  mode text not null check(mode in ('booking','queue')),
  status text not null default 'available' check(status in ('available','running','finished','offline')),
  cycle_ends_at timestamptz,
  unique(kind,mode)
);
insert into public.rc4_machines(id,name,kind,mode) values
 ('washer-book','Washer 01','washer','booking'),('dryer-book','Dryer 01','dryer','booking'),
 ('washer-queue','Washer 02','washer','queue'),('dryer-queue','Dryer 02','dryer','queue');
create table public.rc4_bookings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 machine_id text not null references public.rc4_machines, pair_id uuid not null,
 starts_at timestamptz not null, duration integer not null check(duration in (30,45,60)),
 reserved_until timestamptz not null, started_at timestamptz,
 status text not null default 'confirmed' check(status in ('confirmed','checked-in','complete','cancelled','missed')),
 created_at timestamptz not null default now(),
 check(reserved_until = starts_at + (duration+15)*interval '1 minute'),
 exclude using gist (machine_id with =, tstzrange(starts_at,reserved_until,'[)') with &&)
 where (status in ('confirmed','checked-in','complete'))
);
create table public.rc4_queue (
 id uuid primary key default gen_random_uuid(), ticket bigint generated always as identity unique,
 user_id uuid not null references auth.users on delete cascade,
 kind text not null check(kind in ('washer','dryer')),
 status text not null default 'waiting' check(status in ('waiting','offered','claimed','expired','cancelled','collected')),
 joined_at timestamptz not null default now(), offer_expires_at timestamptz,
 started_at timestamptz, cycle_ends_at timestamptz
);
create unique index rc4_one_active_queue on public.rc4_queue(user_id,kind) where status in ('waiting','offered','claimed');
create unique index rc4_one_offer on public.rc4_queue(kind) where status='offered';
create unique index rc4_one_cycle on public.rc4_queue(kind) where status='claimed';
create table public.rc4_notifications (
 id text primary key, user_id uuid not null references auth.users on delete cascade,
 title text not null, body text not null, category text not null,
 view text not null, created_at timestamptz not null default now(), read_at timestamptz,
 valid_until timestamptz, delivered_at timestamptz,
 lease_until timestamptz, attempts integer not null default 0
);
create table public.rc4_push_subscriptions (
 endpoint text primary key, user_id uuid not null references auth.users on delete cascade,
 subscription jsonb not null, preferences jsonb not null default '{"bookings":true,"queue":true,"cycles":true}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.rc4_profiles enable row level security;
alter table public.rc4_machines enable row level security;
alter table public.rc4_bookings enable row level security;
alter table public.rc4_queue enable row level security;
alter table public.rc4_notifications enable row level security;
alter table public.rc4_push_subscriptions enable row level security;
create policy own_profile on public.rc4_profiles for select to authenticated using(user_id=auth.uid());
create policy own_notifications on public.rc4_notifications for select to authenticated using(user_id=auth.uid());
create policy own_push on public.rc4_push_subscriptions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.rc4_profiles,public.rc4_machines,public.rc4_bookings,public.rc4_queue,public.rc4_notifications,public.rc4_push_subscriptions from anon,authenticated;
grant select on public.rc4_profiles,public.rc4_notifications to authenticated;
grant select,insert,update,delete on public.rc4_push_subscriptions to authenticated;

create function public.rc4_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.email not like '%@chopewash.rc4' then return new; end if;
 insert into rc4_profiles(user_id,username) values(new.id,lower(split_part(new.email,'@',1)));
 return new;
end $$;
create trigger rc4_user_created after insert on auth.users for each row execute function public.rc4_new_user();
insert into rc4_profiles(user_id,username) select id,lower(split_part(email,'@',1)) from auth.users where email like '%@chopewash.rc4' on conflict do nothing;

create function public.rc4_notice(p_id text,p_user uuid,p_title text,p_body text,p_category text,p_view text,p_until timestamptz default null)
returns void language sql security definer set search_path=public,pg_temp as $$
 insert into rc4_notifications(id,user_id,title,body,category,view,valid_until)
 values(p_id,p_user,p_title,p_body,p_category,p_view,p_until) on conflict do nothing;
$$;

-- All writes take the same four row locks, in the same order. At RC4 scale this
-- deliberately simple mutex makes concurrent claims and paired reservations safe.
create function public.rc4_tick() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b rc4_bookings; q rc4_queue; m rc4_machines;
begin
 perform id from rc4_machines order by id for update;
 for b in select * from rc4_bookings where status='confirmed' loop
   if now() >= b.starts_at+interval '15 minutes' then
     update rc4_bookings set status='missed' where id=b.id;
     perform rc4_notice(b.id||':missed',b.user_id,'Booking missed','Your 15-minute check-in window ended. The slot has been released.','bookings','bookings');
   elsif now() >= b.starts_at+interval '13 minutes' then
     perform rc4_notice(b.id||':last-call',b.user_id,'Check-in window closing','About two minutes remain to start your booked cycle.','bookings','bookings',b.starts_at+interval '15 minutes');
   elsif now() >= b.starts_at then
     perform rc4_notice(b.id||':ready',b.user_id,'Your booking is ready','Check in downstairs within 15 minutes.','bookings','bookings',b.starts_at+interval '15 minutes');
   elsif now() >= b.starts_at-interval '10 minutes' then
     perform rc4_notice(b.id||':soon',b.user_id,'Laundry starts soon','Your reservation starts in less than ten minutes.','bookings','bookings',b.starts_at);
   end if;
 end loop;
 for m in select * from rc4_machines where status='running' and cycle_ends_at<=now() loop
   update rc4_machines set status='finished' where id=m.id;
 end loop;
 for b in select * from rc4_bookings where status='checked-in' loop
   if now()>=b.started_at+b.duration*interval '1 minute' then
     perform rc4_notice(b.id||':finished',b.user_id,'Laundry ready to collect','Please collect your laundry and release the machine in the app.','cycles','bookings');
   elsif now()>=b.started_at+(b.duration-5)*interval '1 minute' then
     perform rc4_notice(b.id||':finishing',b.user_id,'Cycle nearly finished','About five minutes left. Get ready to collect.','cycles','bookings',b.started_at+b.duration*interval '1 minute');
   end if;
 end loop;
 for q in select * from rc4_queue where status='claimed' loop
   if now()>=q.cycle_ends_at then
     perform rc4_notice(q.id||':finished',q.user_id,'Laundry ready to collect','Collect your laundry, then release the machine in the queue page.','cycles','queue');
   elsif now()>=q.cycle_ends_at-interval '5 minutes' then
     perform rc4_notice(q.id||':finishing',q.user_id,'Cycle nearly finished','About five minutes left. Get ready to collect.','cycles','queue',q.cycle_ends_at);
   end if;
 end loop;
 for q in select * from rc4_queue where status='offered' and offer_expires_at>now() and offer_expires_at<=now()+interval '1 minute' loop
   perform rc4_notice(q.id||':last-call',q.user_id,'Claim your machine now','Less than one minute remains to check in downstairs.','queue','queue',q.offer_expires_at);
 end loop;
 for q in select * from rc4_queue where status='offered' and offer_expires_at<=now() loop
   update rc4_queue set status='expired' where id=q.id;
   perform rc4_notice(q.id||':expired',q.user_id,'Queue turn expired','Your five-minute check-in window ended. Join again when ready.','queue','queue');
 end loop;
 for m in select * from rc4_machines where mode='queue' and status='available' loop
   if not exists(select 1 from rc4_queue where kind=m.kind and status in ('offered','claimed')) then
     select * into q from rc4_queue where kind=m.kind and status='waiting' order by ticket limit 1;
     if found then
       update rc4_queue set status='offered',offer_expires_at=now()+interval '5 minutes' where id=q.id;
       perform rc4_notice(q.id||':ready',q.user_id,'Your machine is ready','Head to RC4 Level 1 and check in within five minutes.','queue','queue',now()+interval '5 minutes');
     end if;
   end if;
 end loop;
end $$;

create function public.rc4_snapshot() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform rc4_tick();
 select jsonb_build_object(
 'serverTime',now(), 'role',coalesce((select role from rc4_profiles where user_id=auth.uid()),'resident'),
 'machines',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'kind',m.kind,'mode',m.mode,'status',m.status,
 'minutesLeft',case when m.status='running' then greatest(0,ceil(extract(epoch from(m.cycle_ends_at-now()))/60)) else 0 end,
 'queueLength',(select count(*) from rc4_queue q where m.mode='queue' and q.kind=m.kind and q.status in ('waiting','offered')) ) order by m.id) from rc4_machines m),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'pairId',b.pair_id,'kind',case when m.kind='washer' then 'wash' else 'dry' end,
 'dateIso',to_char(b.starts_at at time zone 'Asia/Singapore','YYYY-MM-DD'),'dateLabel',to_char(b.starts_at at time zone 'Asia/Singapore','Dy, DD Mon'),
 'startTime',to_char(b.starts_at at time zone 'Asia/Singapore','HH24:MI'),'duration',b.duration,'status',b.status,'startedAt',b.started_at,'createdAt',b.created_at) order by b.starts_at)
 from rc4_bookings b join rc4_machines m on m.id=b.machine_id where b.user_id=auth.uid() and b.starts_at>now()-interval '2 days'),'[]'::jsonb),
 'queueEntries',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'status',q.status,'joinedAt',q.joined_at,'startedAt',q.started_at,
 'offerExpiresAt',q.offer_expires_at,'cycleEndsAt',q.cycle_ends_at,
 'position',case when q.status='claimed' then 0 else (select count(*) from rc4_queue x where x.kind=q.kind and x.status in ('waiting','offered') and x.ticket<=q.ticket) end,
 'estimatedReadyAt',now()+((case when m.status='running' then greatest(0,extract(epoch from(m.cycle_ends_at-now()))/60) else 0 end)+
 (select count(*)*45 from rc4_queue x where x.kind=q.kind and x.status in ('waiting','offered') and x.ticket<q.ticket))*interval '1 minute'))
 from rc4_queue q join rc4_machines m on m.kind=q.kind and m.mode='queue'
 where q.user_id=auth.uid() and (q.status in ('waiting','offered','claimed') or q.status='expired' and q.joined_at>now()-interval '1 day')),'[]'::jsonb),
 'intervals',coalesce((select jsonb_agg(jsonb_build_object('machineId',machine_id,'startsAt',starts_at,'endsAt',reserved_until)) from rc4_bookings
 where status in ('confirmed','checked-in','complete') and reserved_until>now()),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create function public.rc4_action(action text,payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare uid uuid:=auth.uid(); b rc4_bookings; q rc4_queue; m rc4_machines;
 start_at timestamptz; mins integer; kind text; pair uuid; machine text; part integer; parts integer;
begin
 if uid is null or not exists(select 1 from rc4_profiles where user_id=uid) then raise exception 'Sign in to your RC4 account first.'; end if;
 perform rc4_tick();
 if action='book' then
   kind:=payload->>'kind'; mins:=(payload->>'duration')::integer;
   if kind not in ('wash','dry','both') or mins not in (30,45,60) or kind is null or mins is null then raise exception 'Invalid booking details.'; end if;
   start_at:=((payload->>'dateIso')||'T'||(payload->>'startTime')||':00+08:00')::timestamptz;
   if start_at is null or start_at<now() or (start_at at time zone 'Asia/Singapore')::date>((now() at time zone 'Asia/Singapore')::date+13)
     or extract(minute from start_at)::integer%15<>0 or extract(second from start_at)<>0 then raise exception 'Choose a future 15-minute slot within the next 14 days.'; end if;
   if (select count(distinct pair_id) from rc4_bookings where user_id=uid and status in ('confirmed','checked-in'))>=4 then raise exception 'You can hold up to four reservations.'; end if;
   pair:=gen_random_uuid(); parts:=case when kind='both' then 2 else 1 end;
   for part in 1..parts loop
     machine:=case when kind='dry' or part=2 then 'dryer-book' else 'washer-book' end;
     if (start_at at time zone 'Asia/Singapore')::date>((now() at time zone 'Asia/Singapore')::date+13) then raise exception 'Both slots must start within the next 14 days.'; end if;
     if exists(select 1 from rc4_machines where id=machine and status='offline') then raise exception 'This machine is out of service.'; end if;
     insert into rc4_bookings(user_id,machine_id,pair_id,starts_at,duration,reserved_until)
     values(uid,machine,pair,start_at,mins,start_at+(mins+15)*interval '1 minute');
     start_at:=start_at+(mins+15)*interval '1 minute';
   end loop;
   perform rc4_notice(pair||':confirmed',uid,'Laundry reserved','Your reservation is saved for RC4. Check in when the slot starts.','bookings','bookings');
 elsif action in ('checkIn','cancelBooking','collectBooking') then
   select * into b from rc4_bookings where id=(payload->>'id')::uuid and user_id=uid;
   if not found then raise exception 'Reservation not found.'; end if;
   select * into m from rc4_machines where id=b.machine_id;
   if action='cancelBooking' then
     if b.status<>'confirmed' then raise exception 'Only an upcoming reservation can be cancelled.'; end if;
     -- Cancel the remaining confirmed segment of a wash + dry pair together.
     update rc4_bookings set status='cancelled' where pair_id=b.pair_id and user_id=uid and status='confirmed';
     update rc4_notifications set valid_until=now() where user_id=uid and
       (id like b.pair_id||':%' or exists(select 1 from rc4_bookings x where x.pair_id=b.pair_id and x.status='cancelled' and rc4_notifications.id like x.id||':%'));
   elsif action='checkIn' then
     if b.status='checked-in' then return rc4_snapshot(); end if;
     if b.status<>'confirmed' or now()<b.starts_at or now()>=b.starts_at+interval '15 minutes' then raise exception 'Check in during the first 15 minutes of your booked slot.'; end if;
     if m.status<>'available' then raise exception 'The machine is not free yet. Ask the previous user to collect or contact an operator.'; end if;
     update rc4_notifications set valid_until=now() where user_id=uid and id like b.id||':%';
     update rc4_bookings set status='checked-in',started_at=now() where id=b.id;
     perform rc4_notice(b.id||':started',uid,'Cycle started','Follow your cycle timer on Home.','cycles','bookings',now()+b.duration*interval '1 minute');
     update rc4_machines set status='running',cycle_ends_at=now()+b.duration*interval '1 minute' where id=m.id;
   else
     if b.status<>'checked-in' or now()<b.started_at+b.duration*interval '1 minute' then raise exception 'Collect after your cycle finishes.'; end if;
     update rc4_notifications set valid_until=now() where user_id=uid and id like b.id||':%';
     update rc4_bookings set status='complete' where id=b.id;
     update rc4_machines set status='available',cycle_ends_at=null where id=m.id;
   end if;
 elsif action='joinQueue' then
   kind:=payload->>'kind';
   select * into m from rc4_machines where mode='queue' and rc4_machines.kind=payload->>'kind';
   if not found or m.status='offline' then raise exception 'This queue is unavailable.'; end if;
   insert into rc4_queue(user_id,kind) values(uid,kind) on conflict(user_id,kind) where status in ('waiting','offered','claimed') do nothing;
 elsif action in ('leaveQueue','claimQueue') then
   if action='leaveQueue' then
     select * into q from rc4_queue where user_id=uid and rc4_queue.kind=payload->>'kind' and status in ('waiting','offered','claimed');
   else
     select * into q from rc4_queue where id=(payload->>'id')::uuid and user_id=uid;
   end if;
   if not found then raise exception 'Active queue entry not found.'; end if;
   select * into m from rc4_machines where mode='queue' and rc4_machines.kind=q.kind;
   if action='claimQueue' then
     mins:=(payload->>'duration')::integer;
     if q.status='claimed' then return rc4_snapshot(); end if;
     if mins is null or mins not in (30,45,60) or q.status<>'offered' or q.offer_expires_at<=now() or m.status<>'available' then raise exception 'This offer is no longer available.'; end if;
     update rc4_notifications set valid_until=now() where user_id=uid and id like q.id||':%';
     update rc4_queue set status='claimed',started_at=now(),cycle_ends_at=now()+mins*interval '1 minute' where id=q.id;
     perform rc4_notice(q.id||':started',uid,'Cycle started','Follow your cycle timer on Home.','cycles','queue',now()+mins*interval '1 minute');
     update rc4_machines set status='running',cycle_ends_at=now()+mins*interval '1 minute' where id=m.id;
   else
     if q.status='claimed' then
       if q.cycle_ends_at>now() then raise exception 'Wait until your cycle finishes before releasing the machine.'; end if;
       update rc4_machines set status='available',cycle_ends_at=null where id=m.id;
     end if;
     update rc4_queue set status=case when q.status='claimed' then 'collected' else 'cancelled' end where id=q.id;
     update rc4_notifications set valid_until=now() where user_id=uid and id like q.id||':%';
   end if;
 elsif action='operator' then
   if not exists(select 1 from rc4_profiles where user_id=uid and role='operator') then raise exception 'Operator access required.'; end if;
   select * into m from rc4_machines where id=payload->>'id';
   if not found or payload->>'status' not in ('available','offline') then raise exception 'Invalid machine status.'; end if;
   if m.status='running' then raise exception 'Wait until the cycle finishes before releasing a machine.'; end if;
   if m.status='finished' then
     if payload->>'status'<>'available' then raise exception 'Collect the laundry before taking this machine offline.'; end if;
     update rc4_bookings set status='complete' where machine_id=m.id and status='checked-in';
     update rc4_queue set status='collected' where kind=m.kind and m.mode='queue' and status='claimed';
   end if;
   if payload->>'status'='offline' and exists(select 1 from rc4_bookings where machine_id=m.id and status='confirmed') then raise exception 'Cancel existing reservations before taking this machine offline.'; end if;
   if exists(select 1 from rc4_queue where kind=m.kind and m.mode='queue' and status='offered') then raise exception 'Wait until the current offer is resolved.'; end if;
   update rc4_machines set status=payload->>'status',cycle_ends_at=null where id=m.id;
 elsif action='readNotifications' then
   update rc4_notifications set read_at=now() where user_id=uid and (payload->>'id' is null or id=payload->>'id');
 else raise exception 'Unknown action.';
 end if;
 return rc4_snapshot();
exception when exclusion_violation then raise exception 'Someone already reserved this time. Choose another slot.';
end $$;
revoke all on function public.rc4_new_user(),public.rc4_notice(text,uuid,text,text,text,text,timestamptz),public.rc4_tick(),public.rc4_snapshot(),public.rc4_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.rc4_snapshot() to anon,authenticated;
grant execute on function public.rc4_action(text,jsonb) to authenticated;
grant execute on function public.rc4_tick() to service_role;
grant all on public.rc4_profiles,public.rc4_machines,public.rc4_bookings,public.rc4_queue,public.rc4_notifications,public.rc4_push_subscriptions to service_role;
create function public.rc4_claim_notifications() returns setof public.rc4_notifications language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query
 update rc4_notifications set lease_until=now()+interval '2 minutes',attempts=attempts+1
 where id in (select id from rc4_notifications where delivered_at is null and attempts<5
 and (valid_until is null or valid_until>now()) and (lease_until is null or lease_until<now())
 and created_at>now()-interval '1 hour' order by created_at limit 50 for update skip locked)
 returning *;
end $$;
revoke all on function public.rc4_claim_notifications() from public,anon,authenticated;
grant execute on function public.rc4_claim_notifications() to service_role;
-- Supabase Cron should call select public.rc4_tick() every 30 seconds.
commit;
