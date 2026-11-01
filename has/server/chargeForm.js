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
 let pending;
 async function exchange(){
  if(!pending)pending=Promise.resolve().then(getLog).then(log=>{const rate=require('../../googleDrive').extractFscExchangeRate(log);return rate&&Number(rate)>0?{status:'available',rate,source:'XS FSC'}:{status:'unavailable',rate:'',source:'XS FSC'};}).catch(()=>({status:'unavailable',rate:'',source:'XS FSC'})).finally(()=>{pending=null;});
  return pending;
 }
 return {read,save,exchange};
}
module.exports={createChargeForm};
