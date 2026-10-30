(function(root,factory){const format=factory();if(typeof module==='object'&&module.exports)module.exports=format;else root.formatEmployeePhone=format;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 return function formatEmployeePhone(value){
  const text=String(value??'').trim();if(!/^[+()\d\s.-]*$/.test(text))return text;
  let digits=text.replace(/\D/g,'');if(digits.length===11&&digits[0]==='1')digits=digits.slice(1);else if(text.startsWith('+'))return text;
  return digits.length===10?digits.slice(0,3)+'-'+digits.slice(3,6)+'-'+digits.slice(6):text;
 };
});
