const positions = require('../public/employee-positions');
const accountGroups = require('../public/employee-account-groups');
const {isOwner} = require('./serverOwners');
const permissionEditors=new Set(['lake@mu.com','nextweek1216@gmail.com']);
const canManage=user=>permissionEditors.has(String(user?.email||'').trim().toLowerCase());

function pagePermissions(db, page, directory) {
 db.exec('CREATE TABLE IF NOT EXISTS page_view_permissions(page TEXT PRIMARY KEY, revision INTEGER NOT NULL, roles TEXT NOT NULL, members TEXT NOT NULL)');
 if(!db.prepare('PRAGMA table_info(page_view_permissions)').all().some(column=>column.name==='accounts')) {
  db.exec("ALTER TABLE page_view_permissions ADD COLUMN accounts TEXT NOT NULL DEFAULT '[]'");
 }
 const read = () => {
  const row = db.prepare('SELECT revision,roles,members,accounts FROM page_view_permissions WHERE page=?').get(page);
  return row ? {restricted:row.roles!=='null',revision:row.revision,roles:JSON.parse(row.roles)||[],members:JSON.parse(row.members),accounts:JSON.parse(row.accounts)}
   : {restricted:false,revision:0,roles:[],members:[],accounts:[]};
 };
 const memberships = employee => [accountGroups.scope(employee),...(employee.additionalAccounts||[]).map(accountGroups.scope)];
 const members = () => directory().map(({id,name,station,account})=>({id:String(id),name,station,account}));
 return {
  restricted:()=>read().restricted,
  allows(user, employee, defaultAccess) {
   if (isOwner(user)) return defaultAccess;
   const policy = read();
   if(!policy.restricted)return defaultAccess;
   if(!employee)return false;
   return policy.roles.includes(positions.normalize(employee.position))
    || policy.members.includes(String(employee.id))
    || memberships(employee).some(scope=>policy.accounts.some(account=>accountGroups.same(account,scope)));
  },
  register(app, path, authenticatedUser) {
   const handle = async (req,res) => {
    const user=authenticatedUser(req);
    if (!canManage(user)) return res.status(403).json({error:'Page permission management access denied.'});
    try {
     const directoryMembers=members();
     const accountOptions=()=>[...new Map([...accountGroups.catalog.map(accountGroups.scope),...directory().flatMap(memberships),...read().accounts].map(scope=>[accountGroups.key(scope),scope])).values()]
      .sort((a,b)=>a.station.localeCompare(b.station)||a.account.localeCompare(b.account));
     if (req.method==='POST') {
      const {restricted,revision,roles,members:selected}=req.body||{};
      const current=read();
      const accounts=req.body?.accounts===undefined?current.accounts:req.body.accounts;
      const knownAccounts=new Set(accountOptions().map(accountGroups.key));
      const known=new Set([...directoryMembers.map(member=>member.id),...current.members]);
      if(typeof restricted!=='boolean'||!Array.isArray(roles)||!Array.isArray(selected)||!Array.isArray(accounts)
       ||roles.some(role=>!positions.selectablePositions.includes(role))||selected.some(id=>!known.has(id))
       ||accounts.some(account=>!account||typeof account.station!=='string'||typeof account.account!=='string'
        ||!account.station.trim()||!account.account.trim()||!knownAccounts.has(accountGroups.key(account)))) {
       return res.status(400).json({error:'Choose valid roles, accounts and employees.'});
      }
      if(revision!==current.revision)return res.status(409).json({error:'Permissions changed. Reopen the dialog and try again.'});
      // A default policy keeps its revision so a stale editor cannot overwrite a reset.
      const result=db.prepare('INSERT INTO page_view_permissions (page,revision,roles,members,accounts) VALUES (?,?,?,?,?) ON CONFLICT(page) DO UPDATE SET revision=excluded.revision,roles=excluded.roles,members=excluded.members,accounts=excluded.accounts WHERE page_view_permissions.revision=?')
       .run(page,revision+1,JSON.stringify(restricted?[...new Set(roles)]:null),JSON.stringify(restricted?[...new Set(selected)]:[]),JSON.stringify(restricted?[...new Map(accounts.map(account=>[accountGroups.key(account),accountGroups.scope(account)])).values()]:[]),revision);
      if(!result.changes)return res.status(409).json({error:'Permissions changed. Reopen the dialog and try again.'});
     }
     res.json({...read(),roleOptions:positions.selectablePositions,accountOptions:accountOptions(),memberOptions:directoryMembers});
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
