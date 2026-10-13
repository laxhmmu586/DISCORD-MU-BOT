const test=require('node:test'),assert=require('node:assert/strict');const {gateDeadline,parseEtab,createEtaService}=require('../pbbEta');
const sample=`E T A B A D V I S O R Y\nMU583/13OCT. B-7868. ETA 0937L. GATE 131. PAX 292/01. CREW 04/17.\nTOW IN GATE ONLY\nMU586/13OCT. STD 1230L.\nRegards/LAXOPS/MM.`;
test('ETA minus exactly 15 minutes, including midnight and invalid times',()=>{
 assert.equal(gateDeadline('0937','2026-10-13').gateBy,'09:22');assert.equal(gateDeadline('09:37L','2026-10-13').eta,'09:37');const midnight=gateDeadline('0005','2026-10-13');assert.equal(midnight.gateBy,'23:50');assert.equal(midnight.gateByDate,'2026-10-12');assert.equal(gateDeadline('2460','2026-10-13'),null);
});
test('ETAB selects exact arrival flight/date and ignores departure, gate-only text, signatures and invalid dates',()=>{
 const parsed=parseEtab(sample,'MU583','2026-10-13');assert.equal(parsed.gate,'131');assert.equal(parsed.gateBy,'09:22');assert.equal(parseEtab(sample,'MU586','2026-10-13'),null);assert.equal(parseEtab(sample,'MU583','2026-10-14'),null);assert.equal(parseEtab(sample.replace('0937L','9960L'),'MU583','2026-10-13'),null);
 assert.equal(parseEtab(sample.replace('MU583/13OCT','MU583-13OCT26'),'MU583','2026-10-13').eta,'09:37');assert.equal(parseEtab(sample.replace('MU583/13OCT','MU583/13OCT25'),'MU583','2026-10-13'),null);
});
test('Gmail lookup picks latest matching email, coalesces callers and caches results',async()=>{
 let calls=0;const service=createEtaService({now:()=>Date.parse('2026-10-13T15:00:00Z'),getClient:()=>({userId:'me',gmail:{users:{messages:{list:async({q})=>{calls++;assert.match(q,/from:\(LAXHMXH@hallmark-aviation.com OR laxhm21@gmail.com\)/);return {data:{messages:[{id:'old'},{id:'wrong'},{id:'new'}]}};},get:async({id})=>({data:{internalDate:String(Date.parse('2026-10-13T'+(id==='old'?'13':'14')+':00:00Z')),payload:{mimeType:'text/plain',body:{data:Buffer.from(id==='wrong'?sample.replaceAll('13OCT','12OCT'):id==='new'?sample.replace('0937L','0950L'):sample).toString('base64url')}}}})}}}})});
 const [a,b]=await Promise.all([service.read('MU583','2026-10-13'),service.read('MU583','2026-10-13')]);assert.equal(a.messageId,'new');assert.equal(a.eta,'09:50');assert.equal(a.gateBy,'09:35');assert.deepEqual(a,b);await service.read('MU583','2026-10-13');assert.equal(calls,1);
});
