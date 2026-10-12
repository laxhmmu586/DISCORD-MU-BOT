const { evaluateVisa } = require('./visaEngine');
const crypto = require('node:crypto');
let store;
const recorded = new Set();
function setVisaStore(value){store=value;recorded.clear();}
function checkVisa(input){
  try{
    const result=evaluateVisa(input,store);
    if(store)try{
      const digest=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const key=crypto.createHash('sha256').update(digest+JSON.stringify(result)).digest('hex');
      if(!recorded.has(key)){
        if(result.requirement==='unknown'&&/^[A-Z]{3}$/.test(input.nationality||'')&&/^[A-Z]{3}$/.test(input.destinationCountry||'')&&input.nationality!=='UNK'&&input.destinationCountry!=='UNK'){
          const now=new Date().toISOString();
          store.db.prepare(`INSERT INTO visa_unknown_combinations VALUES(?,?,?,?,?,1,'pending')
            ON CONFLICT(nationality,destination_country,passport_type) DO UPDATE SET last_seen_at=excluded.last_seen_at,occurrences=occurrences+1,status='pending'`).run(input.nationality,input.destinationCountry,input.passportType||'unknown',now,now);
        }
        store.db.prepare('INSERT INTO visa_decisions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),new Date().toISOString(),input.travelDate||'',result.engineVersion,digest,JSON.stringify(result.rules),result.status,JSON.stringify(result.reasonCodes),JSON.stringify(result.missingFields),JSON.stringify(result.sources.map(s=>s.id)),result.manualOverride?JSON.stringify(result.manualOverride):null);
        if(recorded.size>=1000)recorded.clear();recorded.add(key);
      }
    }catch{/* Audit persistence failures must not change an already determined visa decision. */}
    return result;
  }catch{return {status:'review',reason:'Visa rule service unavailable; manual review required',requirement:'unknown',inspection:'ambiguous',action:'double_check',possibleMissedCheck:false,reasonCodes:['SERVICE_UNAVAILABLE'],missingFields:[],rules:[],sources:[],engineVersion:'visa-2'};}
}
module.exports={setVisaStore,checkVisa};
