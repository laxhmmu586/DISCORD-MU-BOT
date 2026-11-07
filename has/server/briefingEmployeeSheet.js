const {reportSections}=require('./briefingPdf');
const {summarySvg,summaryLayout}=require('./briefingSummary');
const membership=require('../public/briefing-membership');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderEmployeeSheet(snapshot){
 const sections=reportSections(snapshot),find=title=>sections.find(([name])=>name===title)?.[1]||[];
 const heading=title=>'<h2>'+escape(title)+'</h2>';
 const team=title=>'<section><h3>'+title+'</h3><dl>'+find(title+' Assignment').map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value||'—')+'</dd></div>').join('')+'</dl></section>';
 const summary=summarySvg(snapshot,{photo:true}),plan=summaryLayout(snapshot,{photo:true});
 const panels=[0,286].map((x,index)=>{const commands=plan.commands.filter(command=>index?command.x>=286:command.x<286),height=Math.max(...commands.map(command=>command.y+(command.kind==='rect'?command.h:command.size)))+4;return '<div>'+summary.replace(/viewBox="[^"]*"/,'viewBox="'+x+' 0 262 '+height+'"').replace(/aria-label="[^"]*"/,'aria-label="'+(index?'Price':'PAX Booking, Special Information and Time Check')+'"')+'</div>';}).join('');
 return '<article class="employee-departure-sheet" aria-label="Departure briefing sheet"><header><div class="employee-sheet-brand">HALLMARK<small>AVIATION SERVICES / LAX - MU</small></div><div><h1>DEPARTURE BRIEFING</h1><strong>'+escape(snapshot.date+' / '+snapshot.flight)+'</strong></div></header>'+
  '<section>'+heading('Flight Information')+'<dl class="employee-flight-grid">'+find('Flight Information').map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value||'—')+'</dd></div>').join('')+'</dl></section>'+
  '<section class="employee-summary">'+panels+'</section>'+
  '<section>'+heading('Details')+'<p class="employee-sheet-details">'+escape(sections.find(([title])=>title==='Details')?.[1]||'—')+'</p></section>'+
  '<section>'+heading('Team Assignment')+'<div class="employee-team-grid">'+team('Counter')+team('Gate')+'</div></section>'+
  '<section>'+heading('Membership Information')+'<div class="employee-membership-scroll" role="region" aria-label="Membership benefits by tier and cabin" tabindex="0"><table><thead><tr>'+membership.headers.map(label=>'<th scope="col">'+escape(label)+'</th>').join('')+'</tr></thead><tbody>'+membership.rows(snapshot.membershipReference).map(row=>'<tr>'+membership.cells(row).map((value,i)=>'<'+(i?'td':'th scope="row"')+'>'+escape(value)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</tbody></table></div><p class="employee-membership-note">'+escape(membership.notice)+'</p></section></article>';
}
module.exports={renderEmployeeSheet};
