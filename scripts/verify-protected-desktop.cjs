// SOURCE_DIRECTORY; network-free integration of the actual packaged server and device signer.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
(async()=>{
 const source=path.resolve(process.argv[2]),dir=fs.mkdtempSync(path.join(os.tmpdir(),'mufc-protected-')),nativeFetch=global.fetch;
 let publicKey,upstreamCalls=0;const upstreamPaths=[];
 const mockFetch=async(resource,options={})=>{
  const url=new URL(resource);
  if(url.hostname==='identitytoolkit.googleapis.com')return Response.json({users:[{localId:'fixture'}]});
  if(url.origin==='https://api.mufcapp.net'){
   upstreamCalls++;upstreamPaths.push(url.pathname);const h=new Headers(options.headers),signed=require('../desktopProtection').message({method:options.method||'GET',url:url.pathname+url.search,time:h.get('X-MUFC-Time'),nonce:h.get('X-MUFC-Nonce'),authorization:h.get('Authorization'),body:options.body});
   assert(crypto.verify(null,Buffer.from(signed),publicKey,Buffer.from(h.get('X-MUFC-Signature'),'base64url')),'native request signed');
   if(/\.(?:css|js|woff2?|ttf|webp|png|svg)$/.test(url.pathname))return Response.json({error:'not bundled'}, {status:404});
   return Response.json(url.pathname==='/desktop-access'?{approved:true}:{fixture:true});
  }
  return nativeFetch(resource,options);
 };
 global.fetch=await require('./desktop-protection/device-client.cjs').createDeviceClient(dir,{isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:b=>b.toString()},mockFetch);
 publicKey=JSON.parse(fs.readFileSync(path.join(dir,'desktop-device-enrollment.json'))).publicKey;
 const fixture=path.join(dir,'19OCT26');fs.mkdirSync(fixture);fs.copyFileSync(path.join(__dirname,'../test/fixtures/boarding-box-bnd-ranges.log'),path.join(fixture,'flight.log'));
 const {server,origin}=await require(path.join(source,'src/server.js')).startServer({logFolder:dir,historyFolder:dir},'fixture-secret',0);
 const request=(p,options={})=>nativeFetch(origin+p,{redirect:'manual',...options,headers:{'X-MUFC-Session':'fixture-secret',...options.headers}});
 try{
  for(const p of ['/index.html','/report.html','/cbs.html','/has-pbb.html','/%69ndex.html','/INDEX.HTML','/index.html.'])assert.equal((await request(p)).status,302,'login first: '+p);
  assert.equal((await nativeFetch(origin+'/index.html',{redirect:'manual'})).status,403,'ordinary browser rejected');
  assert.equal((await request('/desktop-auth',{method:'POST'})).status,401);
  const token='fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
  const signedIn=await request('/desktop-auth',{method:'POST',headers:{Authorization:'Bearer '+token}});assert.equal(signedIn.status,200,await signedIn.clone().text());
  const checked=new Set();
  for(const p of ['/index.html','/report.html','/cbs.html','/has-pbb.html','/has-pbb-dashboard.html']){
   const r=await request(p);assert.equal(r.status,200,p);const html=await r.text();assert.match(html,/<html/);
   for(const match of html.matchAll(/(?:src|href)="(\/[^"?#]+\.(?:js|css))(?:[^\"]*)?"/g)){
    if(checked.has(match[1]))continue;checked.add(match[1]);const dep=await request(match[1]);assert.equal(dep.status,200,'bundled dependency: '+match[1]);
   }
  }
  assert.equal((await request('/cbs-cases')).status,200,'signed LBS proxy');
  if(fs.existsSync(path.join(source,'src/updates/local-checks.cjs'))){const result=await request('/search?q=SY%20MU586%2F19OCT26&flightNo=MU586&flightDate=19OCT26');assert.equal(result.status,200,await result.clone().text());const data=await result.json();assert.equal(data.sy.localChecks,true);assert.equal(data.sy.bagSheet.source,'SY/BND');assert(!upstreamPaths.includes('/search'));assert(!upstreamPaths.includes('/flight-email-checks'));}
  await request('/desktop-auth',{method:'DELETE'});assert.equal((await request('/index.html')).status,302,'signout clears access');
  console.log(JSON.stringify({pages:5,bundledDependencies:checked.size,upstreamCalls,deviceSignatureVerified:true,loginAndSignoutVerified:true}));
 }finally{await new Promise(r=>server.close(r));global.fetch=nativeFetch;fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
