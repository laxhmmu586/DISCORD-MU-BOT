const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path');
const fixture=path.join(__dirname,'fixtures','has-reports-startup.cjs');
for(const mode of ['missing-excel','database-recovery','new-directory'])test('HAS and employee APIs survive report initialization failure: '+mode,()=>{
 const result=spawnSync(process.execPath,[fixture,mode],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/core APIs remain available/);
});
