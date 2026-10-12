require('dotenv').config({quiet:true});
const {VisaStore}=require('../visaStore');
const {VisaMonitor}=require('../visaMonitor');
const {seedCandidates}=require('../visaSeed');
async function main(){
 const store=new VisaStore(process.env.VISA_DB_PATH);
 const monitor=new VisaMonitor(store,{onChange:e=>console.log('Visa policy attention:',JSON.stringify(e))});
 try{console.log(JSON.stringify({results:await monitor.check(),candidates:seedCandidates(store)},null,2));}finally{store.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
