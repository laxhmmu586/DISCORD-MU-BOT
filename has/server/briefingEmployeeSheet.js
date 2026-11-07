const {reportSections}=require('./briefingPdf');
const {summarySvg,summaryLayout}=require('./briefingSummary');
const membership=require('../public/briefing-membership');
const fields=require('../public/briefing-fields');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderEmployeeSheet(snapshot){
 const sections=reportSections(snapshot),find=title=>sections.find(([name])=>name===title)?.[1]||[];
 const heading=title=>'<h2>'+escape(title)+'</h2>';
 const cells=entries=>entries.map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value||'—')+'</dd></div>').join('');
 const special=fields.specialInformation(snapshot.fields,snapshot.direction);
 const specials=special.length?'<section class="employee-specials">'+heading('Special Information')+'<dl class="employee-special-grid">'+cells(special)+'</dl></section>':'';
 const details='<section>'+heading('Details')+'<p class="employee-sheet-details">'+escape(sections.find(([title])=>title==='Details')?.[1]||'—')+'</p></section>';
 const departure=snapshot.direction==='departure',title=(departure?'Departure':'Arrival')+' briefing sheet';
 const header='<header><div class="employee-sheet-brand">HALLMARK<small>AVIATION SERVICES / LAX - MU</small></div><div><h1>'+(departure?'DEPARTURE':'ARRIVAL')+' BRIEFING</h1><strong>'+escape(snapshot.date+' / '+snapshot.flight)+'</strong></div></header>';
 const flight='<section>'+heading('Flight Information')+'<dl class="employee-flight-grid">'+cells(find('Flight Information'))+'</dl></section>';
 if(!departure)return '<article class="employee-departure-sheet employee-arrival-sheet" aria-label="'+title+'">'+header+flight+specials+details+(find('Team Assignment').length?'<section>'+heading('Team Assignment')+'<dl class="employee-arrival-team">'+cells(find('Team Assignment'))+'</dl></section>':'')+'</article>';
 const team=title=>'<section id="employee-'+title.toLowerCase()+'-panel" role="tabpanel" aria-labelledby="employee-'+title.toLowerCase()+'-tab" data-employee-team-panel="'+title.toLowerCase()+'"'+(title==='Gate'?' hidden':'')+'><h3>'+title+'</h3><dl>'+cells(find(title+' Assignment'))+'</dl></section>';
 const summary=summarySvg(snapshot,{photo:true}),plan=summaryLayout(snapshot,{photo:true});
 const commands=plan.commands.filter(command=>command.x>=286),height=Math.max(...commands.map(command=>command.y+(command.kind==='rect'?command.h:command.size)))+4;
 const price=summary.replace(/viewBox="[^"]*"/,'viewBox="286 0 262 '+height+'"').replace(/aria-label="[^"]*"/,'aria-label="Price"');
 const f=snapshot.fields,total=fields.booking(f),booking=heading('PAX Booking')+'<div class="employee-booking-grid">'+['Cabin','Config','PAX','INF'].map(label=>'<span>'+label+'</span>').join('')+['F','J','Y'].map(cabin=>'<strong>'+cabin+'</strong>'+['config','booking','infant'].map(prefix=>'<span class="employee-booking-value">'+escape(f[prefix+cabin]||(prefix==='booking'?'0':'—'))+'</span>').join('')).join('')+'</div><dl class="employee-booking-totals">'+cells([['TTL PAX',total.pax+' + '+total.infants],['PLF',total.plf]])+'</dl>';
 const time='<section>'+heading('Time Check')+'<dl class="employee-time-grid">'+cells(find('Time Check'))+'</dl></section>';
 return '<article class="employee-departure-sheet" aria-label="'+title+'">'+header+flight+
  '<section class="employee-summary"><div>'+booking+specials+time+'</div><div>'+price+'</div></section>'+details+
  '<section>'+heading('Team Assignment')+'<div class="employee-team-tabs" role="tablist" aria-label="Departure assignments">'+['Counter','Gate'].map((name,i)=>'<button type="button" role="tab" id="employee-'+name.toLowerCase()+'-tab" aria-controls="employee-'+name.toLowerCase()+'-panel" aria-selected="'+!i+'" tabindex="'+(i?-1:0)+'" data-employee-team="'+name.toLowerCase()+'">'+name+'</button>').join('')+'</div><div class="employee-team-grid">'+team('Counter')+team('Gate')+'</div></section>'+
  '<section>'+heading('Membership Information')+'<div class="employee-membership-scroll" role="region" aria-label="Membership benefits by tier and cabin" tabindex="0"><table><thead><tr>'+membership.headers.map(label=>'<th scope="col">'+escape(label)+'</th>').join('')+'</tr></thead><tbody>'+membership.rows(snapshot.membershipReference).map(row=>'<tr>'+membership.cells(row).map((value,i)=>'<'+(i?'td':'th scope="row"')+'>'+escape(value)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</tbody></table></div><p class="employee-membership-note">'+escape(membership.notice)+'</p></section></article>';
}
module.exports={renderEmployeeSheet};
