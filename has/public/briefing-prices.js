(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BriefingPrices=factory();})(typeof globalThis==='object'?globalThis:this,()=>{
 const defaults=[
  ['US–China',[['1st extra bag · 23 kg','$195'],['2nd extra bag · 23 kg','$300'],['Economy overweight · 24–32 kg','$150'],['Business overweight · 33–45 kg','$405'],['Oversize · 159–202 cm','$150'],['Oversize · 203–302 cm','$405'],['Exit seat / first row','$135'],['Platinum card · exit seat / first row','Free']]],
  ['US–China–International',[['1st extra bag · 23 kg','$180'],['2nd extra bag · 23 kg','$300'],['Economy overweight · 24–32 kg','$150'],['Oversize · 159–202 cm','$150'],['Oversize · 203–302 cm','$300']]],
  ['Economy → Business (I)',[['Y / B / M / E','$1,100'],['H / K / L','$2,200'],['N / R / S','$2,700'],['V','$3,020']]],
  ['Business → First (F)',[['J','$1,000'],['C / D / Q / I','$2,500']]],
  ['Special baggage',[['1,000 CNY','$150'],['3,500 CNY','$525'],['2,000 CNY','$300'],['4,500 CNY','$674']]]
 ];
 const notice='No Cash · All amounts in USD unless marked CNY.',footnote='Special baggage USD amounts follow the supplied reference (exchange rate 0.14988089). All paid extra bags are limited to 23 kg.';
 function cards(reference={}){const values=reference.values||{};let index=0;const value=fallback=>{const key='price.'+index++;return Object.hasOwn(values,key)?values[key]:fallback;};return [...defaults.map(([title,rows])=>({title:value(title),rows:rows.map(([label,amount])=>[value(label),value(amount)])})),...(reference.boxes?.price||[]).map(card=>({title:card.title,text:card.text}))];}
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function html(){return '<p class="reference-intro"><strong class="reference-no-cash">No Cash</strong> · All amounts in USD unless marked CNY.</p>'+cards().map(card=>'<section class="reference-card"><h3>'+escape(card.title)+'</h3><dl class="reference-rows">'+card.rows.map(([label,value])=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(value)+'</dd></div>').join('')+'</dl></section>').join('')+'<p class="reference-footnote">'+escape(footnote)+'</p>';}
 return {cards,html,notice,footnote};
});
