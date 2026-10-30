// Read-only deployment preflight. Uses existing server credentials, never prints tokens or mail bodies.
const path=require('node:path');
require('dotenv').config({quiet:true});
const root=path.resolve(__dirname,'..');
const {parseAdvisory,arrivalTeam,localDate,buildDiscordPayload}=require('../etabAdvisory');
const {mailBody}=require('../has/server/pbbEtab');
async function main(){
 const gd=require('../googleDrive'),{gmail,userId,authMode}=gd.getNextDayInfoGmailClient();
 const profile=await gmail.users.getProfile({userId},{timeout:15000});
 console.log(JSON.stringify({check:'gmail',mailbox:profile.data.emailAddress,authMode}));
 const dbPath=process.env.PBB_EMPLOYEE_DB_PATH||path.join(path.dirname(process.env.PBB_DB_PATH||path.join(root,'data/pbb.db')),'EP.DB');
 const Database=require('better-sqlite3'),db=new Database(dbPath,{readonly:true,fileMustExist:true});
 let employees;
 try{employees=JSON.parse(db.prepare('SELECT data FROM pbb_employees WHERE singleton=1').get().data).employees;}finally{db.close();}
 console.log(JSON.stringify({check:'admin-employees',count:employees.length,withDiscordId:employees.filter(e=>/^\d{17,20}$/.test(e.discordId||'')).length}));
 const schedule=await gd.readEtabSchedule();
 const listed=await gmail.users.messages.list({userId,q:'from:(LAXHMXH@hallmark-aviation.com OR laxhm21@gmail.com) subject:ETAB newer_than:3d',maxResults:15},{timeout:15000});
 const advisories=[];
 for(const item of listed.data.messages||[]){
  const full=await gmail.users.messages.get({userId,id:item.id,format:'full'},{timeout:15000});
  const received=Number(full.data.internalDate),parsed=parseAdvisory(mailBody(full.data.payload),new Date(received));
  if(parsed)advisories.push({received,messageId:item.id,...parsed});
 }
 advisories.sort((a,b)=>b.received-a.received);
 if(!advisories.length)throw Error('No valid ETAB email found in the last three days');
 const latest=advisories[0],ids=arrivalTeam(schedule,latest.date,employees);
 console.log(JSON.stringify({check:'latest-etab',messageId:latest.messageId,receivedAt:new Date(latest.received).toISOString(),date:latest.date,arrival:latest.arrival,departure:latest.departure,arrivalTeamCount:ids.length}));
 const dates=[...new Set([latest.date,localDate(new Date())])];
 for(const date of dates){try{console.log(JSON.stringify({check:'schedule',date,arrivalTeamCount:arrivalTeam(schedule,date,employees).length}));}catch(e){if(date===latest.date)throw e;console.log(JSON.stringify({check:'schedule',date,warning:e.message}));}}
 const channelId=process.env.ETAB_DISCORD_CHANNEL_ID||'1252026975720046655';
 const channel=await fetch('https://discord.com/api/v10/channels/'+channelId,{headers:{Authorization:'Bot '+process.env.DISCORD_TOKEN},signal:AbortSignal.timeout(15000)});
 if(!channel.ok)throw Error('Discord channel lookup failed: '+channel.status);
 const info=await channel.json();console.log(JSON.stringify({check:'discord-channel',id:info.id,name:info.name,type:info.type}));
 const content=buildDiscordPayload(latest,ids.map(id=>`<@${id}>`).join(' '));
 if(content.length>2000)throw Error('ETAB text exceeds the Discord message limit');
 console.log(JSON.stringify({check:'text-format',characters:content.length,arrivalTeamCount:ids.length,mscWarning:content.includes('# 🚨 MSC GATE OPERATION')}));
}
main().catch(e=>{console.error('ETAB preflight failed:',e.message);process.exitCode=1;});
