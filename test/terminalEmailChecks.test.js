'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalize,mount}=require('../terminalEmailChecks');
const input=()=>({flightNo:'MU586',flightDate:'07NOV26',aircraftRegistration:'B-2020',gdQuery:{crew:[{passport:'SE1234567',name:'Never exported'}]}});
test('normalizes local expectations and rejects invalid flight, date and crew before Gmail access',()=>{
 assert.deepEqual(normalize(input()),{flightNo:'MU586',flightDate:'07NOV26',aircraftRegistration:'B2020',crew:[{no:1,passport:'SE1234567'}]});
 for(const value of [{...input(),flightNo:'MU9999'},{...input(),flightDate:'31NOV26'},{...input(),gdQuery:{crew:Array(81).fill({})}}])assert.throws(()=>normalize(value));
});
test('requires approved Desktop and reuses existing Gmail readers with exact local scope',async()=>{
 let handler,calls=[];
 mount({post:(route,fn)=>{assert.equal(route,'/flight-email-checks');handler=fn}},{getGdCheckEmail:async(...args)=>{calls.push(args);return {complete:true}},getLatestMealOrderEmail:async(...args)=>{calls.push(args);return {found:true}}});
 const invoke=async(req)=>{let status=200,data;const res={status(n){status=n;return this},json(x){data=x;return this},set(){}};await handler(req,res);return {status,data}};
 assert.equal((await invoke({body:input()})).status,403);assert.equal(calls.length,0);
 assert.equal((await invoke({body:{...input(),flightDate:'31NOV26'},desktopUser:{uid:'a'}})).status,400);assert.equal(calls.length,0);
 const request={body:input(),desktopUser:{uid:'a'}};
 const [first,second]=await Promise.all([invoke(request),invoke(request)]);assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(calls.length,2);
 assert.deepEqual(calls[0],['MU586','07NOV26',[{no:1,passport:'SE1234567'}],'GD for MU586/07NOV26',{flightNo:'MU586',flightDate:'07NOV26',aircraftRegistration:'B2020'}]);
 assert.deepEqual(calls[1],['MU586','07NOV26']);
 const changed=input();changed.gdQuery.crew[0].passport='SE7654321';await invoke({body:changed,desktopUser:{uid:'a'}});assert.equal(calls.length,4);
 await invoke({body:input(),desktopUser:{uid:'b'}});assert.equal(calls.length,6,'employee sessions are isolated');
 assert(require('../desktopProtection').privateApi('/flight-email-checks'));
});
