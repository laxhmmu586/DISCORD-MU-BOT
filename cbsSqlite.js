'use strict';
// Keep the legacy range/row contract at the boundary so existing case links,
// parsers and image references survive the change of storage.
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const column = text => [...text].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
const letters = index => { let out=''; for(let n=index+1;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out; };
function parseRange(range) {
 const match=/^(?:'((?:[^']|'')+)'|([^!]+))!([A-Z]+)(\d*)?(?::([A-Z]+)(\d*)?)?$/.exec(range);
 if(!match)throw Error('Unsupported CBS range: '+range);
 return {title:(match[1]?.replace(/''/g,"'")||match[2]),left:column(match[3]),top:Number(match[4]||1),right:column(match[5]||match[3]),bottom:match[5]?Number(match[6]||0):Number(match[4]||0)};
}
class CbsSqlite {
 constructor(filename) {
  if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true});
  this.db=new Database(filename,{timeout:5000});
  this.db.pragma('journal_mode = WAL');this.db.pragma('synchronous = FULL');
  this.db.exec(`CREATE TABLE IF NOT EXISTS cbs_books(id TEXT PRIMARY KEY, imported_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS cbs_tabs(book TEXT NOT NULL,gid INTEGER NOT NULL,title TEXT NOT NULL,next_row INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(book,gid),UNIQUE(book,title));
   CREATE TABLE IF NOT EXISTS cbs_rows(book TEXT NOT NULL,gid INTEGER NOT NULL,row_no INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(book,gid,row_no));
   CREATE TABLE IF NOT EXISTS cbs_tab_revision(book TEXT NOT NULL,gid INTEGER NOT NULL,value INTEGER NOT NULL,PRIMARY KEY(book,gid));
   CREATE TABLE IF NOT EXISTS cbs_revision(id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL);
   INSERT OR IGNORE INTO cbs_revision VALUES(1,0);`);
 }
 assertReady(book) {if(!this.db.prepare('SELECT 1 FROM cbs_books WHERE id=?').get(book))throw Error('CBS SQLite migration has not been imported and verified.');}
 revision(){return this.db.prepare('SELECT value FROM cbs_revision WHERE id=1').get().value;}
 bump(book,gid){this.db.prepare('UPDATE cbs_revision SET value=value+1 WHERE id=1').run();if(book!==undefined)this.db.prepare('INSERT OR REPLACE INTO cbs_tab_revision VALUES(?,?,?)').run(book,gid,this.revision());}
 tabRevision(book,gids){return gids.reduce((sum,gid)=>sum+(this.db.prepare('SELECT value FROM cbs_tab_revision WHERE book=? AND gid=?').get(book,gid)?.value||0),0);}
 prune(configs,now=new Date()){
  const cutoff=new Date(now);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-2);
  return this.db.transaction(()=>{
   let removed=0;const expiredImages=new Set();const del=this.db.prepare('DELETE FROM cbs_rows WHERE book=? AND gid=? AND row_no=?');
   for(const config of configs){
    const entries=this.db.prepare('SELECT row_no,data FROM cbs_rows WHERE book=? AND gid=? AND row_no>1').all(config.book,config.gid);
    for(const entry of entries){const row=JSON.parse(entry.data),time=config.dates.map(i=>Date.parse(row[i])).find(Number.isFinite);if(Number.isFinite(time)&&time<cutoff.getTime()){for(const ref of entry.data.matchAll(/-\d+-([a-f0-9]{64})/g))expiredImages.add(ref[1]);removed+=del.run(config.book,config.gid,entry.row_no).changes;}}
   }
   // Images have no dates of their own. Remove chunks only after no retained
   // case references their immutable hash, preserving all surviving row refs.
   for(const tab of this.db.prepare("SELECT book,gid FROM cbs_tabs WHERE title='CBS Damage Images'").all()){
    const cases=this.db.prepare('SELECT data FROM cbs_rows WHERE book=? AND gid<>?').all(tab.book,tab.gid).map(r=>r.data).join('\n');
    const images=this.db.prepare('SELECT row_no,data FROM cbs_rows WHERE book=? AND gid=?').all(tab.book,tab.gid);
    for(const entry of images){const id=JSON.parse(entry.data)[0];if(expiredImages.has(id)&&!cases.includes('-'+id))removed+=del.run(tab.book,tab.gid,entry.row_no).changes;}
   }
   if(removed){for(const config of configs)this.bump(config.book,config.gid);}return removed;
  })();
 }
 tabs(book){this.assertReady(book);return this.db.prepare('SELECT gid AS sheetId,title FROM cbs_tabs WHERE book=? ORDER BY gid').all(book);}
 tab(book,title){this.assertReady(book);const tab=this.db.prepare('SELECT * FROM cbs_tabs WHERE book=? AND title=?').get(book,title);if(!tab)throw Error('CBS table not imported: '+title);return tab;}
 importBook(book,tabs) {
  if(this.db.prepare('SELECT 1 FROM cbs_books WHERE id=?').get(book))throw Error('Refusing to overwrite an imported CBS database.');
  this.db.transaction(()=>{
   const putTab=this.db.prepare('INSERT INTO cbs_tabs VALUES(?,?,?,?)'),put=this.db.prepare('INSERT INTO cbs_rows VALUES(?,?,?,?)');
   for(const tab of tabs){putTab.run(book,tab.gid,tab.title,tab.rows.length+1);tab.rows.forEach((row,i)=>{if(row.length)put.run(book,tab.gid,i+1,JSON.stringify(row));});}
   this.db.prepare('INSERT INTO cbs_books VALUES(?,?)').run(book,new Date().toISOString());this.bump();
  })();
 }
 get(book,range) {
  const r=parseRange(range),tab=this.tab(book,r.title),end=r.bottom||tab.next_row-1;
  const entries=this.db.prepare('SELECT row_no,data FROM cbs_rows WHERE book=? AND gid=? AND row_no BETWEEN ? AND ? ORDER BY row_no').all(book,tab.gid,r.top,end);
  const values=[];
  for(const entry of entries){const row=JSON.parse(entry.data).slice(r.left,r.right+1);while(row.length&&(row.at(-1)===''||row.at(-1)===null))row.pop();if(row.length){while(values.length<entry.row_no-r.top)values.push([]);values.push(row);}}
  return {data:{range,values}};
 }
 update(book,range,values) {
  return this.db.transaction(()=>{
   const r=parseRange(range),tab=this.tab(book,r.title),get=this.db.prepare('SELECT data FROM cbs_rows WHERE book=? AND gid=? AND row_no=?'),put=this.db.prepare('INSERT OR REPLACE INTO cbs_rows VALUES(?,?,?,?)');let changed=false;
   values.forEach((cells,i)=>{const number=r.top+i,old=get.get(book,tab.gid,number)?.data||'[]',row=JSON.parse(old);cells.forEach((value,j)=>{if(value!==null){while(row.length<r.left+j)row.push('');row[r.left+j]=value;}});const json=JSON.stringify(row);if(json!==old){put.run(book,tab.gid,number,json);changed=true;}});
   this.db.prepare('UPDATE cbs_tabs SET next_row=? WHERE book=? AND gid=? AND next_row<?').run(r.top+values.length,book,tab.gid,r.top+values.length);
   if(changed)this.bump(book,tab.gid);return {data:{updatedRange:range,updatedRows:values.length}};
  })();
 }
 append(book,range,values) {
  return this.db.transaction(()=>{const r=parseRange(range),tab=this.tab(book,r.title),start=tab.next_row,updatedRange=`'${r.title.replace(/'/g,"''")}'!${letters(r.left)}${start}:${letters(r.right)}${start+values.length-1}`;
   this.update(book,updatedRange,values);return {data:{updates:{updatedRange,updatedRows:values.length}}};})();
 }
 clear(book,range){
  return this.db.transaction(()=>{const r=parseRange(range),tab=this.tab(book,r.title),end=r.bottom||tab.next_row-1,entries=this.db.prepare('SELECT row_no,data FROM cbs_rows WHERE book=? AND gid=? AND row_no BETWEEN ? AND ?').all(book,tab.gid,r.top,end);let changed=false;
   for(const entry of entries){const row=JSON.parse(entry.data);for(let i=r.left;i<=Math.min(r.right,row.length-1);i++)row[i]='';const data=JSON.stringify(row);if(data!==entry.data){this.db.prepare('UPDATE cbs_rows SET data=? WHERE book=? AND gid=? AND row_no=?').run(data,book,tab.gid,entry.row_no);changed=true;}}
   if(changed)this.bump(book,tab.gid);return {data:{clearedRange:range}};
  })();
 }
 batch(book,requests) {
  return this.db.transaction(()=>{
   this.assertReady(book);
   for(const request of requests){
    if(request.addSheet){const p=request.addSheet.properties,gid=p.sheetId??(Math.max(0,...this.tabs(book).map(t=>t.sheetId))+1);this.db.prepare('INSERT INTO cbs_tabs VALUES(?,?,?,1)').run(book,gid,p.title);this.bump();continue;}
    const r=request.deleteDimension?.range;if(!r)throw Error('Unsupported CBS table operation.');
    if(r.dimension==='ROWS'){
     // Tombstones preserve identifiers in URLs, linked cases and image refs.
     const result=this.db.prepare('DELETE FROM cbs_rows WHERE book=? AND gid=? AND row_no>? AND row_no<=?').run(book,r.sheetId,r.startIndex,r.endIndex);if(result.changes)this.bump(book,r.sheetId);
    }else if(r.dimension==='COLUMNS'){
     const entries=this.db.prepare('SELECT row_no,data FROM cbs_rows WHERE book=? AND gid=?').all(book,r.sheetId),put=this.db.prepare('UPDATE cbs_rows SET data=? WHERE book=? AND gid=? AND row_no=?');
     for(const entry of entries){const row=JSON.parse(entry.data);row.splice(r.startIndex,r.endIndex-r.startIndex);put.run(JSON.stringify(row),book,r.sheetId,entry.row_no);}if(entries.length)this.bump(book,r.sheetId);
    }else throw Error('Unsupported CBS dimension.');
   }return {data:{}};
  })();
 }
 // Only the explicitly migrated workbook/tabs use SQLite. Report and 240
 // continue through their existing client even when they share a workbook.
 route(remote,book,extraTabs=[]) {
  const uses=args=>args.spreadsheetId===book||extraTabs.some(t=>t.book===args.spreadsheetId&&(args.range?parseRange(args.range).title===t.title:false));
  const values={};
  for(const method of ['get','update','append','clear'])values[method]=async args=>uses(args)?this[method](args.spreadsheetId,args.range,args.requestBody?.values):remote.spreadsheets.values[method](args);
  values.batchGet=async args=>args.spreadsheetId===book?{data:{valueRanges:args.ranges.map(range=>this.get(book,range).data)}}:remote.spreadsheets.values.batchGet(args);
  values.batchUpdate=async args=>{
   if(args.spreadsheetId!==book)return remote.spreadsheets.values.batchUpdate(args);
   return this.db.transaction(()=>({data:{responses:args.requestBody.data.map(item=>this.update(book,item.range,item.values).data)}}))();
  };
  return {spreadsheets:{values,
   get:async args=>args.spreadsheetId===book?{data:{sheets:this.tabs(book).map(properties=>({properties}))}}:remote.spreadsheets.get(args),
   batchUpdate:async args=>args.spreadsheetId===book?this.batch(book,args.requestBody.requests):remote.spreadsheets.batchUpdate(args)
  }};
 }
}
module.exports={CbsSqlite,parseRange};
