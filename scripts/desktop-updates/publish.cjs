'use strict';
// PLAN_JSON PRIVATE_KEY OUTPUT. Build offline; transfer only OUTPUT to HTTPS.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {digest,safeFile,treeHash,atomic}=require('./updater.cjs');
async function publish(plan,key,output) {
  const privateKey=crypto.createPrivateKey(await fs.readFile(key));
  if(privateKey.asymmetricKeyType!=='ed25519')throw Error('Ed25519 release key required');
  const manifest={schema:1,channel:plan.channel,coreVersion:plan.coreVersion,baseline:await treeHash(plan.bundledRoot),sequence:plan.sequence,issuedAt:Date.now(),expiresAt:Date.now()+(plan.validHours||24)*3600000,paused:Boolean(plan.paused),disabled:Boolean(plan.disabled),revoked:plan.revoked||[]};
  await fs.mkdir(path.join(output,'files'),{recursive:true});
  if(plan.hotfix){
    manifest.hotfix={id:plan.hotfix.id,files:[]};
    for(const name of plan.hotfix.files){safeFile(name);const bytes=await fs.readFile(path.join(plan.hotfix.root,name));const sha256=digest(bytes);await fs.writeFile(path.join(output,'files',sha256),bytes);manifest.hotfix.files.push({path:name,sha256,size:bytes.length});}
  }
  if(plan.core){const bytes=await fs.readFile(plan.core.path),sha256=digest(bytes);await fs.writeFile(path.join(output,'files',sha256),bytes);manifest.core={id:plan.core.id,version:plan.core.version,file:path.basename(plan.core.path),sha256,size:bytes.length};}
  const bytes=Buffer.from(JSON.stringify(manifest));
  const envelope={keyId:plan.keyId,payload:bytes.toString('base64'),signature:crypto.sign(null,bytes,privateKey).toString('base64')};
  // Validate the exact publication before committing the only mutable feed file.
  const {Updater}=require('./updater.cjs');
  const verifier=new Updater({coreVersion:plan.coreVersion,config:{channel:plan.channel,keys:{[plan.keyId]:crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'})}}});
  verifier.baseline=manifest.baseline;verifier.verifyEnvelope(envelope);
  await atomic(path.join(output,'manifest.json'),envelope);return manifest;
}
if(require.main===module){const [plan,key,output]=process.argv.slice(2);fs.readFile(plan,'utf8').then(JSON.parse).then(p=>publish(p,key,output)).then(m=>console.log(JSON.stringify({sequence:m.sequence,hotfix:m.hotfix?.id,core:m.core?.id,paused:m.paused,disabled:m.disabled}))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={publish};
