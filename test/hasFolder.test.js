const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const root=path.resolve(__dirname,'..'),manifest=require('../has/manifest.json');
test('all HAS sources and templates exist in the grouped folder and compatibility entries forward correctly',()=>{
 for(const name of manifest.frontend)assert(fs.existsSync(path.join(root,'has/public',name)),name);
 for(const name of manifest.server){assert(fs.existsSync(path.join(root,'has/server',name)),name);assert.match(fs.readFileSync(path.join(root,name),'utf8'),/module\.exports=require\('\.\/has\/server\//);}
 const config=require('../public/firebase.json').hosting;for(const name of manifest.frontend)assert(config.rewrites.some(rule=>rule.destination==='/has/'+name),name);
 for(const folder of ['has-checklists','has-report-templates','has-word-templates'])assert(fs.readdirSync(path.join(root,'has/resources',folder)).length>0);
 for(const name of ['home.html','profile.html','has-login.html','has-pbb.html','has-report.html','has-form.html','has-checklist.html','info.html','read-sign.html','hr.html','briefing.html','schedule.html'])assert(manifest.frontend.includes(name));
});
test('canonical and legacy HAS resources resolve without exposing server code or databases',async t=>{
 const app=express();app.use(require('../has/static').router());const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
 for(let i=0;i<manifest.frontend.length;i+=12)await Promise.all(manifest.frontend.slice(i,i+12).flatMap(name=>['/'+name,'/has/'+name]).map(async uri=>{const response=await fetch(base+uri);assert.equal(response.status,200,uri);await response.arrayBuffer();}));
 for(const uri of ['/has/server/employees.js','/has/data/EP.DB','/has/resources/pbbTemplateMap.json','/has/manifest.json'])assert.equal((await fetch(base+uri)).status,404,uri);
 for(const page of ['home','profile','hr','info','has-checklist','schedule','briefing'])assert.equal((await fetch(base+'/'+page)).status,200,page);
});
