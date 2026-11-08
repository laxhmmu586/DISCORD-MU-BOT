'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {Updater}=require('./updater.cjs');
async function create({app,config,ipcMain,session,fetch}) {
  const updater=await new Updater({directory:path.join(app.getPath('userData'),'updates',app.getVersion()),bundledRoot:path.join(__dirname,'../../web'),coreVersion:app.getVersion(),config,fetch}).init();
  let pinned=updater.state.active,window,token,timer,watchdog;
  const trusted=event=>{
    if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('Main application frame required.');
  };
  ipcMain.handle('hotfix:prepared',async(event,result)=>{
    trusted(event);if(!token||result?.token!==token)return;token=null;
    if(!result.safe)return;
    const preparedURL=window.webContents.getURL();
    const safeURL=new URL(preparedURL);
    if(!['/login.html','/flights.html'].includes(safeURL.pathname)||safeURL.pathname+safeURL.search+safeURL.hash!==result.url)return;
    if(updater.coreReady && safeURL.pathname==='/login.html'){
      try{await require('./core.cjs').scheduleCore(updater);window.destroy();app.quit();}
      catch(error){updater.status={status:'error',message:error.message};}
      return;
    }
    if(updater.checking)return;
    if(updater.rollbackRequested)await updater.rollback('Release disabled by publisher');
    else if(updater.ready)await updater.activate(()=>window.webContents.getURL()===preparedURL&&!window.webContents.isLoadingMainFrame());else return;
    window.webContents.stop();pinned=updater.state.active;window.webContents.reload();
    clearTimeout(watchdog);watchdog=setTimeout(()=>rollback('Hotfix health check timed out'),30000);watchdog.unref();
  });
  ipcMain.handle('hotfix:healthy',async(event,data)=>{trusted(event);if(data?.version!==(pinned||'bundled')||pinned!==updater.state.active)return;await updater.healthy();clearTimeout(watchdog);});
  async function rollback(reason){if(!updater.state.pending)return;await updater.rollback(reason);pinned=updater.state.active;window?.webContents.reload();}
  function prepare(){if(!window||window.isDestroyed()||token)return;token=crypto.randomBytes(24).toString('hex');window.webContents.send('hotfix:prepare',{token});setTimeout(()=>{token=null;},10000).unref();}
  return {
    updater,
    // Server chooses one immutable snapshot per request from this trusted header.
    requestHeaders(headers){headers['X-MUFC-UI-Version']=pinned||'bundled';},
    webRoot(id){if(id==='bundled')return updater.bundledRoot;if(id&&id===pinned)return updater.root(id);throw Error('Invalid UI generation');},
    bind(win,monitor=true){
      window=win;
      if(!monitor)return;
      window.webContents.on('render-process-gone',()=>void rollback('Renderer stopped during hotfix'));
      window.webContents.on('did-fail-load',(_e,_code,_description,_url,main)=>{if(main)void rollback('Hotfix page failed to load');});
      // Never intercept close or wait for a renderer/installer. Verified updates
      // install through the idle login handshake, including after the next launch.
      const needsPrepare=()=>updater.ready||updater.rollbackRequested||(updater.coreReady&&new URL(window.webContents.getURL()||'about:blank').pathname==='/login.html');
      const check=()=>updater.check().then(()=>{if(needsPrepare())prepare();});
      void check();timer=setInterval(check,5*60000);timer.unref();
      const safeTimer=setInterval(()=>{if(needsPrepare())prepare();},10000);safeTimer.unref();
      app.on('before-quit',()=>{clearInterval(timer);clearInterval(safeTimer);clearTimeout(watchdog);});
    }
  };
}
module.exports={create};
