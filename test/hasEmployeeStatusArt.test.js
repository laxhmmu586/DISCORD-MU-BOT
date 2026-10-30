const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../has/public/has-completion.js'),'utf8');
function load(storage=new Map(),blocked=false){
 const scope={sessionStorage:{getItem:key=>{if(blocked)throw Error('Blocked');return storage.get(key)??null;},setItem:(key,value)=>{if(blocked)throw Error('Blocked');storage.set(key,value);}}};
 scope.window=scope;vm.runInNewContext(source,scope);return scope;
}
test('employee selection stays stable during live updates and rotates on a new visit/reload',()=>{
 const storage=new Map(),app=load(storage);
 for(const status of ['waiting','ready','signed','complete']){
  const first=app.hasEmployeeStatusArt(status,'run-1');
  for(let i=0;i<8;i++)assert.equal(app.hasEmployeeStatusArt(status,'run-1'),first);
  app.resetHasEmployeeStatusArt();const next=app.hasEmployeeStatusArt(status,'run-1');assert.notEqual(next,first);
  const reloaded=load(storage);assert.notEqual(reloaded.hasEmployeeStatusArt(status,'run-1'),next);
 }
});
test('blocked session storage still permits rotation, and unknown states cannot select arbitrary assets',()=>{
 const app=load(new Map(),true),first=app.hasEmployeeStatusArt('waiting','one');
 assert.notEqual(app.hasEmployeeStatusArt('waiting','two'),first);
 assert.equal(app.hasEmployeeStatusArt('../../anything','one'),'');
});
test('completed view retains escaped identity, PDF, retry and new checklist actions',()=>{
 const app=load(),r={id:'test',flightNo:'MU586',date:'2026-10-22',gate:'156',bridge:'L3',signatures:{driver:{name:'<driver>',eid:'00123'},spotter:{name:'Fixture Spotter',eid:'04567'}},delivery:{status:'failed',error:'<retry>'}};
 const html=app.hasChecklistComplete(r);
 assert.match(html,/has-employee-art/);assert.match(html,/&lt;driver&gt;/);assert.match(html,/EID 00123/);assert.match(html,/id="download-pdf"/);assert.match(html,/id="retry"/);assert.match(html,/id="back"/);assert.doesNotMatch(html,/has-final-check/);
 r.delivery={status:'sent'};const sent=app.hasChecklistComplete(r);assert.doesNotMatch(sent,/id="retry"/);assert.match(sent,/✓ Sent/);
});
