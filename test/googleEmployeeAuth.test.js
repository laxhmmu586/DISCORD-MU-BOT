const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('signed Google tokens require a verified email and a linked employee, while onboarding can verify an unlinked identity',async t=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const originalFetch=global.fetch;t.after(()=>{global.fetch=originalFetch;});
 global.fetch=async()=>({ok:true,json:async()=>({fixture:publicKey.export({type:'spki',format:'pem'})})});
 const {authenticate,setEmployeeAccessVerifier,setAccountBlockedVerifier}=require('../has/server/pbbAuth');setEmployeeAccessVerifier(user=>user.uid==='linked');
 function request(extra={}){const now=Math.floor(Date.now()/1000),claims={aud:process.env.FIREBASE_PROJECT_ID||'china-eastern',iss:'https://securetoken.google.com/'+(process.env.FIREBASE_PROJECT_ID||'china-eastern'),sub:'unlinked',iat:now,exp:now+3600,email:'test@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'},...extra};const head=Buffer.from(JSON.stringify({alg:'RS256',kid:'fixture'})).toString('base64url'),body=Buffer.from(JSON.stringify(claims)).toString('base64url'),signature=crypto.sign('RSA-SHA256',Buffer.from(head+'.'+body),privateKey).toString('base64url');return {headers:{authorization:'Bearer '+head+'.'+body+'.'+signature}};}
 await assert.rejects(authenticate(request()),/must be linked/);
 assert.equal((await authenticate(request({email:'external@mu.com'}))).uid,'unlinked');
 assert.equal((await authenticate(request({email:'EXTERNAL@MU.COM'}))).uid,'unlinked');
 await assert.rejects(authenticate(request({email:'external@mu.com.attacker.example'})),/must be linked/);
 await assert.rejects(authenticate(request({email:'external@mu.com',email_verified:false})),/must be linked/);
 assert.equal((await authenticate(request(),{allowUnlinkedGoogle:true})).uid,'unlinked');
 assert.equal((await authenticate(request({sub:'linked'}))).provider,'google.com');
 await assert.rejects(authenticate(request({sub:'linked',email_verified:false}),{allowUnlinkedGoogle:true}),/must be linked/);
 assert.equal((await authenticate(request({firebase:{sign_in_provider:'password'}}))).uid,'unlinked');
 setAccountBlockedVerifier(user=>user.uid==='linked');await assert.rejects(authenticate(request({sub:'linked'})),/disabled/);setAccountBlockedVerifier(()=>false);
 await assert.rejects(authenticate(request({exp:1}),{allowUnlinkedGoogle:true}),/Invalid/);
});
