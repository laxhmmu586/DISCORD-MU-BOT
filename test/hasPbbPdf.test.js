const test=require('node:test'),assert=require('node:assert/strict');
const {PDFDocument}=require('../vendor/pdf-lib/pdf-lib');
const {buildHasPbbPdf,templateChecks}=require('../hasPbbPdf');
const items=require('../public/public/has-pbb-data');
function record(type='arrival',account='MU'){
 const answers={driver:{},spotter:{}};for(const q of items.filter(q=>q.type===type))answers[q.role][q.id]=true;
 return {id:'fictional-template-check',station:'LAX',account,type,date:'2099-01-01',flightNo:'ZZ000',gate:'999',bridge:'L2',answers,gateConfirmedAt:'2099-01-01T10:00:00Z',ready:{driver:true,spotter:true},movingAt:'2099-01-01T10:01:00Z',dockedAt:'2099-01-01T10:03:00Z',signatures:{driver:{name:'EXAMPLE DRIVER',strokes:[[[.1,.1],[.4,.6],[.8,.2]]]},spotter:{name:'EXAMPLE SPOTTER',typedSignature:'SAMPLE ONLY',strokes:[]}}};
}
test('Arrival template maps existing gate/readiness/checks, preserves the duplicate SAFE line and leaves rollers unconfirmed',()=>{
 const r=record(),checks=templateChecks(r);assert.equal(checks.length,21);assert.deepEqual(checks.map((yes,i)=>yes?null:i).filter(i=>i!==null),[3,7]);assert.equal(checks[12],checks[13]);
 delete r.gateConfirmedAt;r.ready.driver=false;r.ready.spotter=false;const empty=templateChecks(r);assert.equal(empty[0],false);assert.equal(empty[6],false);assert.equal(empty[8],false);
 r.ready.driver=true;assert.equal(templateChecks(r)[6],true);assert.equal(templateChecks(r)[8],false);r.answers.driver.serviceable=false;assert.equal(templateChecks(r)[1],false);
});
test('EK-only check is determined by the record account, never flight prefix or station',()=>{
 for(const type of ['arrival','departure'])for(const account of ['EK','ek','MU','CI','LAX']){const r=record(type,account);r.flightNo='EK999';assert.equal(templateChecks(r)[type==='arrival'?7:3],account.toUpperCase()==='EK');}
});
test('Departure preserves the existing workflow and leaves unverified/partially covered statements blank',()=>{
 const r=record('departure');assert.deepEqual(templateChecks(r),[true,true,true,false,true,false,true,false,true,true,true,false]);
 r.answers.driver.d2=false;r.answers.driver.d11=false;r.answers.driver.d3=false;r.answers.driver.d4=false;delete r.dockedAt;delete r.movingAt;assert(templateChecks(r).every(value=>value===false));
});
test('both supplied letter-size templates generate with supplied logo and auditable attachments; signatures are required',async()=>{
 for(const type of ['arrival','departure']){const bytes=await buildHasPbbPdf(record(type)),doc=await PDFDocument.load(bytes);assert.equal(doc.getPageCount(),1);assert.deepEqual(doc.getPages()[0].getSize(),{width:612,height:792});assert.match(doc.getTitle(),/HAS PBB LAX MU/);const r=record(type);delete r.signatures.spotter;await assert.rejects(buildHasPbbPdf(r),/Both signatures required/);}
});
