const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
process.env.CBS_SQLITE_PATH=':memory:';process.env.CBS_STORAGE='sqlite';
const storage=require('../cbsStorage'),drive=require('../googleDrive');
test('real CBS writers serialize concurrent case edits and roll back a failed multi-row save',async()=>{
 const s=storage.local(),source=fs.readFileSync(require('node:path').join(__dirname,'../googleDrive.js'),'utf8'),headers=vm.runInNewContext(source.match(/const CBS_HEADERS = (\[[\s\S]*?\]);/)[1]);
 s.importBook(storage.book,[{gid:1615438730,title:'Wrong',rows:[['Date','Status']]},{gid:523026916,title:'Onhand',rows:[['Bag Tag']]},{gid:0,title:'Cases',rows:[headers]},{gid:944289437,title:'Rush',rows:[['File'],['OLD','MU123456','MU999999','MU586','2026-11-01','LAX','PVG','2026-11-01'],['OLD','MU123456','MU999999','MU583','2026-11-02','PVG','LAX','2026-11-01']]}]);
 const record=await drive.appendCbsCase({caseType:'AHL',status:'Open',passengerName:'TEST',bagTag:'MU123456',submittedAt:new Date().toISOString()});
 await Promise.all(['first','second'].map(text=>drive.updateCbsCase(record.rowNumber,{updateEvent:{key:'comment',title:'Comment',fields:[['Comment',text]],by:'TEST'}})));
 const saved=(await drive.getCbsCases()).find(row=>row.rowNumber===record.rowNumber);assert.equal(saved.updateEvents.filter(e=>e.key==='comment').length,2);
 const firstCounts=await drive.getCbsCaseCounts();assert.equal(firstCounts.open.passenger,1);s.update(storage.book,'Cases!AF2',[[JSON.stringify([{key:'comment',status:'Closed',at:'2026-10-15T18:00:00Z',fields:[]}])]]);const normalizedCounts=await drive.getCbsCaseCounts();assert.equal(normalizedCounts.open.passenger,0);assert.equal(normalizedCounts.closed['2026-10'].passenger,1);assert.equal(require('../cbsModules').select(await drive.getCbsCases(),{view:'closed',month:'2026-10'}).rows.length,normalizedCounts.closed['2026-10'].passenger);
 const before=s.get(storage.book,'Rush!A:H').data.values,revision=s.revision(),original=s.update.bind(s);let writes=0;
 s.update=(...args)=>{if(args[1].startsWith("'Rush'!")&&++writes===2)throw Error('simulated disk failure');return original(...args);};
 await assert.rejects(drive.updateCbsWorldTracerCase([2,3],{worldTracerFileNumber:'NEW',originalTagNumber:'MU123456',rushTagNumber:'MU999999',flightRows:[{flightNumber:'MU586'},{flightNumber:'MU583'}]}),/simulated disk failure/);
 s.update=original;assert.deepEqual(s.get(storage.book,'Rush!A:H').data.values,before);assert.equal(s.revision(),revision);assert.equal(s.db.inTransaction,false);s.db.close();
});
