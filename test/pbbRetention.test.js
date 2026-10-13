const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {cutoffDate,prune}=require('../scripts/prune-pbb-records.cjs');
test('04:00 Los Angeles cutoff follows summer/winter time and protects yesterday before 04:00',()=>{
 for(const [input,expected] of [['2026-10-14T10:59:59Z','2026-10-13'],['2026-10-14T11:00:00Z','2026-10-14'],['2026-12-01T11:59:59Z','2026-11-30'],['2026-12-01T12:00:00Z','2026-12-01'],['2026-03-08T11:00:00Z','2026-03-08'],['2026-11-01T12:00:00Z','2026-11-01']])assert.equal(cutoffDate(new Date(input)),expected);
});
test('cleanup removes older forms and embedded PDFs, preserves current forms and employee data, and is repeatable',()=>{
 const db=new Database(':memory:');db.exec('CREATE TABLE pbb_records(id TEXT PRIMARY KEY,data TEXT,pdf BLOB); CREATE TABLE pbb_employees(data TEXT);');db.prepare('INSERT INTO pbb_employees VALUES (?)').run('employee permissions');
 try{
  for(const [id,date,completedAt] of [['old','2026-10-12',null],['yesterday','2026-10-13','2026-10-13T23:00:00Z'],['today','2026-10-14',null],['future','2026-10-15',null]])db.prepare('INSERT INTO pbb_records VALUES (?,?,?)').run(id,JSON.stringify({date,completedAt}),Buffer.from('PDF fixture'));
  assert.equal(prune(db,new Date('2026-10-14T10:59:59Z')).deleted,1);
  assert.equal(prune(db,new Date('2026-10-14T11:00:00Z')).deleted,1);
  assert.deepEqual(db.prepare('SELECT id FROM pbb_records ORDER BY id').all().map(r=>r.id),['future','today']);
  assert.equal(db.prepare('SELECT data FROM pbb_employees').get().data,'employee permissions');assert.equal(db.prepare('SELECT pdf FROM pbb_records WHERE id=?').get('yesterday'),undefined);
  assert.equal(prune(db,new Date('2026-10-14T11:00:10Z')).deleted,0);
 }finally{db.close();}
});
