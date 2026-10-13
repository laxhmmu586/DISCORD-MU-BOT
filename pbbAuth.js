const crypto=require('node:crypto');
let certs,expires=0;
async function authenticate(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const parts=token.split('.');
 if(parts.length!==3)throw new Error('Sign in required');
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),payload=JSON.parse(Buffer.from(parts[1],'base64url'));
 const project=process.env.FIREBASE_PROJECT_ID||'china-eastern',now=Date.now()/1000;
 if(header.alg!=='RS256'||payload.aud!==project||payload.iss!==`https://securetoken.google.com/${project}`||!payload.sub||payload.sub.length>128||payload.exp<=now||!Number.isFinite(payload.exp)||!Number.isFinite(payload.iat)||payload.iat>now+60)throw new Error('Invalid sign-in token');
 if(!certs||Date.now()>expires){const r=await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Unable to verify sign-in');certs=await r.json();expires=Date.now()+3600000;}
 if(!certs[header.kid]||!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),certs[header.kid],Buffer.from(parts[2],'base64url')))throw new Error('Invalid sign-in token');
 return {uid:payload.sub,email:payload.email||''};
}
module.exports={authenticate};
