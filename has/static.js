const path=require('node:path'),fs=require('node:fs'),express=require('express');
const manifest=require('./manifest.json'),publicRoot=path.join(__dirname,'public');
const files=new Set(manifest.frontend);
function router(){const result=express.Router();result.use('/has',express.static(publicRoot,{setHeaders:res=>res.set('Cache-Control','no-store')}));result.use((req,res,next)=>{
 if(!['GET','HEAD'].includes(req.method))return next();
 let name=req.path.replace(/^\//,'');
 if(name==='admin')return res.redirect(302,'/hr');
 if(!files.has(name)&&!path.extname(name)&&files.has(name+'.html'))name+='.html';
 if(!files.has(name))return next();const target=path.join(publicRoot,name);if(!fs.existsSync(target))return next();res.set('Cache-Control','no-store');return res.sendFile(target);
 });return result;}
function withShared(root,options){const result=router();result.use(express.static(root,options));return result;}
module.exports={publicRoot,router,withShared};
