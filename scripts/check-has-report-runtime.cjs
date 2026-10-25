const path=require('node:path');
async function main(){
 const root=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'..'),reports=require(path.join(root,'hasReports'));
 const manifest=require(require.resolve('exceljs/package.json',{paths:[root]}));console.log('Excel support:',manifest.version);
 for(const kind of ['da','wwh']){const model=await reports.template(kind,'2026-10',{station:'LAX',account:'MU'});console.log(kind.toUpperCase()+': template loaded ('+model.rows+' rows)');}
 console.log('Report runtime check passed.');
}
main().catch(error=>{console.error('Report runtime check failed:',error.message);process.exitCode=1;});
