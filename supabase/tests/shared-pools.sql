begin;
insert into auth.users values ('00000000-0000-0000-0000-000000000051','pool-a@chopewash.rc4'),('00000000-0000-0000-0000-000000000052','pool-b@chopewash.rc4');
insert into auth.users values ('00000000-0000-0000-0000-000000000053','pool-c@chopewash.rc4');
delete from rc4_bookings;
delete from rc4_queue;
update rc4_machines set status='available',cycle_ends_at=null;
do $$
declare a uuid:='00000000-0000-0000-0000-000000000051'; b uuid:='00000000-0000-0000-0000-000000000052'; p jsonb; qid uuid; bid uuid; before_count integer;
begin
 perform set_config('request.jwt.claim.sub',a::text,true);
 p:=jsonb_build_object('kind','both','dateIso',to_char(now()+interval '1 day','YYYY-MM-DD'),'startTime','10:00','duration',30,'washerCount',2,'dryerCount',1,'dryerDateIso',to_char(now()+interval '1 day','YYYY-MM-DD'),'dryerTime','10:45','dryerDuration',45);
 perform rc4_action('book',p);
 assert (select count(*) from rc4_bookings where user_id=a)=3,'Two washers + one dryer';
 assert (select count(*) from rc4_bookings where machine_id is not null)=0,'Physical assignment deferred';
 perform set_config('request.jwt.claim.sub',b::text,true);
 before_count:=(select count(*) from rc4_bookings);
 begin perform rc4_action('book',p); raise exception 'Expected full-pool rejection'; exception when others then if SQLERRM='Expected full-pool rejection' then raise; end if; end;
 assert (select count(*) from rc4_bookings)=before_count,'Atomic full-plan failure';
 assert jsonb_array_length(rc4_snapshot()->'bookings')=0,'Private bookings';
 assert (rc4_snapshot()->>'schemaVersion')::integer=3,'Schema compatibility';
 delete from rc4_bookings;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform rc4_action('joinQueue','{"kind":"washer","quantity":2,"duration":30,"dryerQuantity":1,"dryerDuration":45}');
 select id into qid from rc4_queue where user_id=a;
 assert (select status from rc4_queue where id=qid)='offered','Full-pool queue offer';
 assert (select cardinality(machine_ids) from rc4_queue where id=qid)=2,'Both machines held';
 assert not rc4_pool_fits('washer',now(),now()+interval '30 minutes',1),'Offer holds capacity';
 perform rc4_action('claimQueue',jsonb_build_object('id',qid,'duration',30));
 assert (select count(*) from rc4_machines where status='running')=2,'Both washers started';
 assert (select count(*) from rc4_bookings where pair_id=qid and kind='dryer')=1,'Dryer hold becomes reservation';
 begin perform rc4_action('leaveQueue','{"kind":"washer"}'); raise exception 'Expected running release rejection'; exception when others then if SQLERRM='Expected running release rejection' then raise; end if; end;
 update rc4_queue set cycle_ends_at=now()-interval '1 minute' where id=qid;
 update rc4_machines set cycle_ends_at=now()-interval '1 minute' where status='running';
 perform rc4_tick();
 assert (select count(*) from rc4_machines where status='finished')=2,'Collection blocks physical reuse';
 perform rc4_action('leaveQueue','{"kind":"washer"}');
 assert (select count(*) from rc4_machines where status='available')=4,'Release both washers';
 assert (select count(*) from rc4_bookings where pair_id=qid)=1,'Collecting wash preserves dryer';
 select id into bid from rc4_bookings where pair_id=qid;
 perform rc4_action('cancelBooking',jsonb_build_object('id',bid));
 assert (select status from rc4_bookings where id=bid)='cancelled','Cancel dryer';
 delete from rc4_queue; delete from rc4_bookings;
 -- Immediate two-machine reservation check-in, using a valid grace window.
 insert into rc4_bookings(user_id,kind,pair_id,starts_at,duration,reserved_until)
 select a,'washer',a,now()-interval '1 minute',30,now()+interval '44 minutes' from generate_series(1,2);
 select id into bid from rc4_bookings limit 1;
 perform rc4_action('checkIn',jsonb_build_object('id',bid));
 assert (select count(distinct machine_id) from rc4_bookings where status='checked-in')=2,'Atomic distinct assignments';
 perform rc4_action('checkIn',jsonb_build_object('id',bid));
 assert (select count(*) from rc4_bookings where status='checked-in')=2,'Idempotent check-in';
 delete from rc4_bookings; delete from rc4_queue;
 update rc4_machines set status='available',cycle_ends_at=null;
 -- Both washers reserved in 40 minutes: a 50-minute queue offer cannot fit.
 insert into rc4_bookings(user_id,kind,pair_id,starts_at,duration,reserved_until)
 select b,'washer',b,now()+interval '40 minutes',30,now()+interval '85 minutes' from generate_series(1,2);
 perform rc4_action('joinQueue','{"kind":"washer","quantity":1,"duration":30}');
 assert (select status from rc4_queue where user_id=a)='waiting','Protect future reservations';
 delete from rc4_queue; delete from rc4_bookings;
 -- One washer occupied for 70 minutes including buffer. Two-machine waiter
 -- cannot start before then, so a later one-machine 50-minute offer fits safely.
 insert into rc4_queue(user_id,kind,quantity,duration,status,machine_ids,started_at,cycle_ends_at)
 values('00000000-0000-0000-0000-000000000053','washer',1,60,'claimed',array['washer-book'],now()-interval '5 minutes',now()+interval '55 minutes');
 update rc4_machines set status='running',cycle_ends_at=now()+interval '55 minutes' where id='washer-book';
 perform rc4_action('joinQueue','{"kind":"washer","quantity":2,"duration":30}');
 assert (select status from rc4_queue where user_id=a)='waiting','Wait for two together';
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform rc4_action('joinQueue','{"kind":"washer","quantity":1,"duration":30}');
 assert (select status from rc4_queue where user_id=b)='offered','Safe backfill';
 assert (select status from rc4_queue where user_id=a)='waiting','Earlier request preserved';
 select id into qid from rc4_queue where user_id=b;
 perform rc4_action('joinQueue','{"kind":"washer","quantity":2,"duration":30}');
 assert (select quantity from rc4_queue where id=qid)=1,'Duplicate join preserves request';
 update rc4_queue set offer_expires_at=now()-interval '1 second' where id=qid;
 perform rc4_tick();
 assert (select status from rc4_queue where id=qid)='expired','Offer expiration releases hold';
 -- A shorter earlier feasible start prevents backfilling.
 delete from rc4_queue;
 insert into rc4_queue(user_id,kind,quantity,duration,status,machine_ids,started_at,cycle_ends_at)
 values('00000000-0000-0000-0000-000000000053','washer',1,30,'claimed',array['washer-book'],now()-interval '5 minutes',now()+interval '25 minutes');
 insert into rc4_queue(user_id,kind,quantity,duration) values(a,'washer',2,30),(b,'washer',1,30);
 perform rc4_tick();
 assert not exists(select 1 from rc4_queue where status='offered'),'Do not delay earlier start';
 delete from rc4_queue; delete from rc4_bookings;
 update rc4_machines set status='available',cycle_ends_at=null;
 -- Dryer failure must roll back otherwise feasible washer inserts.
 insert into rc4_bookings(user_id,kind,pair_id,starts_at,duration,reserved_until)
 values(b,'dryer',b,((p->>'dryerDateIso')||'T10:45:00+08:00')::timestamptz,45,((p->>'dryerDateIso')||'T11:45:00+08:00')::timestamptz);
 perform set_config('request.jwt.claim.sub',a::text,true);
 before_count:=(select count(*) from rc4_bookings);
 begin perform rc4_action('book',p||'{"dryerCount":2}'); raise exception 'Expected dryer rejection'; exception when others then if SQLERRM='Expected dryer rejection' then raise; end if; end;
 assert (select count(*) from rc4_bookings)=before_count,'No partial washer reservation';
 delete from rc4_bookings;
 perform rc4_action('book',p||jsonb_build_object('secondWasherDateIso',p->>'dateIso','secondWasherTime','11:00','dryerTime','11:45'));
 assert (select count(distinct starts_at) from rc4_bookings where kind='washer')=2,'Staggered washer plan';
 select id into bid from rc4_bookings limit 1;
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin perform rc4_action('cancelBooking',jsonb_build_object('id',bid)); raise exception 'Expected owner rejection'; exception when others then if SQLERRM='Expected owner rejection' then raise; end if; end;
 assert (select count(*) from rc4_bookings where status='confirmed')=3,'Cannot cancel other user plan';
 delete from rc4_bookings;
 insert into rc4_bookings(user_id,kind,pair_id,starts_at,duration,reserved_until)
 select a,'washer',gen_random_uuid(),now()+i*interval '2 hours',30,now()+i*interval '2 hours'+interval '45 minutes' from generate_series(1,8) i;
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform rc4_action('joinQueue','{"kind":"washer","quantity":1,"duration":30}'); raise exception 'Expected quota rejection'; exception when others then if SQLERRM='Expected quota rejection' then raise; end if; end;
 assert not exists(select 1 from rc4_queue where user_id=a),'Quota includes queue machine cycles';
 begin perform rc4_action('operator','{"id":"washer-book","status":"offline"}'); raise exception 'Expected role rejection'; exception when others then if SQLERRM='Expected role rejection' then raise; end if; end;
 assert (select status from rc4_machines where id='washer-book')='available','Resident cannot change machines';
 delete from rc4_bookings; delete from rc4_queue;
 update rc4_profiles set role='operator' where user_id=b;
 insert into rc4_queue(user_id,kind,quantity,duration,status,machine_ids,started_at,cycle_ends_at)
 values(a,'washer',2,30,'claimed',array['washer-book','washer-queue'],now()-interval '31 minutes',now()-interval '1 minute');
 update rc4_machines set status='finished',cycle_ends_at=now()-interval '1 minute' where kind='washer';
 perform set_config('request.jwt.claim.sub',b::text,true);
 assert (select jsonb_array_length(m->'collectionGroup') from jsonb_array_elements(rc4_snapshot()->'machines') m where m->>'id'='washer-book')=2,'Operator sees linked collection machines';
 perform rc4_action('operator','{"id":"washer-book","status":"available"}');
 assert (select count(*) from rc4_machines where status='available')=4,'Operator releases every collected queue machine';
 assert (select status from rc4_queue where user_id=a)='collected','Operator resolves abandoned finished stage';
 assert not has_function_privilege('authenticated','rc4_legacy_action(text,jsonb)','execute'),'Legacy mutation inaccessible';
 assert not has_function_privilege('anon','rc4_action(text,jsonb)','execute'),'No anonymous mutations';
 raise notice 'PASS: shared capacity, privacy, atomic plans, gaps, fair backfill, staggered starts, queue holds, paired drying, collection and permissions';
end $$;
rollback;
