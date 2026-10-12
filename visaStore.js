const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { policies, feeds, officialUrl } = require('./visaSources');
const hash = value => createHash('sha256').update(value).digest('hex');
const validDate = s => {if(!/^\d{4}-\d{2}-\d{2}$/.test(s || ''))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
class VisaStore {
  constructor(filename = path.join(__dirname,'data','visa.db')) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), {recursive:true});
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(fs.readFileSync(path.join(__dirname,'docs','visa-rule-engine-schema.sql'),'utf8'));
    this.db.exec(fs.readFileSync(path.join(__dirname,'docs','visa-coverage-priorities-2026-10-12.sql'),'utf8'));
    this.db.prepare("DELETE FROM visa_monitors WHERE url='https://cs.mfa.gov.cn/lgk1/' AND kind='feed'").run();
    for(const url of ['https://cs.mfa.gov.cn/gyls/lsgz/fwxx/202511/t20251110_11749824.shtml','https://travel.state.gov/en/international-travel/travel-advisories/china.html'])this.db.prepare('DELETE FROM visa_monitors WHERE url=? AND latest_source_id IS NULL').run(url);
    const insert = this.db.prepare('INSERT OR IGNORE INTO visa_monitors(url,kind,authority) VALUES(?,?,?)');
    for (const s of [...feeds,...policies]) insert.run(s.url,s.kind,s.authority);
  }
  overview() {
    return {
      coverage: this.db.prepare('SELECT * FROM visa_coverage ORDER BY observed_count DESC').all(),
      unknownCombinations: this.db.prepare("SELECT * FROM visa_unknown_combinations WHERE status='pending' ORDER BY last_seen_at DESC").all(),
      rules: this.db.prepare('SELECT * FROM visa_rules ORDER BY id,version DESC').all().map(r=>({...r,conditions:JSON.parse(r.conditions_json),sources:this.ruleSources(r)})),
      monitors:this.db.prepare('SELECT * FROM visa_monitors').all(),
      notices:this.db.prepare('SELECT * FROM visa_notices WHERE status=? ORDER BY discovered_at DESC').all('pending'),
      sources:this.db.prepare('SELECT id,authority,url,published_at,fetched_at,review_status FROM visa_sources ORDER BY fetched_at DESC').all()
    };
  }
  ruleSources(rule) {
    return this.db.prepare(`SELECT s.*,r.clause_reference,m.latest_source_id,m.last_success_at,m.last_error
      FROM visa_rule_sources r JOIN visa_sources s ON s.id=r.source_id LEFT JOIN visa_monitors m ON m.url=s.url
      WHERE r.rule_id=? AND r.rule_version=?`).all(rule.id,rule.version).map(({content,...s})=>s);
  }
  activeRules(nationality,destination,travelDate) {
    const candidates=this.db.prepare(`SELECT * FROM visa_rules WHERE status IN ('approved','superseded') AND nationality=? AND destination_country=?
      ORDER BY version DESC`).all(nationality,destination);
    // A future extension must not prematurely remove the currently effective version.
    // Never fall back to an older overlapping version after a newer effective version expires.
    const selected=new Map();
    for(const r of candidates)if(!selected.has(r.id)&&(!travelDate||r.effective_from<=travelDate))selected.set(r.id,r);
    const rules=[...selected.values()];
    const overrides=new Set(rules.filter(r=>r.id===`reviewed-${destination}-${nationality}-${r.passport_type}`.toLowerCase()).map(r=>r.passport_type));
    return rules.filter(r=>!overrides.has(r.passport_type)||r.id===`reviewed-${destination}-${nationality}-${r.passport_type}`.toLowerCase()).map(r=>({...r,conditions:JSON.parse(r.conditions_json),sources:this.ruleSources(r)}));
  }
  snapshot(monitor,content,now) {
    const id=hash(monitor.url+'\n'+content);
    const old=this.db.prepare('SELECT latest_source_id FROM visa_monitors WHERE url=?').get(monitor.url);
    this.db.transaction(()=>{
      this.db.prepare(`INSERT OR IGNORE INTO visa_sources(id,authority,url,fetched_at,content_sha256,snapshot_path,content,review_status)
        VALUES(?,?,?,?,?,?,?,'draft')`).run(id,monitor.authority,monitor.url,now,hash(content),'sqlite:'+id,content);
      this.db.prepare('UPDATE visa_sources SET fetched_at=? WHERE id=?').run(now,id);
      this.db.prepare('UPDATE visa_monitors SET latest_source_id=?,last_attempt_at=?,last_success_at=?,last_error=NULL WHERE url=?').run(id,now,now,monitor.url);
    })();
    return {id,changed:!!old?.latest_source_id && old.latest_source_id!==id};
  }
  draft(input,sourceIds,now=new Date().toISOString()) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(input.id || '') || !/^[A-Z]{3}$/.test(input.nationality || '') ||
        !/^[A-Z]{3}$/.test(input.destination_country || '') || !['visa_exempt','visa_document','citizen_return','special_document','residence_document'].includes(input.rule_type) || input.passport_type !== 'ordinary') throw Error('Invalid rule identity or type');
    if (!validDate(input.effective_from) || (input.effective_until && !validDate(input.effective_until)) || !validDate(input.recheck_due_at) ||
      (input.effective_until && input.effective_until<input.effective_from)) throw Error('Invalid rule dates');
    const c=input.conditions;
    if (['special_document','residence_document'].includes(input.rule_type) ? !c||Object.keys(c).some(k=>!['documentType','issuer'].includes(k))||!['TBZ','PRCARD','TRAVELDOC'].includes(c.documentType)||!/^[A-Z]{3}$/.test(c.issuer||'') : ['visa_document','citizen_return'].includes(input.rule_type) ? !c||Object.keys(c).length!==0 : !c || Object.keys(c).some(k=>!['maxStayDays','purposes','cumulativeDays','cumulativeWindowDays'].includes(k)) ||
        !Number.isInteger(c.maxStayDays) || c.maxStayDays<1 || c.maxStayDays>365 || !Array.isArray(c.purposes) || !c.purposes.length ||
        c.purposes.some(p=>!['tourism','business','visit','exchange','transit','private','medical','transport'].includes(p)) ||
        (c.cumulativeDays !== undefined && (!Number.isInteger(c.cumulativeDays)||c.cumulativeDays<1||!Number.isInteger(c.cumulativeWindowDays)||c.cumulativeWindowDays<1))) throw Error('Invalid fixed rule conditions');
    if (!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.length>8)throw Error('Official snapshots required');
    for(const id of sourceIds) {
      const s=this.db.prepare('SELECT * FROM visa_sources WHERE id=?').get(id);
      if(!s||!officialUrl(s.url)||this.db.prepare('SELECT kind FROM visa_monitors WHERE url=?').get(s.url)?.kind!=='policy')throw Error('Unknown official policy snapshot');
    }
    return this.db.transaction(()=>{
      const version=this.db.prepare('SELECT COALESCE(MAX(version),0)+1 AS n FROM visa_rules WHERE id=?').get(input.id).n;
      this.db.prepare(`INSERT INTO visa_rules(id,version,nationality,destination_country,passport_type,rule_type,conditions_json,effective_from,effective_until,verified_at,recheck_due_at,status)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'draft')`).run(input.id,version,input.nationality,input.destination_country,input.passport_type,input.rule_type,JSON.stringify(c),input.effective_from,input.effective_until||null,now,input.recheck_due_at);
      for(const id of sourceIds)this.db.prepare('INSERT INTO visa_rule_sources VALUES(?,?,?,?)').run(input.id,version,id,String(input.clause_reference||'Reviewed policy conditions').slice(0,500));
      return {id:input.id,version};
    })();
  }
  approve(id,version,reviewer,now=new Date().toISOString()) {
    if(!String(reviewer||'').trim())throw Error('Reviewer name required');
    const rule=this.db.prepare("SELECT * FROM visa_rules WHERE id=? AND version=? AND status='draft'").get(id,version);
    if(!rule)throw Error('Draft rule not found');
    const sources=this.ruleSources(rule);
    if(!sources.length||sources.some(s=>s.latest_source_id!==s.id||!s.last_success_at||Date.parse(now)-Date.parse(s.last_success_at)>72*3600000))throw Error('Fetch current official sources before approval');
    if(rule.rule_type==='visa_exempt'){
      const catalog=require('./visaPolicyCatalog');
      const baseline=catalog.rules.find(r=>r.nationality===rule.nationality&&r.destination_country===rule.destination_country&&r.passport_type===rule.passport_type&&r.rule_type==='visa_exempt');
      const knownIds=Object.values(catalog.sources).map(s=>s.id);
      if(baseline&&sources.every(s=>knownIds.includes(s.id))){
        const c=JSON.parse(rule.conditions_json),expected=baseline.conditions;
        if((baseline.effective_until&&(!rule.effective_until||rule.effective_until>baseline.effective_until))||c.maxStayDays>expected.maxStayDays||c.purposes.some(p=>!expected.purposes.includes(p))||
          (expected.cumulativeDays&&(c.cumulativeDays===undefined||c.cumulativeDays>expected.cumulativeDays||c.cumulativeWindowDays!==expected.cumulativeWindowDays)))throw Error('Rule exceeds the limits of the reviewed official policy');
      }
    }
    if(rule.recheck_due_at<now.slice(0,10)||(rule.effective_until&&rule.effective_until<now.slice(0,10)))throw Error('Cannot approve expired rule');
    this.db.transaction(()=>{
      this.db.prepare("UPDATE visa_rules SET status='superseded' WHERE id=? AND status='approved'").run(id);
      this.db.prepare("UPDATE visa_rules SET status='approved',reviewed_by=?,reviewed_at=?,verified_at=? WHERE id=? AND version=?").run(reviewer,now,now,id,version);
      for(const s of sources)this.db.prepare("UPDATE visa_sources SET review_status='approved',reviewed_by=?,reviewed_at=? WHERE id=?").run(reviewer,now,s.id);
      this.db.prepare("UPDATE visa_coverage SET coverage_status='enabled' WHERE nationality=? AND destination_country=?").run(rule.nationality,rule.destination_country);
      this.db.prepare("INSERT OR IGNORE INTO visa_coverage VALUES(?,?,0,?,?,'enabled')").run(rule.nationality,rule.destination_country,now.slice(0,10),now.slice(0,10));
      this.db.prepare("UPDATE visa_unknown_combinations SET status='covered' WHERE nationality=? AND destination_country=? AND passport_type=?").run(rule.nationality,rule.destination_country,rule.passport_type);
    })();
  }
  acknowledgeNotice(url,reviewer,now) {
    if(!reviewer)throw Error('Reviewer name required');
    const result=this.db.prepare("UPDATE visa_notices SET status='reviewed',reviewed_by=?,reviewed_at=? WHERE url=? AND status='pending'").run(reviewer,now,url);
    if(!result.changes)throw Error('Pending notice not found');
  }
  close(){this.db.close();}
}
module.exports={VisaStore,hash,validDate};
