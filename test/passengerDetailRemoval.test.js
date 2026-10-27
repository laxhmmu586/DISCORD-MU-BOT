const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');
const server = fs.readFileSync(require.resolve('../index.js'), 'utf8');
const source = name => html.slice(html.indexOf(`      function ${name}(`)).split(/\n      (?:async )?function /)[0];

test('BN circles retain numbers and status without detail controls or tooltips', () => {
  const ctx = { escapeHtml: String };
  vm.createContext(ctx);
  vm.runInContext(source('bnCircleLabel') + source('renderBnButtons'), ctx);
  const result = ctx.renderBnButtons([{bn:'050', name:'PRIVATE NAME'}], '', null, null, () => 'is-pass');
  assert.match(result, /<span class="bn-button is-pass">050<\/span>/);
  assert.doesNotMatch(result, /<button |title=|PRIVATE NAME|data-passenger/);
  assert.doesNotMatch(html, /data-passenger-index|data-seat=|data-security-index|function renderSeatMap|function renderSecurityCheck/);
});

test('BN clicks do not open either inline records or passenger popups', async () => {
  const ctx = {handleVisaPolicyAction:async()=>false};
  vm.createContext(ctx);
  const start = html.indexOf('      async function handleResultPanelClick(');
  vm.runInContext(html.slice(start).split(/\n      }/)[0] + '\n      }', ctx);
  await ctx.handleResultPanelClick({target:{closest:()=>null}});
  assert.doesNotMatch(html.slice(start, html.indexOf('resultPanel.addEventListener("click", handleResultPanelClick)', start)), /showPassengerModal|passengerRecordCard/);
});

test('desktop and mobile shared search handler rejects all passenger input without requesting data', async () => {
  const ctx = {queryInput:{value:''},renderPanel:()=>{},fetchSearch:()=>{throw new Error('Unexpected lookup');}};
  vm.createContext(ctx);
  vm.runInContext(source('isSyQuery'), ctx);
  const start = html.indexOf('      async function searchPassenger(');
  vm.runInContext(html.slice(start).split(/\n      (?:async )?function /)[0],ctx);
  for (const value of ['050','BN050','32A','7812545625555','MU5656565','DOE/JOHN','FF MU123456','DOE/JOHN/20APR26']) {
    ctx.queryInput.value=value;
    await ctx.searchPassenger();
  }
  assert.doesNotMatch(html, /function showPassengerModal|function renderPassenger\(/);
});

test('all passenger search formats stop before log access', () => {
  const start = server.indexOf('      const rawQuery =', server.indexOf("  '/search',"));
  const end = server.indexOf('      // Load Log', start);
  const run = new vm.Script('(function(req,res) {' + server.slice(start, end) + '\nreturn "allowed";})');
  const lookup = run.runInNewContext();
  for (const q of ['1','050','BN050','050/20APR','050/20APR26','FF/050/20APR26','FF 050','7812545625555','32A','MU5656565','DOE/JOHN','FF MU123456','32A/20APR26','DOE/JOHN/20APR26']) {
    const res = {status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    assert.equal(lookup({query:{q}},res).code, 410, q);
    assert.match(res.body.error, /Passenger lookup is unavailable/);
  }
  for (const q of ['SY','SY+','SY MU586/27OCT26']) {
    assert.equal(lookup({query:{q}},{}),'allowed',q);
  }
});
