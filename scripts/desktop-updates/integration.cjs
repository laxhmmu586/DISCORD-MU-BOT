'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {Updater}=require('./updater.cjs');
async function create({app,config,ipcMain,session,fetch,dialog=require('electron').dialog}) {
  const updater=await new Updater({directory:path.join(app.getPath('userData'),'updates',app.getVersion()),bundledRoot:path.join(__dirname,'../../web'),coreVersion:app.getVersion(),config,fetch}).init();
  let pinned=updater.state.active,window,token,tokenReason,timer,watchdog,prepareTimer,offeredCore,prompting=false,installing=false;
  const trusted=event=>{
    if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('Main application frame required.');
  };
  async function message(options){if(window&&!window.isDestroyed())return dialog.showMessageBox(window,options);}
  async function offerCore(force=false){
    const item=updater.coreReady;
    if(!item||!window||window.isDestroyed()||window.webContents.isLoadingMainFrame()||prompting||installing||token)return;
    if(!force&&offeredCore===item.release.id)return;
    offeredCore=item.release.id;prompting=true;
    try{
      const result=await message({type:'info',title:'MUFC 软件更新',message:`新版本 ${item.release.version} 已下载完成`,detail:'点击“立即安装”将关闭 MUFC 并安装更新，完成后重新打开。无需登录。\n如果 Windows 提示管理员授权，请选择“是”。',buttons:['立即安装','稍后'],defaultId:0,cancelId:1,noLink:true});
      if(result?.response===0&&updater.coreReady===item)prepare('core-install');
    }finally{prompting=false;}
  }
  ipcMain.handle('updates:install',async event=>{trusted(event);if(!updater.coreReady)throw Error('更新尚未下载完成，请先检查更新。');await offerCore(true);return updater.status;});
  ipcMain.handle('hotfix:prepared',async(event,result)=>{
    trusted(event);if(!token||result?.token!==token)return;
    const reason=tokenReason;token=null;tokenReason=null;clearTimeout(prepareTimer);
    if(!result.safe){
      if(reason==='core-install')await message({type:'info',title:'暂时无法安装',message:'请先保存当前操作',detail:'保存后返回登录页或选择航班页，再点击“立即安装”。',buttons:['知道了']});
      return;
    }
    const preparedURL=window.webContents.getURL(),safeURL=new URL(preparedURL);
    if(!['/login.html','/flights.html'].includes(safeURL.pathname)||safeURL.pathname+safeURL.search+safeURL.hash!==result.url)return;
    if(reason==='core-install'){
      if(!updater.coreReady||installing)return;installing=true;
      try{
        updater.status={...updater.status,status:'installing',message:'正在校验安装包，即将关闭 MUFC 并安装更新。'};
        if(!await require('./core.cjs').scheduleCore(updater,process.pid,()=>!window.isDestroyed()&&window.webContents.getURL()===preparedURL&&!window.webContents.isLoadingMainFrame()))throw Error('更新安装包不可用，请重新检查更新。');
        window.destroy();app.quit();
      }catch(error){
        installing=false;updater.status={...updater.status,status:'error',message:'安装失败：'+error.message};
        await message({type:'error',title:'更新安装失败',message:'更新未能启动',detail:error.message+'\n请点击“立即安装”重试。',buttons:['知道了']});
      }
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
  function prepare(reason='hotfix'){
    if(!window||window.isDestroyed()||token||installing)return;
    token=crypto.randomBytes(24).toString('hex');tokenReason=reason;
    window.webContents.send('hotfix:prepare',{token,reason});
    prepareTimer=setTimeout(()=>{
      token=null;tokenReason=null;
      if(reason==='core-install')void message({type:'error',title:'更新暂时无法安装',message:'页面未响应安装请求',detail:'请重新打开 MUFC 后点击“立即安装”。',buttons:['知道了']});
    },10000);prepareTimer.unref();
  }
  return {
    updater,
    requestHeaders(headers){headers['X-MUFC-UI-Version']=pinned||'bundled';},
    webRoot(id){if(id==='bundled')return updater.bundledRoot;if(id&&id===pinned)return updater.root(id);throw Error('Invalid UI generation');},
    bind(win,monitor=true){
      window=win;if(!monitor)return;
      void fs.readFile(path.join(updater.directory,'core-install-status.json'),'utf8').then(async text=>{
        const previous=JSON.parse(text.replace(/^\uFEFF/,''));
        if(previous.status==='failed')await message({type:'error',title:'上次更新未完成',message:'更新安装失败',detail:String(previous.error||'请重试安装。'),buttons:['知道了']});
      }).catch(()=>{});
      window.webContents.on('render-process-gone',()=>void rollback('Renderer stopped during hotfix'));
      window.webContents.on('did-fail-load',(_e,_code,_description,_url,main)=>{if(main)void rollback('Hotfix page failed to load');});
      // Close always exits immediately. Core installation requires the explicit
      // native dialog choice; only UI hotfixes retain the automatic idle handshake.
      const tick=()=>{if(updater.coreReady)void offerCore();else if(updater.ready||updater.rollbackRequested)prepare();};
      const check=()=>updater.check().then(tick);
      void check();timer=setInterval(check,5*60000);timer.unref();
      const safeTimer=setInterval(tick,10000);safeTimer.unref();
      app.on('before-quit',()=>{clearInterval(timer);clearInterval(safeTimer);clearTimeout(watchdog);clearTimeout(prepareTimer);});
    }
  };
}
module.exports={create};
