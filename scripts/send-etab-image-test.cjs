// Sends only the explicitly requested visual variants, without tagging staff or changing worker state.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
require('dotenv').config({quiet:true});
async function main(){
 const channelId=process.argv[2],gates=process.argv.slice(3);
 if(!/^\d{17,20}$/.test(channelId||'')||!gates.length||gates.some(g=>!['TBA','203'].includes(g)))throw Error('Usage: node scripts/send-etab-image-test.cjs <authorized-channel-id> TBA [203]');
 const {REST,Routes}=require('discord.js'),{mailBody}=require('../has/server/pbbEtab'),{parseAdvisory}=require('../etabAdvisory');
 const {gmail,userId}=require('../googleDrive').getNextDayInfoGmailClient();
 const listed=await gmail.users.messages.list({userId,q:'from:(LAXHMXH@hallmark-aviation.com OR laxhm21@gmail.com) subject:ETAB newer_than:3d',maxResults:15},{timeout:15000});
 const candidates=[];
 for(const m of listed.data.messages||[]){const full=(await gmail.users.messages.get({userId,id:m.id,format:'full'},{timeout:15000})).data;const received=Number(full.internalDate),advisory=parseAdvisory(mailBody(full.payload),new Date(received));if(advisory)candidates.push({received,advisory});}
 candidates.sort((a,b)=>b.received-a.received);if(!candidates.length)throw Error('No valid ETAB mail for preview');
 const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN),channel=await rest.get(Routes.channel(channelId));
 for(const gate of gates){
  const base=candidates[0].advisory,advisory={...base,arrival:{...base.arrival,gate}};
  const image=await require('../etabImage').renderAdvisory(advisory);
  const digest=crypto.createHash('sha256').update(channelId+'|image-test|'+gate).update(image).digest('hex').slice(0,24);
  const sent=await rest.post(Routes.channelMessages(channelId),{body:{nonce:digest,enforce_nonce:true,allowed_mentions:{parse:[]}},files:[{name:'ETAB-'+gate+'-HD-test.png',data:image}]});
  const verified=await rest.get(Routes.channelMessage(channelId,sent.id));
  const dir=process.env.ETAB_TEST_OUTPUT_DIR;if(dir)fs.writeFileSync(path.join(dir,'etab-'+gate+'-hd-test.png'),image);
  console.log(JSON.stringify({gate,id:sent.id,url:'https://discord.com/channels/'+channel.guild_id+'/'+channelId+'/'+sent.id,attachments:verified.attachments.map(a=>({width:a.width,height:a.height})),mentions:verified.mentions.length}));
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
