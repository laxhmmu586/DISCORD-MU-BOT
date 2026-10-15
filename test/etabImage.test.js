const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {renderAdvisory,IMAGE_BOUNDS}=require('../etabImage');
for(const gate of ['134','TBA','203'])test('ETAB '+gate+' trims the outer frame and clears rounded corner remnants',async()=>{
 const image=await renderAdvisory({date:'2026-10-14',arrival:{flight:'MU583',gate,eta:'0922L',reg:'B-7343',pax:'279/0',crew:'04/17'},departure:{flight:'MU586',timeType:'STD',time:'1230L'}});
 const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,IMAGE_BOUNDS.width);assert.equal(info.height,IMAGE_BOUNDS.height);
 const alpha=(x,y)=>data[(y*info.width+x)*4+3];
 for(const [x,y] of [[0,0],[info.width-1,0],[0,info.height-1],[info.width-1,info.height-1]])assert.equal(alpha(x,y),0);
 assert.equal(alpha(Math.floor(info.width/2),Math.floor(info.height/2)),255);
 assert.equal(alpha(Math.floor(info.width/2),0),255);
});
