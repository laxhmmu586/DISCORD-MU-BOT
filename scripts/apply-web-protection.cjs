// Idempotent source migration; original private assets remain available to the desktop packager.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),write=(p,v)=>fs.writeFileSync(path.join(root,p),v);
let html=read('public/public/flights.html');
html=html.replace(/<a\b[^>]*href="\/(?:report|cbs)\.html"[^>]*>[\s\S]*?<\/a>/g,'');
write('public/public/flights.html',html);
let js=read('public/public/flights.js');
js=js.replace(/^  const enter = flight =>.*\r?\n/m,'');
js=js.replace(/<button class="flight-enter"[\s\S]*?<\/button>/,'');
js=js.replace(/^          card\.querySelector\('\.flight-enter'\).*\r?\n/m,'');
write('public/public/flights.js',js);
for(const file of fs.readdirSync(path.join(root,'public/public')).filter(f=>f.endsWith('.html')&&!require('../desktopProtection').privateFiles.includes(f))) {
  let value=read('public/public/'+file);
  value=value.replace(/<a\b[^>]*href="\/?(?:index|report|reports|cbs|info)(?:\.html)?(?:[?#][^"]*)?"[^>]*>[\s\S]*?<\/a>/g,'');
  write('public/public/'+file,value);
}
// Remove links in every workspace page, including sidebars that are not built dynamically.
for(const file of fs.readdirSync(path.join(root,'has/public')).filter(f=>f.endsWith('.html'))) {
  let value=read('has/public/'+file);
  value=value.replace(/<a\b[^>]*href="\/(?:info(?:\.html)?|has-pbb(?:\.html)?)"[^>]*>[\s\S]*?<\/a>/g,'');
  write('has/public/'+file,value);
}
js=read('has/public/workspace-shell.js').replace(/^    \['\/info'.*\r?\n/m,'').replace(/^    \['\/has-pbb\.html'.*\r?\n/m,'');
js=js.replace(/^  if \(!document\.querySelector\('script\[src\*="info-access\.js"\]'\)\).*\r?\n/m,'');
write('has/public/workspace-shell.js',js);
js=read('has/public/employee-sidebar-art.js').replace(/  if\(!footer\.hasAttribute\('data-employee-art'\)[\s\S]*?\n  }\r?\n/,'');
write('has/public/employee-sidebar-art.js',js);
write('has/public/info-access.js',"(()=>{window.employeeInfoAccess=async()=>false;document.querySelectorAll('[data-info-access]').forEach(el=>el.remove());})();\n");
js=read('has/public/workspace-routes.js').replace("'hr', 'info',","'hr',");write('has/public/workspace-routes.js',js);
js=read('public/public/employees-client.js').replace("['eid','phone','email','companyEmail']","['phone','email','companyEmail']");write('public/public/employees-client.js',js);
js=read('has/public/employee-pending.js').replace("row.name+(row.eid?' · '+row.eid:'')","row.name");write('has/public/employee-pending.js',js);
js=read('has/public/uniform-client.js').replace(",['Employee number',p.eid]",'');write('has/public/uniform-client.js',js);
const config=JSON.parse(read('public/firebase.json')),protection=require('../desktopProtection');
const excluded=[...protection.privateFiles,'info.html','info.js','info-access.js'];
config.hosting.ignore=[...new Set([...config.hosting.ignore,...excluded.map(n=>'**/'+n)])];
config.hosting.redirects=config.hosting.redirects.filter(r=>!/^\/info(?:\.html|\/)?$/.test(r.source));
config.hosting.rewrites=config.hosting.rewrites.filter(r=>!/^\/info(?:\.html|\/)?$/.test(r.source));
const blocked=[...new Set([...excluded,...['index','report','reports','cbs','lbs','info']])];
config.hosting.rewrites=config.hosting.rewrites.filter(r=>!blocked.some(n=>r.source==='/'+n||r.source==='/has/'+n));
config.hosting.rewrites.unshift(...blocked.flatMap(n=>['/'+n,'/has/'+n,'/public/'+n,'/public/public/'+n].map(source=>({source,destination:n.startsWith('info')?'/removed.html':'/desktop-only.html'}))));
config.hosting.rewrites=config.hosting.rewrites.filter((row,index,rows)=>rows.findIndex(other=>other.source===row.source)===index);
// Keep Dashboard source excluded and let Hosting return its real 404 page.
config.hosting.rewrites=config.hosting.rewrites.filter(row=>!/^(?:\/public){0,2}(?:\/has)?\/index(?:\.html)?\/?$/.test(row.source));
write('public/firebase.json',JSON.stringify(config,null,2)+'\n');
console.log('Updated web navigation and hosting exclusion rules.');
