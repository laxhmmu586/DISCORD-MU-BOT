// Exact authenticated sign-in identities; lake is the existing owner alias.
const emails=new Set(['lax@mu.com','nextweek1216@gmail.com','lake@mu.com']);
const isOwner=value=>emails.has(String(typeof value==='string'?value:value?.email||'').trim().toLowerCase());
module.exports={emails,isOwner};
