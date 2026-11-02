'use strict';
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const types = ['vip', 'psmMsg', 'inad', 'salesDetails'];
class ReportStore {
  constructor(filename) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), {recursive:true});
    this.db = new Database(filename, {timeout:5000});
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS report_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS report_records(type TEXT NOT NULL,key TEXT NOT NULL,date TEXT NOT NULL,flight TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(type,key));
      CREATE INDEX IF NOT EXISTS report_date ON report_records(type,date,flight);
      CREATE TABLE IF NOT EXISTS report_sources(key TEXT PRIMARY KEY,hash TEXT NOT NULL,checked_at TEXT NOT NULL);
      INSERT OR IGNORE INTO report_meta VALUES('revision','0');`);
    if(!this.db.prepare('PRAGMA table_info(report_records)').all().some(c=>c.name==='identity'))this.db.exec("ALTER TABLE report_records ADD COLUMN identity TEXT NOT NULL DEFAULT ''; CREATE INDEX IF NOT EXISTS report_identity ON report_records(type,identity);");
  }
  ready() { if (!this.db.prepare("SELECT 1 FROM report_meta WHERE key='imported'").get()) throw Error('Report database import has not been verified.'); }
  revision(type) {return this.db.prepare('SELECT value FROM report_meta WHERE key=?').get(type?'revision:'+type:'revision')?.value||'0';}
  bump(type) {
    this.db.prepare("UPDATE report_meta SET value=CAST(value AS INTEGER)+1 WHERE key='revision'").run();
    this.db.prepare("INSERT INTO report_meta VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1").run('revision:'+type);
  }
  put(type, rows, {importing=false}={}) {
    if (!types.includes(type)) return {appended:0, updated:0};
    return this.db.transaction(() => {
      let appended=0, updated=0;
      const get=this.db.prepare('SELECT key,data FROM report_records WHERE type=? AND key=?');
      const matching=this.db.prepare('SELECT key,data FROM report_records WHERE type=? AND identity=? LIMIT 2');
      const put=this.db.prepare('INSERT OR REPLACE INTO report_records(type,key,date,flight,data,identity) VALUES(?,?,?,?,?,?)');
      for (const input of rows) {
        if (String(input.key||'').startsWith('__SCAN__') || input.passenger==='__SCAN_COMPLETE__') continue;
        const row={...input};
        let key=String(row.key || [row.flightDate||row.date,row.flightNo,row.passenger].join('|')).trim().toUpperCase();
        const identity=(type==='salesDetails'?[row.date,row.emd,row.type,row.flightNo,row.reportDate]:type==='inad'?[row.date,row.flightNo,row.passenger,row.bn,row.service]:[key]).map(v=>String(v||'').trim().toUpperCase()).join('|');
        let old=get.get(type,key);
        if(!old&&!importing&&['salesDetails','inad'].includes(type)){const matches=matching.all(type,identity);if(matches.length===1){old=matches[0];key=old.key;row.key=key;}}
        const previous=old?JSON.parse(old.data):null;
        if (previous) {row.recordedAt=previous.recordedAt; if(type==='psmMsg')row.remark=previous.remark||'';}
        const data=JSON.stringify(row);
        if (old?.data===data) continue;
        put.run(type,key,row.date||'',row.flightNo||'',data,identity);
        old?updated++:appended++;
      }
      if(appended+updated)this.bump(type);
      return {appended,updated,stored:appended+updated,source:'sqlite'};
    })();
  }
  query(type,{from='',to='',flight=''}={}) {
    this.ready();
    const conditions=['type=?'],args=[type];
    if(from){conditions.push('date>=?');args.push(from);}
    if(to){conditions.push('date<=?');args.push(to);}
    if(flight){conditions.push('flight=?');args.push(flight);}
    return this.db.prepare('SELECT data FROM report_records WHERE '+conditions.join(' AND ')+' ORDER BY date,flight,key').all(...args).map(r=>JSON.parse(r.data));
  }
  remark(key,remark) {
    this.ready();
    return this.db.transaction(()=>{
      const id=String(key).trim().toUpperCase(), old=this.db.prepare("SELECT data FROM report_records WHERE type='psmMsg' AND key=?").get(id);
      if(!old)return {updated:false,notFound:true};
      const row=JSON.parse(old.data); if((row.remark||'')===remark)return {updated:true,remark};
      row.remark=remark;
      this.db.prepare("UPDATE report_records SET data=? WHERE type='psmMsg' AND key=?").run(JSON.stringify(row),id);
      this.bump('psmMsg');
      return {updated:true,remark};
    })();
  }
  sync(key,rows,write) {
    this.ready();
    const hash=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    if(this.db.prepare('SELECT hash FROM report_sources WHERE key=?').get(key)?.hash===hash)return {appended:0,updated:0,unchanged:true};
    return this.db.transaction(()=>{const result=write();this.db.prepare('INSERT OR REPLACE INTO report_sources VALUES(?,?,?)').run(key,hash,new Date().toISOString());return result;})();
  }
}
let singleton;
module.exports={ReportStore,types,local:()=>singleton ||= new ReportStore(process.env.REPORT_SQLITE_PATH||path.join(__dirname,'data','reports.db'))};
