const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createSearchCache}=require('../scripts/desktop-stability/search-cache.cjs');
const {fingerprint}=require('../scripts/desktop-stability/local-live.cjs');
test('unchanged local data parses once, isolates cached payloads, and invalidates on log, scope or completion changes',()=>{
 let count=0;const read=createSearchCache(()=>({sy:{gate:++count}}));
 const context={flightNo:'MU586',flightDate:'05NOV26'};
 const first=read('log','SY',context);first.sy.gate=999;
 assert.equal(read('log','SY',context).sy.gate,1);assert.equal(count,1);
 read('updated','SY',context);read('updated','SY',{...context,flightDate:'06NOV26'});read('updated','SY',{...context,completed:{steps:{CC:{complete:true}}}});assert.equal(count,4);
});
test('touching or rewriting identical logs does not trigger refresh; actual append and truncate do',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mufc-live-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,'flight.log'),cache=new Map(),walk=async()=>[file],settings={logFolder:root};
 await fs.writeFile(file,'original');const initial=await fingerprint(settings,'SY',cache,walk);
 await fs.utimes(file,new Date(),new Date(Date.now()+5000));assert.equal(await fingerprint(settings,'SY',cache,walk),initial);
 await fs.writeFile(file,'original');assert.equal(await fingerprint(settings,'SY',cache,walk),initial);
 await fs.appendFile(file,' new record');const changed=await fingerprint(settings,'SY',cache,walk);assert.notEqual(changed,initial);
 await fs.writeFile(file,'');assert.notEqual(await fingerprint(settings,'SY',cache,walk),changed);
});
