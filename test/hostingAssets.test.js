const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const hosting=require('../public/firebase.json').hosting;
function hostedFile(url){
 const pathname=new URL(url,'https://www.mufcapp.net').pathname;
 if(pathname.startsWith('/has/'))return path.join(__dirname,'../has/public',pathname.slice(5));
 const direct=path.join(__dirname,'../public/public',pathname);if(fs.existsSync(direct))return direct;
 const rewrite=hosting.rewrites.find(row=>row.source===pathname);
 return rewrite?.destination?.startsWith('/has/')?path.join(__dirname,'../has/public',rewrite.destination.slice(5)):null;
}
for(const page of ['briefing','has-report','qa','has-pbb-dashboard','read-sign','has-report-dashboard'])test(page+' script and stylesheet URLs resolve through Firebase Hosting, not only the Express development router',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../has/public',page+'.html'),'utf8');
 for(const tag of html.match(/<(?:script|link)\b[^>]*>/g)||[]){
  const url=tag.match(/(?:src|href)="([^\"]+)"/)?.[1];if(!url?.startsWith('/')||url.startsWith('/__/')||!/[.](?:js|css)(?:[?]|$)/.test(url))continue;
  const file=hostedFile(url);assert(file&&fs.existsSync(file),'Missing deployed asset route: '+url);
 }
});
test('legacy default-settings and report-grid root URLs remain valid for cached pages',()=>{
 for(const url of ['/briefing-defaults.js','/briefing-defaults.css','/has-report-grid.js','/has-report-alignment.js','/dashboard-charge.js'])assert(hostedFile(url)&&fs.existsSync(hostedFile(url)),url);
});

test('dashboard entry pages and animation assets bypass stale caches',()=>{
 const paths=['/QA','/qa.html','/has-report-dashboard.html','/has-report-dashboard.js','/has-report-dashboard.css','/has/dashboard-charge.js','/has/has-pbb-dashboard.js','/has/read-sign.js'];
 for(const pathname of paths){
  const policies=hosting.headers.filter(rule=>rule.source==='/has/**'?pathname.startsWith('/has/'):rule.source.startsWith('/{')?rule.source.slice(2,-1).split(',').some(name=>pathname==='/'+name):rule.source===pathname);
  assert(policies.some(rule=>rule.headers.some(header=>header.key==='Cache-Control'&&header.value.includes('no-store'))),pathname);
 }
});
