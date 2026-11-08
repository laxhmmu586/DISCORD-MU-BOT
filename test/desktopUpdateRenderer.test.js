'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom');
function setup(route='/flights.html',fetcher=async()=>({ok:true})) {
 const {window,document}=parseHTML('<html><body><input id="work"><dialog></dialog></body></html>');
 let at=1000,callback;const results=[],values=new Map();
 const context={window,document,location:{pathname:route,search:'?choose=1',hash:'#flight'},sessionStorage:{setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k),removeItem:k=>values.delete(k)},scrollX:10,scrollY:20,scrollTo:()=>{},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,CustomEvent:window.CustomEvent,Date:class extends Date {static now(){return at;}}};
 window.fetch=fetcher;window.mufcDesktop={onUpdatePrepare:fn=>{callback=fn;},updatePrepare:async value=>results.push(value),updateHealthy:async()=>{}};
 window.top=window;
 vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/desktop-updates/renderer.js'),'utf8'),context);
 return {window,document,values,results,advance:()=>{at+=31000;},prepare:reason=>callback({token:'one-use-test',reason})};
}
test('Flight Control and forms defer even when idle',async()=>{for(const route of ['/index.html','/cbs-form.html','/has-pbb.html','/scan.html']){const s=setup(route);s.advance();await s.prepare();assert.equal(s.results[0].safe,false);assert.equal(s.values.size,0);}});
test('safe flight selector stores only navigation and authorizes refresh',async()=>{const s=setup();s.advance();await s.prepare();assert.equal(s.results[0].safe,true);const saved=JSON.parse([...s.values.values()][0]);assert.deepEqual(Object.keys(saved),['url','x','y']);assert.equal(saved.url,'/flights.html?choose=1#flight');});
test('dirty input, open modal, operation lock and recent interaction delay activation',async()=>{
 for(const condition of ['dirty','modal','lock','activity']){const s=setup();s.advance();if(condition==='dirty'){const input=s.document.querySelector('input');input.value='must not serialize';input.dispatchEvent(new s.window.Event('input',{bubbles:true}));}if(condition==='modal')s.document.querySelector('dialog').setAttribute('open','');if(condition==='lock')s.window.mufcUpdateLock('scan');if(condition==='activity')s.document.dispatchEvent(new s.window.Event('keydown'));await s.prepare();assert.equal(s.results[0].safe,false,condition);assert.equal(s.values.size,0);}
});
test('pending business requests prevent safe activation',async()=>{let resolve;const s=setup('/flights.html',()=>new Promise(r=>{resolve=r;}));s.advance();const request=s.window.fetch('/business-save');await s.prepare();assert.equal(s.results[0].safe,false);resolve({ok:true});await request;await s.prepare();assert.equal(s.results[1].safe,true);});

test('Install now works immediately from signed-out Settings without an idle wait',async()=>{
 const s=setup('/login.html');const settings=s.document.querySelector('dialog');settings.className='mufc-settings';settings.setAttribute('open','');
 await s.prepare('core-install');assert.equal(s.results[0].safe,true);assert.equal(s.document.body.inert,false);
});
test('Install now still protects dirty fields and business pages',async()=>{
 const s=setup('/login.html');s.document.querySelector('input').dispatchEvent(new s.window.Event('input',{bubbles:true}));await s.prepare('core-install');assert.equal(s.results[0].safe,false);
 const work=setup('/index.html');await work.prepare('core-install');assert.equal(work.results[0].safe,false);
});
test('native installation errors never leave the page inert',async()=>{
 const s=setup('/login.html');s.window.mufcDesktop.updatePrepare=async()=>{throw Error('native failure');};await assert.rejects(s.prepare('core-install'));assert.equal(s.document.body.inert,false);
});
