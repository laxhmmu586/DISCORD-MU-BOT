// Explicit operator-only test delivery. A separate per-channel state prevents duplicate test advisories.
const path=require('node:path');
require('dotenv').config({quiet:true});
async function main(){
 const channelId=process.argv[2];if(!/^\d{17,20}$/.test(channelId||''))throw Error('Usage: node scripts/send-etab-test.cjs <authorized-test-channel-id>');
 const testTba=process.argv.includes('--tba');
 const revision=process.argv.find(a=>a.startsWith('--revision='))?.slice(11)||'';
 if(revision && !/^[a-z0-9-]{1,40}$/.test(revision))throw Error('Invalid test revision');
 const {REST,Routes}=require('discord.js'),Database=require('better-sqlite3');
 const gd=require('../googleDrive'),{createAdvisoryService,createStateStore}=require('../etabAdvisory');
 const root=path.resolve(__dirname,'..'),dataDir=path.dirname(process.env.PBB_DB_PATH||path.join(root,'data/pbb.db'));
 const employeeDb=new Database(process.env.PBB_EMPLOYEE_DB_PATH||path.join(dataDir,'EP.DB'),{readonly:true,fileMustExist:true});
 const stateDb=new Database(path.join(dataDir,'etab-test-'+channelId+(testTba?'-tba':'')+(revision?'-'+revision:'')+'.db'));
 try{
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  const channel=await rest.get(Routes.channel(channelId));console.log(JSON.stringify({testChannel:channel.id,name:channel.name,gateOverride:testTba?'TBA':null}));
  const store=createStateStore(stateDb);let failed=false;
  const service=createAdvisoryService({getClient:gd.getNextDayInfoGmailClient,readSchedule:gd.readEtabSchedule,nonceScope:(testTba?'test-tba':'test-original')+(revision?':'+revision:''),
   getEmployees:()=>JSON.parse(employeeDb.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data).employees,
   channel:async()=>({id:channelId,send:payload=>rest.post(Routes.channelMessages(channelId),{body:{content:testTba?payload.content.replace(/(GATE:)\S+/,'$1TBA').replace(/\n# 🚨 MSC GATE OPERATION$/,''):payload.content,nonce:payload.nonce,enforce_nonce:payload.enforceNonce,allowed_mentions:payload.allowedMentions}})}),
   store,log:{info:console.log,error:(...a)=>{failed=true;console.error(...a);}}
  });
  await service.tick();if(failed)throw Error('ETAB test failed; partial delivery state retained for retry');
  const state=store.get();if(!state.lastAdvisoryId)throw Error('No completed ETAB text advisory in test state');
  for(const id of [state.lastAdvisoryId]){
   const message=await rest.get(Routes.channelMessage(channelId,id));
   console.log(JSON.stringify({messageId:id,channelId:message.channel_id,content:message.content,attachments:message.attachments?.map(a=>({filename:a.filename,width:a.width,height:a.height})),mentionCount:message.mentions?.length}));
  }
 }finally{employeeDb.close();stateDb.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
