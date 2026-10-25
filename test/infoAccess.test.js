const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('Info page and navigation are removed',()=>{
 assert.equal(fs.existsSync('public/public/info.html'),false);
 for(const name of fs.readdirSync('public/public').filter(n=>n.endsWith('.html')))assert.doesNotMatch(fs.readFileSync('public/public/'+name,'utf8'),/href="\/info.html"|src="\/info-access.js/);
});
