const positions = require('../public/employee-positions');
const {isOwner} = require('./serverOwners');
const permissionEditors=new Set(['lake@mu.com','nextweek1216@gmail.com']);
const canManage=user=>permissionEditors.has(String(user?.email||'').trim().toLowerCase());

function pagePermissions(db, page, directory) {
 db.exec('CREATE TABLE IF NOT EXISTS page_view_permissions(page TEXT PRIMARY KEY, revision INTEGER NOT NULL, roles TEXT NOT NULL, members TEXT NOT NULL)');
 const read = () => {
  const row = db.prepare('SELECT revision,roles,members FROM page_view_permissions WHERE page=?').get(page);
  return row ? {restricted:row.roles!=='null',revision:row.revision,roles:JSON.parse(row.roles)||[],members:JSON.parse(row.members)}
   : {restricted:false,revision:0,roles:[],members:[]};
 };
 const members = () => directory().map(({id,name,station,account})=>({id:String(id),name,station,account}));
 return {
  restricted:()=>read().restricted,
  allows(user, employee, defaultAccess) {
   if (isOwner(user)) return defaultAccess;
   const policy = read();
   return policy.restricted ? !!employee && (policy.roles.includes(positions.normalize(employee.position)) || policy.members.includes(String(employee.id))) : defaultAccess;
  },
  register(app, path, authenticatedUser) {
   const handle = async (req,res) => {
    const user=authenticatedUser(req);
    if (!canManage(user)) return res.status(403).json({error:'Page permission management access denied.'});
    try {
     const directoryMembers=members();
     if (req.method==='POST') {
      const {restricted,revision,roles,members:selected}=req.body||{};
      const current=read();
      const known=new Set([...directoryMembers.map(member=>member.id),...current.members]);
      if(typeof restricted!=='boolean'||!Array.isArray(roles)||!Array.isArray(selected)||roles.some(role=>!positions.selectablePositions.includes(role))||selected.some(id=>!known.has(id))) {
       return res.status(400).json({error:'Choose valid roles and employees.'});
      }
      if(revision!==current.revision)return res.status(409).json({error:'Permissions changed. Reopen the dialog and try again.'});
      // A default policy keeps its revision so a stale editor cannot overwrite a reset.
      db.prepare('INSERT INTO page_view_permissions VALUES (?,?,?,?) ON CONFLICT(page) DO UPDATE SET revision=excluded.revision,roles=excluded.roles,members=excluded.members')
       .run(page,revision+1,JSON.stringify(restricted?[...new Set(roles)]:null),JSON.stringify(restricted?[...new Set(selected)]:[]));
     }
     res.json({...read(),roleOptions:positions.selectablePositions,memberOptions:directoryMembers});
    } catch {
     res.status(500).json({error:'Page permissions are unavailable.'});
    }
   };
   app.get(path,handle);
   app.post(path,handle);
  }
 };
}
module.exports = {pagePermissions};
