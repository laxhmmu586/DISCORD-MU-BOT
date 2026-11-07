const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const express=require('express');
const {createApiGuard,captureBody,staticGuard,message,privateApi,privatePage}=require('../desktopProtection');
const {withoutEid}=require('../employeeDataProtection');
test('private pages blocked before every static mount; Info removed',async t=>{
 const app=express();app.use(staticGuard);app.use((_q,r)=>r.send('public'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 for(const route of ['/index.html','/public/index.html','/public/public/index.html','/has/index.html','/index','/report.html','/cbs.html','/has-pbb.html'])assert.equal((await fetch(base+route)).status,403,route);
 for(const route of ['/info','/info.html','/has/info.html','/info/'])assert.equal((await fetch(base+route)).status,410,route);
 assert.equal((await fetch(base+'/flights.html')).status,200);
});
test('device proof, employee login, request binding, replay and revocation',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mufc-device-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'devices.json'),pair=crypto.generateKeyPairSync('ed25519');
 const devices={approved:{publicKey:pair.publicKey.export({type:'spki',format:'pem'})}};fs.writeFileSync(file,JSON.stringify(devices));
 const app=express();app.use(express.json({verify:captureBody}));app.use(createApiGuard({devicesFile:file,authenticate:async req=>{if(req.get('Authorization')!=='Bearer employee')throw Error('login');return {uid:'employee',email:'employee@mu.com'};}}));app.use((_q,r)=>r.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const sign=(url='/search?q=SY',body='',method='GET',authorization='Bearer employee',time=String(Date.now()))=>{
  const nonce=crypto.randomBytes(24).toString('base64url');return {'Content-Type':'application/json',Authorization:authorization,'X-MUFC-Device':'approved','X-MUFC-Time':time,'X-MUFC-Nonce':nonce,'X-MUFC-Signature':crypto.sign(null,Buffer.from(message({method,url,time,nonce,authorization,body})),pair.privateKey).toString('base64url')};
 };
 for(const p of ['/search?q=SY','/cbs-cases','/psm-report','/sales-report/download','/has-pbb-api/context','/desktop-access','/dashboard-snapshot']){
  assert.equal((await fetch(base+p,{headers:{Authorization:'Bearer employee',Origin:'https://www.mufcapp.net','User-Agent':'MUFC Desktop'}})).status,403,p);
 }
 const headers=sign();assert.equal((await fetch(base+'/search?q=SY',{headers})).status,200);assert.equal((await fetch(base+'/search?q=SY',{headers})).status,403,'replay');
 assert.equal((await fetch(base+'/search?q=PD',{headers:sign()})).status,403,'path binding');
 assert.equal((await fetch(base+'/search?q=SY',{headers:{...sign(),Authorization:'Bearer stolen'}})).status,403,'token binding');
 assert.equal((await fetch(base+'/search?q=SY',{headers:sign('/search?q=SY','','GET','')})).status,403,'login needed even with device signature');
 assert.equal((await fetch(base+'/search?q=SY',{headers:sign('/search?q=SY','','GET','Bearer employee',String(Date.now()-120000))})).status,403,'expired');
 const url='/psm-report/remark',body='{"a":1}';assert.equal((await fetch(base+url,{method:'POST',body,headers:sign(url,body,'POST')})).status,200);
 assert.equal((await fetch(base+url,{method:'POST',body:'{"a":2}',headers:sign(url,body,'POST')})).status,403,'body binding');
 devices.approved.revoked=true;fs.writeFileSync(file,JSON.stringify(devices));assert.equal((await fetch(base+'/search?q=SY',{headers:sign()})).status,403,'revoked without restart');
 assert.equal((await fetch(base+'/staff-schedule-api')).status,200,'web workflow retained');
});
test('employee information omits EID recursively',()=>{
 assert.deepEqual(withoutEid({employees:[{id:'a',eid:'123',name:'A'}],profile:{eid:'321',name:'B'}}),{employees:[{id:'a',name:'A'}],profile:{name:'B'}});
});
test('hosting excludes original page code and all desktop aliases',()=>{
 const {hosting}=require('../public/firebase.json');
 for(const name of ['index.html','report.html','report.js','cbs.html','has-pbb.html','info.html'])assert(hosting.ignore.includes('**/'+name));
 for(const source of ['/index.html','/has/index.html','/report.html','/cbs.html','/has-pbb.html','/info'])assert(hosting.rewrites.some(r=>r.source===source&&['/desktop-only.html','/removed.html'].includes(r.destination)));
 assert(privateApi('/cbs-cases'));assert(!privateApi('/cbs-scan'));assert(!privatePage('/has-report'));
});
