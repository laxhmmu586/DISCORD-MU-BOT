'use strict';
function install(window,ipcMain,origin) {
  const state=()=>({maximized:window.isMaximized(),fullscreen:window.isFullScreen(),nativeOverlay:process.platform==='win32'});
  ipcMain.handle('window:control',(event,action)=>{
    if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||new URL(event.senderFrame.url).origin!==origin)throw Error('Untrusted window control');
    if(action==='minimize')window.minimize();
    else if(action==='maximize'){if(window.isMaximized())window.unmaximize();else window.maximize();}
    else if(action==='close')window.close();
    else if(action!=='state')throw Error('Unknown window action');
    return window.isDestroyed()?{}:state();
  });
  for(const event of ['maximize','unmaximize','enter-full-screen','leave-full-screen'])window.on(event,()=>{if(!window.isDestroyed())window.webContents.send('window:state',state());});
}
module.exports={install};
