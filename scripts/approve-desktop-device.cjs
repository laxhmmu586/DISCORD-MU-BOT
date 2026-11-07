// Run on the API host: node scripts/approve-desktop-device.cjs enroll PUBLIC_ENROLLMENT_JSON [LABEL]
// Revocation: node scripts/approve-desktop-device.cjs revoke DEVICE_ID
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [action,arg,label]=process.argv.slice(2),file=process.env.MUFC_DESKTOP_DEVICES_FILE||path.resolve(__dirname,'../data/desktop-devices.json');
const devices=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
if(action==='enroll'){
 const {id,publicKey,computer}=JSON.parse(fs.readFileSync(arg,'utf8'));
 if(crypto.createPublicKey(publicKey).asymmetricKeyType!=='ed25519'||crypto.createHash('sha256').update(publicKey).digest('hex')!==id)throw Error('Invalid enrollment');
 devices[id]={publicKey,label:label||computer||'',approvedAt:new Date().toISOString(),revoked:false};
 console.log('Approved device '+id);
}else if(action==='revoke'&&devices[arg]){devices[arg].revoked=true;console.log('Revoked device '+arg);}
else throw Error('Expected enroll PUBLIC_ENROLLMENT_JSON [LABEL], or revoke DEVICE_ID');
fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(devices,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);
