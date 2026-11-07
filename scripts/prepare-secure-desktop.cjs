'use strict';
// EXTRACTED_2.1.4_SOURCE OUTPUT_SOURCE CONFIG_JSON VERSION
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [base,out,config,version]=process.argv.slice(2);
assert(base&&out&&config&&/^\d+\.\d+\.\d+$/.test(version));
assert(!fs.existsSync(out),'Output must be new');
fs.cpSync(base,out,{recursive:true});
require('./desktop-updates/patch.cjs').apply(path.resolve(out),JSON.parse(fs.readFileSync(config)));
const file=path.join(out,'package.json'),metadata=JSON.parse(fs.readFileSync(file));metadata.version=version;fs.writeFileSync(file,JSON.stringify(metadata,null,2));
console.log('Prepared secure desktop '+version);
