'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
async function setup(response=0,installError=false){
 const handlers={},intervals=[],sent=[],calls=[],dialogs=[];
 const updater={state:{active:null},status:{core:true},coreReady:{release:{id:'core-test',version:'2.1.9'}},directory:'/fixture',check:async()=>calls.push('check'),init:async function(){return this;}};
 class FakeUpdater{constructor(){return updater;}}
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/desktop-updates/integration.cjs'),'utf8'),{module,require:name=>name==='./updater.cjs'?{Updater:FakeUpdater}:name==='./core.cjs'?{scheduleCore:async()=>{if(installError)throw Error('signature check failed');calls.push('install');return true;}}:require(name),__dirname:__dirname,setTimeout:()=>({unref(){}}),clearTimeout(){},setInterval:fn=>{intervals.push(fn);return {unref(){}};},clearInterval(){},URL,process});
 const app=new EventEmitter();Object.assign(app,{getPath:()=>'/fixture',getVersion:()=> '2.1.9',quit:()=>calls.push('quit')});
 const dialog={showMessageBox:async(_win,options)=>{dialogs.push(options);return {response};}};
 const integration=await module.exports.create({app,config:{},dialog,ipcMain:{handle:(name,fn)=>handlers[name]=fn}});
 const win=new EventEmitter(),frame={};Object.assign(win,{isDestroyed:()=>false,destroy:()=>calls.push('destroy'),webContents:new EventEmitter()});Object.assign(win.webContents,{mainFrame:frame,isLoadingMainFrame:()=>false,getURL:()=> 'http://127.0.0.1/login.html',send:(name,data)=>sent.push({name,data})});
 integration.bind(win);await new Promise(resolve=>setImmediate(resolve));
 return {handlers,intervals,sent,calls,dialogs,updater,win,event:{sender:win.webContents,senderFrame:frame}};
}
test('download offers Install now before login; approval alone authorizes explicit safe handshake',async()=>{
 const s=await setup();assert.deepEqual(s.calls,['check']);assert.equal(s.dialogs[0].buttons[0],'立即安装');assert.equal(s.sent[0].data.reason,'core-install');
 let prevented=false;s.win.emit('close',{preventDefault:()=>{prevented=true;}});assert.equal(prevented,false);
 await s.handlers['hotfix:prepared'](s.event,{token:s.sent[0].data.token,safe:true,url:'/login.html'});assert.deepEqual(s.calls,['check','install','destroy','quit']);
});
test('Later never installs or repeatedly prompts; explicit retry reopens the dialog',async()=>{
 const s=await setup(1);assert.equal(s.sent.length,0);s.intervals[1]();await new Promise(r=>setImmediate(r));assert.equal(s.dialogs.length,1);
 await s.handlers['updates:install'](s.event);assert.equal(s.dialogs.length,2);assert.deepEqual(s.calls,['check']);
});
test('unsafe page refuses installation and explains what to do',async()=>{
 const s=await setup();await s.handlers['hotfix:prepared'](s.event,{token:s.sent[0].data.token,safe:false});assert.deepEqual(s.calls,['check']);assert.equal(s.dialogs[1].title,'暂时无法安装');
});
test('native verification failure keeps the app open and shows the actual error',async()=>{
 const s=await setup(0,true);await s.handlers['hotfix:prepared'](s.event,{token:s.sent[0].data.token,safe:true,url:'/login.html'});assert.deepEqual(s.calls,['check']);assert(s.dialogs[1].detail.includes('signature check failed'));
});
