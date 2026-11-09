'use strict';
const crypto=require('node:crypto');
const cookieName='__Host-mufc_session';
const failure=(message,status=403)=>Object.assign(Error(message),{status});
const normal=v=>String(v||'').trim().toLowerCase();
const cookie=req=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function permitted(path,method){
 if(method!=='GET'&&method!=='POST')return false;
 return /^\/(?:has|mufc)-report-api\/(?:context$|da\/\d{4}-(?:0[1-9]|1[0-2])(?:\/(?:stream|updates|export|import|rows))?$)/.test(path)
  ||path==='/has-pbb-api'||path.startsWith('/has-pbb-api/')
  ||method==='GET'&&/^\/has-page-api\/(?:has-report|has-pbb)\/access$/.test(path)
  ||method==='GET'&&['/profile-api','/profile-api/workspace','/workspace-page-api','/page-permissions-api'].includes(path);
}
function createMufcSso({firebase,employees,blocked,groups,fetch=global.fetch,now=Date.now}){
 const pending=new Map(),sessions=new Map();
 const prune=()=>{for(const map of [pending,sessions])for(const [key,item]of map)if(item.until<=now())map.delete(key);};
 async function source(token){
  if(typeof token!=='string'||token.length>16384)throw failure('Invalid MUFC sign-in.',401);
  const response=await fetch('https://api.mufcapp.net/profile-api/workspace',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw failure('Your MUFC sign-in is no longer valid.',401);
  const result=await response.json();if(!Array.isArray(result.accounts)||!result.accounts.some(a=>a.station==='LAX'&&a.account==='MU'))throw failure('Link your MUFC employee account first.');
  // The upstream verifies the signature, project, expiry and blocked-account state.
  const claims=JSON.parse(Buffer.from(token.split('.')[1]||'','base64url'));
  if(!Number.isFinite(claims.exp)||claims.exp*1000<=now())throw failure('MUFC sign-in expired.',401);
  if(!claims.sub||!claims.email)throw failure('Your MUFC employee sign-in has no account identity.',401);
  // MUFC permits approved password accounts with an unverified email flag.
  // Trust only its authenticated workspace membership here; the matching HAS
  // identity must still be enabled and explicitly linked below.
  return claims;
 }
 function employee(email){
  const rows=employees.get().employees.filter(e=>normal(e.loginId)===normal(email)&&!e.mergedInto);
  if(rows.length!==1||rows[0].accountDisabled)throw failure('Your HAS Station employee account is unavailable.');
  return rows[0];
 }
 async function begin(token,destination){
  if(!['da','pbb'].includes(destination))throw failure('Unknown workspace.');prune();
  if(pending.size>=500||sessions.size>=1000)throw failure('Please retry shortly.',503);
  const claims=await source(token),person=employee(claims.email);
  if(!groups.belongs(person,{station:'LAX',account:'MU'}))throw failure('LAX/MU access is required.');
  const target=await firebase.getUserByEmail(normal(person.loginId));
  if(target.disabled)throw failure('Your HAS Station account is disabled.');
  const linked=employees.db.prepare('SELECT employee_id FROM employee_accounts WHERE uid=?').get(target.uid);
  if(linked?.employee_id!==person.id)throw failure('Link the matching employee account in HAS Station first.');
  const user={uid:target.uid,email:target.email,emailVerified:target.emailVerified===true,provider:'custom',authTime:claims.auth_time};
  if(blocked(employees.db,user))throw failure('Your HAS Station account is disabled.');
  const code=crypto.randomBytes(32).toString('base64url');
  pending.set(hash(code),{until:now()+30000,token,claims,user,destination});
  return {url:'https://has-station.com/mufc-sso#code='+code};
 }
 async function redeem(code){
  prune();const id=hash(String(code||'')),item=pending.get(id);pending.delete(id);
  if(!item||item.until<=now())throw failure('This sign-in link expired. Open it again from MUFC.',401);
  const person=employee(item.claims.email);if(blocked(employees.db,item.user))throw failure('Account disabled.');
  const token=crypto.randomBytes(32).toString('base64url');
  const customToken=await firebase.createCustomToken(item.user.uid,{mufcWorkspace:true});
  sessions.set(hash(token),{...item,employeeId:person.id,until:Math.min(item.claims.exp*1000,now()+15*60000),checked:now()});
  return {cookie:token,customToken,path:item.destination==='da'?'/mufc-da':'/has-pbb.html'};
 }
 async function authenticate(req){
  const token=cookie(req);if(!token)return null;
  prune();const item=sessions.get(hash(token));if(!item)throw failure('Open this workspace again from MUFC.',401);
  const requestPath=new URL(req.originalUrl||req.url||req.path,'https://has-station.com').pathname;
  if(!permitted(requestPath,req.method))throw failure('This MUFC session only permits DA and Jet Bridge.');
  const match=/^Bearer ([^\s]+)$/.exec(req.get('Authorization')||'');if(!match)throw failure('Sign in required.',401);
  const verified=await firebase.verifyIdToken(match[1],true);
  if(verified.uid!==item.user.uid)throw failure('Sign-in identity changed.',401);
  if(now()-item.checked>=15000){await source(item.token);item.checked=now();}
  const person=employee(item.claims.email);
  if(person.id!==item.employeeId||!groups.belongs(person,{station:'LAX',account:'MU'})||blocked(employees.db,item.user))throw failure('Workspace access revoked.');
  // Existing report/PBB handlers still enforce role permissions and revisions.
  req.headers['x-workspace-account']=JSON.stringify({station:'LAX',account:'MU'});
  if(/^\/(?:has|mufc)-report-api\//.test(requestPath))req.mufcReports=true;
  return item.user;
 }
 function mount(app){
  const wrap=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Sign-in is temporarily unavailable.'});}};
  app.post('/mufc-sso/start',wrap(async(req,res)=>{
   if(req.get('Origin')&&req.get('Origin')!=='https://has-station.com')throw failure('Cross-site request rejected.');
   const token=/^Bearer ([^\s]+)$/.exec(req.get('Authorization')||'')?.[1];res.json(await begin(token,req.body?.destination));
  }));
  app.post('/mufc-sso/redeem',wrap(async(req,res)=>{
   if(req.get('Origin')!=='https://has-station.com')throw failure('Cross-site request rejected.');
   const result=await redeem(req.body?.code);res.cookie(cookieName,result.cookie,{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:15*60000});
   res.json({customToken:result.customToken,path:result.path});
  }));
  app.post('/auth-api/logout',(req,res,next)=>{const token=cookie(req);if(!token)return next();if(req.get('Origin')!=='https://has-station.com')return res.sendStatus(403);sessions.delete(hash(token));res.clearCookie(cookieName,{httpOnly:true,secure:true,sameSite:'strict',path:'/'});res.sendStatus(204);});
 }
 return {begin,redeem,authenticate,mount,close(){pending.clear();sessions.clear();}};
}
module.exports={createMufcSso,permitted};
