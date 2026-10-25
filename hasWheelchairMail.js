const ZONE='America/Los_Angeles';
const TO='laurence.chai@chinaeastern-usa.com',CC='lake.xia@hallmark-aviation.com';
function period(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',hourCycle:'h23'}).formatToParts(now),get=k=>Number(parts.find(p=>p.type===k).value);
 const year=get('year'),month=get('month'),day=get('day');
 // Latest due period also catches a missed run after a server restart.
 const firstHalf=day>16||day===16&&get('hour')>=9;
 const secondHalf=!firstHalf&&(day>1||get('hour')>=9);
 const date=new Date(Date.UTC(year,month-1-(firstHalf?0:1),1));
 if(!firstHalf&&!secondHalf)return make(date,1,15);
 return make(date,firstHalf?1:16,firstHalf?15:new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate());
}
function make(date,start,end){const month=date.toISOString().slice(0,7),label=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long'}).format(date)+' '+start+'–'+end+', '+date.getUTCFullYear();return {month,start,end,label,key:month+':'+start};}
function count(model,values,range){
 let arrival=0,departure=0;
 for(const day of model.days){if(day.day<range.start||day.day>range.end)continue;for(let r=day.start;r<=day.end;r++)for(const [column,kind] of [['O','arrival'],['P','departure']]){
  const raw=values[column+r];if(raw==null||raw==='')continue;const n=Number(raw);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid wheelchair count at '+column+r);
  if(kind==='arrival')arrival+=n;else departure+=n;
 }}return {arrival,departure,total:arrival+departure};
}
function message(range,counts){return {to:TO,cc:CC,subject:'Wheelchair count summary for '+range.label,text:'Hello Laurence,\n\nI hope this message finds you well.\n\nPlease find below the summary of wheelchair orders for '+range.label+'.\n\nArrival: '+counts.arrival+'\nDeparture: '+counts.departure+'\nTotal: '+counts.total+'\n\nIf you require any further information or assistance, please feel free to reach out.\n\nThank you,\nLAX MU REPORT (BOT)'};}
async function send(message,key){
 const {gmail,userId}=require('./googleDrive').getNextDayInfoGmailClient(),id='<wheelchair-'+key.replace(/[^\w-]/g,'-')+'@mufcapp.net>';
 // Reconcile a previous send whose acknowledgement was lost.
 const existing=await gmail.users.messages.list({userId,q:'in:sent rfc822msgid:'+id.slice(1,-1),maxResults:1},{timeout:30000});
 if(existing.data.messages?.length)return existing.data.messages[0].id;
 const raw=['From: LAXHMMU PAX BOT <'+(userId==='me'?'laxhmmu@gmail.com':userId)+'>','To: '+TO,'Cc: '+CC,'Message-ID: '+id,'Subject: =?UTF-8?B?'+Buffer.from(message.subject).toString('base64')+'?=','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(message.text).toString('base64')].join('\r\n');
 const result=await gmail.users.messages.send({userId,requestBody:{raw:Buffer.from(raw).toString('base64url')}},{timeout:30000,retry:false});
 if(!result.data.id)throw Error('No Gmail delivery acknowledgement');return result.data.id;
}
function createMailer({database,read,template,sendEmail=send,now=()=>new Date()}){
 let busy=false,timer;
 async function tick(){if(busy)return;busy=true;let db,range,claimed=false;try{
  range=period(now());if(range.month<'2026-01')return;db=database();
  db.exec('CREATE TABLE IF NOT EXISTS has_wheelchair_mail(period TEXT PRIMARY KEY,state TEXT NOT NULL,attempted INTEGER NOT NULL,message_id TEXT)');
  if(db.prepare('SELECT state FROM has_wheelchair_mail WHERE period=?').get(range.key)?.state==='sent')return;
  const scope={station:'LAX',account:'MU'},saved=read(scope,'da',range.month);
  // Never report an absent DA as a zero-count report.
  if(!saved.updatedAt)return;
  const model=await template('da',range.month,scope,saved.extraRows),counts=count(model,saved.values,range);
  const stamp=Date.now();claimed=Boolean(db.prepare("INSERT INTO has_wheelchair_mail(period,state,attempted) VALUES(?,'sending',?) ON CONFLICT(period) DO UPDATE SET state='sending',attempted=excluded.attempted WHERE state!='sent' AND attempted<?").run(range.key,stamp,stamp-15*60000).changes);
  if(!claimed)return;const id=await sendEmail(message(range,counts),range.key);
  db.prepare("UPDATE has_wheelchair_mail SET state='sent',message_id=? WHERE period=?").run(id,range.key);
 }catch(error){console.error('Wheelchair summary email:',error);}finally{busy=false;}}
 return {tick,start(){if(timer)return;void tick();timer=setInterval(()=>void tick(),60000);timer.unref?.();},close(){clearInterval(timer);timer=null;}};
}
module.exports={period,count,message,createMailer};
