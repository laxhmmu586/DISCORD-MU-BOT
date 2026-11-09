const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('MUFC desktop proxies all three reports to the fixed-account API and rejects other report paths',()=>{
 const source=fs.readFileSync('scripts/client-glass-v2/files/src/server.js','utf8'),start=source.indexOf('      if (/^\\/(?:has|mufc)-report-api'),end=source.indexOf("      if (!['GET', 'POST']",start);
 assert(start>=0&&end>start);const gate=source.slice(start,end);
 const route=path=>{const scope={url:new URL('http://localhost'+path),res:{},json:(_,data,status)=>({data,status})};vm.createContext(scope);const denied=vm.runInContext('(function(){'+gate+'})()',scope);return {path:scope.url.pathname,denied};};
 for(const prefix of ['has','mufc']){
  for(const path of ['/context','/da/2026-11','/da/2026-11/stream','/wwh/2026-11/export','/rechargeable/2026-11'])assert.equal(route('/'+prefix+'-report-api'+path).path,'/mufc-report-api'+path);
  for(const path of ['/dashboard','/expense/2026-11','/terrific/2026-11','/cos/2026-11'])assert.equal(route('/'+prefix+'-report-api'+path).denied.status,404);
 }
 assert.equal(route('/sales-details-report').path,'/sales-details-report');
 assert(source.includes("'authorization', 'content-type', 'accept', 'x-workspace-account'"),'Online proxy retains authentication');
});
