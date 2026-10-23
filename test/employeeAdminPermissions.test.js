const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {registerEmployees}=require('../employees');
test('existing and Gmail employee administrators can read and save records; other accounts cannot',async t=>{
 const app=express();app.use(express.json());let saves=0,changes=0;
 registerEmployees(app,{authenticate:async req=>{const email=req.headers['x-test-email'];if(!email)throw Error('Sign in required');return {uid:'fixture',email};},store:{get:()=>({revision:1,employees:[]}),save:body=>{saves++;return body;}},onChange:()=>changes++});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});const url='http://127.0.0.1:'+server.address().port+'/employee-admin-api';
 assert.equal((await fetch(url)).status,401);
 for(const email of ['lake@mu.com','nextweek1216@gmail.com','tamsun10@gmail.com','NEXTWEEK1216@GMAIL.COM']){
  const headers={'x-test-email':email,'Content-Type':'application/json'};assert.equal((await fetch(url,{headers})).status,200,email+' read');assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({revision:1,employees:[]})})).status,200,email+' save');
 }
 for(const email of ['tamsun@hm.com','employee@gmail.com','nextweek1216@gmail.com.attacker.example','tamsun10+other@gmail.com']){
  const headers={'x-test-email':email,'Content-Type':'application/json'};assert.equal((await fetch(url,{headers})).status,403);assert.equal((await fetch(url,{method:'POST',headers,body:'{}'})).status,403);
 }
 assert.equal(saves,4);assert.equal(changes,4);
});
