import { readFile, writeFile, mkdir, readdir, stat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root=path.resolve(process.argv[2]);
const run=JSON.parse(await readFile(path.join(root,'RUN.json'),'utf8'));
if(!run.finishedAt)throw new Error('Finish runtime capture before packaging.');
if(createHash('sha256').update(await readFile('dist/index.html')).digest('hex')!==run.buildHash)throw new Error('Build changed after capture.');
const failed=run.scripts.filter(item=>item.code!==0);
if(failed.length){
 const reruns=JSON.parse(await readFile(path.join(root,'RERUNS.json'),'utf8'));
 if(reruns.buildHash!==run.buildHash||failed.some(item=>!reruns.reruns.some(retry=>retry.script===item.script&&retry.code===0)))throw new Error('Unresolved runtime QA failure.');
}
const themeRuns=JSON.parse(await readFile(path.join(root,'THEME-RUN.json'),'utf8'));
if(themeRuns.length!==32||themeRuns.some(item=>item.code!==0))throw new Error('Complete the four-theme matrix before packaging.');
const start=Date.parse(run.startedAt);
const groups=[
 ['01-landing-recovery',['landing-copy','recovery-path']],
 ['02-onboarding',['onboarding-layout','onboarding-restrictions','scratch-plan']],
 ['03-today-calendar',['rest-day','planned-today','today-exercise-edit','today-illustration-coverage','active-today','today-day-header','other-active-day-polish','block-metadata','calendar-range-contrast']],
 ['04-active-workout',['active-workout-bottom','active-workout-clarity','active-workout-superset','header-alignment','workout-restart','warmup-sequencing','workout-flow','endurance-illustrations']],
 ['05-adjust-today',['adjust-today']],
 ['06-flexible-week',['flexible-week','flexible-week-states','flexible-week-integration','flexible-week-polish','flexible-availability']],
 ['07-completion-history',['history-correction','session-feedback']],
 ['08-coach',['coach-history','coach-coverage-adapt','plan-upgrade-fallback']],
 ['09-progress-performance',['performance-insights','goal-progress','e1rm-polish','progress-order','exercise-history']],
 ['10-training-blocks',['training-blocks']],
 ['11-block-review-next-block',['block-review']],
 ['12-gym-profiles',['gym-profiles']],
 ['13-substitutions',['smart-substitutions']],
 ['14-plate-calculator',['plate-calculator']],
 ['15-plan-history',['plan-history','edit-plan-hierarchy','plan-reorder']],
 ['16-workout-photos',['workout-photo-timeline','workout-photo-compare']],
 ['17-custom-exercises-aliases',['custom-exercises']],
 ['18-import-export',['historical-workout-import','import-review-ux','workout-history-export','export-plan']],
 ['19-advanced-logging',['advanced-logging']],
 ['20-profile-settings',['profile-logging','profile-grouping','rest-notifications']],
 ['21-backup-restore',['backup-restore','restore-crash']],
 ['22-offline-errors',['offline-pwa','persistence-failure','edge-back','edge-back-interactions']],
 ['23-theme-comparisons',['dark-mode','premium-theme','appearance','motion-theme']],
 ['24-modal-scaffold-references',['modal-scaffold','bottom-sheet-drag']],
];
const manifest=[], omitted=[];
for(const [section,dirs] of groups){
 await mkdir(path.join(root,section),{recursive:true});
 for(const dir of dirs){
  const sourceRoot=path.resolve('artifacts',dir);
  for(const name of await readdir(sourceRoot).catch(()=>[])){
   if(!name.endsWith('.png')||/guide|contact|before|diagnostic|-(?:cancel|commit)-partial/i.test(name))continue;
   const source=path.join(sourceRoot,name), info=await stat(source);
   if(info.mtimeMs<start)continue;
   // Retain every main-width state, all narrow Light states, and wide top-level views.
   // Other width/theme duplicates remain available in the source evidence directory.
   const width=/(?:^|[-_])(320|375|390|430|500)(?:[-_.]|$)/.exec(name)?.[1];
   const redundantNarrow=width==='320'&&/^(?:320-|matrix-)(?:premium|standard-dark)/.test(name);
   // Some authoritative scripts capture a theme only at 430px. Preserve it.
   const redundantWide=false;
   if(redundantNarrow||redundantWide||width==='500'){omitted.push({source,reason:'Additional width/theme duplicate; current 390px and narrow baseline evidence retained.'});continue;}
   const relative=`${section}/${dir}--${name}`,bytes=await readFile(source);
   await copyFile(source,path.join(root,relative));
   manifest.push({file:relative,source,capturedAt:info.mtime.toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
  }
 }
}
await writeFile(path.join(root,'MANIFEST.json'),JSON.stringify({buildHash:run.buildHash,startedAt:run.startedAt,screenshots:manifest,additionalFreshVariants:omitted},null,2));
await writeFile(path.join(root,'INDEX.md'),`# Fresh ROOK production visual review\n\nBuild SHA-256 (dist/index.html): ${run.buildHash}\n\nCaptured after ${run.startedAt}. Synthetic local fixtures only. No old review imagery.\n\n${manifest.length} original PNGs. Additional duplicate viewport/theme captures remain listed in MANIFEST.json, not silently represented as reviewed.\n\n`+groups.map(([s])=>`- ${s}: ${manifest.filter(m=>m.file.startsWith(s+'/')).length} images`).join('\n')+'\n\nScreenshots do not prove touch, keyboard, persistence, notification delivery or physical-device behavior. Runtime results are reported separately.\n');
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1080,height:1600},deviceScaleFactor:1});
await mkdir(path.join(root,'internal-contact-sheets'),{recursive:true});
const boards=[];
for(const [section] of groups){
 const items=manifest.filter(m=>m.file.startsWith(section+'/'));
 for(let i=0;i<items.length;i+=9){
  const batch=items.slice(i,i+9),name=`${section}-${String(i/9+1).padStart(2,'0')}.png`;
  const cards=await Promise.all(batch.map(async m=>`<figure><figcaption>${m.file.split('/')[1]}</figcaption><img src="data:image/png;base64,${(await readFile(path.join(root,m.file))).toString('base64')}"></figure>`));
  await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:#c7c7c7;font:12px Arial}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px}figure{margin:0;min-width:0}figcaption{height:38px;overflow-wrap:anywhere}img{width:100%;height:660px;object-fit:contain;object-position:top;background:#aaa}</style><main>${cards.join('')}</main></html>`);
  await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(root,'internal-contact-sheets',name),fullPage:true});
  boards.push({file:name,screenshots:batch.map(m=>m.file)});
 }
}
await browser.close();
await writeFile(path.join(root,'internal-contact-sheets','INDEX.json'),JSON.stringify(boards,null,2));
console.log(JSON.stringify({screenshots:manifest.length,boards:boards.length,root}));
