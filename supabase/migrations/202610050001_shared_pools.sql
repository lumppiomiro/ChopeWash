-- Apply after both 20261004 migrations, with the matching app. Existing history stays intact.
-- Offline/collection delays can still prevent physical handoff; never fake a cycle start.
begin;
alter table rc4_machines drop constraint rc4_machines_kind_mode_key;
alter table rc4_machines drop constraint rc4_machines_mode_check;
update rc4_machines set mode='pool';
alter table rc4_machines add constraint rc4_machines_mode_check check(mode in ('pool'));
alter table rc4_bookings add column kind text;
update rc4_bookings b set kind=m.kind from rc4_machines m where b.machine_id=m.id;
alter table rc4_bookings alter column kind set not null;
alter table rc4_bookings add constraint rc4_booking_kind check(kind in ('washer','dryer'));
alter table rc4_bookings alter column machine_id drop not null;
update rc4_bookings set machine_id=null where status='confirmed';
do $$ declare constraint_name text; begin
 select conname into constraint_name from pg_constraint where conrelid='public.rc4_bookings'::regclass and contype='x';
 execute format('alter table public.rc4_bookings drop constraint %I',constraint_name);
end $$;
alter table rc4_bookings add constraint rc4_running_machine_conflict exclude using gist
 (machine_id with =,tstzrange(starts_at,reserved_until,'[)') with &&) where(status='checked-in');
drop index rc4_one_offer;
drop index rc4_one_cycle;
alter table rc4_queue add column quantity integer not null default 1 check(quantity between 1 and 2);
alter table rc4_queue add column duration integer not null default 30 check(duration in (30,45,60));
alter table rc4_queue add column machine_ids text[] not null default '{}';
alter table rc4_queue add column dryer_quantity integer not null default 0 check(dryer_quantity between 0 and 2);
alter table rc4_queue add column dryer_duration integer not null default 45 check(dryer_duration in (30,45,60));
alter table rc4_queue add column dryer_starts_at timestamptz;
-- Migrate active legacy queue ownership, including running cycles.
update rc4_queue q set machine_ids=array[case when kind='washer' then 'washer-queue' else 'dryer-queue' end],
 duration=case when status='claimed' then round(extract(epoch from(cycle_ends_at-started_at))/60)::integer else 30 end
 where status in ('offered','claimed');
create view rc4_pool_intervals with (security_invoker=true) as
 select kind,machine_id,starts_at,greatest(reserved_until,case when status='checked-in' then now()+interval '15 minutes' else reserved_until end) as ends_at,1::integer as quantity
 from rc4_bookings where status in ('confirmed','checked-in')
 union all
 select kind,null,coalesce(started_at,offer_expires_at-interval '5 minutes'),
 case when status='claimed' then greatest(cycle_ends_at+interval '15 minutes',now()+interval '15 minutes') else offer_expires_at+(duration+15)*interval '1 minute' end,quantity
 from rc4_queue where status in ('offered','claimed')
 union all
 select 'dryer',null,dryer_starts_at,dryer_starts_at+(dryer_duration+15)*interval '1 minute',dryer_quantity
 from rc4_queue where status='offered' and dryer_quantity>0;
revoke all on rc4_pool_intervals from public,anon,authenticated;

create function rc4_pool_fits(p_kind text,p_start timestamptz,p_end timestamptz,p_quantity integer) returns boolean
language sql security definer set search_path=public,pg_temp as $$
 with capacity as (select count(*)::integer n from rc4_machines where kind=p_kind and status<>'offline'),
 boundaries as (select p_start t union select starts_at from rc4_pool_intervals where kind=p_kind and starts_at>=p_start and starts_at<p_end)
 select p_quantity>0 and p_end>p_start and not exists(
 select 1 from boundaries cross join capacity where
 p_quantity+coalesce((select sum(quantity) from rc4_pool_intervals i where i.kind=p_kind and i.starts_at<=t and i.ends_at>t),0)>capacity.n);
$$;
create function rc4_next_gap(p_kind text,p_after timestamptz,p_minutes integer,p_quantity integer) returns timestamptz
language sql security definer set search_path=public,pg_temp as $$
 select min(t) from (select p_after t union select ends_at from rc4_pool_intervals where kind=p_kind and ends_at>p_after and ends_at<p_after+interval '14 days') candidates
 where rc4_pool_fits(p_kind,t,t+p_minutes*interval '1 minute',p_quantity);
$$;
-- Quota counts machine cycles, not plan groups, including active queue requests.
create function rc4_cycle_count(p_user uuid) returns integer language sql security definer set search_path=public,pg_temp as $$
 select (select count(*) from rc4_bookings where user_id=p_user and status in ('confirmed','checked-in'))::integer
 +coalesce((select sum(quantity+case when status in ('waiting','offered') then dryer_quantity else 0 end) from rc4_queue where user_id=p_user and status in ('waiting','offered','claimed')),0)::integer;
$$;
create function rc4_offer_waiters() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare q rc4_queue; ids text[]; barrier timestamptz; feasible timestamptz; dry_start timestamptz;
begin
 for q in select * from rc4_queue where status='waiting' order by ticket loop
   -- Do not bypass an earlier resident unless this complete offer/cycle fits before their earliest feasible start.
   select min(rc4_next_gap(x.kind,now(),x.duration+20,x.quantity)) into barrier from rc4_queue x
   where x.kind=q.kind and x.status='waiting' and x.ticket<q.ticket;
   feasible:=rc4_next_gap(q.kind,now(),q.duration+20,q.quantity);
   if feasible is null or feasible>now() then continue; end if;
   if barrier is not null and now()+(q.duration+20)*interval '1 minute'>barrier then continue; end if;
   select array_agg(id order by id) into ids from (select m.id from rc4_machines m where m.kind=q.kind and m.status='available'
     and not exists(select 1 from rc4_queue x where x.status in ('offered','claimed') and m.id=any(x.machine_ids))
     order by m.id limit q.quantity) available;
   if coalesce(cardinality(ids),0)<q.quantity then continue; end if;
   dry_start:=null;
   if q.dryer_quantity>0 then
     -- Pair only when the washer offer is real, not while the wash start is uncertain.
     dry_start:=rc4_next_gap('dryer',date_trunc('hour',now())+ceil(extract(minute from now()+interval '50 minutes')/15)*interval '15 minutes'
       +case when date_trunc('hour',now()+interval '50 minutes')>date_trunc('hour',now()) then interval '1 hour' else interval '0 hours' end,
       q.dryer_duration+15,q.dryer_quantity);
     if dry_start is null or dry_start >= (((now() at time zone 'Asia/Singapore')::date+14)::timestamp at time zone 'Asia/Singapore') then continue; end if;
   end if;
   update rc4_queue set status='offered',offer_expires_at=now()+interval '5 minutes',machine_ids=ids,dryer_starts_at=dry_start where id=q.id;
   perform rc4_notice(q.id||':ready',q.user_id,'Your laundry plan is ready','Your requested machines are held for five minutes. Check in downstairs.','queue','queue',now()+interval '5 minutes');
 end loop;
end $$;

create or replace function public.rc4_tick() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b rc4_bookings; q rc4_queue; m rc4_machines; notice_key text;
begin
 perform id from rc4_machines order by id for update;
 for b in select * from rc4_bookings where status='confirmed' loop
   select id::text into notice_key from rc4_bookings where pair_id=b.pair_id and kind=b.kind and starts_at=b.starts_at order by id limit 1;
   if now() >= b.starts_at+interval '15 minutes' then
     update rc4_bookings set status='missed' where id=b.id;
     perform rc4_notice(notice_key||':missed',b.user_id,'Booking missed','Your 15-minute check-in window ended. The slot has been released.','bookings','bookings');
   elsif now() >= b.starts_at+interval '13 minutes' then
     perform rc4_notice(notice_key||':last-call',b.user_id,'Check-in window closing','About two minutes remain to start your booked cycle.','bookings','bookings',b.starts_at+interval '15 minutes');
   elsif now() >= b.starts_at then
     perform rc4_notice(notice_key||':ready',b.user_id,'Your booking is ready','Check in downstairs within 15 minutes.','bookings','bookings',b.starts_at+interval '15 minutes');
   elsif now() >= b.starts_at-interval '10 minutes' then
     perform rc4_notice(notice_key||':soon',b.user_id,'Laundry starts soon','Your reservation starts in less than ten minutes.','bookings','bookings',b.starts_at);
   end if;
 end loop;
 for m in select * from rc4_machines where status='running' and cycle_ends_at<=now() loop
   update rc4_machines set status='finished' where id=m.id;
 end loop;
 for b in select * from rc4_bookings where status='checked-in' loop
   select id::text into notice_key from rc4_bookings where pair_id=b.pair_id and kind=b.kind and starts_at=b.starts_at order by id limit 1;
   if now()>=b.started_at+b.duration*interval '1 minute' then
     perform rc4_notice(notice_key||':finished',b.user_id,'Laundry ready to collect','Please collect your laundry and release the machine in the app.','cycles','bookings');
   elsif now()>=b.started_at+(b.duration-5)*interval '1 minute' then
     perform rc4_notice(notice_key||':finishing',b.user_id,'Cycle nearly finished','About five minutes left. Get ready to collect.','cycles','bookings',b.started_at+b.duration*interval '1 minute');
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
 perform rc4_offer_waiters();
end $$;

create or replace function public.rc4_snapshot() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform rc4_tick();
 select jsonb_build_object(
 'schemaVersion',3, 'serverTime',now(), 'role',coalesce((select role from rc4_profiles where user_id=auth.uid()),'resident'),
 'machines',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'kind',m.kind,'mode',m.mode,'status',m.status,
 'minutesLeft',case when m.status='running' then greatest(0,ceil(extract(epoch from(m.cycle_ends_at-now()))/60)) else 0 end,
 'collectionGroup',case when exists(select 1 from rc4_profiles where user_id=auth.uid() and role='operator') then coalesce((select to_jsonb(machine_ids) from rc4_queue where status='claimed' and m.id=any(machine_ids)),'[]'::jsonb) else null end,
 'held',exists(select 1 from rc4_queue q where q.status='offered' and m.id=any(q.machine_ids)), 'queueLength',(select count(*) from rc4_queue q where q.kind=m.kind and q.status in ('waiting','offered')) ) order by m.id) from rc4_machines m),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'pairId',b.pair_id,'kind',case when b.kind='washer' then 'wash' else 'dry' end,
 'dateIso',to_char(b.starts_at at time zone 'Asia/Singapore','YYYY-MM-DD'),'dateLabel',to_char(b.starts_at at time zone 'Asia/Singapore','Dy, DD Mon'),
 'startTime',to_char(b.starts_at at time zone 'Asia/Singapore','HH24:MI'),'machineName',m.name,'machineId',b.machine_id,'duration',b.duration,'status',b.status,'startedAt',b.started_at,'createdAt',b.created_at) order by b.starts_at)
 from rc4_bookings b left join rc4_machines m on m.id=b.machine_id where b.user_id=auth.uid() and b.starts_at>now()-interval '2 days'),'[]'::jsonb),
 'queueEntries',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'quantity',q.quantity,'duration',q.duration,'dryerQuantity',q.dryer_quantity,'dryerDuration',q.dryer_duration,'dryerStartsAt',q.dryer_starts_at,'machineIds',to_jsonb(q.machine_ids),'status',q.status,'joinedAt',q.joined_at,'startedAt',q.started_at,
 'offerExpiresAt',q.offer_expires_at,'cycleEndsAt',q.cycle_ends_at,
 'position',case when q.status='claimed' then 0 else (select count(*) from rc4_queue x where x.kind=q.kind and x.status in ('waiting','offered') and x.ticket<=q.ticket) end,
 'estimatedReadyAt',case when q.status='waiting' then rc4_next_gap(q.kind,now(),q.duration+20,q.quantity) else null end)) from rc4_queue q
 where q.user_id=auth.uid() and (q.status in ('waiting','offered','claimed') or q.status='expired' and q.joined_at>now()-interval '1 day')),'[]'::jsonb),
 'intervals',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'machineId',machine_id,'startsAt',starts_at,'endsAt',ends_at,'quantity',quantity)) from rc4_pool_intervals where ends_at>now()),'[]'::jsonb)
 ) into result;
 return result;
end $$;


alter function rc4_action(text,jsonb) rename to rc4_legacy_action;
revoke all on function rc4_legacy_action(text,jsonb) from public,anon,authenticated;
create function rc4_action(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare uid uuid:=auth.uid(); b rc4_bookings; q rc4_queue; m rc4_machines; pair uuid; s timestamptz; second_s timestamptz; d timestamptz; k text;
 n integer; dn integer; mins integer; dmins integer; idx integer; ids text[]; bid uuid;
begin
 if uid is null or not exists(select 1 from rc4_profiles where user_id=uid) then raise exception 'Sign in to your RC4 account first.'; end if;
 perform id from rc4_machines order by id for update;
 perform rc4_tick();
 if action='book' then
   k:=payload->>'kind'; mins:=(payload->>'duration')::integer;
   if k is null or k not in ('wash','dry','both') or mins is null or mins not in (30,45,60) then raise exception 'Invalid booking details.'; end if;
   if k<>'dry' and mins<>30 then raise exception 'Washing cycles are always 30 minutes.'; end if;
   n:=coalesce((payload->>'washerCount')::integer,1); dn:=coalesce((payload->>'dryerCount')::integer,1);
   if n not between 1 and 2 or dn not between 1 and 2 then raise exception 'Choose one or two machines.'; end if;
   s:=((payload->>'dateIso')||'T'||(payload->>'startTime')||':00+08:00')::timestamptz;
   if (payload ? 'secondWasherDateIso') <> (payload ? 'secondWasherTime') or (payload ? 'secondWasherTime' and (coalesce(payload->>'secondWasherTime','')='' or n<>2 or k='dry')) then raise exception 'Choose a date and start for the second washer.'; end if;
   second_s:=coalesce(((payload->>'secondWasherDateIso')||'T'||(payload->>'secondWasherTime')||':00+08:00')::timestamptz,s);
   d:=case when k='both' then ((payload->>'dryerDateIso')||'T'||(payload->>'dryerTime')||':00+08:00')::timestamptz else s end;
   dmins:=case when k='both' then (payload->>'dryerDuration')::integer else mins end;
   if k='both' and (d is null or dmins is null or dmins not in (30,45,60) or d<greatest(s,case when n=2 then second_s else s end)+interval '45 minutes') then raise exception 'Choose drying after all washes and a 15-minute buffer.'; end if;
   if s is null or s<=now() or (n=2 and k<>'dry' and second_s<=now()) or
     exists(select 1 from unnest(array[s,case when n=2 and k<>'dry' then second_s else s end,d]) t where t>(((now() at time zone 'Asia/Singapore')::date+14)::timestamp at time zone 'Asia/Singapore')-interval '1 second' or extract(minute from t)::integer%15<>0 or extract(second from t)<>0)
     then raise exception 'Choose future quarter-hour starts within the next 14 days.'; end if;
   if rc4_cycle_count(uid)+(case when k='dry' then dn when k='wash' then n else n+dn end)>8 then raise exception 'You can hold up to eight machine cycles.'; end if;
   pair:=gen_random_uuid();
   if k<>'dry' then
     for idx in 1..n loop
       if not rc4_pool_fits('washer',case when idx=2 then second_s else s end,case when idx=2 then second_s else s end+interval '45 minutes',1) then raise exception 'Not enough washer capacity. Choose another time.'; end if;
       insert into rc4_bookings(user_id,kind,pair_id,starts_at,duration,reserved_until) values(uid,'washer',pair,case when idx=2 then second_s else s end,30,(case when idx=2 then second_s else s end)+interval '45 minutes');
     end loop;
   end if;
   if k<>'wash' then
     if not rc4_pool_fits('dryer',d,d+(dmins+15)*interval '1 minute',dn) then raise exception 'Not enough dryer capacity. Neither part was reserved.'; end if;
     for idx in 1..dn loop insert into rc4_bookings(user_id,kind,pair_id,starts_at,duration,reserved_until) values(uid,'dryer',pair,d,dmins,d+(dmins+15)*interval '1 minute'); end loop;
   end if;
   perform rc4_notice(pair||':confirmed',uid,'Laundry plan reserved','All requested cycles are reserved together. Machines are assigned at check-in.','bookings','bookings');
 elsif action='joinQueue' then
   k:=payload->>'kind'; n:=coalesce((payload->>'quantity')::integer,1); mins:=coalesce((payload->>'duration')::integer,case when k='washer' then 30 else 45 end);
   dn:=coalesce((payload->>'dryerQuantity')::integer,0); dmins:=coalesce((payload->>'dryerDuration')::integer,45);
   if k is null or k not in ('washer','dryer') or n not between 1 and 2 or mins not in (30,45,60) or (k='washer' and mins<>30) or dn not between 0 and 2 or dmins not in (30,45,60) or (k='dryer' and dn>0) then raise exception 'Invalid laundry request.'; end if;
   if n>(select count(*) from rc4_machines where kind=k and status<>'offline') or dn>(select count(*) from rc4_machines where kind='dryer' and status<>'offline') then raise exception 'Not enough machines in service for this request.'; end if;
   if exists(select 1 from rc4_queue where user_id=uid and kind=k and status in ('waiting','offered','claimed')) then return rc4_snapshot(); end if;
   if rc4_cycle_count(uid)+n+dn>8 then raise exception 'You can hold up to eight machine cycles.'; end if;
   insert into rc4_queue(user_id,kind,quantity,duration,dryer_quantity,dryer_duration) values(uid,k,n,mins,dn,dmins)
     on conflict(user_id,kind) where status in ('waiting','offered','claimed') do nothing;
   perform rc4_offer_waiters();
 elsif action='claimQueue' then
   select * into q from rc4_queue where id=(payload->>'id')::uuid and user_id=uid;
   if not found or q.status not in ('offered','claimed') then raise exception 'Your offer is no longer available.'; end if;
   if q.status='claimed' then return rc4_snapshot(); end if;
   if (payload->>'duration')::integer<>q.duration then raise exception 'Cycle length is fixed by your queue request. Rejoin to change it.'; end if;
   if q.offer_expires_at<=now() or exists(select 1 from rc4_machines where id=any(q.machine_ids) and status<>'available') then raise exception 'The machines are not physically ready. Please contact an operator.'; end if;
   if q.dryer_quantity>0 then
     for idx in 1..q.dryer_quantity loop insert into rc4_bookings(user_id,kind,pair_id,starts_at,duration,reserved_until)
       values(uid,'dryer',q.id,q.dryer_starts_at,q.dryer_duration,q.dryer_starts_at+(q.dryer_duration+15)*interval '1 minute'); end loop;
   end if;
   update rc4_queue set status='claimed',started_at=now(),cycle_ends_at=now()+q.duration*interval '1 minute' where id=q.id;
   update rc4_machines set status='running',cycle_ends_at=now()+q.duration*interval '1 minute' where id=any(q.machine_ids);
   update rc4_notifications set valid_until=now() where user_id=uid and id like q.id||':%';
   perform rc4_notice(q.id||':started',uid,'Cycles started','Follow your laundry plan on Home. Any reserved dryer appears under bookings.','cycles','queue',now()+q.duration*interval '1 minute');
 elsif action='leaveQueue' then
   select * into q from rc4_queue where user_id=uid and kind=payload->>'kind' and status in ('waiting','offered','claimed');
   if not found then raise exception 'Active queue request not found.'; end if;
   if q.status='claimed' then
     if q.cycle_ends_at>now() then raise exception 'Wait until every cycle finishes before releasing the machines.'; end if;
     update rc4_machines set status='available',cycle_ends_at=null where id=any(q.machine_ids);
   end if;
   update rc4_queue set status=case when q.status='claimed' then 'collected' else 'cancelled' end where id=q.id;
   update rc4_notifications set valid_until=now() where user_id=uid and id like q.id||':%';
   perform rc4_offer_waiters();
 elsif action='checkIn' then
   select * into b from rc4_bookings where id=(payload->>'id')::uuid and user_id=uid;
   if not found then raise exception 'Reservation not found.'; end if;
   if b.status='checked-in' then return rc4_snapshot(); end if;
   if b.status<>'confirmed' or now()<b.starts_at or now()>=b.starts_at+interval '15 minutes' then raise exception 'Check in within the first 15 minutes of your slot.'; end if;
   select array_agg(id) into ids from (select id from rc4_machines m where kind=b.kind and status='available'
     and not exists(select 1 from rc4_queue q where q.status='offered' and m.id=any(q.machine_ids)) order by id) available;
   n:=(select count(*) from rc4_bookings where pair_id=b.pair_id and kind=b.kind and starts_at=b.starts_at and status='confirmed');
   if coalesce(cardinality(ids),0)<n then raise exception 'Waiting for collection. Your cycles have not started; contact an operator if needed.'; end if;
   idx:=0;
   for bid in select id from rc4_bookings where pair_id=b.pair_id and kind=b.kind and starts_at=b.starts_at and status='confirmed' order by id loop
     idx:=idx+1;
     update rc4_bookings set machine_id=ids[idx],status='checked-in',started_at=now() where id=bid;
     update rc4_machines set status='running',cycle_ends_at=now()+b.duration*interval '1 minute' where id=ids[idx];
     update rc4_notifications set valid_until=now() where user_id=uid and id like bid||':%';
   end loop;
   perform rc4_notice(b.id||':started',uid,'Laundry stage started','Your assigned machines are shown in My laundry.','cycles','bookings',now()+b.duration*interval '1 minute');
 elsif action='operator' then
   if not exists(select 1 from rc4_profiles where user_id=uid and role='operator') then raise exception 'Operator access required.'; end if;
   select * into m from rc4_machines where id=payload->>'id';
   if not found or payload->>'status' not in ('available','offline') or m.status='running' then raise exception 'Cannot change this machine now.'; end if;
   select * into q from rc4_queue where status in ('offered','claimed') and m.id=any(machine_ids);
   if found then
     if q.status<>'claimed' or m.status<>'finished' or payload->>'status'<>'available' or exists(select 1 from rc4_machines where id=any(q.machine_ids) and status<>'finished') then raise exception 'Resolve the active queue request first. Never interrupt a running cycle.'; end if;
     update rc4_queue set status='collected' where id=q.id;
     update rc4_machines set status='available',cycle_ends_at=null where id=any(q.machine_ids);
     update rc4_notifications set valid_until=now() where user_id=q.user_id and id like q.id||':%';
     perform rc4_notice(q.id||':operator-collected',q.user_id,'Machines released by operator','Collection was confirmed for every machine in your queue stage. Any drying reservation stays booked.','cycles','queue');
   end if;
   if payload->>'status'='offline' and exists(select 1 from rc4_bookings where kind=m.kind and status='confirmed') then raise exception 'Resolve upcoming pool reservations before reducing capacity.'; end if;
   if m.status='finished' and payload->>'status'<>'available' then raise exception 'Confirm collection first.'; end if;
   update rc4_bookings set status='complete' where machine_id=m.id and status='checked-in';
   update rc4_machines set status=payload->>'status',cycle_ends_at=null where id=m.id;
 else return rc4_legacy_action(action,payload);
 end if;
 return rc4_snapshot();
end $$;
revoke all on function rc4_pool_fits(text,timestamptz,timestamptz,integer),rc4_next_gap(text,timestamptz,integer,integer),rc4_offer_waiters(),rc4_cycle_count(uuid),rc4_action(text,jsonb) from public,anon,authenticated;
grant execute on function rc4_action(text,jsonb) to authenticated;
commit;
