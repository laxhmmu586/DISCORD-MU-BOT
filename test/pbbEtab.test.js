const test=require('node:test'),assert=require('node:assert/strict');
const {parseEtab,createGateService}=require('../pbbEtab');
test('ETAB gate lookup matches flight/date and works without ETA',()=>{
 assert.deepEqual(parseEtab('MU583/13OCT26\nGATE: 132','MU583','2026-10-13'),{flightNo:'MU583',date:'2026-10-13',gate:'132'});
 assert.equal(parseEtab('MU586/13OCT26 GATE 131\nMU583/14OCT26 GATE 132','MU583','2026-10-13'),null);
 assert.equal(parseEtab('MU583/13OCT25 GATE 132','MU583','2026-10-13'),null);
 assert.equal(parseEtab('MU583/13OCT26 ETA 0937','MU583','2026-10-13'),null);
 assert.equal(parseEtab('MU583/13OCT26 GATE TBA','MU583','2026-10-13'),null);
 assert.equal(parseEtab('MU583/13OCT26 GATE L2','MU583','2026-10-13').gate,'L2');
 assert.equal(parseEtab('MU586/13OCT26 GATE 131\nMU583/13OCT26 GATE 132','MU583','2026-10-13').gate,'132');
});
test('gate service selects latest matching email, coalesces requests, returns no ETA or deadline',async()=>{
 let lists=0,gets=0;const now=()=>Date.parse('2026-10-13T16:00Z');const service=createGateService({now,getClient:()=>({userId:'me',gmail:{users:{messages:{list:async({q})=>{lists++;assert.match(q,/subject:ETAB/);assert.match(q,/LAXHMXH@hallmark-aviation.com/);return {data:{messages:[{id:'old'},{id:'new'},{id:'wrong'}]}};},get:async({id})=>{gets++;return {data:{internalDate:String(Date.parse(id==='old'?'2026-10-13T14:00Z':'2026-10-13T15:00Z')),payload:{mimeType:'text/plain',body:{data:Buffer.from(id==='wrong'?'MU583/14OCT26 GATE 199':`MU583/13OCT26 GATE ${id==='new'?'132':'131'}`).toString('base64url')}}}};}}}}})});
 const [a,b]=await Promise.all([service.read('MU583','2026-10-13'),service.read('MU583','2026-10-13')]);assert.equal(a.gate,'132');assert.deepEqual(a,b);assert.equal(a.eta,undefined);assert.equal(a.gateBy,undefined);await service.read('MU583','2026-10-13');assert.equal(lists,1);assert.equal(gets,3);
});
