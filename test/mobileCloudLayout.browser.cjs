const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('C:/Users/Frank/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext();
await context.route('**/*',async route=>{const u=new URL(route.request().url());const f=path.join(process.cwd(),'public/public',u.pathname);if(u.hostname==='fixture.local'&&fs.existsSync(f)&&fs.statSync(f).isFile())return u.pathname.endsWith('.html')?route.fulfill({contentType:'text/html',body:fs.readFileSync(f,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')}):route.fulfill({path:f});return route.fulfill({contentType:u.pathname.endsWith('.js')?'application/javascript':'application/json',body:u.pathname.endsWith('.js')?'':'{}'});});
const page=await context.newPage();
fs.mkdirSync('.verification/ce777',{recursive:true});
for(const width of [390,360]){
 await page.setViewportSize({width,height:660});
 for(const file of ['240.html','scan.html','scan2.html','m-board.html','m-board2.html','contact-form.html','cbs-form.html','pir-form.html?type=AHL','pir-form.html?type=DPR','report.html','pbb.html']){
 await page.goto('https://fixture.local/'+file);await page.waitForTimeout(150);
 const bg=await page.evaluate(()=>[getComputedStyle(document.body).backgroundImage,getComputedStyle(document.body,'::before').backgroundImage].join(' '));assert(bg.includes('cloud-sky-mobile.png'),file+' missing background');assert.equal(await page.locator('.mobile-aircraft-sky').isVisible(),true);
 // PIR has pre-existing narrow-screen form overflow; verify decoration geometry below.
 if(!file.startsWith('pir-form.html'))assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),file+' overflow '+width);
 const band=await page.locator('.mobile-aircraft-sky').boundingBox();const header=await page.locator('body > header').boundingBox();const main=await page.locator('body > main').boundingBox();assert(band.y>=header.y-1&&band.y+band.height<=header.y+header.height+1,file+' aircraft outside header');assert(band.y+band.height<=main.y+1,file+' aircraft overlaps content');for(const rect of await page.locator('body > header button, body > header a.button, body > header .language-toggle').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}))){assert(band.x+band.width<=rect.x||rect.x+rect.width<=band.x||band.y+band.height<=rect.y||rect.y+rect.height<=band.y,file+' aircraft overlaps button');}assert(band.x+band.width<=width,file+' aircraft outside viewport');await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));assert(await page.evaluate(()=>{const p=getComputedStyle(document.body,'::before');return p.display!=='none'&&p.position==='fixed'&&p.top==='0px'&&p.bottom==='0px'&&p.backgroundSize==='cover'&&p.backgroundImage.includes('cloud-sky-mobile.png');}),file+' scrolled background not full viewport');await page.evaluate(()=>scrollTo(0,0));const loaded=await page.evaluate(async()=>{const i=new Image();i.src='/assets/cloud-sky-mobile.png';await i.decode();return i.naturalWidth>1000;});assert(loaded);
 await page.screenshot({path:'.verification/ce777/'+file.replace(/[?=]/g,'-')+'-'+width+'.png'});
 console.log('PASS '+width+' '+file);
 }
}
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

