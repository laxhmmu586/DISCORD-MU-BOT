const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const {parseAdvisory}=require('../etabAdvisory');
const {renderAdvisory}=require('../etabImage');
async function main(){
 const dir=path.join(__dirname,'../.verification/etab');await fs.mkdir(dir,{recursive:true});
 // Preview the production assets without regenerating or overwriting them.
 const images=[];
 for(const gate of ['134','TBA','203']){
  const data=parseAdvisory(`MU583/14OCT. B-7343. ETA 0922L. GATE ${gate}. PAX 279/0. CREW 04/17.\nMU586/14OCT. STD 1230L.\nRegards/LAXOPS/RA.`,new Date('2026-10-14T10:18:00Z'));
  const buffer=await renderAdvisory(data);await fs.writeFile(path.join(dir,`etab-${gate}.png`),buffer);images.push(buffer);
 }
 const outputSize=await sharp(images[0]).metadata();
 for(const [name,background] of [['etab-three-styles','#313338'],['etab-three-styles-light','#ffffff']]){
  await sharp({create:{width:outputSize.width*3,height:outputSize.height,channels:3,background}}).composite(images.map((input,i)=>({input,left:i*outputSize.width,top:0}))).png().toFile(path.join(dir,name+'.png'));
 }
 console.log(dir);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
