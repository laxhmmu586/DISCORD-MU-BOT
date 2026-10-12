const test=require('node:test');const assert=require('node:assert/strict');
const {VisaStore}=require('../visaStore');const {VisaMonitor,fetchOfficial,noticeLinks}=require('../visaMonitor');
const {explainDecision}=require('../visaExplain');const {mountVisaRoutes}=require('../visaRoutes');const express=require('express');
const url='https://en.nia.gov.cn/n147418/n147463/index.html';
function html(body){return '<html><title>Official visa notices</title><body>'+body+' '.repeat(400)+'</body></html>';}
test('discovers a new official announcement URL instead of only rechecking old pages',async()=>{
 const s=new VisaStore(':memory:');s.db.prepare('DELETE FROM visa_monitors').run();s.db.prepare('INSERT INTO visa_monitors(url,kind,authority) VALUES(?,?,?)').run(url,'feed','NIA');
 const content=html('<a href="/n147418/n147468/c999999/content.html">Canadian and British visa exemption extended</a> Official visa information for all ordinary passport travelers.');
 const fetcher=async()=>new Response(content,{headers:{'content-type':'text/html'}});
 const m=new VisaMonitor(s,{fetcher});try{const result=await m.check();assert.equal(result[0].ok,true);assert.equal(s.overview().notices.length,1);assert.equal(s.overview().monitors.length,2);await m.check();assert.equal(s.overview().notices.length,1);}finally{s.close();}
});
test('ignores offsite, javascript and announcement-index links',()=>{
 const links=noticeLinks(html('<a href="https://evil.example/visa.html">Visa exemption changed</a><a href="javascript:alert(1)">Visa changed urgently</a><a href="index.html">Visa policy list</a>'),url);assert.equal(links.length,0);
});
test('redirects must remain on official HTTPS hosts',async()=>{
 await assert.rejects(fetchOfficial(url,async()=>new Response('',{status:302,headers:{location:'https://evil.example/visa.html'}})),/Redirect outside/);
 await assert.rejects(fetchOfficial('http://en.nia.gov.cn/'),/official/);
});
test('maintenance and missing policy pages cannot refresh successful check time',async()=>{
 const s=new VisaStore(':memory:');s.db.prepare('DELETE FROM visa_monitors').run();s.db.prepare('INSERT INTO visa_monitors(url,kind,authority,last_success_at) VALUES(?,?,?,?)').run(url,'policy','NIA','2026-10-10T12:00:00Z');
 const m=new VisaMonitor(s,{fetcher:async()=>new Response(html('<title>系统维护</title>'))});try{const results=await m.check();assert.equal(results[0].ok,false);assert.equal(s.overview().monitors[0].last_success_at,'2026-10-10T12:00:00Z');}finally{s.close();}
});
test('immutable source versions survive content change and failures',async()=>{
 const s=new VisaStore(':memory:');const mon=s.overview().monitors[0];try{
 const a=s.snapshot(mon,'Official visa rule version one','2026-10-12T10:00:00Z');const b=s.snapshot(mon,'Official visa rule version two','2026-10-12T11:00:00Z');assert.notEqual(a.id,b.id);assert.equal(b.changed,true);assert.equal(s.db.prepare('SELECT content FROM visa_sources WHERE id=?').get(a.id).content,'Official visa rule version one');
 }finally{s.close();}
});
test('AI never gets passenger data and cannot override engine status',async()=>{
 let payload;const r=await explainDecision({status:'review',reason:'Missing facts',reasonCodes:['REVIEW'],missingFields:['purpose'],rules:[],sources:[],passportNo:'SECRET',ckinLines:['PRIVATE']},{key:'test',model:'test',fetcher:async(_,opts)=>{payload=JSON.parse(opts.body);return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'需要人工核对'}]}]}));}});
 assert.equal(r.status,'review');assert.doesNotMatch(payload.input,/SECRET|PRIVATE/);assert.equal(payload.store,false);
});
test('AI failure leaves deterministic explanation available',async()=>{
 const r=await explainDecision({status:'pass',reason:'240 TWOV 已人工核对',missingFields:[],sources:[]},{key:'test',model:'test',fetcher:async()=>{throw Error('offline');}});assert.equal(r.status,'pass');assert.equal(r.provider,'template');
});
test('admin mutation endpoints require token and evaluation retains manual 240',async()=>{
 const s=new VisaStore(':memory:');const app=express();app.use(express.json());mountVisaRoutes(app,s,{check:async()=>[]},{token:'test-secret'});
 const server=await new Promise(resolve=>{const srv=app.listen(0,'127.0.0.1',()=>resolve(srv));});const base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/visa-api/check',{method:'POST'})).status,403);
 const resp=await fetch(base+'/visa-api/evaluate',{method:'POST',headers:{authorization:'Bearer test-secret','content-type':'application/json'},body:JSON.stringify({nationality:'USA',destinationCountry:'CHN',travelDate:'2026-10-12',ckinLines:['CKIN 240']})});assert.equal(resp.status,200);const d=await resp.json();assert.equal(d.status,'pass');assert.equal(s.db.prepare('SELECT COUNT(*) n FROM visa_decisions').get().n,1);
 }finally{await new Promise(r=>server.close(r));s.close();}
});
