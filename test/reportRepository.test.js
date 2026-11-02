'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.REPORT_SQLITE_PATH=':memory:';
const store=require('../reportSqlite').local();
store.db.prepare('INSERT INTO report_meta VALUES(?,?)').run('imported','test');
const drive=require('../googleDrive');
test('actual report writers persist once and keep Authorization remarks across source resync',async()=>{
 const row={flightDate:'01NOV26',flightNo:'MU586',passenger:'TEST/PASSENGER',bn:'001',seat:'1A',bags:'MU123456',type:'MSG',detail:'first line\nsecond line'};
 const results=await Promise.all(Array.from({length:5},()=>drive.appendPsmMsgReportRows([row])));
 assert.equal(results.reduce((n,r)=>n+(r.appended||0),0),1);
 const rows=await drive.getPsmMsgReportRows('2026-11-01','2026-11-01');assert.equal(rows.length,1);
 await drive.updatePsmMsgReportRemark(rows[0].key,'saved manually');
 await drive.appendPsmMsgReportRows([row]);assert.equal((await drive.getPsmMsgReportRows('2026-11-01'))[0].remark,'saved manually');
 assert.equal((await drive.appendSpmlReportRows([{date:'2026-11-01'}])).disabled,true);
 assert.equal((await drive.appendStoredReportRows('wheelchair','2026-11-01',[])).disabled,true);
});
test('Sales Details reads existing SQLite records without a source sync',async()=>{
 store.put('salesDetails',[{key:'sale1',date:'2026-11-01',emd:'123',value:30,type:'UPG',flightNo:'MU586'},{key:'sale2',date:'2026-11-01',emd:'456',value:20,type:'UPG',flightNo:'MU583'}]);
 const result=await drive.getSalesDetailsReportRows('2026-11-01','2026-11-01',{flight:'MU586'});
 assert.equal(result.rows.length,1);assert.equal(result.totals[0].amount,30);
});
