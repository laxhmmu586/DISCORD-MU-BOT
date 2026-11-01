const model=require('../public/charge-form-model');
function createChargeForm({db,now=()=>new Date(),getLog=()=>require('../../googleDrive').getLatestFlightLog()}){
 db.exec('CREATE TABLE IF NOT EXISTS briefing_charge_prices(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT,updated_by TEXT)');
 db.prepare('INSERT OR IGNORE INTO briefing_charge_prices VALUES(1,0,?,NULL,NULL)').run(JSON.stringify(model.defaults));
 const read=()=>{const row=db.prepare('SELECT * FROM briefing_charge_prices WHERE id=1').get();return {revision:row.revision,prices:JSON.parse(row.data),updatedAt:row.updated_at,updatedBy:row.updated_by};};
 const save=db.transaction((body,access)=>{
  const current=read(),keys=Object.keys(model.defaults),prices=body.prices;
  if(!prices||Array.isArray(prices)||typeof prices!=='object'||Object.keys(prices).length!==keys.length||keys.some(key=>!Object.hasOwn(prices,key)||typeof prices[key]!=='number'||!Number.isFinite(prices[key])||prices[key]<0||prices[key]>1000000||Math.abs(prices[key]*100-Math.round(prices[key]*100))>0.000001))throw Object.assign(Error('Enter a valid price for each item (up to two decimals).'),{status:400});
  if(body.revision!==current.revision)throw Object.assign(Error('Prices changed. Reopen Charge Form before saving.'),{status:409});
  const at=now().toISOString();db.prepare('UPDATE briefing_charge_prices SET revision=revision+1,data=?,updated_at=?,updated_by=? WHERE id=1').run(JSON.stringify(prices),at,access.name);
  db.prepare('INSERT INTO briefing_audit(date,flight,field,before_value,after_value,employee_id,at) VALUES(NULL,NULL,?,?,?,?,?)').run('charge-prices',JSON.stringify(current.prices),JSON.stringify(prices),access.employeeId,at);return read();
 });
 const today=()=>require('../../etabAdvisory').localDate(now());
 db.exec('CREATE TABLE IF NOT EXISTS briefing_charge_exchange(date TEXT PRIMARY KEY,revision INTEGER NOT NULL,rate TEXT NOT NULL,source TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)');
 const readExchange=(date=today())=>{const row=db.prepare('SELECT * FROM briefing_charge_exchange WHERE date=?').get(date);return row?{status:'available',date,revision:row.revision,rate:row.rate,source:row.source}:{status:'unavailable',date,revision:0,rate:'',source:'XS FSC'};};
 const saveExchange=db.transaction((body,access)=>{
  const date=today(),rate=String(body.rate??'').trim(),current=readExchange(date);
  if(body.date!==date)throw Object.assign(Error('The day changed. Reopen Charge Form to load today’s exchange rate.'),{status:409});
  if(!/^\d+(?:\.\d{1,12})?$/.test(rate)||Number(rate)<=0||Number(rate)>100)throw Object.assign(Error('Enter a positive USD / CNY exchange rate.'),{status:400});
  if(body.revision!==current.revision)throw Object.assign(Error('Today’s exchange rate changed. Reload it before saving.'),{status:409});
  const at=now().toISOString();db.prepare('INSERT INTO briefing_charge_exchange VALUES(?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET revision=excluded.revision,rate=excluded.rate,source=excluded.source,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(date,current.revision+1,rate,'Manual',at,access.name);
  db.prepare('INSERT INTO briefing_audit(date,flight,field,before_value,after_value,employee_id,at) VALUES(?,NULL,?,?,?,?,?)').run(date,'charge-exchange',JSON.stringify(current),JSON.stringify({rate}),access.employeeId,at);return readExchange(date);
 });
 const pending=new Map();
 async function exchange(){
  const date=today(),saved=readExchange(date);if(saved.status==='available')return saved;
  if(!pending.has(date))pending.set(date,(async()=>{let timer;try{
   const log=await Promise.race([Promise.resolve().then(getLog),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FSC lookup timeout')),8000);})]);
   const rate=require('../../googleDrive').extractFscExchangeRate(log);
   if(rate&&Number(rate)>0&&today()===date)db.prepare('INSERT OR IGNORE INTO briefing_charge_exchange VALUES(?,1,?,?,?,?)').run(date,rate,'XS FSC',now().toISOString(),'XS FSC log');
  }catch{}finally{clearTimeout(timer);pending.delete(date);}return readExchange();})());
  return pending.get(date);
 }
 return {read,save,exchange,readExchange,saveExchange};
}
module.exports={createChargeForm};
