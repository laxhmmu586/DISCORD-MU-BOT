const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = p => fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const server=read('index.js'), drive=read('googleDrive.js'), js=read('public/public/baggage.js'), cbs=read('public/public/cbs.html');
const fn=(s,n,indent='')=>s.match(new RegExp(`^${indent}(?:async )?function ${n}\\([^\\n]*\\) \\{\\n[\\s\\S]*?^${indent}\\}`,'m'))[0];

test('Notag opens a fixed inbound form with No Tag and preserves normal tag validation',()=>{
 const ctx=vm.createContext({escapeHtml:String,ymdFromDate:()=> '2026-10-16',BaggageIdentificationPicker:{fields:()=>'<div>Identification</div>'}});
 vm.runInContext(fn(js,'renderTestBagEntry','      '),ctx);
 const html=ctx.renderTestBagEntry('inbound',{noTag:true,bagTag:'No Tag'});
 assert.match(html,/name="bagTag" value="No Tag" readonly/);
 assert.doesNotMatch(html,/pattern=|Co-mail/);
 assert.match(html,/value="Office"[^>]*readonly/);
 assert.match(html,/<option value="MU583" selected>/);
 assert.match(ctx.renderTestBagEntry('inbound',{}),/pattern="\[A-Z0-9\]\{2\}\[0-9\]\{6\}"/);
 assert.match(read('public/public/baggage.html'),/type="button" id="test-no-tag">Notag/);
 const formCtx=vm.createContext({testBagSearchPending:false,renderTestAddForm:(...args)=>{formCtx.args=args;}});
 vm.runInContext(fn(js,'openNoTagForm','      '),formCtx);formCtx.openNoTagForm();
 assert.equal(formCtx.args[1],'inbound');assert.equal(formCtx.args[2][0].noTag,true);
});

test('API saves No Tag directly to On Hand and rejects outbound, bad date, and ordinary invalid tags',async()=>{
 let handler;const onHand=[],normal=[];
 const start=server.indexOf("app.post('/test-baggage',");
 const src=server.slice(start,server.indexOf('\n});',start)+4);
 const ctx={BaggageGuide:require('../public/public/baggage-guide'),app:{post:(_,fn)=>handler=fn},cleanBodyText:(v)=>String(v||'').trim(),normalizeTestBagTag:v=>String(v||'').replace(/\s/g,'').toUpperCase(),isValidTestBagTag:v=>/^[A-Z0-9]{2}\d{6}$/.test(v),isValidRushBagTag:()=>true,appendCbsUnresolvedBaggageCase:async r=>{onHand.push(r);return {created:true,record:r}},appendTestBaggageRecord:async r=>{normal.push(r);return {created:true,record:r}},console};
 vm.runInNewContext(src,ctx);
 const call=async patch=>{let status=200,data;await handler({body:{noTag:true,direction:'inbound',bagTag:'No Tag',date:'2026-10-16',flight:'MU583',bagType:'Passenger bag',location:'Office',bagIdentification:{color:'BE',type:'25',descriptors:'X-M,K'},...patch}},{status(n){status=n;return this},json(v){data=v;return this}});return {status,data};};
 for(let i=0;i<2;i++){const r=await call({});assert.equal(r.status,201);assert.equal(r.data.record.bagTag,'No Tag');assert.equal(r.data.record.bagIdentification.descriptors,'X-M,K');}
 for(const patch of [{direction:'outbound'},{date:''},{location:'Transfer'},{bagType:'Co-mail'},{noTag:false},{bagIdentification:{color:'INVALID'}},{bagIdentification:{descriptors:'D,L,M,R'}},{bagIdentification:{descriptors:'X-M,R'}}])assert.equal((await call(patch)).status,400);
 assert.equal((await call({noTag:false,bagTag:'MU123456'})).status,201);
 assert.equal(onHand.length,2);assert.equal(normal.length,1);
});

test('storage appends separate No Tag rows, preserves labels, and still deduplicates real tags',async()=>{
 const rows=[],written=[];
 const ctx=vm.createContext({isCbsOnHandExcludedBag:()=>false,getCbsUnresolvedBaggageSheetTitle:async()=> 'OnHand',getCbsUnresolvedBaggageCases:async()=>rows,sanitizeSheetText:v=>String(v||'').trim(),CBS_SHEET_ID:'fixture',CBS_UNRESOLVED_BAGGAGE_HEADERS:Array(18).fill(''),escapeSheetTitle:String,appendCbsNotLoadBaggageCase:async()=>{},invalidateCbsUnresolvedBaggageCache:()=>{},sheets:{spreadsheets:{values:{get:async()=>({data:{values:[Array(18).fill('')]}}),append:async p=>{const values=p.requestBody.values[0];written.push(values);rows.push({bagTag:values[0]});return {data:{updates:{updatedRange:`OnHand!A${written.length+1}:R${written.length+1}`}}};}}}}});
 vm.runInContext(fn(drive,'appendCbsUnresolvedBaggageCase'),ctx);
 for(const bagTag of ['No Tag','No Tag','MU123456','MU123456'])await ctx.appendCbsUnresolvedBaggageCase({bagTag,direction:'inbound',flight:'MU583',date:'2026-10-16',location:'Office',bagType:'Passenger bag',bagIdentification:{color:'BE',type:'25',descriptors:'X-M,K'}});
 assert.equal(written.length,3);assert.equal(written[0][0],'No Tag');assert.equal(written[1][0],'No Tag');
 const event=JSON.parse(written[0][17])[0];assert.equal(event.bagIdentification.color,'BE');assert.equal(event.bagIdentification.type,'25');assert.equal(event.bagIdentification.descriptors,'X-M,K');
 assert.equal(written[0][2],'MU583');assert.equal(written[0][3],'2026-10-16');
});

test('CBS keeps separate No Tag cases while grouping tagged bag history',()=>{
 const source=cbs.slice(cbs.indexOf('      const rowsByTag = new Map();'),cbs.indexOf('      rows = [...rowsByTag.values()]'));
 const ctx=vm.createContext({rows:[{bagTag:'No Tag',rowNumber:2},{bagTag:'No Tag',rowNumber:3},{bagTag:'MU123456',rowNumber:4},{bagTag:'MU123456',rowNumber:5}]});
 vm.runInContext(source+'\nglobalThis.groups=[...rowsByTag.values()];',ctx);
 assert.equal(ctx.groups.length,3);assert.deepEqual(Array.from(ctx.groups,g=>g.length),[1,1,2]);
});

test('fresh On Hand reads restore the saved visual identification from the sheet',async()=>{
 const identification={number:1,tag:'No Tag',color:'BE',type:'25',descriptors:'X-M,K'};
 const values=['No Tag','inbound','MU583','2026-10-16','Passenger bag','','Office',new Date().toISOString(),'','','','','','','','','',JSON.stringify([{key:'bag-identification',bagIdentification:identification}])];
 const ctx=vm.createContext({cbsUnresolvedBaggageCache:{expiresAt:0,rows:null,pending:null,generation:0},CBS_UNRESOLVED_CACHE_TTL_MS:30000,CBS_SHEET_ID:'fixture',CBS_UNRESOLVED_BAGGAGE_SHEET_GID:1,CBS_UNRESOLVED_BAGGAGE_HEADERS:['Bag Tag'],getCbsUnresolvedBaggageSheetTitle:async()=>'OnHand',getCbsRetainedSheetRows:async()=>[['Bag Tag'],values],isCbsOnHandExcludedBag:()=>false,cbsUnresolvedRushTag:()=>'',copyCbsUnresolvedBaggageRows:rows=>rows});
 vm.runInContext(fn(drive,'safeJsonArray')+'\n'+fn(drive,'getCbsUnresolvedBaggageCases'),ctx);
 const rows=await ctx.getCbsUnresolvedBaggageCases({forceRefresh:true});
 assert.equal(rows.length,1);assert.equal(rows[0].bagTag,'No Tag');assert.deepEqual(JSON.parse(JSON.stringify(rows[0].bagIdentifications[0])),identification);
});
