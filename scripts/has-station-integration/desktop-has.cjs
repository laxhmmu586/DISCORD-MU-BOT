'use strict';
function install({ipcMain,BrowserWindow,session,trusted,onReturnToFlights=()=>{},fetch=global.fetch}){
 const windows=new Map();
 ipcMain.handle('has:open',async(event,request)=>{
  trusted(event);
  if(!request||!['da','pbb'].includes(request.destination)||typeof request.token!=='string'||request.token.length>16384)throw Error('Invalid HAS workspace request.');
  const response=await fetch('https://has-station.com/mufc-sso/start',{method:'POST',headers:{Authorization:'Bearer '+request.token,'Content-Type':'application/json'},body:JSON.stringify({destination:request.destination}),redirect:'error',signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to open HAS Station.');
  if(!/^https:\/\/has-station\.com\/mufc-sso#code=[A-Za-z0-9_-]{43}$/.test(data.url))throw Error('Invalid HAS Station sign-in response.');
  const existing=windows.get(request.destination);if(existing&&!existing.isDestroyed()){existing.focus();await existing.loadURL(data.url);return;}
  const isolated=session.fromPartition('mufc-has-'+request.destination);
  isolated.setPermissionRequestHandler((_web,permission,callback)=>callback(permission==='clipboard-sanitized-write'));
  const child=new BrowserWindow({width:1450,height:950,title:request.destination==='da'?'MUFC · LAX/MU DA':'MUFC · Jet Bridge',webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  windows.set(request.destination,child);child.setMenuBarVisibility(false);
  child.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  child.webContents.on('will-navigate',(event,url)=>{
   if(url==='https://has-station.com/mufc-return'){
    event.preventDefault();void Promise.resolve(onReturnToFlights()).then(()=>child.close());return;
   }
   if(new URL(url).origin!=='https://has-station.com')event.preventDefault();
  });
  child.webContents.on('will-attach-webview',event=>event.preventDefault());
  child.on('closed',()=>windows.delete(request.destination));await child.loadURL(data.url);
 });
 const close=()=>{for(const win of windows.values())if(!win.isDestroyed())win.close();windows.clear();};
 ipcMain.handle('has:close',event=>{trusted(event);close();});
 return {close};
}
module.exports={install};
