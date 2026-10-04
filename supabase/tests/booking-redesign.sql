begin;
insert into auth.users values
 ('00000000-0000-0000-0000-000000000051','redesign-a@chopewash.rc4'),
 ('00000000-0000-0000-0000-000000000052','redesign-b@chopewash.rc4');
do $$
declare alice uuid:='00000000-0000-0000-0000-000000000051'; bob uuid:='00000000-0000-0000-0000-000000000052';
 d text:=to_char(now()+interval '1 day','YYYY-MM-DD'); p jsonb; rejected boolean; snap jsonb; offer uuid;
begin
 perform set_config('request.jwt.claim.sub',alice::text,true);
 p:=jsonb_build_object('kind','wash','dateIso',d,'startTime','09:00','duration',45);
 rejected:=false;
 begin perform rc4_action('book',p); exception when others then rejected:=true; end;
 assert rejected,'45-minute wash accepted';
 p:=p||jsonb_build_object('kind','both','duration',30,'dryerDateIso',d,'dryerTime','11:00','dryerDuration',60);
 snap:=rc4_action('book',p);
 assert (select duration from rc4_bookings where user_id=alice and machine_id='washer-book')=30,'washer length';
 assert (select duration from rc4_bookings where user_id=alice and machine_id='dryer-book')=60,'independent dryer length';
 assert to_char((select starts_at from rc4_bookings where user_id=alice and machine_id='dryer-book') at time zone 'Asia/Singapore','HH24:MI')='11:00','custom dryer time ignored';
 perform set_config('request.jwt.claim.sub',bob::text,true);
 rejected:=false;
 begin perform rc4_action('book',p||'{"startTime":"10:00","dryerTime":"11:15"}'::jsonb); exception when others then rejected:=true; end;
 assert rejected and not exists(select 1 from rc4_bookings where user_id=bob),'paired collision must roll back washer';
 rejected:=false;
 begin perform rc4_action('book',p||'{"startTime":"10:00","dryerTime":"10:30"}'::jsonb); exception when others then rejected:=true; end;
 assert rejected,'dryer scheduled too early';
 p:=p||jsonb_build_object('startTime','23:30','dryerDateIso',to_char(now()+interval '2 days','YYYY-MM-DD'),'dryerTime','00:15','dryerDuration',45);
 perform rc4_action('book',p);
 assert exists(select 1 from rc4_bookings where user_id=bob and machine_id='dryer-book' and (starts_at at time zone 'Asia/Singapore')::date=(now()+interval '2 days')::date),'cross-day pairing';
 snap:=rc4_action('joinQueue','{"kind":"washer"}');
 offer:=(snap->'queueEntries'->0->>'id')::uuid;
 rejected:=false;
 begin perform rc4_action('claimQueue',jsonb_build_object('id',offer,'duration',60)); exception when others then rejected:=true; end;
 assert rejected,'queue washer allowed 60 minutes';
 perform rc4_action('claimQueue',jsonb_build_object('id',offer,'duration',30));
 assert (select cycle_ends_at-started_at from rc4_queue where id=offer)=interval '30 minutes','queue washer duration';
 raise notice 'PASS: fixed washers, custom dryer duration/time, cross-day pairing, paired rollback and queue enforcement';
end $$;
rollback;
