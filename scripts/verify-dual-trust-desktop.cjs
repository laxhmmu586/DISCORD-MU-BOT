const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.resolve(process.argv[2]),config=require(path.join(source,'update-config.json'));
const oldEnvelope=JSON.parse(fs.readFileSync(process.argv[3])),newEnvelope=JSON.parse(fs.readFileSync(process.argv[4]));
const {Updater}=require(path.join(source,'src/updates/updater.cjs'));
assert.deepEqual(Object.keys(config.keys).sort(),['mufc-2026','mufc-lax-20261108'].sort());
assert(config.coreCertificateThumbprints.includes('877C05BF6EA092C78B8C5A3F081BF25855EFB390'));
assert(config.coreCertificateThumbprints.includes('0CD6CA0573BCC9CC94B13ECFDCD3581BCC92A341'));
for(const envelope of [oldEnvelope,newEnvelope]){const payload=JSON.parse(Buffer.from(envelope.payload,'base64'));const updater=new Updater({coreVersion:payload.coreVersion,config});updater.baseline=payload.baseline;updater.verifyEnvelope(envelope);assert.throws(()=>updater.verifyEnvelope({...envelope,signature:Buffer.alloc(64).toString('base64')}),/signature/);}
const oldUi=JSON.parse(Buffer.from(oldEnvelope.payload,'base64'));for(const f of oldUi.hotfix.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(source,'web',f.path))).digest('hex'),f.sha256);
assert.equal(fs.readFileSync(path.join(source,'src/server.js'),'utf8'),require('./desktop-dual-trust/patch-server.cjs')(fs.readFileSync(path.join(root,'output/mufc-desktop-2.1.9/app-source/src/server.js'),'utf8')));
assert.equal(require(path.join(source,'package.json')).version,'2.1.11');
const form=fs.readFileSync(path.join(source,'web/charge-form.js'),'utf8'),adapter=form.slice(form.indexOf(' async function exchangeApi('),form.indexOf(' async function fetchDefaults('));const context={peopleApi:async(url,body)=>{assert.equal(url,'/briefing-api/charge-form/exchange');return body?{source:'Manual (local)',rate:body.rate}:{rate:'0.14988979'};}};
vm.runInNewContext(adapter,context);
(async()=>{assert.equal((await context.exchangeApi()).rate,'0.14988979');const saved=await context.exchangeApi({date:'2026-11-08',revision:1,rate:'0.15'});assert.equal(saved.source,'Manual (local)');console.log('PASS: both original and new manifest signatures accepted; tampering rejected; old certificate pin retained; current UI preserved; local FSC loads and persists; Core server unchanged.');})().catch(e=>{console.error(e);process.exitCode=1;});
