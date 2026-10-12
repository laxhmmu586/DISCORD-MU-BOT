const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
test('successful login always returns to flight selection, including stale dashboard next links',()=>{
 const html=fs.readFileSync('public/public/login.html','utf8');
 const source=html.match(/function getRedirectTarget\(\) \{[\s\S]*?\n      \}/)[0];
 for(const next of ['', '?next=/index.html', '?next=/irr.html', '?next=//example.com']){
  const ctx={URL,window:{location:{href:'https://www.mufcapp.net/login.html'+next}}};vm.createContext(ctx);vm.runInContext(source,ctx);
  assert.equal(ctx.getRedirectTarget(),'https://www.mufcapp.net/flights.html');
 }
});
