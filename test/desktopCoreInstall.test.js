'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto'),{EventEmitter}=require('node:events'),{execFileSync}=require('node:child_process');
test('Core helper preserves verification, elevates installation, reports failures and parses as PowerShell',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mufc-install-test-'));try{
 const file=path.join(directory,'installer.exe'),bytes=Buffer.from('test-only; never executable');await fs.writeFile(file,bytes);
 const manifest={sequence:1,paused:false,disabled:false},item={file,release:{id:'test',version:'2.1.9',sha256:crypto.createHash('sha256').update(bytes).digest('hex')},envelope:{}};
 const updater={directory,coreReady:item,config:{coreCertificateThumbprints:['A'.repeat(40)]},state:{blocked:[]},control:manifest,verifyEnvelope:()=>manifest};let captured;
 const child={execFile:(_file,_args,_options,callback)=>callback(null,''),spawn:(_file,args)=>{captured=args;const process=new EventEmitter();process.unref=()=>{};queueMicrotask(()=>process.emit('spawn'));return process;}};
 const module={exports:{}};vm.runInNewContext(await fs.readFile(require.resolve('../scripts/desktop-updates/core.cjs'),'utf8'),{module,require:name=>name==='node:child_process'?child:name==='./updater.cjs'?{digest:b=>crypto.createHash('sha256').update(b).digest('hex')}:require(name),process:{platform:'win32',pid:1234,execPath:'C:/Program Files (x86)/MUFC/MUFC.exe'},Buffer});
 assert.equal(await module.exports.scheduleCore(updater),true);const code=Buffer.from(captured.at(-1),'base64').toString('utf16le');assert(code.includes('Get-AuthenticodeSignature'));assert(code.includes('Get-FileHash'));assert(code.includes('-Verb RunAs'));assert(code.includes("status='failed'"));assert(code.includes('-WindowStyle Normal'));
 if(process.platform==='win32'){const parse='$null=[scriptblock]::Create([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String(\''+captured.at(-1)+'\')));';execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(parse,'utf16le').toString('base64')],{windowsHide:true});}
 const status=JSON.parse(await fs.readFile(path.join(directory,'core-install-status.json'),'utf8'));assert.equal(status.status,'starting');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
