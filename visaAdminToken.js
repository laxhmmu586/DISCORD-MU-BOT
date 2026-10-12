const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function adminToken(){
  if(process.env.VISA_ADMIN_TOKEN)return process.env.VISA_ADMIN_TOKEN;
  const filename=path.join(__dirname,'data','visa-admin-token.txt');
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  try{return fs.readFileSync(filename,'utf8').trim();}catch(e){if(e.code!=='ENOENT')throw e;}
  const token=crypto.randomBytes(32).toString('base64url');
  try{fs.writeFileSync(filename,token,{flag:'wx',mode:0o600});return token;}catch(e){if(e.code==='EEXIST')return fs.readFileSync(filename,'utf8').trim();throw e;}
}
module.exports={adminToken};
