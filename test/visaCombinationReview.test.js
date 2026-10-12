const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {VisaStore}=require('../visaStore');const {mountVisaRoutes}=require('../visaRoutes');const runtime=require('../visaRuntime');const {evaluateVisa}=require('../visaEngine');
const facts={nationality:'ZAF',destinationCountry:'CHN',passportType:'ordinary',travelDate:'2026-10-20',purpose:'tourism',stayDays:10,ckinLines:[]};
async function withServer(fn) {
 const store=new VisaStore(':memory:');store.db.prepare("UPDATE visa_monitors SET last_success_at=? WHERE kind='feed'").run(new Date().toISOString());
 const app=express();app.use(express.json());
 const content='<html><title>Visa policy</title><body>'+('Official visa policy: ordinary passports may visit for tourism up to 30 days. '.repeat(6))+'</body></html>';
 mountVisaRoutes(app,store,{check:async()=>[]},{token:'test-admin',verifyReviewer:async token=>{if(token!=='signed-fixture')throw Error('Not authorized');return {reviewer:'lake@mu.com',uid:'fixture'};},fetcher:async()=>new Response(content,{headers:{'content-type':'text/html'}})});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 const post=(endpoint,body,token='signed-fixture')=>fetch(base+endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
 try{await fn({store,base,post});}finally{runtime.setVisaStore(undefined);await new Promise(resolve=>server.close(resolve));store.close();}
}
function rule(extra={}) {return {nationality:'ZAF',destination_country:'CHN',passport_type:'ordinary',rule_type:'visa_exempt',conditions:{maxStayDays:30,purposes:['tourism']},effective_from:'2026-10-12',effective_until:'2026-12-31',recheck_due_at:'2026-11-11',clause_reference:'Verified ordinary-passport tourism exemption, up to 30 days; excludes work and study.',...extra};}
test('uncovered BN combination is queued, reviewed, published in SQLite and used by subsequent checks',async()=>withServer(async({store,post})=>{
 runtime.setVisaStore(store);assert.equal(runtime.checkVisa(facts).status,'review');assert.equal(store.overview().unknownCombinations.length,1);
 const response=await post('/visa-api/source-preview',{url:'https://www.mfa.gov.cn/policy-test.html'});assert.equal(response.status,200);const source=await response.json();assert.match(source.content,/Official visa policy/);
 const published=await post('/visa-api/review-combination',{rule:rule(),sourceIds:[source.id],reviewer:'spoofed',confirmed:true});assert.equal(published.status,200);
 const saved=await published.json();assert.equal(saved.reviewer,'lake@mu.com');assert.equal(saved.approved,true);
 assert.equal(store.overview().unknownCombinations.length,0);assert.equal(runtime.checkVisa(facts).status,'pass');
 assert.equal(evaluateVisa({...facts,stayDays:31},store).status,'pass');assert.equal(evaluateVisa({...facts,travelDate:'2027-01-01'},store).status,'review');
}));
test('traveller Review Pass and unsupported/expired policy publication do not create reusable rules',async()=>withServer(async({store,post})=>{
 assert.equal((await post('/visa-api/review-combination',{rule:rule(),sourceIds:[],confirmed:true},'forged')).status,403);
 assert.equal((await post('/visa-api/source-preview',{url:'https://example.com/policy'})).status,400);
 assert.equal((await post('/visa-api/source-preview',{url:'http://www.mfa.gov.cn/policy'})).status,400);
 const source=await (await post('/visa-api/source-preview',{url:'https://www.mfa.gov.cn/policy-test.html'})).json();
 assert.equal((await post('/visa-api/review-combination',{rule:rule(),sourceIds:[source.id]})).status,400);
 assert.equal((await post('/visa-api/review-combination',{rule:rule({effective_until:'2026-10-01'}),sourceIds:[source.id],confirmed:true})).status,400);
 assert.equal(store.overview().rules.length,0);
}));
test('failed replacement rolls back and stale official snapshots cannot be published',async()=>withServer(async({store,post})=>{
 const source=await (await post('/visa-api/source-preview',{url:'https://www.mfa.gov.cn/policy-test.html'})).json();
 const body={rule:rule(),sourceIds:[source.id],confirmed:true};assert.equal((await post('/visa-api/review-combination',body)).status,200);
 store.db.prepare('UPDATE visa_monitors SET last_success_at=? WHERE url=?').run('2026-01-01T00:00:00Z',source.url);
 assert.equal((await post('/visa-api/review-combination',body)).status,400);
 assert.equal(store.overview().rules.length,1);assert.equal(store.overview().rules[0].status,'approved');
}));
