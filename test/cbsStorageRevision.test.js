const test=require('node:test'),assert=require('node:assert/strict');
process.env.CBS_SQLITE_PATH=':memory:';process.env.CBS_STORAGE='sqlite';
const storage=require('../cbsStorage');
test('module revisions isolate Open, Closed, Rush and Bag Room changes',()=>{
 const s=storage.local(),book=storage.book;
 s.importBook(book,[{gid:0,title:'Cases',rows:[['Type','Status'],['AHL','Open'],['DPR','Closed']]},{gid:1615438730,title:'Wrong',rows:[['Date','Status']]},{gid:523026916,title:'Onhand',rows:[['Tag'],['MU111111','','','','Bag','Open','Office']]},{gid:944289437,title:'Rush',rows:[['File'],['RUSH123']]},{gid:1145829442,title:'Missing',rows:[['Tag']]}]);
 const before={...storage.revisions()};s.update(book,'Cases!C2',[['New name']]);const after=storage.revisions();assert.notEqual(after['passenger:open'],before['passenger:open']);for(const key of ['passenger:closed','on-hand:open','bag-room:open','rush','missing'])assert.equal(after[key],before[key]);s.update(book,'Cases!B2',[['Closed']]);const moved=storage.revisions();assert.notEqual(moved['passenger:open'],after['passenger:open']);assert.notEqual(moved['passenger:closed'],after['passenger:closed']);s.db.close();
});
