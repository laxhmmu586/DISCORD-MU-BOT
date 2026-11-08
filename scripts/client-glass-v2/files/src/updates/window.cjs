'use strict';
function install(window,ipcMain,origin) {
  window.webContents.on('before-input-event',(event,input)=>{
    if(input.type!=='keyDown'||input.alt||input.meta)return;
    if(input.key==='F5'||(input.control&&String(input.key).toLowerCase()==='r')){event.preventDefault();window.webContents.reload();}
  });
  const state=()=>({maximized:window.isMaximized(),fullscreen:window.isFullScreen()});
  ipcMain.handle('window:control',(event,action)=>{
    if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||new URL(event.senderFrame.url).origin!==origin)throw Error('Untrusted window control');
    if(action==='reload')window.webContents.reload();
    else if(action==='minimize')window.minimize();
    else if(action==='maximize'){if(window.isMaximized())window.unmaximize();else window.maximize();}
    else if(action==='close')window.close();
    else if(action!=='state')throw Error('Unknown window action');
    return window.isDestroyed()?{}:state();
  });
  for(const event of ['maximize','unmaximize','enter-full-screen','leave-full-screen'])window.on(event,()=>{if(!window.isDestroyed())window.webContents.send('window:state',state());});
}
module.exports={install};
