const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
function createEnrollmentHandler({devicesFile,authenticate,now=Date.now,used=new Map(),isAdmin=user=>require('./has/server/employees').ADMIN_EMAILS.has(String(user.email||'').trim().toLowerCase())}) {
 return async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Use POST.',code:'METHOD_NOT_ALLOWED'});
  let user;
  try{user=await authenticate(req);}catch{return res.status(401).json({error:'Sign in with an active administrator account to approve this computer.',code:'SIGN_IN_REQUIRED'});}
  if(!isAdmin(user))return res.status(403).json({error:'This computer is not approved. Ask an administrator to sign in to MUFC on this computer once, then sign out and use your employee account. / 此电脑尚未授权，请管理员在本机登录一次，之后退出并使用员工账号登录。',code:'DESKTOP_ADMIN_REQUIRED'});
  try {
   const {id,publicKey,computer}=req.body||{},at=now(),time=req.get('X-MUFC-Time'),nonce=req.get('X-MUFC-Nonce');
   if(typeof publicKey!=='string'||publicKey.length>1000||typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)||typeof computer!=='string'||computer.length>200)throw Error('enrollment');
   const key=crypto.createPublicKey(publicKey);
   if(key.asymmetricKeyType!=='ed25519'||crypto.createHash('sha256').update(publicKey).digest('hex')!==id||req.get('X-MUFC-Device')!==id)throw Error('key');
   if(!/^\d{13}$/.test(time||'')||Math.abs(at-Number(time))>60000||!/^[-\w]{20,100}$/.test(nonce||''))throw Error('time');
   for(const [entry,expires]of used)if(expires<at)used.delete(entry);
   const replay=id+':'+nonce;if(used.has(replay))throw Error('replay');
   const signed=require('./desktopProtection').message({method:req.method,url:req.originalUrl,time,nonce,authorization:req.get('Authorization'),body:req.rawBody});
   if(!crypto.verify(null,Buffer.from(signed),key,Buffer.from(req.get('X-MUFC-Signature')||'','base64url')))throw Error('proof');
   used.set(replay,at+120000);
   let devices={};try{devices=JSON.parse(fs.readFileSync(devicesFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(devices[id]?.revoked)return res.status(403).json({error:'This computer was revoked. Contact the server administrator to restore access.',code:'DESKTOP_REVOKED'});
   if(!devices[id]) {
    devices[id]={publicKey,label:computer,approvedAt:new Date(at).toISOString(),approvedBy:{uid:user.uid,email:user.email},revoked:false};
    fs.mkdirSync(path.dirname(devicesFile),{recursive:true});
    const temporary=devicesFile+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify(devices,null,2),{mode:0o600,flag:'wx'});fs.renameSync(temporary,devicesFile);
    console.info('MUFC desktop approved by administrator',JSON.stringify({id,computer,uid:user.uid,email:user.email}));
   }
   return res.json({approved:true,id});
  }catch{return res.status(400).json({error:'Unable to approve this computer. Restart MUFC and try again, or contact the administrator.',code:'INVALID_DEVICE_ENROLLMENT'});}
 };
}
module.exports={createEnrollmentHandler};
