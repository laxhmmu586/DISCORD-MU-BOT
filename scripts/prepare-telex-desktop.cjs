// Prepare a copy of an existing Windows client for electron-builder --prepackaged.
// Usage: node scripts/prepare-telex-desktop.cjs BASE_APP OUTPUT VERSION ASAR_MODULE
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

(async () => {
  const [baseArg, outputArg, version, asarModule] = process.argv.slice(2);
  assert(baseArg && outputArg && /^\d+\.\d+\.\d+$/.test(version) && asarModule,
    'Expected BASE_APP OUTPUT VERSION ASAR_MODULE');
  const base = path.resolve(baseArg), output = path.resolve(outputArg);
  assert(!fs.existsSync(output), 'Output must be a new directory');
  assert(!output.startsWith(base + path.sep), 'Output must be outside the base app');
  const asar = require(path.resolve(asarModule));
  const archive = path.join(base, 'resources/app.asar');
  const source = asar.extractFile(archive, 'web/flight-telex.js').toString('utf8');
  const oldLabel = 'separate.has(code) ? `Send a separate Telex to ${recipients}` : "Send Telex"';
  assert(source.includes(oldLabel) || source.includes('instruction.textContent = "Send Telex";'), 'Unrecognized Telex implementation');
  // Use the current UI fix while retaining the desktop's explicit SSR permission gate.
  const updated = fs.readFileSync(path.join(__dirname,'../public/public/flight-telex.js'),'utf8')
    .replace('sy.permissions?.canViewSpecialService !== false','sy.permissions?.canViewSpecialService === true');
  fs.mkdirSync(output, {recursive:true});
  const release = path.join(output, 'release-app');
  fs.cpSync(base, release, {recursive:true});
  const extracted = path.join(output, 'app-source');
  asar.extractAll(archive, extracted);
  fs.writeFileSync(path.join(extracted, 'web/flight-telex.js'), updated);
  const helper=fs.readFileSync(path.join(__dirname,'../passengerServiceText.js'));
  fs.writeFileSync(path.join(extracted,'legacy/passengerServiceText.js'),helper);
  for(const name of ['syParser.js','flightParser.js']){
    const file=path.join(extracted,'legacy',name);
    let parser=fs.readFileSync(file,'utf8');
    const filter=String.raw`(?=\s*\.split\(/\\r\?\\n/\)\s*\.filter\(isServiceExtractionLine\))`;
    parser=parser.replace(new RegExp(String.raw`String\(section \|\| ''\)`+filter,'g'),'withoutContactDetails(section)')
      .replace(new RegExp(String.raw`\bsection`+filter,'g'),'withoutContactDetails(section)');
    assert(parser.includes('withoutContactDetails(section)'),name+' must filter contact fields');
    parser="const { withoutContactDetails } = require('./passengerServiceText');\n"+parser;
    fs.writeFileSync(file,parser);
  }
  const businessPath=path.join(extracted,'legacy/business-helpers.js');
  const functionPattern=/^function hasVipServiceMarker\([^\n]*\) \{[\s\S]*?^\}/m;
  const marker=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8').match(functionPattern)?.[0];
  const business=fs.readFileSync(businessPath,'utf8');assert(marker&&functionPattern.test(business));
  fs.writeFileSync(businessPath,business.replace(functionPattern,marker));
  const packagePath = path.join(extracted, 'package.json');
  const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  metadata.version = version;
  fs.writeFileSync(packagePath, JSON.stringify(metadata, null, 2) + '\n');
  const targetArchive = path.join(release, 'resources/app.asar');
  await asar.createPackage(extracted, targetArchive);
  const changed = [];
  for (const entry of asar.listPackage(archive)) {
    const name = entry.replace(/^[\\/]/, '');
    if (asar.statFile(archive, name).files) continue;
    if (!asar.extractFile(archive, name).equals(asar.extractFile(targetArchive, name))) changed.push(name.replace(/\\/g, '/'));
  }
  assert.deepEqual(changed.sort(), ['legacy/business-helpers.js','legacy/flightParser.js','legacy/syParser.js','package.json','web/flight-telex.js']);
  assert(asar.extractFile(targetArchive,path.join('legacy','passengerServiceText.js')).equals(helper));
  assert.equal(asar.extractFile(targetArchive, 'web/flight-telex.js').toString(), updated);
  const manifest = {version, baseVersion:JSON.parse(asar.extractFile(archive, 'package.json')).version,
    changedAppFiles:changed,addedAppFiles:['legacy/passengerServiceText.js'], archiveSha256:crypto.createHash('sha256').update(fs.readFileSync(targetArchive)).digest('hex')};
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
})().catch(error => {console.error(error); process.exitCode = 1;});
