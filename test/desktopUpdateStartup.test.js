'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
test('startup checks and idle login Core installation require no employee login',async()=>{
  const handlers={},intervals=[],sent=[],calls=[];
  const updater={state:{active:null},status:{},coreReady:{},check:async()=>{calls.push('check');},init:async function(){return this;}};
  class FakeUpdater {constructor(){return updater;}}
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/desktop-updates/integration.cjs'),'utf8'),{module,require:name=>name==='./updater.cjs'?{Updater:FakeUpdater}:name==='./core.cjs'?{scheduleCore:async()=>calls.push('install')}:require(name),__dirname:__dirname,setTimeout:()=>({unref(){}}),clearTimeout(){},setInterval:fn=>{intervals.push(fn);return {unref(){}};},clearInterval(){},URL});
  const app=new EventEmitter();Object.assign(app,{getPath:()=>'/fixture',getVersion:()=> '2.1.7',quit:()=>calls.push('quit')});
  const integration=await module.exports.create({app,config:{},ipcMain:{handle:(name,fn)=>handlers[name]=fn}});
  const win=new EventEmitter(),frame={};Object.assign(win,{isDestroyed:()=>false,destroy:()=>calls.push('destroy'),webContents:new EventEmitter()});Object.assign(win.webContents,{mainFrame:frame,getURL:()=> 'http://127.0.0.1/login.html',send:(name,data)=>sent.push({name,data})});
  integration.bind(win);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['check']);assert.equal(sent[0].name,'hotfix:prepare');
  const event={sender:win.webContents,senderFrame:frame};
  await handlers['hotfix:prepared'](event,{token:sent[0].data.token,safe:false,url:'/login.html'});
  assert.deepEqual(calls,['check']);intervals[1]();
  await handlers['hotfix:prepared'](event,{token:sent[1].data.token,safe:true,url:'/login.html'});
  assert.deepEqual(calls,['check','install','destroy','quit']);
});
