const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {renderAdvisory,IMAGE_BOUNDS}=require('../etabImage');
for(const gate of ['134','TBA','201','203','225A'])test('ETAB '+gate+' keeps five opaque panels with transparent gutters and surround',async()=>{
 const image=await renderAdvisory({date:'2026-10-14',arrival:{flight:'MU583',gate,eta:'0922L',reg:'B-7343',pax:'279/0',crew:'04/17'},departure:{flight:'MU586',timeType:'STD',time:'1230L'}});
 const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,IMAGE_BOUNDS.width);assert.equal(info.height,IMAGE_BOUNDS.height);
 const alpha=(x,y)=>data[(y*info.width+x)*4+3];
 for(const [x,y] of [[0,0],[info.width-1,0],[0,info.height-1],[info.width-1,info.height-1]])assert.equal(alpha(x,y),0);
 assert.equal(alpha(Math.floor(info.width/2),0),255);
 // Check PNG alpha, rather than a painted chat background.
 const sourceAlpha=(x,y)=>alpha(x-IMAGE_BOUNDS.left,y-IMAGE_BOUNDS.top);
 const night=gate==='TBA',day=gate==='134';
 const top=day?480:night?460:458,bottom=day?663:night?643:639;
 for(const x of [70,300,450,650,840]){
  assert.equal(sourceAlpha(x,top-9),0,'banner-to-cards gap');
  assert.equal(sourceAlpha(x,bottom-9),0,'gap between card rows');
 }
 for(const y of [top+40,top+110,bottom+40,bottom+110]){
  assert.equal(sourceAlpha(450,y),0,'gap between card columns');
  assert.equal(sourceAlpha(27,y),0,'left surround');
  assert.equal(sourceAlpha(875,y),0,'right surround');
 }
 for(const [x,y] of [[300,200],[300,top+70],[700,top+70],[300,bottom+90],[700,bottom+90]]){
  assert.equal(sourceAlpha(x,y),255,'panel content remains opaque');
 }
 assert.equal(sourceAlpha(450,860),0,'bottom surround');
 for(const y of [top,bottom])for(const x of [day?30:33,day?456:night?460:461]){
  assert.equal(sourceAlpha(x+1,y+1),0,'individual card corner');
 }
});
