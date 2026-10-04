-- Apply after 202610040001_rc4_shared.sql. Does not change existing reservations.
-- The server enforces fixed washers and independently scheduled paired dryers.
begin;
create or replace function public.rc4_action(action text,payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare uid uuid:=auth.uid(); b rc4_bookings; q rc4_queue; m rc4_machines;
 start_at timestamptz; wash_start timestamptz; dryer_start timestamptz; dryer_mins integer; mins integer; kind text; pair uuid; machine text; part integer; parts integer;
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
   if kind in ('wash','both') and mins<>30 then raise exception 'Washing cycles are always 30 minutes.'; end if;
   wash_start:=start_at;
   if kind='both' then
     dryer_mins:=(payload->>'dryerDuration')::integer;
     dryer_start:=((payload->>'dryerDateIso')||'T'||(payload->>'dryerTime')||':00+08:00')::timestamptz;
     if dryer_mins is null or dryer_mins not in (30,45,60) or dryer_start is null then raise exception 'Choose a dryer date, time and 30, 45 or 60 minute cycle.'; end if;
     if dryer_start<wash_start+interval '45 minutes' then raise exception 'The dryer must start after washing and a 15-minute buffer.'; end if;
     if extract(minute from dryer_start)::integer%15<>0 or extract(second from dryer_start)<>0 then raise exception 'Choose a 15-minute dryer start interval.'; end if;
   end if;
   pair:=gen_random_uuid(); parts:=case when kind='both' then 2 else 1 end;
   for part in 1..parts loop
     machine:=case when kind='dry' or part=2 then 'dryer-book' else 'washer-book' end;
     if part=2 then start_at:=dryer_start; mins:=dryer_mins; end if;
     if (start_at at time zone 'Asia/Singapore')::date>((now() at time zone 'Asia/Singapore')::date+13) then raise exception 'Both slots must start within the next 14 days.'; end if;
     if exists(select 1 from rc4_machines where id=machine and status='offline') then raise exception 'This machine is out of service.'; end if;
     insert into rc4_bookings(user_id,machine_id,pair_id,starts_at,duration,reserved_until)
     values(uid,machine,pair,start_at,mins,start_at+(mins+15)*interval '1 minute');
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
     if q.kind='washer' and mins<>30 then raise exception 'Washing cycles are always 30 minutes.'; end if;
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

revoke all on function public.rc4_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.rc4_action(text,jsonb) to authenticated;
commit;
