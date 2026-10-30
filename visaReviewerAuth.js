const crypto = require('node:crypto');
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function createReviewerVerifier({fetcher=fetch, clock=()=>Date.now(), projectId=process.env.VISA_FIREBASE_PROJECT_ID||'china-eastern',
  reviewers=(process.env.VISA_RULE_REVIEWERS||'lake@mu.com').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean)}={}) {
  let certificates, expiresAt=0, loading;
  async function keys() {
    if(certificates&&clock()<expiresAt)return certificates;
    if(!loading)loading=(async()=>{
      const response=await fetcher(CERTS_URL,{signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Reviewer authentication unavailable');
      const data=await response.json();
      if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Reviewer authentication unavailable');
      certificates=data;
      const seconds=Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]||300);
      expiresAt=clock()+Math.min(seconds,3600)*1000;
      return data;
    })().finally(()=>{loading=null;});
    return loading;
  }
  return async function verify(token) {
    if(typeof token!=='string'||token.length>12000)throw Error('Sign in to review visa policies');
    const parts=token.split('.');
    if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))throw Error('Invalid reviewer identity');
    let header,claims;
    try{header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw Error('Invalid reviewer identity');}
    if(!header||typeof header!=='object'||Array.isArray(header)||!claims||typeof claims!=='object'||Array.isArray(claims))throw Error('Invalid reviewer identity');
    const now=Math.floor(clock()/1000);
    if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>128||claims.aud!==projectId||claims.iss!==`https://securetoken.google.com/${projectId}`||
      typeof claims.sub!=='string'||!claims.sub||claims.sub.length>128||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now||
      !Number.isFinite(claims.auth_time)||claims.auth_time>now||claims.email_verified!==true||typeof claims.email!=='string')throw Error('Invalid reviewer identity');
    const certs=await keys();
    if(!Object.hasOwn(certs,header.kid)||!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),certs[header.kid],Buffer.from(parts[2],'base64url')))throw Error('Invalid reviewer identity');
    const email=claims.email.toLowerCase();
    if(!require('./has/server/serverOwners').isOwner(email)&&!reviewers.includes(email))throw Error('This account cannot publish visa policies');
    return {reviewer:email,uid:claims.sub};
  };
}
module.exports={createReviewerVerifier};
