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
  assert(source.includes(oldLabel), 'Base app must contain the expected Telex implementation');
  const updated = source
    .replace(/^  const separate = .*;\r?\n/m, '')
    .replace(/^  const recipients = .*;\r?\n/m, '')
    .replace(oldLabel, '"Send Telex"');
  fs.mkdirSync(output, {recursive:true});
  const release = path.join(output, 'release-app');
  fs.cpSync(base, release, {recursive:true});
  const extracted = path.join(output, 'app-source');
  asar.extractAll(archive, extracted);
  fs.writeFileSync(path.join(extracted, 'web/flight-telex.js'), updated);
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
  assert.deepEqual(changed.sort(), ['package.json', 'web/flight-telex.js']);
  assert.equal(asar.extractFile(targetArchive, 'web/flight-telex.js').toString(), updated);
  const manifest = {version, baseVersion:JSON.parse(asar.extractFile(archive, 'package.json')).version,
    changedAppFiles:changed, archiveSha256:crypto.createHash('sha256').update(fs.readFileSync(targetArchive)).digest('hex')};
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
})().catch(error => {console.error(error); process.exitCode = 1;});
