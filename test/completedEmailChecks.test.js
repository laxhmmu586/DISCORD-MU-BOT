'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRetainer}=require('../scripts/client-glass-v2/files/web/completed-email-checks.js');
const fixture=(state='ready')=>({flightNo:'MU586',flightDate:'07NOV26',aircraftRegistration:'B-2020',reservation:[10,20,100],reservationTicketed:[10,20,100],crewApis:{gdCheckQuery:{crew:[{passport:'TEST0001'}]},steps:[{key:'gdCheck',complete:state==='ready',searched:state==='ready',time:state==='ready'?'10:30':'',details:state==='ready'?{complete:true}: {}}]},spml:{preorderByCabin:{Y:{VGML:2}},email:{found:state==='ready',counts:{VGML:2},cabinCounts:{F:10,J:20,Y:100}}},desktopCloud:{state,message:'Background Gmail check'}});
const gd=sy=>sy.crewApis.steps[0];
test('unchanged completed GD/Meal remain complete through a background load or failure',()=>{
 const retain=createRetainer({getUserId:()=> 'employee-a'});retain(fixture());
 for(const state of ['pending','error']){const input=fixture(state),output=retain(input);assert.equal(gd(output).complete,true);assert.equal(output.spml.email.found,true);assert.equal(output.emailCheckRefresh.mealRetained,true);assert.equal(gd(input).complete,false,'never mutate the source payload');}
});
test('crew or aircraft changes invalidate GD independently of Meal Order',()=>{
 for(const change of [sy=>sy.aircraftRegistration='B-2021',sy=>sy.crewApis.gdCheckQuery.crew[0].passport='TEST0002']){const retain=createRetainer({getUserId:()=> 'a'});retain(fixture());const next=fixture('pending');change(next);const result=retain(next);assert.equal(gd(result).complete,false);assert.equal(result.spml.email.found,true);}
});
test('reservation or preorder changes invalidate Meal independently of GD',()=>{
 for(const change of [sy=>sy.reservationTicketed[2]++,sy=>sy.reservation[1]++,sy=>sy.spml.preorderByCabin.Y.VGML++]){const retain=createRetainer({getUserId:()=> 'a'});retain(fixture());const next=fixture('pending');change(next);const result=retain(next);assert.equal(gd(result).complete,true);assert.equal(result.spml.email.found,false);}
});
test('flight/date and employee changes never inherit previous completed results',()=>{
 let uid='a';const retain=createRetainer({getUserId:()=> uid});retain(fixture());
 for(const change of [sy=>sy.flightNo='MU578',sy=>sy.flightDate='08NOV26']){const next=fixture('pending');change(next);assert.equal(gd(retain(next)).complete,false);assert.equal(retain(next).spml.email.found,false);}
 uid='b';assert.equal(gd(retain(fixture('pending'))).complete,false);uid='';assert.equal(gd(retain(fixture('pending'))).complete,false);
});
test('fresh mismatches replace success and cannot resurrect an obsolete green state',()=>{
 const retain=createRetainer({getUserId:()=> 'a'});retain(fixture());const changed=fixture();gd(changed).complete=false;changed.spml.email.found=false;retain(changed);
 const result=retain(fixture('pending'));assert.equal(gd(result).complete,false);assert.equal(result.spml.email.found,false);
});
test('retains across same-session page reloads while unrelated log updates do not invalidate',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 createRetainer({getUserId:()=> 'a',storage})(fixture());const retain=createRetainer({getUserId:()=> 'a',storage});const next=fixture('pending');next.localLogRevision='unrelated-new-terminal-output';assert.equal(gd(retain(next)).complete,true);assert.equal(retain(next).spml.email.found,true);
});
test('a first pending request is never promoted to completed without a ready result',()=>{const result=createRetainer({getUserId:()=> 'a'})(fixture('pending'));assert.equal(gd(result).complete,false);assert.equal(result.spml.email.found,false);});
