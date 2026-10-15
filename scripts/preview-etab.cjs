const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const {parseAdvisory}=require('../etabAdvisory');
const {renderAdvisory}=require('../etabImage');
async function main(){
 const dir=path.join(__dirname,'../.verification/etab');await fs.mkdir(dir,{recursive:true});
 const template=path.join(__dirname,'../assets/etab/glass-template-source.png');
 const meta=await sharp(template).metadata(),panelWidth=Math.floor(meta.width/3);
 for(const [i,mode] of ['day','night','msc'].entries())await sharp(template).extract({left:i*panelWidth,top:0,width:panelWidth,height:meta.height}).resize(900,900).png().toFile(path.join(__dirname,'../assets/etab',mode+'-template.png'));
 // A dedicated high-resolution daytime master avoids enlarging the original triptych.
 const dayMaster=path.join(__dirname,'../assets/etab/day-master-hd.png');
 try {await fs.access(dayMaster);await sharp(dayMaster).resize(900,900,{kernel:'lanczos3'}).sharpen({sigma:0.55,m1:0.4,m2:1}).png().toFile(path.join(__dirname,'../assets/etab/day-template.png'));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const images=[];
 for(const gate of ['134','TBA','203']){
  const data=parseAdvisory(`MU583/14OCT. B-7343. ETA 0922L. GATE ${gate}. PAX 279/0. CREW 04/17.\nMU586/14OCT. STD 1230L.\nRegards/LAXOPS/RA.`,new Date('2026-10-14T10:18:00Z'));
  const buffer=await renderAdvisory(data);await fs.writeFile(path.join(dir,`etab-${gate}.png`),buffer);images.push(buffer);
 }
 const outputSize=await sharp(images[0]).metadata();
 await sharp({create:{width:outputSize.width*3,height:outputSize.height,channels:3,background:'#001020'}}).composite(images.map((input,i)=>({input,left:i*outputSize.width,top:0}))).png().toFile(path.join(dir,'etab-three-styles.png'));
 console.log(dir);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
