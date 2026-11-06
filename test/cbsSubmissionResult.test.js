'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../public/public/pir-form.html'), 'utf8').replace(/\r\n/g, '\n');
const parser = html.slice(html.indexOf('    async function parseJson('), html.indexOf('    function syncEvidenceSlots('));
const resultCode = html.slice(html.indexOf('      try {\n      payload.damagedBags='), html.indexOf("\n    });\n    form.addEventListener('reset'"));
const saved = {created:true, record:{rowNumber:53}};
async function submit({status=201, body=saved, raw, networkError, language='en', attachmentError}={}) {
  const classes = new Set();
  const card = {hidden:false}, title = {hidden:false}, button = {disabled:true}, delivery = {};
  const context = vm.createContext({
    document:{documentElement:{lang:language}, querySelector:s=>s==='.page-title'?title:delivery},
    payload:{}, typeSelect:{value:'AHL'}, damageDirtyViews:[], collectDamageEntries:()=>[], apiBase:'',
    collectRequiredAttachments:async()=>{if(attachmentError)throw Error(attachmentError);return [];},
    fetch:async()=>{if(networkError)throw Error(networkError);return {ok:status>=200&&status<300,status,text:async()=>raw===undefined?JSON.stringify(body):raw};},
    formStatus:{}, thanks:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},scrollIntoView:()=>{}},
    form:{closest:()=>card, querySelector:()=>button}, submittingDialog:{open:true,close(){this.open=false;}},
    submitting:true, reportSaved:false
  });
  vm.runInContext(parser,context);
  await vm.runInContext(`(async()=>{${resultCode}})()`,context);
  return {context,success:classes.has('is-active'),card,title,button};
}
for (const language of ['en','zh']) {
  for (const [name,request] of [
    ['proxy HTML 413',{status:413,raw:'<html>too large</html>'}],
    ['JSON error',{status:400,body:{error:'Invalid attachment'}}],
    ['server failure',{status:500,raw:'<html>error</html>'}],
    ['HTML success status',{status:200,raw:'<html>login</html>'}],
    ['missing save confirmation',{body:{}}],
    ['created false',{body:{created:false,record:{rowNumber:53}}}],
    ['missing saved row',{body:{created:true,record:{}}}],
    ['network failure',{networkError:'Failed to fetch'}],
    ['attachment read failure',{attachmentError:'Cannot read file'}]
  ]) test(`${language}: ${name} keeps form visible without success`,async()=>{
    const r=await submit({...request,language});
    assert.equal(r.success,false);assert.equal(r.card.hidden,false);assert.equal(r.title.hidden,false);
    assert.equal(r.context.formStatus.className,'status err');assert.ok(r.context.formStatus.textContent);
    assert.equal(r.button.disabled,false);assert.equal(r.context.submittingDialog.open,false);
  });
}
test('413 explains upload size instead of claiming success',async()=>{
  assert.match((await submit({status:413,raw:'nginx'})).context.formStatus.textContent,/too large.*not saved/);
});
for (const key of ['emailError','discordError']) test(`${key} does not show success or allow duplicate submission`,async()=>{
  const r=await submit({body:{...saved,[key]:'delivery failed'}});
  assert.equal(r.success,false);assert.equal(r.card.hidden,false);assert.equal(r.button.disabled,true);
  assert.match(r.context.formStatus.textContent,/saved.*failed.*Do not submit again/);
});
test('confirmed durable save shows success; pending delivery is labelled',async()=>{
  for(const deliveryPending of [false,true]) {
    const r=await submit({body:{...saved,deliveryPending}});
    assert.equal(r.success,true);assert.equal(r.card.hidden,true);assert.equal(r.button.disabled,true);
  }
});
test('file picker enforces six total across every attachment type and 3 MB per file',()=>{
  const code=html.slice(html.indexOf('    function updateAttachmentPreview('),html.indexOf("    form.addEventListener('input'"));
  const selectedAttachments=new Map([['boardingPass',[{size:1}]],['bagTag:1',[{size:1}]],['damagePhoto:1',[{size:1}]],['tagOnBag:1',[{size:1}]],['other',[{size:1},{size:1}]]]);
  const error={};let rendered=0;
  const c=vm.createContext({selectedAttachments,attachmentKey:i=>i.key,renderAttachmentGroup:()=>rendered++,document:{documentElement:{lang:'en'},querySelector:()=>error}});
  vm.runInContext(code,c);
  const input={key:'extra',files:[{size:1}],value:'file',closest:()=>({dataset:{maxAttachments:'4'}})};
  c.updateAttachmentPreview(input);assert.match(error.textContent,/Maximum 6/);assert.equal(rendered,0);assert.equal(selectedAttachments.has('extra'),false);
  selectedAttachments.delete('other');
  input.files=[{size:3*1024*1024+1}];c.updateAttachmentPreview(input);assert.match(error.textContent,/3 MB/);assert.equal(rendered,0);
  input.files=[{size:3*1024*1024}];c.updateAttachmentPreview(input);assert.equal(rendered,1);assert.equal(selectedAttachments.get('extra').length,1);
});
