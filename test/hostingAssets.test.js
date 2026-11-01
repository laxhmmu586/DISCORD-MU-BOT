const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const hosting=require('../public/firebase.json').hosting;
function hostedFile(url){
 const pathname=new URL(url,'https://www.mufcapp.net').pathname;
 if(pathname.startsWith('/has/'))return path.join(__dirname,'../has/public',pathname.slice(5));
 const direct=path.join(__dirname,'../public/public',pathname);if(fs.existsSync(direct))return direct;
 const rewrite=hosting.rewrites.find(row=>row.source===pathname);
 return rewrite?.destination?.startsWith('/has/')?path.join(__dirname,'../has/public',rewrite.destination.slice(5)):null;
}
for(const page of ['briefing','has-report'])test(page+' script and stylesheet URLs resolve through Firebase Hosting, not only the Express development router',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../has/public',page+'.html'),'utf8');
 for(const tag of html.match(/<(?:script|link)\b[^>]*>/g)||[]){
  const url=tag.match(/(?:src|href)="([^\"]+)"/)?.[1];if(!url?.startsWith('/')||url.startsWith('/__/')||!/[.](?:js|css)(?:[?]|$)/.test(url))continue;
  const file=hostedFile(url);assert(file&&fs.existsSync(file),'Missing deployed asset route: '+url);
 }
});
test('legacy default-settings and report-grid root URLs remain valid for cached pages',()=>{
 for(const url of ['/briefing-defaults.js','/briefing-defaults.css','/has-report-grid.js'])assert(hostedFile(url)&&fs.existsSync(hostedFile(url)),url);
});
