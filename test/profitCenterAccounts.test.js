const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),groups=require('../has/public/employee-account-groups'),{createEmployeeStore}=require('../has/server/employees');
test('workbook accounts have six ordered regions and requested exclusions',()=>{
 assert.deepEqual(groups.regions,['West Coast','North Coast','Central','East Coast','South Coast','CBS']);assert.equal(groups.catalog.length,200);assert.equal(new Set(groups.catalog.map(groups.key)).size,200);
 for(const [station,account,region] of [['LAX','MU','West Coast'],['SFO','MU','North Coast'],['IAH','BR','Central'],['JFK','AF','East Coast'],['ATL','BA','South Coast'],['SFO','CBS','CBS'],['SJC','LF','CBS'],['OGG','WS','West Coast']])assert.equal(groups.regionName(station,account),region);
 for(const [station,account] of [['LAX','CALL-CENTER'],['HNL','CHARTER'],['AUS','KL'],['JFK','CHARTER'],['AUS','CHARTER'],['DFW','CHARTER']])assert(!groups.catalog.some(x=>x.station===station&&x.account===account));
});
test('one-time import adds only empty accounts and does not recreate accounts deleted later',()=>{
 const db=new Database(':memory:');try{
 const seed=[{id:'test',name:'TEST',position:'Agent',station:'LAX',account:'MU'}],store=createEmployeeStore(db,{seed,importCatalog:true}),before=store.getAll();assert.equal(before.employees.length,1);assert.equal(before.accounts.length,200);assert.equal(before.employees[0].id,'test');
 db.prepare('DELETE FROM employee_account_groups WHERE station=? AND account=?').run('JFK','AF');const again=createEmployeeStore(db,{seed,importCatalog:true}).getAll();assert.deepEqual(again.employees,before.employees);assert.equal(again.accounts.length,199);assert.equal(again.revision,before.revision);
 }finally{db.close();}
});
