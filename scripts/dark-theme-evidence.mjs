// Merge the latest verified sample of each actual surface; keep earlier captures
// as before evidence. This does not rerun flows or modify application data.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root='artifacts/ROOK-DARK-THEME-AUDIT';
const runs=['final','edge-final','edge-recheck','states-final','last-recheck','import-parity-final','combine-final','interaction-final','coverage-final','drag-final','reduced-final'];
const samples=new Map(),setupErrors=[];
for(const run of runs){const rows=JSON.parse(await readFile(`${root}/${run}/results.json`,'utf8'));for(const row of rows){if(row.error){setupErrors.push({run,variant:row.variant,name:row.name,error:row.error});continue;}samples.set(`${row.variant}/${row.name}`,{...row,run});}}
for(const row of JSON.parse(await readFile(`${root}/after-final-results.json`,'utf8')).filter(r=>r.variant.includes('-dark-')))samples.set(`${row.variant}/${row.name}`,{...row,run:'after-final'});
const results=[...samples.values()],names=[...new Set(results.map(r=>r.name))].sort();
const failures=results.flatMap(r=>r.rows.filter(t=>!t.disabled&&t.ratio<t.required).map(t=>({variant:r.variant,name:r.name,run:r.run,...t})));
const summary={surfaces:names.length,cases:results.length,visibleTextSamples:results.reduce((n,r)=>n+r.rows.length,0),activeContrastCandidates:failures,overflow:results.filter(r=>r.overflow).map(r=>[r.variant,r.name]),widths:[320,390],styles:['Standard Dark','Premium Dark'],allFourVariants:names.every(name=>results.filter(r=>r.name===name).length===4),setupErrors};
await writeFile(`${root}/audit-results.json`,JSON.stringify({summary,results},null,2));
const aiBatches={
 1:['edit-block-4-selected','edit-block-6-selected-deload-toggle'],
 2:['edit-plan-exercise','logging'],
 3:['build-personal','build-goal','build-days-selected','build-equipment','build-preferences','build-invalid-custom','generated-reorder','scratch-empty','scratch-picker','scratch-warmup'],
 4:['today-planned','today-rest','calendar','today-completed','delete-confirm','active-weighted','active-side','rest-timer','exercise-options','illustration-viewer'],
 5:['import-paste','import-edit-source','import-ai-offer','import-grouped-optional','import-alternatives','history-hevy-review','history-strong-columns','history-generic-facts','history-hevy-success','history-error'],
 6:['coach-initial','coach-long-transcript','coach-keyboard-emulated','coach-loading','coach-failed','coach-retry-ready','combine-time','combine-proposal','combine-review','combine-applied'],
 7:['profile-root','profile-program','appearance','export-plan','progress-empty-photos','progression','working-weights','weight-chart','photo-timeline','photo-delete-confirm'],
 8:['edit-plan-exercise','logging','import-edit-source','history-hevy-success','combine-time','physique-intro','physique-upload','physique-unselected','build-invalid-cta','block-focus-visible'],
 9:['combined-active','adjust-time-selected','scratch-drag-active','coach-loading'],
};
const fixes={
 'edit-block':'Undefined surface aliases → real surface/text/selected roles',
 'edit-plan-exercise':'Shared editor metadata + control boundaries',
 'logging':'Standard selected role aligned to Premium',
 'appearance':'Shared selected role',
 'build':'Shared selected role + schedule helper text',
 'generated':'Shared editor metadata + selected role',
 'scratch':'Shared editor metadata + picker field boundary',
 'import-edit-source':'Shared editor metadata; warm-up label; destructive remove role',
 'import-result':'Import summary secondary text',
 'history-hevy-success':'Shared accent-soft success badge',
 'history-':'Session summary secondary text',
 'coach-loading':'Reduced-motion status text',
 'combine-time':'Neutral choice buttons use dark surface roles',
 'physique':'Photo guidance, upload icon, selected/unselected suggestion text',
};
let md='# Actual-product audit inventory\n\nEach row includes both 320px and 390px. Browser/measurement is not a claim of physical iPhone execution. AI column names only submitted screenshot batches; shared-primitive coverage is explicitly distinguished. Final re-review verdicts are in REVIEW.md.\n\n| Surface / state | Standard Dark | Premium Dark | Issue / change | AI visual review | Owner check |\n|---|---|---|---|---|---|\n';
for(const name of names){const status=style=>[320,390].map(w=>{const r=results.find(x=>x.name===name&&x.variant===`${style}-dark-${w}`);return !r?'missing':r.overflow||r.rows.some(t=>!t.disabled&&t.ratio<t.required)?`${w}: inspect`:`${w}: pass`;}).join('; ');const batch=Object.entries(aiBatches).filter(([,v])=>v.includes(name)).map(([k])=>'B'+k).join(', ');const fix=Object.entries(fixes).find(([key])=>name.startsWith(key))?.[1]||'No local defect';md+=`| ${name} | ${status('standard')} | ${status('premium')} | ${fix} | ${batch||'Browser + measured; shared primitives reviewed'} | Native iOS only |\n`;}
await writeFile(`${root}/AUDIT-TABLE.md`,md);
console.log(JSON.stringify({...summary,setupErrors:setupErrors.map(e=>`${e.run}: ${e.variant} ${e.name} (superseded fixture setup)`),activeContrastCandidates:failures},null,2));
if(failures.length||summary.overflow.length||!summary.allFourVariants)throw new Error('Dark audit has unresolved contrast, overflow or coverage failures; inspect audit-results.json.');
