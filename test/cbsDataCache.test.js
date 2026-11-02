const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/public/cbs-data.js'),'utf8');
function fixture(){
 let revision='1',offline=false,modules=null;const calls=[],events=[],memory=new Map(),handlers={};
 const window={fetch:async(input)=>{const url=String(input);calls.push(url);if(offline)throw Error('offline');return new Response(JSON.stringify(url.includes('/cbs-revision')?{revision,...(modules?{modules}:{})}:{rows:[{id:revision}]}));},addEventListener:(name,fn)=>handlers[name]=fn,dispatchEvent:event=>events.push(event.type)};
 const context=vm.createContext({window,document:{hidden:false,addEventListener(){}},sessionStorage:{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)},location:{href:'https://site.test/cbs.html'},URL,Response,Event,Date,Map,Set,setInterval:(_fn,ms)=>assert.equal(ms,60000)});
 vm.runInContext(source,context);return {window,calls,events,handlers,revision:value=>revision=value,offline:()=>offline=true,modules:value=>modules=value};
}
test('unchanged revision avoids full list requests and changed revision invalidates cached data',async()=>{const f=fixture();await f.window.cbsDataCache.check();let res=await f.window.fetch('https://api.mufcapp.net/cbs-cases');assert.equal((await res.json()).rows[0].id,'1');await f.window.fetch('https://api.mufcapp.net/cbs-cases');await f.window.cbsDataCache.check();assert.equal(f.calls.filter(c=>c.endsWith('/cbs-cases')).length,1);assert(!f.events.includes('cbs-data-changed'));f.revision('2');await f.window.cbsDataCache.check();assert(f.events.includes('cbs-data-changed'));res=await f.window.fetch('https://api.mufcapp.net/cbs-cases');assert.equal((await res.json()).rows[0].id,'2');});
test('offline mode keeps cached rows and announces their stale status',async()=>{const f=fixture();await f.window.cbsDataCache.check();await f.window.fetch('https://api.mufcapp.net/cbs-cases');f.offline();await f.window.cbsDataCache.check();assert(f.events.includes('cbs-data-offline'));assert.equal((await(await f.window.fetch('https://api.mufcapp.net/cbs-cases')).json()).rows[0].id,'1');});
test('concurrent list requests coalesce and retain separately readable response bodies',async()=>{const f=fixture();const responses=await Promise.all([f.window.fetch('https://api.mufcapp.net/cbs-cases'),f.window.fetch('https://api.mufcapp.net/cbs-cases')]);assert.equal(f.calls.length,1);for(const response of responses)assert.equal((await response.json()).rows[0].id,'1');});

test('editing Open leaves Closed and Rush caches intact and query variants stay isolated',async()=>{
 const f=fixture();f.modules({'passenger:open':'p1','passenger:closed':'c1',rush:'r1'});await f.window.cbsDataCache.check();
 for(const path of ['/cbs-cases?view=open','/cbs-cases?view=closed&month=2026-10','/cbs-worldtracer-cases'])await f.window.fetch('https://api.mufcapp.net'+path);
 f.revision('2');f.modules({'passenger:open':'p2','passenger:closed':'c1',rush:'r1'});await f.window.cbsDataCache.check();
 assert(!f.window.cbsDataCache.has('/cbs-cases?view=open'));assert(f.window.cbsDataCache.has('/cbs-cases?month=2026-10&view=closed'));assert(f.window.cbsDataCache.has('/cbs-worldtracer-cases'));
 const before=f.calls.length;await f.window.fetch('https://api.mufcapp.net/cbs-cases?month=2026-10&view=closed');await f.window.fetch('https://api.mufcapp.net/cbs-worldtracer-cases');assert.equal(f.calls.length,before);
});
