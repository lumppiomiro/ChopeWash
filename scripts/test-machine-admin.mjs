import assert from 'node:assert/strict';
import test from 'node:test';
import { hasMachineAdminAccess, collectionTargets, collectedMachines } from '../src/lib/machine-admin.ts';
const machine=(id,status='finished',patch={})=>({id,name:id,kind:'washer',mode:'pool',status,minutesLeft:0,queueLength:0,...patch});
test('Admin UI requires a fresh server capability and operator role',()=>{
 assert.equal(hasMachineAdminAccess({machineAdmin:true,role:'operator'},true),true);
 for(const [state,ready] of [[{machineAdmin:true,role:'operator'},false],[{machineAdmin:true,role:'resident'},true],[{machineAdmin:false,role:'operator'},true],[{role:'operator'},true]]) assert.equal(hasMachineAdminAccess(state,ready),false);
});
test('A finished machine can be selected without other machines',()=>{
 const m=machine('w1'); assert.deepEqual(collectionTargets(m,[m]).map(x=>x.id),['w1']);
});
test('Linked queue stages are selected together',()=>{
 const a=machine('w1','finished',{collectionGroup:['w1','w2']}); const b=machine('w2','finished',{collectionGroup:['w1','w2']});
 assert.deepEqual(collectionTargets(a,[a,b]).map(x=>x.id),['w1','w2']);
 assert.equal(collectedMachines([a,b]).length,2);
});
test('Running, held, missing and incomplete linked groups cannot be cleared',()=>{
 const a=machine('w1','finished',{collectionGroup:['w1','w2']});
 for(const b of [machine('w2','running'),machine('w2','finished',{held:true}),machine('w2','available')]) assert.deepEqual(collectionTargets(a,[a,b]),[]);
 assert.deepEqual(collectionTargets(a,[a]),[]);
 assert.equal(collectedMachines([a,machine('w2','running')]).length,0);
});
test('Bulk selection excludes running, offline, already available and held machines',()=>{
 assert.deepEqual(collectedMachines([machine('w1'),machine('w2','running'),machine('d1','available'),machine('d2','offline'),machine('x','finished',{held:true})]).map(x=>x.id),['w1']);
});
