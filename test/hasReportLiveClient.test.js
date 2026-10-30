const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const flush=()=>new Promise(r=>setImmediate(r));
test('SSE client parses split frames, polls only after disconnect, reconnects and disposes cleanly',async()=>{
 const timers=new Set(),intervals=new Set(),events=[],errors=[];let online=false,attempts=0,updates=0,stream;
 const window={hasReportRequest:async()=>{updates++;return {revision:1};},hasReportStream:async(_path,signal)=>{attempts++;if(!online)throw Error('network down');return {headers:{get:()=> 'text/event-stream'},body:new ReadableStream({start(controller){stream=controller;signal.addEventListener('abort',()=>controller.error(Object.assign(Error('aborted'),{name:'AbortError'})),{once:true});}})};}};
 vm.runInNewContext(fs.readFileSync('has/public/has-report-live.js','utf8'),{window,AbortController,TextDecoder,setTimeout:(fn,ms)=>{const item={fn,ms};timers.add(item);return item;},clearTimeout:t=>timers.delete(t),setInterval:(fn,ms)=>{const item={fn,ms};intervals.add(item);return item;},clearInterval:t=>intervals.delete(t)});
 const stop=window.watchHasReport({path:'/da/2026-10',onRevision:e=>events.push(e),onError:e=>errors.push(e.message)});await flush();assert.equal(updates,1);assert.equal(intervals.size,1);assert.equal(attempts,1);
 online=true;const retry=[...timers].find(t=>t.ms===1000);timers.delete(retry);retry.fn();await flush();assert.equal(intervals.size,0,'healthy SSE stops polling');
 stream.enqueue(new TextEncoder().encode('event: revi'));stream.enqueue(new TextEncoder().encode('sion\ndata: {"revision":2}\n\n'));await flush();assert.equal(events.at(-1).revision,2);
 stream.close();await flush();assert.equal(intervals.size,1);assert.equal(updates,2);assert(errors.includes('Live connection ended.'));
 stop();await flush();assert.equal(intervals.size,0);assert.equal(timers.size,0);
});
