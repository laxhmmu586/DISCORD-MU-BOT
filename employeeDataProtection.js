// Keep legacy internal identifiers for record linkage, but never publish EID in employee information.
function withoutEid(value) {
  if(Array.isArray(value))return value.map(withoutEid);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key.toLowerCase()!=='eid').map(([key,item])=>[key,withoutEid(item)]));
  return value;
}
function middleware(req,res,next) {
  if(/^\/(?:employee-admin-api|profile-api|employee-pending-api)(?:\/|$)/.test(req.path)) {
    const json=res.json.bind(res);res.json=value=>json(withoutEid(value));
  }
  next();
}
module.exports={withoutEid,middleware};
