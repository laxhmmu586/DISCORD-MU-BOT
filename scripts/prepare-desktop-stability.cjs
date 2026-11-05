// BASE_APP OUTPUT VERSION ASAR_MODULE; preserves every unrelated packaged file.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const [baseArg,outArg,version,asarArg]=process.argv.slice(2);assert(baseArg&&outArg&&asarArg&&/^\d+\.\d+\.\d+$/.test(version));
 const base=path.resolve(baseArg),out=path.resolve(outArg),asar=require(path.resolve(asarArg));assert(!fs.existsSync(out));assert(!out.startsWith(base+path.sep));
 const release=path.join(out,'release-app'),source=path.join(out,'app-source'),archive=path.join(base,'resources/app.asar');
 fs.cpSync(base,release,{recursive:true});asar.extractAll(archive,source);
 const file=name=>path.join(source,name),read=name=>fs.readFileSync(file(name),'utf8'),write=(name,text)=>fs.writeFileSync(file(name),text);
 write('package.json',JSON.stringify({...JSON.parse(read('package.json')),version},null,2)+'\n');
 for(const [from,to] of [['local-live.cjs','src/local-live.js'],['search-cache.cjs','src/search-cache.js']])write(to,fs.readFileSync(path.join(__dirname,'desktop-stability',from)));
 let server=read('src/server.js');
 assert(server.includes('const local = search(log, q, context);'));
 server=server.replace('const store = new LogStore(settings);',"const store = new LogStore(settings);\n  const cachedSearch = require('./search-cache').createSearchCache(search);")
  .replace('const local = search(log, q, context);','const local = cachedSearch(log, q, context);')
  .replace("${cacheParams}:${local.sy.localLogRevision}","${cacheParams}");
 write('src/server.js',server);
 let html=read('web/index.html');assert(html.includes('const SY_BACKUP_REFRESH_MS = 5 * 1000;'));
 html=html.replace('const SY_BACKUP_REFRESH_MS = 5 * 1000;','const SY_BACKUP_REFRESH_MS = 30 * 1000;')
  .replace('sy.desktopCloud, sy.localLogRevision, sy.fscRateSheetSync','sy.desktopCloud, sy.fscRateSheetSync');
 html=html.replace('</head>','<link rel="stylesheet" href="/desktop-stability.css"></head>');write('web/index.html',html);
 write('web/desktop-stability.css',fs.readFileSync(path.join(__dirname,'desktop-stability/dashboard.css')));
 const target=path.join(release,'resources/app.asar');await asar.createPackage(source,target);
 const changed=[];for(const entry of asar.listPackage(archive)){const name=entry.replace(/^[\\/]/,'');if(asar.statFile(archive,name).files)continue;if(!asar.extractFile(archive,name).equals(asar.extractFile(target,name)))changed.push(name.replace(/\\/g,'/'));}
 assert.deepEqual(changed.sort(),['package.json','src/local-live.js','src/server.js','web/index.html']);
 const manifest={version,changed,added:['src/search-cache.js','web/desktop-stability.css'],archiveSha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
