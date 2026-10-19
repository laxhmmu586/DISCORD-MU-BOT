const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../public/public/index.html'),'utf8');
const source=html.slice(html.indexOf('      function securityTone(row)'),html.indexOf('      function securityCard(row)'));
const context=vm.createContext({});vm.runInContext(source,context);
test('VISA circle takes priority over other warnings and failures without changing aggregate counts',()=>{
 const tone=row=>context.securityCircleTone(row);
 assert.equal(tone({visaStatus:'review'}),'visa-warning');
 assert.equal(tone({visaStatus:'review',bagStatus:'review',tkStatus:'fail'}),'visa-warning');
 assert.equal(context.securityTone({visaStatus:'review',tkStatus:'fail'}),'fail');
 assert.equal(tone({visaStatus:'pass',bagStatus:'review'}),'warning');
 assert.equal(tone({visaStatus:'pass',tkStatus:'fail'}),'fail');
 assert.equal(tone({visaStatus:'review',review:{status:'pass'}}),'pass');
 assert.equal(tone({visaStatus:'review',review:{status:'fail'}}),'fail');
 assert.equal(tone({visaStatus:'pass'}),'pass');
});
