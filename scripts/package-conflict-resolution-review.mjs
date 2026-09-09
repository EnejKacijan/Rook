import { readFile, readdir, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
const root='artifacts/conflict-resolution',files={};
const main=JSON.parse(await readFile('artifacts/edit-plan-opening/RESULTS.json','utf8'));
const states=JSON.parse(await readFile(`${root}/states/RESULTS.json`,'utf8'));
if(main.length!==12||states.length!==24||states.some(item=>!item.pass))throw new Error('Complete both QA matrices before packaging');
for(const [prefix,dir,filter] of [
 ['before',`${root}/before/edit-plan-opening`,name=>name.endsWith('-target.png')],
 ['after','artifacts/edit-plan-opening',name=>name.endsWith('.png')],
 ['edge',`${root}/states`,name=>name.endsWith('.png')],
])for(const name of await readdir(dir))if(filter(name))files[`${prefix}/${name}`]=[await readFile(`${dir}/${name}`),{level:0}];
files['README.md']=strToU8('ROOK focused conflict-resolution refinement. All images are actual application screenshots with synthetic fixtures, not mockups. BEFORE contains original conflict cards. AFTER contains normal reference editor, blocked Today, conflict target, compatible picker, next conflict, and resolved Today at 320/390/430 × four themes. EDGE contains 320/390 × four themes: effort correction before/draft/saved offline; no-compatible-replacement with last-exercise removal disabled; search-empty and simulated persistence-failure. The source snapshot remains unchanged until explicit Save. Normal fields return after resolution. No new durable state. No medical clearance claims. Runtime tests separately verify filtering, sequential focus, save/reload/offline, storage failure and bounded cancellable reveal. Screenshots alone cannot establish animation or physical-device correctness. Review only this scoped UI, not unrelated Today or existing storage-warning UI.');
await writeFile(`${root}/review.zip`,zipSync(files));console.log(`${Object.keys(files).length-1} original screenshots packaged`);
