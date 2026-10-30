const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(__dirname,'public'),target=path.join(root,'public','public','has');
const marker=path.join(target,'.has-generated.json');
if(!target.startsWith(root+path.sep)||path.basename(target)!=='has')throw Error('Invalid HAS build target');
if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink()||!fs.existsSync(marker))throw Error('Refusing to replace a folder not created by HAS build');fs.rmSync(target,{recursive:true});}
fs.cpSync(source,target,{recursive:true});
fs.writeFileSync(marker,JSON.stringify({source:'has/public',generatedAt:new Date().toISOString()}));
console.log('HAS frontend built from has/public');
