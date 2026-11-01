import {existsSync,readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const lock=JSON.parse(readFileSync('package-lock.json','utf8')),entries=[],missing=[];
const retained=existsSync('docs/licenses/packages/manifest.json')?JSON.parse(readFileSync('docs/licenses/packages/manifest.json','utf8')):[];
function sourceNotices(directory,depth=0) {
  if(depth>4)return [];
  const found=[];
  for(const file of readdirSync(directory,{withFileTypes:true})) {
    if(file.name==='node_modules'||file.name.startsWith('.'))continue;
    const path=join(directory,file.name);
    if(file.isDirectory())found.push(...sourceNotices(path,depth+1));
    else if(/\.(?:[cm]?js|ts)$/.test(file.name)) {
      const source=readFileSync(path,'utf8');
      for(const block of source.match(/\/\*[\s\S]*?\*\//g)||[])
        if(/@license|copyright/i.test(block)&&/Apache License|MIT License|Permission is hereby granted|Licensed under/i.test(block))found.push(block);
    }
  }
  return [...new Set(found)];
}
for(const [path,metadata] of Object.entries(lock.packages||{})) {
  if(!path.startsWith('node_modules/')||metadata.dev===true||!existsSync(join(path,'package.json')))continue;
  const pkg=JSON.parse(readFileSync(join(path,'package.json'),'utf8'));
  const files=readdirSync(path).filter(name=>/^(?:licen[sc]e|copying|copyright|notice)(?:[.-]|$)/i.test(name)&&!name.endsWith('.map'));
  const texts=files.flatMap(name=>{try{return [`--- ${name} ---\n${readFileSync(join(path,name),'utf8')}`];}catch{return [];}});
  const license=typeof pkg.license==='string'?pkg.license:metadata.license||'Not declared';
  const retainedNotice=retained.find(item=>!item.error&&item.name===pkg.name&&item.version===pkg.version&&existsSync(item.path));
  if(!texts.length&&retainedNotice)texts.push(`--- Notice retained from exact upstream revision: ${retainedNotice.source} ---\n${readFileSync(retainedNotice.path,'utf8')}`);
  if(!texts.length) {
    const headers=sourceNotices(path);
    if(headers.length)texts.push(`--- Copyright/license notices preserved from installed source headers ---\n${headers.join('\n\n')}`);
    if(headers.length&&license==='Apache-2.0')texts.push(`--- Apache License 2.0 (standard text, distributed with firebase-admin) ---\n${readFileSync('node_modules/firebase-admin/LICENSE','utf8')}`);
  }
  if(!texts.length)missing.push({name:pkg.name,version:pkg.version,license});
  entries.push({name:pkg.name,version:pkg.version,license,path,notices:texts});
}
entries.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
mkdirSync('public/legal',{recursive:true});mkdirSync('artifacts/legal-privacy-audit',{recursive:true});
const noticeText=`ROOK — installed production dependency notices\nGenerated from package-lock.json and installed package notice files.\nIncludes server-only dependencies (for example firebase-admin); this is not a list of browser SDKs.\nNo license for ROOK itself is granted by this file.\nPackages without an installed top-level notice need follow-up before release.\n\n${entries.map(entry=>`${entry.name}@${entry.version}\nDeclared license: ${entry.license}\n${entry.notices.join('\n\n')||'No top-level notice file found; see the package distribution and its declared license.'}`).join('\n\n========================================\n\n')}`;
// Preserve notice content while normalizing upstream line endings/trailing spaces.
writeFileSync('public/legal/software-notices.txt',`${noticeText.replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,'').trimEnd()}\n`);
writeFileSync('artifacts/legal-privacy-audit/software-inventory.json',JSON.stringify({packages:entries.map(({notices,...entry})=>({...entry,noticeFiles:entry.path?readdirSync(entry.path).filter(name=>/^(?:licen[sc]e|copying|copyright|notice)(?:[.-]|$)/i.test(name)):[]})),missingNotices:missing},null,2));
console.log(JSON.stringify({packages:entries.length,missingTopLevelNoticeFiles:missing.length,unresolved:missing},null,2));
