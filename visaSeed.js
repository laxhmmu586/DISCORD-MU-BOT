const catalog=require('./visaPolicyCatalog');
function seedCandidates(store,now=new Date()) {
  const results=[];
  for(const definition of catalog.rules) {
    const sourceIds=definition.sourceKeys.map(k=>catalog.sources[k].id);
    if(definition.sourceKeys.some(k=>store.db.prepare('SELECT latest_source_id FROM visa_monitors WHERE url=?').get(catalog.sources[k].url)?.latest_source_id!==catalog.sources[k].id)) {
      results.push({nationality:definition.nationality,pending:'Fetch the reviewed official snapshot; changed content requires a new review'});continue;
    }
    const {sourceKeys,...input}=definition;
    const latest=store.db.prepare('SELECT * FROM visa_rules WHERE id=? ORDER BY version DESC LIMIT 1').get(input.id);
    if(latest&&latest.status!=='superseded'&&latest.conditions_json===JSON.stringify(input.conditions)&&latest.rule_type===input.rule_type&&latest.effective_from===input.effective_from&&latest.effective_until===input.effective_until&&latest.recheck_due_at===input.recheck_due_at&&
      JSON.stringify(store.ruleSources(latest).map(s=>s.id).sort())===JSON.stringify([...sourceIds].sort()))continue;
    // Operator-created versions take precedence over the shipped baseline.
    if(latest?.reviewed_by&&latest.reviewed_by!==catalog.reviewer&&latest.reviewed_by!=='Official source verification, 2026-10-12')continue;
    results.push(store.draft(input,sourceIds,now.toISOString()));
  }
  return results;
}
function publishVerifiedBaseline(store,now=new Date()) {
  for(const definition of catalog.rules) {
    const rule=store.db.prepare("SELECT * FROM visa_rules WHERE id=? AND status='draft' ORDER BY version DESC LIMIT 1").get(definition.id);
    if(!rule||rule.nationality!==definition.nationality||rule.destination_country!==definition.destination_country||rule.passport_type!==definition.passport_type||rule.rule_type!==definition.rule_type||
      rule.conditions_json!==JSON.stringify(definition.conditions)||rule.effective_from!==definition.effective_from||rule.effective_until!==definition.effective_until||rule.recheck_due_at!==definition.recheck_due_at)continue;
    const expected=definition.sourceKeys.map(k=>catalog.sources[k].id).sort();
    const sources=store.ruleSources(rule);
    if(JSON.stringify(sources.map(s=>s.id).sort())!==JSON.stringify(expected)||sources.some(s=>s.latest_source_id!==s.id))continue;
    try{store.approve(rule.id,rule.version,catalog.reviewer,now.toISOString());}catch{/* Stale/expired baselines remain in review. */}
  }
  // The initial inventory was reviewed with the original 30 China combinations.
  // Later destination/document additions must not hold their inventory hostage.
  const initialRules=catalog.rules.filter(d=>d.destination_country==='CHN'&&!d.id.startsWith('chn-entry-')&&!['BRA','ARM'].includes(d.nationality));
  if(!store.db.prepare("SELECT 1 FROM visa_metadata WHERE key='initial_notice_inventory'").get()&&initialRules.every(d=>store.db.prepare("SELECT 1 FROM visa_rules WHERE id=? AND status='approved' AND reviewed_by=?").get(d.id,catalog.reviewer))) {
    const inventory=require('./visaPolicyInventory.json');
    store.db.transaction(()=>{
      for(const notice of store.overview().notices) {
        const source=store.db.prepare('SELECT latest_source_id FROM visa_monitors WHERE url=?').get(notice.url)?.latest_source_id;
        if(inventory.sourceIds.includes(source))store.acknowledgeNotice(notice.url,'Initial official announcement inventory, '+inventory.reviewedAt,now.toISOString());
      }
      if(inventory.snapshots.every(s=>store.db.prepare('SELECT latest_source_id FROM visa_monitors WHERE url=?').get(s.url)?.latest_source_id))store.db.prepare("INSERT INTO visa_metadata VALUES('initial_notice_inventory',?)").run(now.toISOString());
    })();
  }
}
module.exports={seedCandidates,publishVerifiedBaseline};
