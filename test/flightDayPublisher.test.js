'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createPublisher}=require('../scripts/desktop-updates/publisher.cjs');
test('approved publisher uploads only SY/BND and retries failed writes without marking them saved',async()=>{
 const raw=fs.readFileSync(require('node:path').join(__dirname,'fixtures/boarding-box-bnd-ranges.log'),'utf8')+'\n2026 October 19, Monday, 15:38:00\n>PR\n PR: MU586/19OCT26\n SECRET/PASSENGER';
 const requests=[];let fail=true;const publisher=createPublisher({store:{read:async()=>raw},context:require('../flightContext'),getAuthorization:()=> 'Bearer test',now:()=>Date.parse('2026-10-19T23:00:00Z'),fetch:async(url,opts)=>{requests.push(JSON.parse(opts.body));return fail?new Response('',{status:503}):Response.json({flights:[{flightNo:'MU586',gate:'156'}]});}});
 await publisher.tick();assert.equal(publisher.status().pending,true);fail=false;await publisher.tick();assert.equal(publisher.status().pending,false);assert.equal(requests.length,2);assert(!requests[0].log.includes('SECRET'));assert(requests[0].log.includes(' BND:'));assert.equal(publisher.snapshot().flights[0].gate,'156');
});
