const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../has/public/schedule-live.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({offline=false}={}){
 const intervals=new Set(),timeouts=[],controllers=[],calls=[];let token='initial',updates=0,fail=offline;
 const context={window:{MU_API_BASE:'http://local',workspaceHeaders:()=>({'X-Workspace-Account':'LAX / MU'})},document:{hidden:false},firebase:{auth:()=>({currentUser:{getIdToken:async()=>'token'}})},AbortController,TextDecoder,
  setInterval:fn=>{intervals.add(fn);return fn;},clearInterval:id=>intervals.delete(id),setTimeout:(fn,ms)=>{const timer={fn,ms};timeouts.push(timer);return timer;},clearTimeout:timer=>{const i=timeouts.indexOf(timer);if(i>=0)timeouts.splice(i,1);},
  fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith('/revision'))return {ok:true,json:async()=>({revision:token})};if(fail)throw Error('offline');const body=new ReadableStream({start(controller){controllers.push(controller);options.signal.addEventListener('abort',()=>{try{controller.error(Error('aborted'));}catch{}});}});return {ok:true,headers:new Headers({'Content-Type':'text/event-stream'}),body};}
 };vm.runInNewContext(source,context);
 const stop=context.window.watchSchedule({initialRevision:'initial',onRevision:()=>updates++});
 return {context,calls,stop,get updates(){return updates;},set token(value){token=value;},set offline(value){fail=value;},poll:async()=>{for(const fn of [...intervals])await fn();await settle();},send:async revision=>{controllers.at(-1).enqueue(new TextEncoder().encode(revision===null?': heartbeat\n\n':'event: revision\ndata: '+JSON.stringify({revision})+'\n\n'));await settle();},disconnect:async()=>{controllers.at(-1).close();await settle();},reconnect:async()=>{const timer=timeouts.find(t=>t.ms<45000);assert(timer);timeouts.splice(timeouts.indexOf(timer),1);timer.fn();await settle();}};
}
test('healthy stream ignores initial revision, repeated revisions and heartbeats, then settles after each change',async t=>{
 const f=fixture();t.after(f.stop);await settle();await f.send('initial');await f.send(null);assert.equal(f.updates,0);
 await f.send('changed');await f.send('changed');await f.send(null);assert.equal(f.updates,1);await f.poll();assert.equal(f.calls.length,1);
 await f.send('next');assert.equal(f.updates,2);await f.send('next');assert.equal(f.updates,2);
});
test('offline fallback checks only the revision and never requests the full schedule unchanged',async t=>{
 const f=fixture({offline:true});t.after(f.stop);await settle();await f.poll();await f.poll();assert.equal(f.updates,0);
 f.token='changed';await f.poll();await f.poll();assert.equal(f.updates,1);assert(f.calls.slice(1).every(c=>c.url.endsWith('/revision')));
 assert(f.calls.every(c=>c.options.headers['X-Workspace-Account']==='LAX / MU'));
 f.context.document.hidden=true;const count=f.calls.length;await f.poll();assert.equal(f.calls.length,count);
 f.stop();f.context.document.hidden=false;await f.stop.check();assert.equal(f.calls.length,count);
});
test('reconnect keeps its baseline and delivers changes missed while disconnected once',async t=>{
 const f=fixture();t.after(f.stop);await settle();await f.send('initial');await f.disconnect();await f.reconnect();await f.send('initial');assert.equal(f.updates,0);
 await f.disconnect();f.token='missed';await f.poll();assert.equal(f.updates,1);await f.reconnect();await f.send('missed');assert.equal(f.updates,1);await f.send('new');assert.equal(f.updates,2);
});
