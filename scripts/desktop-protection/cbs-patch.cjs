const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function applyCbs(source,root){
 const read=n=>fs.readFileSync(path.join(source,n),'utf8'),write=(n,v)=>{fs.mkdirSync(path.dirname(path.join(source,n)),{recursive:true});fs.writeFileSync(path.join(source,n),v);};
 const copied=new Set();
 function copy(name){
  if(name.includes('${')){const prefix=name.slice(0,name.indexOf('${'));if(!prefix.endsWith('/'))return;name=prefix;}
  name=path.posix.normalize(name.replace(/^\//,''));if(copied.has(name)||name.startsWith('../')||name.startsWith('__/'))return;
  const candidate=[path.join(root,'public/public',name),path.join(root,'has/public',name.replace(/^has\//,''))].find(f=>fs.existsSync(f));
  if(!candidate){assert(fs.existsSync(path.join(source,'web',name)),'Missing CBS dependency: '+name);return;}
  copied.add(name);
  if(fs.statSync(candidate).isDirectory()){fs.cpSync(candidate,path.join(source,'web',name),{recursive:true});return;}
  let data=fs.readFileSync(candidate);
  if(/\.(?:html|js|css)$/.test(name)){
   let text=data.toString();if(name.endsWith('.html'))text=text.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-(?:app|auth)-compat\.js)/g,'/assets/firebase/$1');
   const refs=[];
   for(const m of text.matchAll(/(?:src|href)=["']([^"'?#]+)(?:[^"']*)?["']/g))if(/\.(?:js|css|png|webp|jpg|svg|hdr|ttf|woff2?)$/.test(m[1]))refs.push(m[1]);
   for(const m of text.matchAll(/(?:from\s*|import\s*)["']([^"'?#]+)(?:[^"']*)?["']/g))if(m[1].startsWith('.')||m[1].startsWith('/'))refs.push(m[1]);
   for(const m of text.matchAll(/url\(\s*["']?([^"')?#\s]+)/g))if(!m[1].startsWith('data:'))refs.push(m[1]);
   for(const m of text.matchAll(/new URL\(["']([^"'?#]+)(?:[^"']*)?["']/g))refs.push(m[1]);
   for(const m of text.matchAll(/["'`](\/assets\/[a-zA-Z0-9_./-]+)/g))refs.push(m[1]);
   for(const ref of refs){if(/^(?:https?:|data:|blob:)/.test(ref))continue;const target=ref.startsWith('/')?ref.slice(1):path.posix.join(path.posix.dirname(name),ref);copy(target);}
   data=Buffer.from(text);
  }
  write('web/'+name,data);
 }
 for(const name of ['cbs.html','cbs-form.html','pir-form.html','assets/cbs-icons','assets/baggage-guide-3d','assets/640653098-BAGGAGE-CHART-11_01.png','assets/640653098-BAGGAGE-CHART-11_02.png'])copy(name);
 let cbs=read('web/cbs.html');
 cbs=cbs.replace('<script src="/__/firebase/init.js"></script>','<script src="/__/firebase/init.js"></script><script src="/desktop-lbs.js"></script><script src="/cbs-stream.js"></script>');
 cbs=cbs.replace('if (auth) await auth.signOut().catch(() => {});',"await fetch('/desktop-auth',{method:'DELETE',keepalive:true});\n      if (auth) await auth.signOut().catch(() => {});");
 cbs=cbs.replace(/    function connectCbsLiveSync\(\) \{[\s\S]*?\n    \}/,`    function connectCbsLiveSync() {
      const stop=connectCbsStream({fetch:window.fetch.bind(window),url:apiBase+'/cbs-live-stream',
        onConnected(){cbsLiveConnected=true;cbsLiveStatus.textContent='Live · changes only';cbsLiveStatus.className='cbs-live-status connected';},
        onRefresh:scheduleCbsLiveRefresh,
        onError(){cbsLiveConnected=false;cbsLiveStatus.textContent='Reconnecting…';cbsLiveStatus.className='cbs-live-status reconnecting';}});
      window.addEventListener('pagehide',stop,{once:true});
    }`);
 assert(cbs.includes('const stop=connectCbsStream'));write('web/cbs.html',cbs);
 write('web/cbs-stream.js',fs.readFileSync(path.join(__dirname,'cbs-stream.js')));
 // Keep the sidebar's CBS Form link when the general desktop adapter removes web-only forms.
 let ui=read('web/desktop-ui.js');
 if(!ui.includes('CBS forms stay local'))ui=ui.replace("    if (new URL(item.getAttribute('href')", "    // CBS forms stay local.\n    if (/^\\/(?:cbs|pir)-form\\.html$/.test(pathname)) continue;\n    if (new URL(item.getAttribute('href')");
 write('web/desktop-ui.js',ui);
 let policy=read('src/desktop-policy.js');
 if(!policy.includes('CBS local forms'))policy=policy.replace('const excludedPage =','const previousExcludedPage =').replace('module.exports = { excludedPage };',"// CBS local forms\nconst excludedPage=pathname=>/^\\/(?:cbs|pir)-form(?:\\.html)?$/i.test(pathname)?false:previousExcludedPage(pathname);\nmodule.exports = { excludedPage };");
 write('src/desktop-policy.js',policy);
 let server=read('src/server.js');server=server.replace('|cbs|has-pbb','|cbs|cbs-form|pir-form|has-pbb');write('src/server.js',server);
 return [...copied];
}
module.exports={applyCbs};
