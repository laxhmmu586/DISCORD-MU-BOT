const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),items=require('../has/public/pbb-data');
test('short screen prompts leave all original PDF question wording unchanged',()=>{
 const rows=Object.values(items).flat();assert.equal(crypto.createHash('sha256').update(JSON.stringify(rows.map(x=>[x.id,x.text]))).digest('hex'),'7d21118aaa7f845949ebab63b38f10b1b4627b584fb4c0d438bcbd2e24df39ba');
 for(const row of rows){assert.ok(row.prompt,'screen prompt for '+row.id);if(row.id!=='d11')assert.ok(row.prompt.length<=row.text.length,'shorter prompt for '+row.id);}
 assert.equal(items.departure.find(x=>x.id==='d11').prompt,'Turn the key to OFF and remove it.');
 assert.equal(items.arrival.find(x=>x.id==='a10').defaultValue,'NA');
 for(const id of ['a8','a9']){const row=items.arrival.find(x=>x.id===id);if(!row.trainingIllustration)assert.ok(row.photos[0].endsWith('-realistic.webp'));assert.ok(fs.existsSync(path.join(__dirname,'../has/public/assets/pbb',row.photos[0])));}
});
