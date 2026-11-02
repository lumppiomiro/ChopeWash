begin;
delete from rc4_bookings;
delete from rc4_queue;
update rc4_machines set status='available',cycle_ends_at=null;
insert into auth.users values ('00000000-0000-0000-0000-000000000081','admin-resident@chopewash.rc4'),('00000000-0000-0000-0000-000000000082','other-operator@chopewash.rc4');
update rc4_profiles set role='operator' where username='other-operator';
do $$
declare miro uuid:=(select user_id from rc4_profiles where username='miro'); resident uuid:='00000000-0000-0000-0000-000000000081'; other_op uuid:='00000000-0000-0000-0000-000000000082'; snapshot jsonb; bid uuid; qid uuid; n integer;
begin
 assert miro is not null,'Existing Miro identity required';
 foreach resident in array array['00000000-0000-0000-0000-000000000081'::uuid,other_op] loop
   perform set_config('request.jwt.claim.sub',resident::text,true);
   assert not rc4_is_machine_admin(),'Only Miro is an admin, even if another profile has operator role';
   assert (rc4_snapshot()->>'machineAdmin')::boolean=false,'Non-Miro snapshot denies admin UI';
   begin perform rc4_action('clearMachines','{"machineIds":["washer-book"]}'); raise exception 'Expected denial'; exception when insufficient_privilege then null; end;
   begin perform rc4_action('operator','{"id":"washer-book","status":"available"}'); raise exception 'Expected denial'; exception when insufficient_privilege then null; end;
 end loop;
 resident:='00000000-0000-0000-0000-000000000081';
 perform set_config('request.jwt.claim.sub','',true);
 assert (rc4_snapshot()->>'machineAdmin')::boolean=false,'Anonymous snapshot cannot grant admin';
 perform set_config('request.jwt.claim.sub',miro::text,true);
 assert rc4_is_machine_admin(),'Miro grant works';
 assert (rc4_snapshot()->>'machineAdmin')::boolean,'Fresh Miro snapshot exposes admin capability';
 assert (rc4_snapshot()->>'schemaVersion')::integer=3,'Existing snapshot contract retained';
 -- Complete a finished booking, preserving a linked future drying reservation.
 insert into rc4_bookings(user_id,kind,machine_id,pair_id,starts_at,duration,reserved_until,started_at,status)
 values(resident,'washer','washer-book',resident,now()-interval '40 minutes',30,now()+interval '5 minutes',now()-interval '40 minutes','checked-in') returning id into bid;
 insert into rc4_bookings(user_id,kind,pair_id,starts_at,duration,reserved_until,status)
 values(resident,'dryer',resident,now()+interval '2 hours',45,now()+interval '3 hours','confirmed');
 update rc4_machines set status='finished',cycle_ends_at=now()-interval '10 minutes' where id='washer-book';
 snapshot:=rc4_action('clearMachines','{"machineIds":["washer-book"]}');
 assert (snapshot->>'machineAdmin')::boolean,'Mutation keeps fresh admin capability';
 assert (select status from rc4_machines where id='washer-book')='available','Finished machine available';
 assert (select status from rc4_bookings where id=bid)='complete','Booking reconciled';
 assert (select count(*) from rc4_bookings where status='confirmed')=1,'Future dryer preserved';
 assert (select actor_id from rc4_machine_admin_events order by created_at desc limit 1)=miro,'Audit actor derived from auth.uid';
 n:=(select count(*) from rc4_machine_admin_events);
 begin perform rc4_action('clearMachines','{"machineIds":["washer-book"]}'); raise exception 'Expected stale selection'; exception when others then if SQLERRM='Expected stale selection' then raise; end if; end;
 assert (select count(*) from rc4_machine_admin_events)=n,'Failed clears do not create success audits';
 delete from rc4_bookings;
 -- Linked queue stages must be cleared together after every cycle finishes.
 insert into rc4_queue(user_id,kind,quantity,duration,status,machine_ids,started_at,cycle_ends_at)
 values(resident,'washer',2,30,'claimed',array['washer-book','washer-queue'],now()-interval '40 minutes',now()-interval '10 minutes') returning id into qid;
 update rc4_machines set status='finished',cycle_ends_at=now()-interval '10 minutes' where kind='washer';
 begin perform rc4_action('clearMachines','{"machineIds":["washer-book"]}'); raise exception 'Expected partial group rejection'; exception when others then if SQLERRM='Expected partial group rejection' then raise; end if; end;
 assert (select count(*) from rc4_machines where status='finished')=2,'Partial clear leaves entire group intact';
 perform rc4_action('clearMachines','{"machineIds":["washer-book","washer-queue"]}');
 assert (select status from rc4_queue where id=qid)='collected','Claimed queue ledger reconciled';
 assert (select count(*) from rc4_machines where status='available')=4,'Whole group released';
 delete from rc4_queue;
 -- Atomic rejection when any selected machine is running.
 update rc4_machines set status='finished' where id='washer-book';
 update rc4_machines set status='running',cycle_ends_at=now()+interval '20 minutes' where id='dryer-book';
 begin perform rc4_action('clearMachines','{"machineIds":["washer-book","dryer-book"]}'); raise exception 'Expected running rejection'; exception when others then if SQLERRM='Expected running rejection' then raise; end if; end;
 assert (select status from rc4_machines where id='washer-book')='finished','Running rejection rolls back other releases';
 assert (select status from rc4_machines where id='dryer-book')='running','Running cycle protected';
 update rc4_machines set status='available',cycle_ends_at=null;
 -- An inconsistent finished flag must not override an active booking timer.
 insert into rc4_bookings(user_id,kind,machine_id,pair_id,starts_at,duration,reserved_until,started_at,status)
 values(resident,'washer','washer-book',resident,now()-interval '1 minute',30,now()+interval '44 minutes',now()-interval '1 minute','checked-in');
 update rc4_machines set status='finished' where id='washer-book';
 begin perform rc4_action('clearMachines','{"machineIds":["washer-book"]}'); raise exception 'Expected timer rejection'; exception when others then if SQLERRM='Expected timer rejection' then raise; end if; end;
 delete from rc4_bookings;
 update rc4_machines set status='available',cycle_ends_at=null;
 -- Offline restoration and duplicate selection normalization.
 update rc4_machines set status='offline' where id='dryer-book';
 perform rc4_action('clearMachines','{"machineIds":["dryer-book","dryer-book"]}');
 assert (select status from rc4_machines where id='dryer-book')='available','Offline machine restored';
 -- Invalid IDs/payloads cannot partially release real machines.
 update rc4_machines set status='finished' where id='washer-book';
 begin perform rc4_action('clearMachines','{"machineIds":["washer-book","missing"]}'); raise exception 'Expected invalid selection'; exception when others then if SQLERRM='Expected invalid selection' then raise; end if; end;
 assert (select status from rc4_machines where id='washer-book')='finished','Invalid selection atomic';
 begin perform rc4_action('clearMachines','{"machineIds":[]}'); raise exception 'Expected empty selection'; exception when others then if SQLERRM='Expected empty selection' then raise; end if; end;
 begin perform rc4_action('clearMachines','{}'); raise exception 'Expected missing selection'; exception when others then if SQLERRM='Expected missing selection' then raise; end if; end;
 -- Release serves waiting residents normally instead of cancelling their requests.
 update rc4_machines set status='finished' where kind='washer';
 insert into rc4_queue(user_id,kind,quantity,duration,status) values(resident,'washer',1,30,'waiting') returning id into qid;
 perform rc4_action('clearMachines','{"machineIds":["washer-book","washer-queue"]}');
 assert (select status from rc4_queue where id=qid)='offered','Existing waiter receives offer';
 assert exists(select 1 from jsonb_array_elements(rc4_snapshot()->'machines') m where (m->>'held')::boolean),'Public UI shows held machine accurately';
 delete from rc4_queue;
 -- Resident booking/cancellation still works through the secured wrapper.
 perform set_config('request.jwt.claim.sub',resident::text,true);
 perform rc4_action('book',jsonb_build_object('kind','wash','dateIso',to_char(now()+interval '1 day','YYYY-MM-DD'),'startTime','16:00','duration',30));
 select id into bid from rc4_bookings where user_id=resident;
 perform rc4_action('cancelBooking',jsonb_build_object('id',bid));
 assert (select status from rc4_bookings where id=bid)='cancelled','Normal resident actions preserved';
 assert not has_function_privilege('anon','rc4_action(text,jsonb)','execute'),'No anonymous mutations';
 assert not has_function_privilege('authenticated','rc4_shared_action(text,jsonb)','execute'),'Cannot bypass admin wrapper';
 assert not has_function_privilege('authenticated','rc4_shared_snapshot()','execute'),'Cannot bypass snapshot wrapper';
 assert not has_table_privilege('authenticated','rc4_profiles','UPDATE'),'Cannot grant own admin role';
 assert not has_table_privilege('authenticated','rc4_machine_admin_events','INSERT'),'Cannot forge audit records';
 assert not has_table_privilege('authenticated','rc4_machine_admin_events','SELECT'),'Audit records not resident-visible';
 raise notice 'PASS: Miro-only authorization, anonymous/other-operator denial, atomic linked clearing, running/timer protection, ledger reconciliation, offline restoration, audit and normal resident flows';
end $$;
rollback;
