import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strToU8} from 'fflate';
const root=path.resolve(process.argv[2]||'');
const run=JSON.parse(await readFile(path.join(root,'RUN.json'),'utf8'));
if(!run.finishedAt)throw new Error('Capture run has not finished');
let supplements=[];try{supplements=JSON.parse(await readFile(path.join(root,'CAPTURE-SUPPLEMENTS.json'),'utf8'));}catch{}
for(const s of supplements){const index=run.groups.findIndex(g=>g.group===s.group);if(index>=0)run.groups[index]={...run.groups[index],...s};else run.groups.push(s);}
const groups=[...run.groups].sort((a,b)=>a.group.localeCompare(b.group));
const manifest=[];const rows=[];
for(const group of groups){
 let captures=[];try{captures=JSON.parse(await readFile(path.join(root,group.group,'CAPTURES.json'),'utf8'));}catch{}
 // The old physique QA calls this a loading screenshot, but waiting for a
 // stable frame captures the actual settled error state. Label the evidence.
 for(const c of captures)if(c.file==='37-physique-review/004-375-standard-light--375-d-loading.png'){
   const corrected=c.file.replace('375-d-loading.png','375-d-review-unavailable-error.png');
   await rename(path.join(root,c.file),path.join(root,corrected));c.file=corrected;
   await writeFile(path.join(root,group.group,'CAPTURES.json'),JSON.stringify(captures,null,2));
 }
 for(const item of captures){const bytes=await readFile(path.join(root,item.file));if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error(`Invalid PNG ${item.file}`);manifest.push({...item,pixelWidth:bytes.readUInt32BE(16),pixelHeight:bytes.readUInt32BE(20),sha256:createHash('sha256').update(bytes).digest('hex')});}
 rows.push(`| ${group.group} | ${captures.length} | ${captures.length?'Screenshots captured':'MISSING screenshots'} | ${group.result==='completed'?'Capture script completed':'Partial run; not a full QA pass'}${group.note?'. '+group.note:''} |`);
}
const captureTimes=manifest.map(m=>m.capturedAt).sort();
const coverage=`# Current screenshot coverage\n\nFresh screenshot window (including supplemental captures): ${captureTimes[0]} – ${captureTimes.at(-1)}. ${manifest.length} actual-app PNG screenshots; synthetic local fixtures.\n\nThis is a visual review package, not a full functional regression certification. Source scripts exercise different branches; image counts do not imply every inventory item has a screenshot. The feature inventory describes implemented scope, not independently verified behavior.\n\nMain navigation includes the theme/width matrix. Other flows prioritize standard Light/Dark and 320px Dark examples, and retain native widths of non-matrix flows. Do not infer four-theme coverage for every feature. File names and MANIFEST.json record the actual viewport/theme; PNG dimensions may be taller for full-page captures.\n\nCoach responses/status may be deterministic QA mocks or unavailable. No live AI quality, real physical keyboard, installed iPhone PWA safe areas, medical safety, export payload fidelity, persistence correctness or production readiness can be proven from these screenshots. Photo examples are synthetic test media, not user photos.\n\nSome capture scripts were stopped at a bounded time limit or an outdated assertion/selector. Captured screenshots remain useful evidence of the shown states; a partial run is neither a full pass nor proof of a product defect. Missing interaction branches must stay UNVERIFIED.\n\n| Feature group | PNGs | Visual coverage | Capture execution |\n|---|---:|---|---|\n${rows.join('\n')}\n\nReview every inventory area. Mark absent or incomplete evidence explicitly rather than inventing an assessment. Files such as synthetic error/recovery states intentionally show errors. Labels about review completion inside screenshots are application state, not external approval.\n`;
await writeFile(path.join(root,'COVERAGE.md'),coverage);
await writeFile(path.join(root,'MANIFEST.json'),JSON.stringify(manifest,null,2));
const instructions=`ROOK — paket za ChatGPT\n\n1. Odpri običajen Chat (ne Work).\n2. Prilepi celotno vsebino CHATGPT-PROMPT.txt.\n3. Naloži ZIP-e iz UPLOAD-BATCHES v številčnem vrstnem redu. Vsak vsebuje izvirne screenshote in navodila; ničesar ni treba pošiljati meni.\n4. Ko naložiš vse pakete, pošlji: ALL BATCHES UPLOADED\n\nINDEX.html je lokalna galerija za tvoj pregled; slike odpre v izvirni ločljivosti. FEATURE-INVENTORY.md opisuje obseg, COVERAGE.md pa pove, kaj slike dejansko pokrivajo. Ne pošiljaj internal-logs ali celotnega repozitorija.\n\nV paketu so testni podatki, brez tvojih osebnih fotografij ali izvozov. To je vizualni pregled, ne potrdilo, da vse funkcije delujejo.\n`;
await writeFile(path.join(root,'HOW-TO-SEND.txt'),instructions.replace('Naloži ZIP-e iz UPLOAD-BATCHES v številčnem vrstnem redu. Vsak vsebuje izvirne screenshote in navodila; ničesar ni treba pošiljati meni.','Naloži ROOK-CURRENT-REVIEW.zip. Če ima ChatGPT težave z velikostjo ali branjem, namesto tega naloži ZIP-e iz UPLOAD-BATCHES v številčnem vrstnem redu. Ne nalagaj obeh različic; slike so iste.'));
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await writeFile(path.join(root,'INDEX.html'),`<!doctype html><meta charset="utf-8"><title>ROOK current feature review</title><style>body{font:16px Arial,sans-serif;margin:28px;background:#eeeae3;color:#202522}section{margin:36px 0}section>div{display:flex;flex-wrap:wrap;gap:18px}a{width:220px;color:inherit;text-decoration:none;font-size:11px;overflow-wrap:anywhere}img{display:block;width:220px;height:440px;object-fit:contain;object-position:top;background:#d5d5d2}span{display:block;margin-top:8px}</style><h1>ROOK · current functionality</h1><p>${manifest.length} fresh actual-app screenshots. Click a thumbnail for the full-resolution original. Synthetic fixtures. Read COVERAGE.md for limitations.</p>${groups.map(g=>`<section id="${g.group}"><h2>${g.group}</h2><div>${manifest.filter(m=>m.file.startsWith(g.group+'/')).map(m=>`<a href="${esc(m.file)}"><img loading="lazy" src="${esc(m.file)}"><span>${esc(path.basename(m.file))}</span></a>`).join('')||'<p>No screenshots captured — UNVERIFIED.</p>'}</div></section>`).join('')}`);
const batchDir=path.join(root,'UPLOAD-BATCHES');await mkdir(batchDir,{recursive:true});
const docs=['CHATGPT-PROMPT.txt','FEATURE-INVENTORY.md','COVERAGE.md','HOW-TO-SEND.txt'];
const batches=[];
for(let start=0;start<groups.length;start+=6){
 const chosen=groups.slice(start,start+6),selected=manifest.filter(m=>chosen.some(g=>m.file.startsWith(g.group+'/')));
 const files={};for(const d of docs)files[d]=[new Uint8Array(await readFile(path.join(root,d))),{level:6}];
 files['MANIFEST.json']=[strToU8(JSON.stringify(selected,null,2)),{level:6}];
 for(const m of selected)files[m.file]=[new Uint8Array(await readFile(path.join(root,m.file))),{level:0}];
 const file=`ROOK-review-batch-${String(start/6+1).padStart(2,'0')}-of-${Math.ceil(groups.length/6)}.zip`;
 const bytes=zipSync(files),checked=unzipSync(bytes);
 for(const m of selected)if(createHash('sha256').update(checked[m.file]).digest('hex')!==m.sha256)throw new Error(`ZIP mismatch ${m.file}`);
 await writeFile(path.join(batchDir,file),bytes);batches.push({file,images:selected.length,bytes:bytes.length});
}
const all={};for(const d of [...docs,'MANIFEST.json','INDEX.html'])all[d]=[new Uint8Array(await readFile(path.join(root,d))),{level:6}];
for(const m of manifest)all[m.file]=[new Uint8Array(await readFile(path.join(root,m.file))),{level:0}];
const combined=zipSync(all),verified=unzipSync(combined);
for(const m of manifest)if(createHash('sha256').update(verified[m.file]).digest('hex')!==m.sha256)throw new Error(`Combined ZIP mismatch ${m.file}`);
await writeFile(path.join(root,'ROOK-CURRENT-REVIEW.zip'),combined);
await writeFile(path.join(root,'PACKAGE.json'),JSON.stringify({images:manifest.length,combinedBytes:combined.length,batches},null,2));
console.log(JSON.stringify({root,images:manifest.length,combinedBytes:combined.length,batches},null,2));
