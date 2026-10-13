const path=require('node:path');
const TIME_ZONE='America/Los_Angeles';
function cutoffDate(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
 // A catch-up run before 04:00 must still retain yesterday's active forms.
 if(Number(parts.hour)<4)day.setUTCDate(day.getUTCDate()-1);
 return day.toISOString().slice(0,10);
}
function prune(db,now=new Date()){
 const cutoff=cutoffDate(now);
 const deleted=db.prepare("DELETE FROM pbb_records WHERE json_extract(data,'$.date') < ?").run(cutoff).changes;
 return {cutoff,timeZone:TIME_ZONE,deleted};
}
if(require.main===module){
 const Database=require('better-sqlite3'),fs=require('node:fs');
 const filename=process.env.PBB_DB_PATH||path.resolve(__dirname,'../data/pbb.db');
 if(!fs.existsSync(filename))throw Error('PBB database does not exist: '+filename);
 const db=new Database(filename,{fileMustExist:true,timeout:15000});
 try{console.log(JSON.stringify(prune(db)));}finally{db.close();}
}
module.exports={TIME_ZONE,cutoffDate,prune};
