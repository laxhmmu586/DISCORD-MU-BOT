'use strict';
const path=require('node:path');
const book=process.env.CBS_SHEET_ID||'10oEQypkoaNvosREqT-mNw8zsyrQxln2EwsBUuS9OtsU';
const related=[
 {book:'1JqRnDx_uLc2m2SzyZOuHWWJsbkKenlKo60U9zwV9uMQ',gid:1340163844},
 {book:process.env.CONTACT_FORM_SHEET_ID||'1JqRnDx_uLc2m2SzyZOuHWWJsbkKenlKo60U9zwV9uMQ',gid:Number(process.env.CONTACT_FORM_SHEET_GID||1889354016)}
];
let store,lastCleanup='';
function local(){
 store ||= new (require('./cbsSqlite').CbsSqlite)(process.env.CBS_SQLITE_PATH||path.join(__dirname,'data','cbs.db'));
 const day=new Date().toISOString().slice(0,10);
 if(lastCleanup!==day&&store.db.prepare('SELECT 1 FROM cbs_books WHERE id=?').get(book)){
  const specs=[['CBS_SHEET_GID',0,[26]],['WRONG_BAGGAGE_SHEET_GID',1615438730,[0]],['CBS_WORLDTRACER_SHEET_GID',944289437,[7,6]],['CBS_UNRESOLVED_BAGGAGE_SHEET_GID',523026916,[7]],['CBS_NOT_LOAD_BAGGAGE_SHEET_GID',1393047851,[7]],['CBS_MISSING_BAG_SHEET_GID',1145829442,[6]]];
  store.prune([...specs.map(([name,gid,dates])=>({book,gid:Number(process.env[name]||gid),dates})),...related.map((t,i)=>({...t,dates:i===0?[15,3]:[0]}))]);lastCleanup=day;
 }
 return store;
}
const enabled=()=>process.env.CBS_STORAGE!=='sheets';
function localTitle(id,gid){
 if(!enabled()||id!==book&&!related.some(t=>t.book===id&&String(t.gid)===String(gid)))return null;
 const tab=local().tabs(id).find(t=>String(t.sheetId)===String(gid));if(!tab)throw Error('CBS migration is missing table '+gid);return tab.title;
}
function client(remote){
 if(!enabled())return remote;
 // Resolve shared-workbook titles lazily; unrelated pages can run before import.
 const extras=related.map(t=>({...t,get title(){return local().db.prepare('SELECT title FROM cbs_tabs WHERE book=? AND gid=?').get(t.book,t.gid)?.title||null;}}));
 const lazy={spreadsheets:{values:{}}};
 for(const method of ['get','batchUpdate'])lazy.spreadsheets[method]=args=>local().route(remote,book,extras).spreadsheets[method](args);
 for(const method of ['get','update','append','batchUpdate','clear','batchGet'])lazy.spreadsheets.values[method]=args=>local().route(remote,book,extras).spreadsheets.values[method](args);
 return lazy;
}
let revisionMemo=null;
function revisions(){
 const db=local(),revision=db.revision();if(revisionMemo?.revision===revision)return revisionMemo.modules;
 const hash=rows=>require('node:crypto').createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,24),gid=(name,fallback)=>Number(process.env[name]||fallback);
 const rows=ids=>ids.flatMap(id=>db.db.prepare('SELECT gid,row_no,data FROM cbs_rows WHERE book=? AND gid=? ORDER BY row_no').all(book,id)).filter(r=>r.row_no>1);
 const passenger=rows([gid('CBS_SHEET_GID',0),gid('WRONG_BAGGAGE_SHEET_GID',1615438730)]),onhand=rows([gid('CBS_UNRESOLVED_BAGGAGE_SHEET_GID',523026916)]),modules={};
 const passengerStatus=entry=>{const v=JSON.parse(entry.data);if(entry.gid!==gid('CBS_SHEET_GID',0))return v[1];try{const events=JSON.parse(v[31]||'[]');return Array.isArray(events)?events.at(-1)?.status||v[1]:v[1];}catch{return v[1];}};
 for(const view of ['open','closed']){
  modules['passenger:'+view]=hash(passenger.filter(r=>/close|forward\s+to\s+mu/i.test(String(passengerStatus(r)||''))===(view==='closed')));
  for(const group of ['on-hand','bag-room'])modules[group+':'+view]=hash(onhand.filter(r=>{const values=JSON.parse(r.data),archived=Boolean(values[10])&&['on-hand-rush','shipped','passenger-collected','case-close','linked-passenger-file','change-type','expired'].includes(String(values[8]||'').toLowerCase()),bagRoom=[values[4],values[5]].some(v=>String(v||'').trim().toLowerCase()==='not load bags');return archived===(view==='closed')&&bagRoom===(group==='bag-room');}));
 }
 modules.rush=hash(rows([gid('CBS_WORLDTRACER_SHEET_GID',944289437)]));modules.missing=hash(rows([gid('CBS_MISSING_BAG_SHEET_GID',1145829442)]));modules.shipment=hash([...passenger,...onhand].filter(r=>/shipping|shipped/i.test(r.data)));
 const pending=new Map();for(const row of rows([gid('CBS_MISSING_BAG_SHEET_GID',1145829442)])){const v=JSON.parse(row.data);if(v[0])pending.set(v[0],Boolean(pending.get(v[0])||v[7]||v[8]));}const summary={rushMissingWorldTracer:rows([gid('CBS_WORLDTRACER_SHEET_GID',944289437)]).some(r=>{const v=JSON.parse(r.data);return !v[0]&&Boolean(v[1]);}),missingOpenCount:[...pending.values()].filter(v=>!v).length};revisionMemo={revision,modules,summary};return modules;
}

module.exports={book,related,local,localTitle,client,enabled,revisions,summary:()=>{revisions();return revisionMemo.summary;}};
