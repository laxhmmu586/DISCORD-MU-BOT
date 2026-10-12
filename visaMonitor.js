const { officialUrl } = require('./visaSources');
function decodeEntities(s) {
  return s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{
    const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);
    return v>0&&v<=0x10ffff?String.fromCodePoint(v):'';
  }).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
}
function textContent(html) {
  return decodeEntities(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function policyText(html) {
  const main=html.match(/<[^>]+class=["'][^"']*(?:TRS_Editor|view TRS_UEDITOR)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    || html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  // Full text fallback is conservative: navigation changes may require review.
  const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';
  return textContent(title+' '+(main||html));
}
function noticeLinks(html,base) {
  const links=new Map();
  for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title=textContent(m[2]);
    if(!/visa|免签|签证|入境|过境/i.test(title)||title.length<8)continue;
    try{
      const url=new URL(decodeEntities(m[1]),base);url.hash='';
      if(officialUrl(url.href)&&/\.(?:html|shtml)$/.test(url.pathname)&&!/\/index(?:_\d+)?\./.test(url.pathname))links.set(url.href,title);
    }catch{ /* Malformed individual links never become monitored URLs. */ }
  }
  return [...links].slice(0,40).map(([url,title])=>({url,title}));
}
async function fetchOfficial(url,fetcher=fetch) {
  if(!officialUrl(url))throw Error('Only configured official HTTPS government sources are allowed');
  const signal=AbortSignal.timeout(20000);
  for(let redirects=0;redirects<4;redirects++) {
    const response=await fetcher(url,{redirect:'manual',signal,headers:{'User-Agent':'MUFC-Visa-Policy-Monitor/1.0','Accept':'text/html'}});
    if([301,302,303,307,308].includes(response.status)){
      const next=new URL(response.headers.get('location'),url).href;
      if(!officialUrl(next))throw Error('Redirect outside official government hosts');
      url=next;continue;
    }
    if(!response.ok)throw Error('Official source HTTP '+response.status);
    if(/system|maintenance/i.test(new URL(url).pathname))throw Error('Official page redirected to maintenance');
    const reader=response.body?.getReader();let html;
    if(reader) {
      const chunks=[];let total=0;
      for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>2*1024*1024){await reader.cancel();throw Error('Official page exceeds 2 MB');}chunks.push(Buffer.from(value));}
      const raw=Buffer.concat(chunks);
      const charset=response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1]||raw.toString('ascii').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]||'utf-8';
      html=new TextDecoder(charset).decode(raw);
    } else html=await response.text();
    if(/<title[^>]*>[^<]*(?:系统维护|maintenance|access denied)/i.test(html)||html.length<300)throw Error('Official content unavailable');
    return html;
  }
  throw Error('Too many official page redirects');
}
class VisaMonitor {
  constructor(store,{fetcher=fetch,clock=()=>new Date(),onChange=()=>{}}={}){this.store=store;this.fetcher=fetcher;this.clock=clock;this.onChange=onChange;this.running=null;}
  check(){if(!this.running)this.running=this.run().finally(()=>{this.running=null;});return this.running;}
  async run(){
    const results=[];const now=this.clock().toISOString();
    const monitors=this.store.db.prepare('SELECT * FROM visa_monitors').all();
    const enqueued=new Set(monitors.map(m=>m.url));
    for(const m of monitors) {
      try {
        const html=await fetchOfficial(m.url,this.fetcher);
        const content=policyText(html);
        if(content.length<80||!(/visa|免签|签证|入境|过境/i.test(content)))throw Error('Expected visa policy content missing');
        const links=m.kind==='feed'?noticeLinks(html,m.url):[];
        const snapshot=this.store.snapshot(m,content,now);
        if(m.kind==='feed') {
          for(const n of links) {
            const inserted=this.store.db.prepare("INSERT OR IGNORE INTO visa_notices(url,title,discovered_at,status) VALUES(?,?,?,'pending')").run(n.url,n.title,now);
            this.store.db.prepare("INSERT OR IGNORE INTO visa_monitors(url,kind,authority) VALUES(?,'policy',?)").run(n.url,m.authority);
            if(!enqueued.has(n.url)){enqueued.add(n.url);monitors.push(this.store.db.prepare('SELECT * FROM visa_monitors WHERE url=?').get(n.url));}
            if(inserted.changes)this.onChange({kind:'new_notice',...n});
          }
        }
        if(snapshot.changed&&m.kind==='policy') {
          const title=textContent(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'Official policy changed');
          this.store.db.prepare(`INSERT INTO visa_notices(url,title,discovered_at,status) VALUES(?,?,?,'pending')
            ON CONFLICT(url) DO UPDATE SET title=excluded.title,discovered_at=excluded.discovered_at,status='pending',reviewed_by=NULL,reviewed_at=NULL`).run(m.url,title,now);
          this.onChange({kind:'changed_policy',url:m.url});
        }
        results.push({url:m.url,ok:true,...snapshot});
      }catch(e){
        const wasError=m.last_error;
        this.store.db.prepare('UPDATE visa_monitors SET last_attempt_at=?,last_error=? WHERE url=?').run(now,String(e.message).slice(0,300),m.url);
        if(!wasError)this.onChange({kind:'fetch_failure',url:m.url,error:e.message});
        results.push({url:m.url,ok:false,error:e.message});
      }
    }
    const {seedCandidates,publishVerifiedBaseline}=require('./visaSeed');
    seedCandidates(this.store,this.clock());
    publishVerifiedBaseline(this.store,this.clock());
    return results;
  }
  start(){
    // Check on startup and every hour; fetch daily, or hourly within 30 days of expiration.
    const tick=()=>{
      const now=this.clock();
      const urgent=this.store.db.prepare("SELECT 1 FROM visa_rules WHERE status='approved' AND effective_until BETWEEN ? AND ? LIMIT 1").get(now.toISOString().slice(0,10),new Date(now.getTime()+30*86400000).toISOString().slice(0,10));
      const last=this.store.db.prepare('SELECT MIN(last_attempt_at) AS at FROM visa_monitors').get().at;
      const retry=this.store.db.prepare('SELECT 1 FROM visa_monitors WHERE last_success_at IS NULL OR last_error IS NOT NULL LIMIT 1').get();
      if(!last||this.store.db.prepare('SELECT 1 FROM visa_monitors WHERE last_attempt_at IS NULL LIMIT 1').get()||now.getTime()-Date.parse(last)>=(urgent||retry?3600000:86400000))this.check().catch(e=>console.error('Visa monitor:',e.message));
    };
    tick();const timer=setInterval(tick,3600000);timer.unref();return ()=>clearInterval(timer);
  }
}
module.exports={VisaMonitor,fetchOfficial,textContent,policyText,noticeLinks};
