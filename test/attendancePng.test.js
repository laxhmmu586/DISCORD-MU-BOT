const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('glass cards expand for long names, reasons and notes while keeping the footer below the panel',async()=>{
 const {buildCardSvg,renderCards}=require('../attendanceCards');
 const base={employeeName:'W'.repeat(100),date:'2026-10-14',arrivalTime:'10:00',reason:'W'.repeat(1000),note:'Details '.repeat(120),reference:'REQ-HIDDEN-EXAMPLE',submittedAt:'2026-10-14T20:00:00Z'};
 for(const type of ['late','sick']){
  const record={...base,type},svg=buildCardSvg(record).toString();
  assert.doesNotMatch(svg,/REQ-HIDDEN-EXAMPLE|China Eastern|中国东方航空/);
  assert.match(svg,/Additional note/);assert.match(svg,/Employee Request Received/);
  assert.match(svg,/<text text-anchor="end" x="755"[^>]*>Submitted /);
  assert.match(svg,/font-family="Poppins"/);
  assert.doesNotMatch(svg,/stroke-width="10"[^>]*filter="url\(#blur\)"/);
  const panelHeight=Number(svg.match(/x="360" y="164" width="401" height="(\d+)"/)[1]);
  const footerY=Number(svg.match(/M44 (\d+)H757/)[1]);assert.ok(footerY>164+panelHeight);
  const image=(await renderCards(record))[0].attachment;assert.equal(image.readUInt32BE(16),800);assert.ok(image.readUInt32BE(20)>1500);
 }
});

test('both card sets render in an isolated checkout without node_modules or system font access', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attendance-png-'));
  try {
    const root = path.join(__dirname, '..');
    for (const name of ['attendanceCards.js', 'attendancePng.js', 'vendor/resvg-wasm', 'vendor/fonts', 'public/public/assets/attendance']) {
      const target = path.join(dir, name); fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(path.join(root, name), target, { recursive: true });
    }
    const result = spawnSync(process.execPath, ['-e', `
      const assert=require('node:assert/strict'),Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
      const original=Module._load;Module._load=function(id,...args){if(id==='sharp'||(!id.startsWith('.')&&!id.startsWith('node:')))throw Error('External dependencies unavailable: '+id);return original.call(this,id,...args);};
      const read=fs.readFileSync;fs.readFileSync=function(file,...args){const name=path.resolve(String(file));if(!name.startsWith(process.cwd()+path.sep))throw Error('External files unavailable: '+name);return read.call(this,file,...args);};
      const {renderCards}=require('./attendanceCards');
      const base={employeeName:'Test Employee',date:'2026-10-14',arrivalTime:'10:00',reason:'Traffic & <roadworks>',note:'Test note',reference:'REQ-EXAMPLE',submittedAt:'2026-10-14T20:00:00Z'};
      (async()=>{const sets=await Promise.all(['late','sick'].map(type=>renderCards({...base,type},[{date:base.date,type}])));for(const files of sets){assert.equal(files.length,1);for(const file of files){assert.equal(file.attachment.subarray(1,4).toString(),'PNG');assert.equal(file.attachment.readUInt32BE(16),800);assert.ok(file.attachment.readUInt32BE(20)>150);assert.ok(file.attachment.length>10000);}}console.log('2 PNGs generated without external packages or fonts');})().catch(e=>{console.error(e);process.exitCode=1;});
    `], { cwd: dir, encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /2 PNGs generated/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
