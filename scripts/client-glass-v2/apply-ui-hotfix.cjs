'use strict';
const assert=require('node:assert/strict');
function appendUpdateHelp(html){
  return html.includes('src="/update-status-help.js"')?html:html.replace('</head>','<script defer src="/update-status-help.js"></script></head>');
}
function applyUiHotfix(html){
  const anchor='      function updateFlightFromSy(sy, options = {}) {';
  assert(html.includes(anchor),'Unsupported dashboard render entry point');
  if(!html.includes('href="/glass-status-palette.css"'))html=html.replace('</head>','<link rel="stylesheet" href="/glass-status-palette.css"></head>');
  if(!html.includes('src="/completed-email-checks.js"'))html=html.replace('</head>','<script src="/completed-email-checks.js"></script></head>');
  if(!html.includes('sy = window.mufcRetainEmailChecks?.(sy) || sy;'))html=html.replace(anchor,anchor+'\n        sy = window.mufcRetainEmailChecks?.(sy) || sy;');
  html=html.replace('status.textContent=sy.spml?.email?.error||','status.textContent=sy.emailCheckRefresh?.mealRetained?"Meal Order checked; local data unchanged. Rechecking in background.":sy.spml?.email?.error||');
  return appendUpdateHelp(html);
}
module.exports={applyUiHotfix,appendUpdateHelp};
