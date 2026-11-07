const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// These files are packaged with Desktop, never served by the public API host.
const privateFiles = ['index.html','report.html','report.js','reports.html','cbs.html','cbs.js','has-pbb.html','has-pbb-client.js','has-pbb-data.js','has-pbb-dashboard.html','has-pbb-dashboard.js'];
function normalized(value) {
  try { return decodeURIComponent(value).replace(/\\/g,'/').replace(/\/{2,}/g,'/').toLowerCase(); } catch { return ''; }
}
function privatePage(value) {
  const p=normalized(value).replace(/\/$/,'');
  return privateFiles.some(name=>p==='/'+name||p==='/public/'+name||p==='/public/public/'+name||p==='/has/'+name)
    || /^\/(?:public\/)?(?:index|report|reports|cbs|lbs|has-pbb|has-pbb-dashboard)$/.test(p);
}
function removedPage(value) { return /^(?:\/public){0,2}(?:\/has)?\/info(?:\.html|\.js|-access\.js)?\/?$/.test(normalized(value)); }
function privateApi(p) {
  return /^\/(?:desktop-access|search|dashboard-snapshot|sy-live-stream|flight-telex|notes|security-reviews|warning-acknowledgements|stored-report|reports\/|sales-report\/|(?:sales-details|vip|psm|inad|spml|wch|miss-connection|test-baggage|bagroom)-report|has-pbb-api(?:\/|$)|pbb-api(?:\/|$)|test-baggage(?:\/|$)|cbs-(?!scan(?:2)?(?:\/|$)))/i.test(p);
}
const digest=value=>crypto.createHash('sha256').update(value||'').digest('hex');
function message({method,url,time,nonce,authorization,body}) {
  return ['MUFC-DESKTOP-1',method.toUpperCase(),url,time,nonce,digest(authorization),digest(body)].join('\n');
}
function staticGuard(req,res,next) {
  if(removedPage(req.path))return res.status(410).set('Cache-Control','no-store').json({error:'This page has been removed.'});
  if(privatePage(req.path))return res.status(403).set('Cache-Control','no-store').json({error:'Use MUFC Desktop on an approved computer.'});
  next();
}
function createApiGuard({devicesFile=process.env.MUFC_DESKTOP_DEVICES_FILE||path.join(__dirname,'data','desktop-devices.json'),authenticate=require('./has/server/pbbAuth').authenticate,now=Date.now}={}) {
  const used=new Map();
  return async(req,res,next)=>{
    if(!privateApi(req.path)||req.method==='OPTIONS')return next();
    res.set('Cache-Control','private, no-store');
    try {
      // A web login, Origin or User-Agent is never proof of an approved device.
      const id=req.get('X-MUFC-Device'),time=req.get('X-MUFC-Time'),nonce=req.get('X-MUFC-Nonce'),signature=req.get('X-MUFC-Signature');
      const at=now();
      if(!id||!/^\d{13}$/.test(time||'')||Math.abs(at-Number(time))>60000||!/^[-\w]{20,100}$/.test(nonce||'')||!signature)throw Error('device');
      const devices=JSON.parse(fs.readFileSync(devicesFile,'utf8'));
      const device=devices[id];
      if(!device||device.revoked||!device.publicKey)throw Error('device');
      for(const [key,expires] of used)if(expires<at)used.delete(key);
      const key=id+':'+nonce;
      if(used.has(key))throw Error('replay');
      const signed=message({method:req.method,url:req.originalUrl,time,nonce,authorization:req.get('Authorization'),body:req.rawBody});
      if(!crypto.verify(null,Buffer.from(signed),device.publicKey,Buffer.from(signature,'base64url')))throw Error('signature');
      used.set(key,at+120000);
      req.desktopUser=await authenticate(req);
      if(device.allowedEmails?.length&&!device.allowedEmails.includes(req.desktopUser.email.toLowerCase()))throw Error('account');
      next();
    } catch { return res.status(403).json({error:'Approved MUFC Desktop computer and employee sign-in required.',code:'DESKTOP_REQUIRED'}); }
  };
}
const captureBody=(req,_res,buffer)=>{req.rawBody=buffer;};
module.exports={privateFiles,privatePage,removedPage,privateApi,staticGuard,createApiGuard,captureBody,message,digest};
