import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';

const root=path.resolve(process.argv[2]);
const manifest=JSON.parse(await readFile(path.join(root,'MANIFEST.json'),'utf8'));
const run=JSON.parse(await readFile(path.join(root,'RUN.json'),'utf8'));
if(!run.finishedAt)throw new Error('Wait for the capture run to finish before packaging.');
if(createHash('sha256').update(await readFile('dist/index.html')).digest('hex')!==manifest.buildHash)throw new Error('Build changed after capture.');
await mkdir(path.join(root,'upload-batches'),{recursive:true});
const batches=[];
for(let batch=0;batch<6;batch++){
 const first=batch*4+1,last=first+3;
 const items=manifest.screenshots.filter(s=>{const n=Number(s.file.slice(0,2));return n>=first&&n<=last;});
 const files={};
 for(const item of items){
  const bytes=await readFile(path.join(root,item.file));
  if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error(`Screenshot changed: ${item.file}`);
  files[item.file]=[bytes,{level:0}];
 }
 files['INDEX.md']=strToU8(await readFile(path.join(root,'INDEX.md'),'utf8'));
 files['BATCH.md']=strToU8(`Batch ${batch+1} of 6. Folders ${first}–${last}. ${items.length} original screenshots.\n\nInspect the PNGs themselves. No old approval, prior screenshot, contact sheet, real personal photo, or production user data is included. Filenames identify fixtures and viewports; a matrix prefix is the authoritative theme when it overrides an older scenario suffix. Some images are scrolled states; full-page top-level captures may show fixed navigation at its viewport position.\n\nDo not infer physical-device, persistence or interaction verification from these images. Please acknowledge receipt only until ALL BATCHES UPLOADED.\n`);
 files['MANIFEST.json']=strToU8(JSON.stringify({buildHash:manifest.buildHash,screenshots:items.map(({source,...s})=>s)},null,2));
 const name=`ROOK-fresh-batch-${String(batch+1).padStart(2,'0')}-folders-${String(first).padStart(2,'0')}-${last}.zip`;
 const bytes=zipSync(files,{level:6});await writeFile(path.join(root,'upload-batches',name),bytes);
 batches.push({file:name,screenshots:items.length,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(path.join(root,'UPLOAD-INDEX.json'),JSON.stringify(batches,null,2));
console.log(JSON.stringify(batches,null,2));
