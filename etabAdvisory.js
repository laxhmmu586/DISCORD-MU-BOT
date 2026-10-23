const crypto = require('node:crypto');
const { mailBody } = require('./pbbEtab');
const ZONE = 'America/Los_Angeles';
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function clockIn(eta) {
  const t = String(eta).padStart(4, '0'), h = Number(t.slice(0,2)), m = Number(t.slice(2));
  return String((h + (m <= 39 ? 23 : 24)) % 24).padStart(2,'0') + String(m <= 9 ? 15 : m <= 24 ? 30 : m <= 39 ? 45 : 0).padStart(2,'0') + 'L';
}
function localDate(time) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(time).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function intervalMs(time) {
  const hour = Number(new Intl.DateTimeFormat('en-US',{timeZone:ZONE,hour:'numeric',hourCycle:'h23'}).format(time));
  return (hour >= 21 || hour < 12 ? 5 : 15) * 60000;
}
function flightDate(day, month, received) {
  const year = Number(localDate(received).slice(0,4));
  const options = [year-1,year,year+1].map(y=>new Date(Date.UTC(y,MONTHS.indexOf(month),Number(day),12))).filter(d=>d.getUTCMonth()===MONTHS.indexOf(month)&&d.getUTCDate()===Number(day));
  if(!options.length)return null;
  options.sort((a,b)=>Math.abs(a-received)-Math.abs(b-received));
  return options[0].toISOString().slice(0,10);
}
function parseAdvisory(text, received = new Date()) {
  const raw = String(text || '').split(/Regards|\nOn .+wrote:|\n-{2,}\s*Forwarded/i)[0].replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').toUpperCase();
  const flights = [...raw.matchAll(/\b(MU\d{3,4})\s*[\/-]\s*(\d{2})([A-Z]{3})\b/g)];
  const arrival = flights.find(f=>/\bETA\s*[:\-]?\s*\d/.test(raw.slice(f.index,flights[flights.indexOf(f)+1]?.index || raw.length)));
  if (!arrival || !MONTHS.includes(arrival[3])) return null;
  const pos = flights.indexOf(arrival), a = raw.slice(arrival.index,flights[pos+1]?.index || raw.length);
  const departure = flights[pos+1], d = departure ? raw.slice(departure.index,flights[pos+2]?.index || raw.length) : '';
  const time = (body,label)=>{const m=body.match(new RegExp('\\b'+label+'\\s*[:\\-]?\\s*(\\d{3,4})L?\\b'));if(!m)return '';const t=m[1].padStart(4,'0');return Number(t.slice(0,2))<24 && Number(t.slice(2))<60 ? t+'L' : '';};
  const eta=time(a,'ETA'); if (!eta) return null;
  const gate=a.match(/\bGATE\s*[:\-]?\s*(TBA|\d{1,3}[A-Z]?|[A-Z]\d{1,3})\b/)?.[1] || 'TBA';
  const std=time(d,'STD'), etd=time(d,'ETD');
  const date=flightDate(arrival[2],arrival[3],received);if(!date)return null;
  const departureDate = departure && `${departure[2]}${departure[3]}`;
  return {date,arrival:{flight:arrival[1],gate,eta,clockIn:clockIn(eta.slice(0,4)),reg:a.match(/\bB-\d{3,4}\b/)?.[0] || '',pax:a.match(/\bPAX\s*[:\-]?\s*(\d+\/\d+)\b/)?.[1] || '',crew:a.match(/\bCREW\s*[:\-]?\s*(\d+\/\d+)\b/)?.[1] || ''},departure:{flight:departure?.[1] || '',time:std || etd,timeType:std?'STD':'ETD',...(departureDate && departureDate !== `${arrival[2]}${arrival[3]}` ? {flightDate:departureDate} : {})}};
}
function theme(gate) { return gate === 'TBA' ? 'night' : /^2(?:0\d|1\d|2[0-5])[A-Z]?$/.test(gate) && parseInt(gate,10)>=201 ? 'msc' : 'day'; }
function buildDiscordPayload(advisory, mentions = '') {
  const { arrival, departure } = advisory;
  const gate = arrival.gate || 'TBA';
  const date = advisory.date.slice(8,10) + ' ' + MONTHS[Number(advisory.date.slice(5,7))-1];
  const gateNumber = parseInt(gate,10);
  let content = `## ✈️ ETAB · ${date} - GATE:${gate}\n`;
  content += `### Arrival - ${arrival.flight}\n`;
  for (const [key, label] of [['reg','REG'], ['eta','ETA'], ['pax','PAX'], ['crew','CREW']]) {
    if (arrival[key]) content += `🔸 ${label}: ${arrival[key]}\n`;
  }
  if (arrival.clockIn) content += `### 🕒 Clock-in: ${arrival.clockIn}\n`;
  if (mentions) content += `👥 Arrival Team:\n${mentions.trim().split(/\s+/).join('\n')}\n`;
  if (departure.flight) {
    content += `### Departure - ${departure.flight}\n`;
    content += `🔹 ${departure.timeType || 'ETD'}: ${departure.time || 'TBA'}\n`;
  }
  if (!Number.isNaN(gateNumber) && gateNumber >= 201 && gateNumber <= 225) content += '\n# 🚨 MSC GATE OPERATION';
  return content;
}
function scheduleDate(value) {
  if(typeof value === 'number') return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  const s=String(value || '').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : '';
}
function normalizeScheduleName(value) {
  return String(value || '').normalize('NFKD').replace(/\([^)]*\)|（[^）]*）/g,' ')
    .replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
}
function isLegacyEtabRequest({channelId,message},enabled,etabChannelId='1252026975720046655') {
  return enabled && String(channelId)===etabChannelId && typeof message==='string' && /^\s*(?:#+\s*)?(?:✈️?\s*)?ETAB\s+ADVISORY\b/i.test(message);
}
function arrivalTeam(rows,date,employees,log=console) {
  const col=(rows[1] || []).findIndex((v,i)=>i>=3 && scheduleDate(v)===date);
  if(col<0) throw new Error('ETAB schedule date not found: '+date);
  const normalize=s=>String(s || '').trim().toLowerCase();
  const ids=[],missing=[],skipped=[];
  for(const row of rows.slice(2)) if(normalize(row[col])==='a' && normalize(row[1])) {
    const key=normalizeScheduleName(row[1]);
    const matches=employees.filter(e=>key && normalizeScheduleName(e.name)===key);
    if(matches.length===1 && !String(matches[0].discordId || '').trim()) skipped.push(String(row[1]));
    else if(matches.length!==1 || !/^\d{17,20}$/.test(matches[0].discordId || '')) missing.push(String(row[1]));
    else ids.push(matches[0].discordId);
  }
  if(skipped.length) log.warn?.('ETAB arrival team skipped employees without Discord IDs:',skipped.join(', '));
  if(missing.length) throw new Error('ETAB schedule employees require unique server Discord IDs: '+missing.join(', '));
  return [...new Set(ids)];
}
function createStateStore(db) {
  db.exec('CREATE TABLE IF NOT EXISTS etab_advisory_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
  return {get:()=>JSON.parse(db.prepare('SELECT data FROM etab_advisory_state WHERE id=1').get()?.data || '{}'),put:state=>db.prepare('INSERT INTO etab_advisory_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(state))};
}
function createAdvisoryService({getClient,readSchedule,getEmployees,channel,store,now=()=>new Date(),log=console,nonceScope=''}) {
  let busy=false,stopped=false,timer;
  const messageCache=new Map();
  async function latest(state) {
    const {gmail,userId}=getClient();
    const result=await gmail.users.messages.list({userId,q:'from:(LAXHMXH@hallmark-aviation.com OR laxhm21@gmail.com) subject:ETAB newer_than:3d',maxResults:15},{timeout:15000});
    const candidates=[];
    for(const m of result.data.messages || []) {
      if(m.id===state.lastMessageId) continue;
      let full=messageCache.get(m.id);
      if(!full){full=(await gmail.users.messages.get({userId,id:m.id,format:'full'},{timeout:15000})).data;messageCache.set(m.id,full);if(messageCache.size>50)messageCache.delete(messageCache.keys().next().value);}
      const received=new Date(Number(full.internalDate));
      if(!Number.isFinite(+received) || +received <= (state.lastReceived || 0)) continue;
      const advisory=parseAdvisory(mailBody(full.payload),received);
      if(advisory) candidates.push({messageId:m.id,received:+received,advisory});
    }
    return candidates.sort((a,b)=>b.received-a.received)[0];
  }
  async function tick() {
    if(busy)return; busy=true;
    try {
      let state=store.get();
      if(!state.pending) {
        const item=await latest(state);if(!item)return;
        const hash=crypto.createHash('sha256').update(JSON.stringify(item.advisory)).digest('hex');
        if(hash===state.lastHash){store.put({...state,lastMessageId:item.messageId,lastReceived:item.received});return;}
        const ids=arrivalTeam(await readSchedule(),item.advisory.date,getEmployees(),log);
        state={...state,pending:{...item,hash,ids}};store.put(state);
      }
      const p=state.pending, target=await channel();
      // Deterministic Discord nonces also protect retries after an ambiguous network response.
      const nonce=kind=>crypto.createHash('sha256').update(String(target.id||'default')+'|'+nonceScope+'|'+p.messageId+'|'+kind).digest('hex').slice(0,24);
      const content=buildDiscordPayload(p.advisory,p.ids.map(id=>`<@${id}>`).join(' '));
      const sent=await target.send({content,nonce:nonce('text'),enforceNonce:true,allowedMentions:{parse:[],users:p.ids}});
      store.put({lastMessageId:p.messageId,lastReceived:p.received,lastHash:p.hash,lastAdvisoryId:sent.id,lastFlightDate:p.advisory.date});
      log.info?.('ETAB advisory sent:',p.advisory.arrival.flight,p.advisory.date,'message='+sent.id);
    } catch(error) { log.error('ETAB advisory failed; retry on next check:',error.message); }
    finally {busy=false;}
  }
  async function cycle(){await tick();if(!stopped){timer=setTimeout(cycle,intervalMs(now()));timer.unref?.();}}
  return {tick,start(){stopped=false;void cycle();},stop(){stopped=true;clearTimeout(timer);}};
}
module.exports={clockIn,localDate,intervalMs,parseAdvisory,theme,buildDiscordPayload,scheduleDate,normalizeScheduleName,isLegacyEtabRequest,arrivalTeam,createStateStore,createAdvisoryService};
