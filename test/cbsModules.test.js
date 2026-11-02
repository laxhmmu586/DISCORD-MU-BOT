const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {select,matchMaps}=require('../cbsModules');
test('open lists omit archives; closed lists fetch one requested month',()=>{
 const rows=[{rowNumber:2,status:'Open',submittedAt:'2026-10-01'},{rowNumber:3,status:'Closed',updatedAt:'2026-10-15T18:00:00Z'},{rowNumber:4,status:'Forward to MU',updatedAt:'2026-09-03T18:00:00Z'}];
 assert.deepEqual(select(rows,{view:'open'}).rows.map(r=>r.rowNumber),[2]);
 const result=select(rows,{view:'closed',month:'2026-09'});assert.deepEqual(result.rows.map(r=>r.rowNumber),[4]);assert.deepEqual(result.months,['2026-10','2026-09']);assert.equal(select(rows,{view:'closed'}).month,'2026-10');assert.throws(()=>select(rows,{view:'closed',month:'invalid'}),/valid month/);
});
test('On-hand and Bag Room are independent modules and nonfinal resolutions remain open',()=>{
 const rows=[{rowNumber:2,status:'Open',bagType:'Bag',createdAt:'2026-10-01'},{rowNumber:3,status:'Not Load Bags',createdAt:'2026-10-01'},{rowNumber:4,bagType:'Bag',resolvedAt:'2026-10-15T18:00:00Z',resolution:'case-close'},{rowNumber:5,bagType:'Bag',resolvedAt:'2026-10-15T18:00:00Z',resolution:'other'}];
 assert.deepEqual(select(rows,{view:'open',group:'on-hand'},'onhand').rows.map(r=>r.rowNumber),[2,5]);assert.deepEqual(select(rows,{view:'open',group:'bag-room'},'onhand').rows.map(r=>r.rowNumber),[3]);assert.deepEqual(select(rows,{view:'closed',group:'on-hand',month:'2026-10'},'onhand').rows.map(r=>r.rowNumber),[4]);
});
test('matching badges carry only identifiers rather than downloading the other module',()=>{const result=matchMaps([{rowNumber:2,bagTag:'MU123456',updateEvents:[{key:'upcoming_rush',fields:[['Rush Tag','MU999999']]}]}],[{rowNumber:3,bagTag:'MU999999',passengerName:'private'}]);assert.deepEqual(result.onHandMatches[2],{rowNumber:3,bagTag:'MU999999'});assert.deepEqual(result.passengerMatches[3],{rowNumber:2,bagTag:'MU123456'});assert(!JSON.stringify(result).includes('private'));});
test('module navigation loads only the selected module and no data for compose/tools pages',async()=>{
 const page=fs.readFileSync(require('node:path').join(__dirname,'../public/public/cbs.html'),'utf8'),fn=page.match(/function loadActiveCbsModule\(\)\{[^\n]+/)[0],calls=[],context=vm.createContext({activeCbsSection:'open',activeCbsGroup:'passenger',Promise,renderShipments(){},loadCases:async()=>calls.push('passenger'),loadUnresolvedBaggage:async()=>calls.push('onhand'),loadWorldTracerCases:async()=>calls.push('rush'),loadMissingReports:async()=>calls.push('missing')});vm.runInContext(fn,context);
 for(const [section,group,expected] of [['open','passenger',['passenger']],['closed','on-hand',['onhand']],['open','bag-room',['onhand']],['worldtracer','passenger',['rush']],['missing','passenger',['missing']],['email','passenger',[]]]){context.activeCbsSection=section;context.activeCbsGroup=group;calls.length=0;await context.loadActiveCbsModule();assert.deepEqual(calls,expected);}
 const initial=page.slice(page.indexOf('    const initialSection ='));assert.doesNotMatch(initial,/\n    (?:loadCases|loadMissingReports|loadWorldTracerCases|loadUnresolvedBaggage|syncMissingReports)\(\)/);
});
