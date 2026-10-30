(() => {
 window.watchHasReport=({path,onRevision,onError})=>{
  let stopped=false,controller,reconnect,poll,watchdog,backoff=1000;
  const check=async()=>{try{const state=await window.hasReportRequest(path+'/updates');if(!stopped)onRevision(state);}catch(error){if(!stopped)onError?.(error);}};
  function fallback(){if(!poll){void check();poll=setInterval(check,10000);}}
  async function connect(){
   if(stopped)return;controller=new AbortController();
   const wake=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>controller.abort(),45000);};wake();
   try{
    const response=await window.hasReportStream(path+'/stream',controller.signal);
    if(stopped)return;
    if(!response.headers.get('Content-Type')?.includes('text/event-stream')||!response.body)throw Error('Live updates are unavailable.');
    clearInterval(poll);poll=null;backoff=1000;
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(!stopped){const {done,value}=await reader.read();if(done)throw Error('Live connection ended.');wake();buffer=(buffer+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');if(buffer.length>65536)throw Error('Invalid live update.');let boundary;
     while((boundary=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const lines=frame.split('\n');if(lines.some(line=>line==='event: revision')){const data=lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');if(data)onRevision(JSON.parse(data));}}
    }
   }catch(error){if(!stopped){onError?.(error);if(!stopped){fallback();reconnect=setTimeout(connect,backoff);backoff=Math.min(backoff*2,30000);}}}
   finally{clearTimeout(watchdog);controller?.abort();}
  }
  void connect();
  return ()=>{stopped=true;clearTimeout(reconnect);clearTimeout(watchdog);clearInterval(poll);controller?.abort();};
 };
})();
