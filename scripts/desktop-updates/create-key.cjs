'use strict';
// DIRECTORY must already have a restrictive Windows ACL. Never put it in a repo.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const directory=process.argv[2];if(!directory)throw Error('Signing directory required');
const pair=crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(path.join(directory,'hotfix-private.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});
fs.writeFileSync(path.join(directory,'hotfix-public.pem'),pair.publicKey.export({type:'spki',format:'pem'}),{flag:'wx'});
console.log('Created Ed25519 release key; private key stays on this computer.');
