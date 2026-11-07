'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Updater,digest,treeHash,safeFile,sourceURL}=require('../scripts/desktop-updates/updater.cjs');
const {publish}=require('../scripts/desktop-updates/publish.cjs');
async function setup(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mufc-update-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const base=path.join(dir,'base');await fs.mkdir(path.join(base,'assets'),{recursive:true});await fs.writeFile(path.join(base,'index.html'),'old');await fs.writeFile(path.join(base,'assets','a.js'),'old script');await fs.writeFile(path.join(base,'desktop-update.js'),'immutable coordinator');
 const pair=crypto.generateKeyPairSync('ed25519'),pem=pair.privateKey.export({type:'pkcs8',format:'pem'}),key=path.join(dir,'private.pem');await fs.writeFile(key,pem);
 const patches=path.join(dir,'patches');await fs.mkdir(patches);await fs.writeFile(path.join(patches,'index.html'),'new');
 const plan={channel:'stable',coreVersion:'2.1.5',bundledRoot:base,keyId:'test',sequence:1,hotfix:{id:'h1',root:patches,files:['index.html']}};
 const feed=path.join(dir,'feed');await publish(plan,key,feed);
 const requests=[];
 const fetch=async(url,opts)=>{requests.push(url);assert.equal(opts.redirect,'error');if(url.startsWith('http://192.168.1.2/'))throw Error('LAN offline');try{return new Response(await fs.readFile(path.join(feed,new URL(url).pathname.replace('/updates/',''))));}catch{return new Response('',{status:404});}};
 const config={channel:'stable',keys:{test:pair.publicKey.export({type:'spki',format:'pem'})},sources:['http://192.168.1.2/updates/','https://oracle.example/updates/']};
 const args={directory:path.join(dir,'user','updates'),bundledRoot:base,coreVersion:'2.1.5',config,fetch};
 return {dir,base,pair,key,plan,feed,args,requests,updater:await new Updater(args).init()};
}
test('signed hotfix stages, falls back from LAN, activates atomically and leaves business files alone',async t=>{
 const s=await setup(t);const business=path.join(s.dir,'user','boarding.db');await fs.writeFile(business,'business-data');
 await s.updater.check();assert.equal(s.updater.ready,'h1');assert.equal(await fs.readFile(path.join(s.updater.root(),'index.html'),'utf8'),'old');assert(s.requests[0].startsWith('http://192.168.1.2/'));
 await s.updater.activate();assert.equal(s.updater.state.pending,true);assert.equal(await fs.readFile(path.join(s.updater.root(),'index.html'),'utf8'),'new');await s.updater.healthy();
 const reopened=await new Updater(s.args).init();assert.equal(reopened.state.active,'h1');assert.equal(await fs.readFile(business,'utf8'),'business-data');
});
test('crash before health acknowledgement automatically returns to bundled UI',async t=>{const s=await setup(t);await s.updater.check();await s.updater.activate();const reopened=await new Updater(s.args).init();assert.equal(reopened.state.active,null);assert(reopened.state.blocked.includes('h1'));});
test('unsigned receipt cannot authorize a modified executable UI tree',async t=>{const s=await setup(t);await s.updater.check();await s.updater.activate();await s.updater.healthy();const root=s.updater.root();await fs.writeFile(path.join(root,'assets/a.js'),'tampered');const receiptFile=path.join(path.dirname(root),'receipt.json'),receipt=JSON.parse(await fs.readFile(receiptFile));receipt.tree=await treeHash(root);await fs.writeFile(receiptFile,JSON.stringify(receipt));const reopened=await new Updater(s.args).init();assert.equal(reopened.state.active,null);});
test('rejects tampered signature, unknown key and wrong channel/core/base',async t=>{
 const s=await setup(t),envelope=JSON.parse(await fs.readFile(path.join(s.feed,'manifest.json')));
 assert.throws(()=>s.updater.verifyEnvelope({...envelope,signature:Buffer.alloc(64).toString('base64')}),/signature/);
 assert.throws(()=>s.updater.verifyEnvelope({...envelope,keyId:'evil'}),/key/);
 for(const patch of [{channel:'evil'},{coreVersion:'0.0.0'},{baseline:'0'.repeat(64)},{expiresAt:1},{issuedAt:Date.now()+100000}]){
  const bytes=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(envelope.payload,'base64')),...patch}));assert.throws(()=>s.updater.verifyEnvelope({...envelope,payload:bytes.toString('base64'),signature:crypto.sign(null,bytes,s.pair.privateKey).toString('base64')}));
 }
});
test('checksum failure never alters active pointer',async t=>{const s=await setup(t);const files=await fs.readdir(path.join(s.feed,'files'));await fs.writeFile(path.join(s.feed,'files',files[0]),'bad');await s.updater.check();assert.equal(s.updater.ready,null);assert.equal(s.updater.state.active,null);});
test('publication pause, replay and emergency disable cannot activate staged code',async t=>{
 const s=await setup(t);await s.updater.check();assert(s.updater.ready);
 await publish({...s.plan,sequence:2,paused:true},s.key,s.feed);await s.updater.check();assert.equal(s.updater.ready,null);
 await publish(s.plan,s.key,s.feed);await s.updater.check();assert.match(s.updater.status.message,/Replayed/);
 await publish({...s.plan,sequence:3},s.key,s.feed);await s.updater.check();await s.updater.activate();await s.updater.healthy();
 await publish({...s.plan,sequence:4,disabled:true},s.key,s.feed);await s.updater.check();assert.equal(s.updater.rollbackRequested,true);await s.updater.rollback('disabled');assert.equal(s.updater.state.active,null);
});
test('local emergency disable blocks checks and activation',async t=>{const s=await setup(t);await s.updater.check();await fs.writeFile(path.join(s.args.directory,'disable-updates.json'),'true');await assert.rejects(s.updater.activate(),/disabled locally/);await s.updater.check();assert.equal(s.updater.ready,null);});
test('rejects traversal, Windows aliases, native modules and Core-owned assets',()=>{for(const name of ['../x.js','a/../x.js','a\\x.js','C:/x.js','a//x.js','a/node.node','src/main.js.exe','a/CON.js','a/com1.js','desktop-update.js','flight-session.js','assets/firebase/x.js','a:stream.js','a./x.js'])assert.throws(()=>safeFile(name),name);for(const name of ['index.html','assets/x.js','checklists/pbb.json'])assert.equal(safeFile(name),name);});
test('only configured private IPv4 HTTP mirrors or HTTPS are allowed',()=>{for(const url of ['http://oracle.example/','file:///tmp/','http://127.0.0.1/','https://a:b@oracle.example/','https://oracle.example/?x'])assert.throws(()=>sourceURL(url));assert.equal(sourceURL('https://oracle.example/updates').protocol,'https:');});
test('Core is downloaded and hash verified without executing it',async t=>{const s=await setup(t),installer=path.join(s.dir,'MUFC-Setup-2.1.6.exe');await fs.writeFile(installer,'test-not-executable');await publish({...s.plan,sequence:2,core:{path:installer,id:'core-216',version:'2.1.6'}},s.key,s.feed);await s.updater.check();assert.equal(digest(await fs.readFile(s.updater.coreReady.file)),s.updater.coreReady.release.sha256);});
test('same-sequence equivocation and immutable release-ID reuse fail closed',async t=>{
 const s=await setup(t);await s.updater.check();await publish({...s.plan,paused:true},s.key,s.feed);await s.updater.check();assert.match(s.updater.status.message,/Conflicting/);
 await fs.writeFile(path.join(s.plan.hotfix.root,'index.html'),'different bytes');await publish({...s.plan,sequence:2},s.key,s.feed);await s.updater.check();assert.equal(s.updater.ready,null);assert.equal(s.updater.state.active,null);
});
test('new manifest without a hotfix cancels an older staged hotfix',async t=>{const s=await setup(t);await s.updater.check();await publish({...s.plan,sequence:2,hotfix:null},s.key,s.feed);await s.updater.check();assert.equal(s.updater.ready,null);});
test('failed durable activation cannot mark an untested UI active or healthy',async t=>{const s=await setup(t);await s.updater.check();const save=s.updater.persist.bind(s.updater);s.updater.persist=async()=>{throw Error('disk full');};await assert.rejects(s.updater.activate(),/disk full/);assert.equal(s.updater.state.active,null);assert.equal(s.updater.state.pending,undefined);assert.equal(s.updater.ready,'h1');s.updater.persist=save;await s.updater.activate();s.updater.persist=async()=>{throw Error('disk full');};await assert.rejects(s.updater.healthy(),/disk full/);assert.equal(s.updater.state.pending,true);});
