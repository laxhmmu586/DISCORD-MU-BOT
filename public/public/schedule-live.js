(()=>{
 window.watchSchedule=({onRevision})=>{
  let stopped=false,controller,reconnect,poll,watchdog,backoff=1000,lastRevision=null;
  const fallback=()=>{if(!poll)poll=setInterval(()=>{if(!document.hidden)onRevision();},5000);};
  async function connect(){
   if(stopped)return;
   controller=new AbortController();
   const wake=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>controller.abort(),45000);};
   wake();
   try{
    const user=firebase.auth().currentUser;if(!user)throw Error('Sign in required.');
    const response=await fetch((window.MU_API_BASE||'https://api.mufcapp.net').replace(/\/$/,'')+'/staff-schedule-api/stream',{
     cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+await user.getIdToken(),...(window.workspaceHeaders?.()||{})}
    });
    if(stopped)return;
    if(!response.ok||!response.headers.get('Content-Type')?.includes('text/event-stream')||!response.body)throw Error('Live updates unavailable.');
    clearInterval(poll);poll=null;backoff=1000;
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(!stopped){
     const {done,value}=await reader.read();if(stopped)return;if(done)throw Error('Live connection ended.');wake();
     buffer=(buffer+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');if(buffer.length>65536)throw Error('Invalid live update.');
     let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){
      const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
      if(!frame.split('\n').includes('event: revision'))continue;
      const payload=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
      const revision=JSON.parse(payload).revision;
      if(typeof revision==='string'&&revision!==lastRevision){lastRevision=revision;onRevision();}
     }
    }
   }catch{if(!stopped){fallback();reconnect=setTimeout(connect,backoff);backoff=Math.min(backoff*2,30000);}}
   finally{clearTimeout(watchdog);controller?.abort();}
  }
  void connect();
  return ()=>{stopped=true;clearTimeout(reconnect);clearTimeout(watchdog);clearInterval(poll);controller?.abort();};
 };
})();
