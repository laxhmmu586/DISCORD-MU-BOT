'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function applyJetBridgeLink(source){
 const page=path.join(source,'web/flights.html'),main=path.join(source,'src/main.js');
 let html=fs.readFileSync(page,'utf8'),code=fs.readFileSync(main,'utf8');
 const handler='window.webContents.setWindowOpenHandler(({ url }) => {';
 const rule="if(url === 'https://has-station.com/has-pbb.html'){shell.openExternal(url);return {action:'deny'};}";
 assert(code.includes(handler),'Review the desktop external-link handler before applying this patch');
 if(!code.includes(rule))code=code.replace(handler,handler+'\n      '+rule);
 if(!html.includes('/jetbridge-link.js'))html=html.replace('</head>','<script defer src="/jetbridge-link.js"></script></head>');
 assert(html.includes('/jetbridge-link.js'),'Flight selection page has no head closing tag');
 html=html.replace(/href="\/has-pbb\.html"/g,'href="https://has-station.com/has-pbb.html" target="_blank" rel="noopener noreferrer"');
 fs.copyFileSync(path.join(__dirname,'jetbridge-link.js'),path.join(source,'web/jetbridge-link.js'));
 fs.writeFileSync(page,html);fs.writeFileSync(main,code);
}
module.exports={applyJetBridgeLink};
if(require.main===module)applyJetBridgeLink(path.resolve(process.argv[2]));
