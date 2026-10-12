const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {createReviewerVerifier}=require('../visaReviewerAuth');
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const clock=()=>Date.parse('2026-10-12T12:00:00Z');const ts=Math.floor(clock()/1000);
function token(extra={},headerExtra={}) {
 const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test',...headerExtra})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({aud:'china-eastern',iss:'https://securetoken.google.com/china-eastern',sub:'reviewer-id',email:'lake@mu.com',email_verified:true,iat:ts-60,auth_time:ts-120,exp:ts+600,...extra})).toString('base64url');
 const signing=header+'.'+payload;return signing+'.'+crypto.sign('RSA-SHA256',Buffer.from(signing),privateKey).toString('base64url');
}
test('policy reviewer comes from a signed Firebase identity, with cached Google keys',async()=>{
 let calls=0;const verify=createReviewerVerifier({clock,fetcher:async()=>{calls++;return new Response(JSON.stringify({test:publicKey.export({type:'spki',format:'pem'})}),{headers:{'cache-control':'max-age=600'}});}});
 assert.equal((await verify(token())).reviewer,'lake@mu.com');await verify(token());assert.equal(calls,1);
 await assert.rejects(verify(token({email:'agent@example.com'})),/cannot publish/);
 await assert.rejects(verify(token().slice(0,-16)+'AAAAAAAAAAAAAAAA'),/Invalid/);
});
test('unsigned, expired, unverified and other-project identities cannot approve rules',async()=>{
 const verify=createReviewerVerifier({clock,fetcher:async()=>{throw Error('Should not fetch keys');}});
 for(const t of [token({}, {alg:'none'}),token({exp:ts}),token({iat:ts+1}),token({auth_time:ts+1}),token({aud:'other'}),token({iss:'https://example.com'}),token({email_verified:false}),token({sub:''}),'not-a-token'])await assert.rejects(verify(t),/Invalid/);
});
