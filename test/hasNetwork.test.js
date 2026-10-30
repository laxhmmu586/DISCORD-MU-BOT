const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('HAS uses direct API on every hosting domain and preserves explicit overrides',()=>{
 const script=fs.readFileSync('has/public/has-network.js','utf8');
 for(const hostname of ['www.mufcapp.net','china-eastern.web.app','china-eastern.firebaseapp.com','localhost'])for(const override of [undefined,'http://localhost:3000']){
  const context={window:{MU_API_BASE:override},location:{hostname}};vm.runInNewContext(script,context);assert.equal(context.window.MU_API_BASE,override||'https://api.mufcapp.net');
 }
});
test('Hosting and HAS no longer depend on Cloudflare routing',()=>{
 const config=JSON.parse(fs.readFileSync('public/firebase.json','utf8'));assert.equal(config.functions,undefined);assert.equal(config.hosting.rewrites,undefined);
 assert.equal(fs.existsSync('deploy/has-network/wrangler.jsonc'),false);assert.equal(fs.existsSync('deploy/has-network/worker.mjs'),false);
 assert(!fs.readFileSync('has/public/has-pbb-client.js','utf8').includes("'/has-network'"));
});
