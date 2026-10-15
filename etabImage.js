const sharp = require('sharp');
const path = require('node:path');
const { theme } = require('./etabAdvisory');
const IMAGE_BOUNDS={left:26,top:24,width:850,height:840};
// Coordinates follow the existing artwork, before the exterior crop. Only the
// banner and four information cards remain opaque; chat shows through the gaps.
const PANEL_REGIONS={
  day:[
    [26,24,850,438,24],
    [30,480,407,162,22],[456,480,407,162,22],
    [30,663,407,192,22],[456,663,407,192,22],
  ],
  night:[
    [26,24,850,418,24],
    [33,460,407,162,22],[460,460,411,162,22],
    [33,643,407,200,22],[460,643,411,200,22],
  ],
  msc:[
    [26,24,850,416,24],
    [32,458,411,162,22],[461,458,412,162,22],
    [33,639,410,194,22],[461,639,412,194,22],
  ],
};
let aircraftIcons;
function loadAircraftIcons(){
  if(!aircraftIcons)aircraftIcons=Promise.all(['arrival','departure'].map(async(type)=>{
    const source=await sharp(path.join(__dirname,'assets/etab',type+'-aircraft.png')).trim().png().toBuffer();
    const oriented=type==='arrival'?await sharp(source).rotate(12,{background:'#0000'}).png().toBuffer():source;
    return sharp(oriented).resize(136,54,{fit:'contain',background:'#0000'}).png().toBuffer();
  })).catch(error=>{aircraftIcons=undefined;throw error;});
  return aircraftIcons;
}
const escape = value => String(value || '—').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));

// Preserve the reference's glass, light, runway and heading; overlay live data only.
async function renderAdvisory(data) {
  const mode=theme(data.arrival.gate), accent={day:'#a5ffd0',night:'#ffe591',msc:'#ffccd0'}[mode];
  const a=data.arrival,d=data.departure;
  const verticalOffset=mode==='day'?0:-18;
  const text=(x,y,size,value,fill='#f5faff',weight=700,anchor='start')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escape(value)}</text>`;
  const date=new Date(data.date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'}).toUpperCase();
  const fields=[['REG',a.reg],['PAX',a.pax],['CREW',a.crew]];
  const overlay=`<svg width="900" height="900" xmlns="http://www.w3.org/2000/svg"><defs><filter id="iconGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter><clipPath id="dateTextureClip"><rect x="628" y="31" width="231" height="91" rx="20"/></clipPath><pattern id="dateMicrogrid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#91cdff" stroke-opacity=".1" stroke-width=".65"/><path d="M10 11h2m-1-1v2" stroke="#c2e5ff" stroke-opacity=".14" stroke-width=".65"/></pattern></defs>
    <g clip-path="url(#dateTextureClip)"><rect x="628" y="31" width="231" height="91" fill="url(#dateMicrogrid)"/><g fill="none" stroke="#92caff" stroke-opacity=".13" stroke-width=".75"><circle cx="847" cy="118" r="48"/><circle cx="847" cy="118" r="63"/><path d="M630 111Q710 93 753 52T860 45"/></g></g>
    <g transform="translate(0 ${verticalOffset})">
    <g id="plane" transform="translate(105 550)" fill="none" stroke="${accent}" stroke-width="2.6"><circle r="31"/><g transform="rotate(28)"><path d="M0-24C-3-24-3.7-20-3.7-16V-6L-22 7V12L-3.7 6V18L-11 23V27L0 23L11 27V23L3.7 18V6L22 12V7L3.7-6V-16C3.7-20 3-24 0-24Z" fill="${accent}" stroke="none"/></g></g><use href="#plane" filter="url(#iconGlow)" opacity=".45"/>
    <path d="M178 505v111" stroke="${accent}" stroke-opacity=".55"/>
    ${text(307,529,29,'GATE','#fff7dc',700,'middle')}
    <g id="clock" fill="none" stroke="#e2f5ff" stroke-width="3"><circle cx="516" cy="541" r="27"/><path d="M516 524v19l12 8" stroke-linecap="round"/></g><use href="#clock" filter="url(#iconGlow)"/>
    <path d="M573 505v111" stroke="#61bdff" stroke-opacity=".6"/>
    ${text(596,529,29,'ETA')}
    ${text(415,713,27,a.flight,'#f5faff',700,'end')}${text(841,713,27,d.flight||'TBA','#f5faff',700,'end')}
    <path d="M57 735h358 M483 735h358" stroke="#a0c8f0" stroke-opacity=".42"/>
    ${fields.map(([label,value],i)=>text(61+i*128,781,21,label,'#c4d5ee',400)+text(61+i*128,823,29,value)).join('')}
    <path d="M179 765v66 M307 765v66" stroke="#428fd3" stroke-opacity=".35"/>
    ${mode==='msc'?text(663,755,16,'MSC GATE OPERATION','#ffc2c9',700,'middle'):''}
    </g>
  </svg>`;
  const layers=[{input:Buffer.from(overlay)}];
  const [arrivalIcon,departureIcon]=await loadAircraftIcons();
  layers.push({input:arrivalIcon,left:54,top:674+verticalOffset},{input:departureIcon,left:480,top:674+verticalOffset});
  async function digits(value,center,top,size,maxWidth,colors,glow,label='') {
    let mask=await sharp({text:{text:escape(value),font:'Archivo Black, '+size,fontfile:path.join(__dirname,'assets/etab/fonts/ArchivoBlack-Regular.ttf'),rgba:true,dpi:72}}).png().toBuffer();
    let meta=await sharp(mask).metadata();
    if(meta.width>maxWidth){mask=await sharp(mask).resize({width:maxWidth}).png().toBuffer();meta=await sharp(mask).metadata();}
    let left=Math.round(center-meta.width/2);
    if(label){
      const labelImage=await sharp({text:{text:`<span foreground="#f5faff">${escape(label)}</span>`,font:'Arial Bold 27',rgba:true,dpi:72}}).png().toBuffer();
      const lm=await sharp(labelImage).metadata(),gap=22,start=Math.round(center-(lm.width+gap+meta.width)/2);
      layers.push({input:labelImage,left:start,top:top+Math.round((meta.height-lm.height)/2)});left=start+lm.width+gap;
    }
    const gradient=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%"><stop stop-color="${colors[0]}"/><stop offset=".42" stop-color="${colors[1]}"/><stop offset=".72" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
    const face=await sharp(gradient).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
    // One-pixel bevels follow the actual glyph contours, keeping small text crisp.
    const alpha=await sharp(mask).ensureAlpha().raw().toBuffer(),highlight=Buffer.alloc(meta.width*meta.height*4),shade=Buffer.alloc(highlight.length);
    for(let y=0;y<meta.height;y++)for(let x=0;x<meta.width;x++){
      const i=(y*meta.width+x)*4,a=alpha[i+3],above=y?alpha[i-meta.width*4+3]:0,below=y<meta.height-1?alpha[i+meta.width*4+3]:0;
      highlight[i]=255;highlight[i+1]=255;highlight[i+2]=255;highlight[i+3]=Math.round(Math.max(0,a-above)*.75);
      shade[i]=20;shade[i+1]=47;shade[i+2]=65;shade[i+3]=Math.round(Math.max(0,a-below)*.45);
    }
    const raw={width:meta.width,height:meta.height,channels:4};
    const glyph=await sharp(face).composite([{input:highlight,raw},{input:shade,raw}]).png().toBuffer();
    const halo=await sharp({create:{width:meta.width,height:meta.height,channels:4,background:glow}}).composite([{input:mask,blend:'dest-in'}]).extend({top:16,bottom:16,left:16,right:16,background:'#0000'}).blur(5).png().toBuffer();
    const depth=await sharp({create:{width:meta.width,height:meta.height,channels:4,background:{r:5,g:22,b:40,alpha:.55}}}).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
    layers.push({input:halo,left:left-16,top:top-16},{input:depth,left:left+1,top:top+2},{input:glyph,left,top});
  }
  const gateColors=mode==='day'?['#ffffff','#edfff2','#85dfaa']:mode==='night'?['#fffde5','#fff0b1','#e6bd5b']:['#ffffff','#fff6f6','#e7a5af'];
  await digits(a.gate,307,550+verticalOffset,90,228,gateColors,accent);
  const timeColors=['#ffffff','#edf6ff','#99bfe4'];
  await digits(date,747,61,42,215,timeColors,'#81bfff');
  await digits(a.eta,724,555+verticalOffset,70,267,timeColors,'#81bfff');
  await digits(d.time || 'TBA',663,779+verticalOffset,70,267,timeColors,'#81bfff',(d.timeType || 'ETD')+':');
  const composed=await sharp(path.join(__dirname,'assets/etab',mode+'-template.png')).composite(layers).png().toBuffer();
  const trimmed=await sharp(composed).extract(IMAGE_BOUNDS).png().toBuffer();
  const panelMask=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_BOUNDS.width}" height="${IMAGE_BOUNDS.height}"><g transform="translate(${-IMAGE_BOUNDS.left} ${-IMAGE_BOUNDS.top})" fill="#fff">${PANEL_REGIONS[mode].map(([x,y,width,height,radius])=>`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/>`).join('')}</g></svg>`);
  return sharp(trimmed).ensureAlpha().composite([{input:panelMask,blend:'dest-in'}]).png().toBuffer();
}
module.exports={renderAdvisory,IMAGE_BOUNDS};
