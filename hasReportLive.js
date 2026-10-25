function createReportLive({context,read,heartbeatMs=15000}){
 const streams=new Set(),same=(a,b)=>a.station===b.station&&a.account===b.account;
 const allowed=sub=>{const current=context(sub.user);return current.permissions[sub.kind]&&same(current.scope,sub.scope);};
 const state=sub=>({scope:sub.scope,kind:sub.kind,month:sub.month,revision:read(sub.scope,sub.kind,sub.month).revision,daRevision:sub.kind==='wwh'?read(sub.scope,'da',sub.month).revision:0});
 function end(sub){clearInterval(sub.timer);streams.delete(sub);sub.res.end();}
 function send(sub){try{if(Date.now()-sub.opened>=1800000||!allowed(sub))return end(sub);const data=state(sub);if(!sub.res.write('event: revision\ndata: '+JSON.stringify(data)+'\n\n'))end(sub);}catch{end(sub);}}
 return {
  subscribe(req,res,ctx){
   const sub={user:req.reportUser,res,scope:ctx.scope,kind:req.params.kind,month:req.params.month,opened:Date.now()};
   // Resolve storage before sending stream headers so failures remain HTTP 503.
   const initial=state(sub);
   res.set({'Content-Type':'text/event-stream','Cache-Control':'private, no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
   streams.add(sub);res.write('retry: 2000\nevent: revision\ndata: '+JSON.stringify(initial)+'\n\n');
   sub.timer=setInterval(()=>send(sub),heartbeatMs);sub.timer.unref();res.on('close',()=>{clearInterval(sub.timer);streams.delete(sub);});
  },
  publish(scope,kind,month){for(const sub of streams){if(same(scope,sub.scope)&&sub.month===month&&(sub.kind===kind||kind==='da'&&sub.kind==='wwh'))send(sub);}},
  close(){for(const sub of streams)end(sub);}
 };
}
module.exports={createReportLive};
