const express=require('express');
const {pagePermissions}=require('./pagePermissions');

const pages={
 'account-settings':[], 'admin':[], 'approval-workflow':[], 'attendance-request':[],
 attendance:[], 'has-checklist':[], 'has-form':['/new-access-api'],
 'has-pbb':['/has-pbb-api'], 'has-report-dashboard':[],
 'has-report':['/has-report-api','/incident-api','/expense-api','/terrific-api'],
 home:[], hr:['/employee-admin-api'], info:[], 'my-approvals':[], profile:[],
 'read-sign':['/read-sign-api'], schedule:['/staff-schedule-api'], uniform:['/uniform-api']
};

function registerWorkspacePagePermissions(app,{employees,profiles,authenticate}){
 const linked=user=>profiles.linked(user);
 const directory=()=>employees.get().employees.filter(row=>!row.mergedInto);
 for(const [page,apis] of Object.entries(pages)){
  const policy=pagePermissions(employees.db,page,directory),path='/has-page-api/'+page;
  const authenticatePage=async(req,res,next)=>{
   res.set('Cache-Control','private, no-store');
   try{req.pageUser=await authenticate(req,{allowUnlinkedGoogle:true});}
   catch{return res.status(401).json({error:'Sign in required.'});}
   next();
  };
  app.use(path,express.json({limit:'64kb'}),authenticatePage);
  app.get(path+'/access',(req,res)=>res.json({canAccess:!policy.restricted()||policy.allows(req.pageUser,linked(req.pageUser),true)}));
  policy.register(app,path+'/permissions',req=>req.pageUser);
  for(const api of apis)app.use(api,(req,res,next)=>{
   if(!policy.restricted()||page==='has-pbb'&&req.path.startsWith('/dashboard'))return next();
   return authenticatePage(req,res,()=>{
    if(!policy.allows(req.pageUser,linked(req.pageUser),true))return res.status(403).json({error:'Page access denied.'});
    next();
   });
  });
 }
}
module.exports={registerWorkspacePagePermissions};
