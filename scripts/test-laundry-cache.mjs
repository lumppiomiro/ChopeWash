import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { readSnapshotCache, writeSnapshotCache, clearSnapshotCache, snapshotIsFresh, SNAPSHOT_CACHE_TTL, snapshotCacheKey } from "../src/lib/laundry-cache.ts";

const records = new Map();
const storage = { getItem: key => records.get(key) ?? null, setItem: (key,value) => records.set(key,value), removeItem: key => records.delete(key) };
const snapshot = { schemaVersion:3, role:"operator", serverTime:"2026-10-13T00:00:00Z", machines:[], bookings:[], queueEntries:[] };
const key = snapshotCacheKey("fixture-project");
writeSnapshotCache(storage,key,"alice",snapshot,1000);
assert.equal(readSnapshotCache(storage,key,"alice",1001).state.role,"resident");
assert.equal(readSnapshotCache(storage,key,"bob",1001),null);
assert.equal(readSnapshotCache(storage,key,null,1001),null);
assert.equal(readSnapshotCache(storage,key,"alice",1000+SNAPSHOT_CACHE_TTL),null);
assert.equal(readSnapshotCache(storage,key,"alice",999),null);
storage.setItem(key,"{broken"); assert.equal(readSnapshotCache(storage,key,"alice",1001),null);
writeSnapshotCache(storage,key,"alice",{...snapshot,machines:[null]},1000); assert.equal(readSnapshotCache(storage,key,"alice",1001),null);
writeSnapshotCache(storage,key,"alice",{...snapshot,schemaVersion:2},1000); assert.equal(readSnapshotCache(storage,key,"alice",1001),null);
const unavailable = {getItem(){throw Error("denied");},setItem(){throw Error("full");},removeItem(){throw Error("denied");}};
assert.equal(readSnapshotCache(unavailable,key,"alice"),null); writeSnapshotCache(unavailable,key,"alice",snapshot); clearSnapshotCache(unavailable,key);
assert.equal(snapshotIsFresh(1000,15999),true); assert.equal(snapshotIsFresh(1000,16000),false); assert.equal(snapshotIsFresh(0,1000),false);

// Run the real hook with deterministic hooks, auth events, browser lifecycle and
// deferred RPCs. No credentials, actual browser or production writes are used.
let clock = 100_000, cursor = 0, effectQueue = [], hooks = [], authCallback;
const cleanup = [], requests = [], listeners = new Map();
const same = (a,b) => a && b && a.length===b.length && a.every((v,i)=>Object.is(v,b[i]));
const react = {
  useState(initial){const i=cursor++; if(!hooks[i]) hooks[i]={value:initial}; return [hooks[i].value,value=>{hooks[i].value=typeof value==="function"?value(hooks[i].value):value;}];},
  useRef(initial){const i=cursor++; return hooks[i]??= {current:initial};},
  useCallback(fn,deps){const i=cursor++; if(!same(hooks[i]?.deps,deps)) hooks[i]={value:fn,deps}; return hooks[i].value;},
  useEffect(fn,deps){const i=cursor++; if(!same(hooks[i]?.deps,deps)){hooks[i]={deps};effectQueue.push(()=>{cleanup[i]?.();cleanup[i]=fn();});}},
};
const client = {auth:{onAuthStateChange(fn){authCallback=fn; return {data:{subscription:{unsubscribe(){}}}};}},rpc(name){
  let resolve; const promise=new Promise(done=>resolve=done); requests.push({name,resolve});
  promise.abortSignal=()=>promise; return promise;
}};
const windowMock={localStorage:storage,setTimeout:fn=>{queueMicrotask(fn);return 1;},setInterval:()=>1,
  addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
const documentMock={visibilityState:"visible",addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
const navigatorMock={onLine:true};
class TestDate extends Date {static now(){return clock;}}
const source=readFileSync(new URL("../src/lib/laundry-store.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const storeModule={exports:{}};
vm.runInNewContext(code,{module:storeModule,exports:storeModule.exports,require:name=>name==="react"?react:name==="@/lib/supabase"?{requireSupabase:()=>client,getSupabaseClient:()=>client}:{readSnapshotCache:(s,k,o)=>readSnapshotCache(s,k,o,clock),writeSnapshotCache:(s,k,o,state,now=clock)=>writeSnapshotCache(s,k,o,state,now),clearSnapshotCache,snapshotIsFresh:time=>snapshotIsFresh(time,clock),snapshotCacheKey},window:windowMock,document:documentMock,navigator:navigatorMock,Date:TestDate,AbortSignal,process:{env:{NEXT_PUBLIC_SUPABASE_URL:"fixture-project"}},clearInterval(){},console});
const render=()=>{cursor=0;const result=storeModule.exports.useLaundryStore();const pending=effectQueue;effectQueue=[];pending.forEach(fn=>fn());return result;};
const settle=async()=>{for(let i=0;i<8;i++) await Promise.resolve();};
const auth=(id,event="SIGNED_IN")=>authCallback(event,id?{user:{id}}:null);
writeSnapshotCache(storage,key,"alice",snapshot,clock);
let store=render(); auth("alice","INITIAL_SESSION"); await settle(); store=render();
assert.equal(store.hasData,true); assert.equal(store.ready,false); assert.equal(requests.length,1);
requests.shift().resolve({data:{...snapshot,role:"resident"},error:null}); await settle(); store=render(); assert.equal(store.ready,true);
const retained=store.state; auth("alice"); auth("alice","TOKEN_REFRESHED"); store=render(); assert.equal(store.state,retained); assert.equal(store.ready,true);
listeners.get("focus")(); listeners.get("visibilitychange")(); await settle(); assert.equal(requests.length,1); // dedup
requests.shift().resolve({data:null,error:Error("network failure")}); await settle(); store=render(); assert.equal(store.state,retained); assert.equal(store.ready,false);
await assert.rejects(store.addBooking({}),/Refreshing/); assert.equal(requests.length,1); // no action RPC from cache
requests.shift().resolve({data:snapshot,error:null}); await settle(); store=render();
// A pre-mutation read cannot overwrite the newer successful write.
void store.refresh(); const oldRead=requests.shift(); const mutation=store.cancelBooking("fictional"); const write=requests.shift(); assert.equal(write.name,"rc4_action");
write.resolve({data:{...snapshot,serverTime:"2026-10-13T00:01:00Z"},error:null}); await mutation;
oldRead.resolve({data:snapshot,error:null}); await settle(); store=render(); assert.equal(store.state.serverTime,"2026-10-13T00:01:00Z");
clock+=20_000; listeners.get("focus")(); store=render(); assert.equal(store.ready,false);
auth("bob"); await settle(); store=render(); assert.equal(store.hasData,false); assert.equal(storage.getItem(key),null);
// Ignore Alice's in-flight results after a user switch.
requests.shift().resolve({data:snapshot,error:null}); await settle(); store=render(); assert.equal(store.hasData,false);
requests.shift().resolve({data:snapshot,error:null}); await settle(); store=render(); assert.equal(store.ready,true);
auth(null,"SIGNED_OUT"); await settle(); store=render(); assert.equal(store.hasData,false); assert.equal(storage.getItem(key),null);
documentMock.visibilityState="hidden"; const count=requests.length; listeners.get("focus")(); assert.equal(requests.length,count);
cleanup.forEach(fn=>fn?.());
console.log("PASS: cache owner/expiry/schema/storage safety, restore, same-user auth, request dedup, stale write guard, quiet failure, mutation race, account switch, sign-out and hidden-tab polling.");
