import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const out='artifacts/ROOK-FINAL-HARDENING',normal=s=>s.replace(/\r\n/g,'\n');
const snapshot=normal(await readFile(`${out}/before-tracked.patch`,'utf8'));
const patches=new Map([...snapshot.matchAll(/^diff --git a\/(.+) b\/(.+)\n([\s\S]*?)(?=^diff --git |$(?![\s\S]))/gm)].map(m=>[m[2],m[3]]));
assert.ok(patches.size>20,'complete original dirty diff loaded');
const allowed=new Set(['src/App.jsx','src/FlexibleWeekSheet.jsx','src/FlexibleWeekSheet.test.jsx','src/SheetActionFooter.jsx','src/SheetActionFooter.test.jsx','src/coach.css','src/overrides.css','src/loggedExercises.css','src/workout-controls.css','src/swipePageMotion.js','src/useSemanticSwipeBack.js','src/useSemanticSwipeBack.test.js','scripts/coach-history-qa.mjs']);
function apply(original,patch){
 if(!patch)return original;
 const source=original.split('\n'),result=[];let cursor=0;
 const lines=patch.split('\n');
 for(let i=0;i<lines.length;i++){
  const m=lines[i].match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);if(!m)continue;
  const start=Math.max(0,Number(m[1])-1);result.push(...source.slice(cursor,start));cursor=start;
  for(i++;i<lines.length&&!lines[i].startsWith('@@');i++){
   const line=lines[i],prefix=line[0];
   if(prefix===' '||prefix==='-'){assert.equal(source[cursor],line.slice(1),'safety snapshot matches HEAD');if(prefix===' ')result.push(source[cursor]);cursor++;}
   else if(prefix==='+')result.push(line.slice(1));
  }i--;
 }
 result.push(...source.slice(cursor));return result.join('\n');
}
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:10e6}).split('\0').filter(p=>p&&!p.startsWith('artifacts/'));
const changed=[],unchanged=[];let incremental='';
for(const file of tracked){
 const head=normal(execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8',maxBuffer:10e6}));
 const before=apply(head,patches.get(file)),after=normal(await readFile(file,'utf8'));
 if(before===after){unchanged.push(file);continue;}
 assert.ok(allowed.has(file),`unexpected change outside this pass: ${file}`);
 const baseline=path.join(out,'comparison-before',file);await mkdir(path.dirname(baseline),{recursive:true});await writeFile(baseline,before);
 const diff=spawnSync('git',['diff','--no-index','--no-ext-diff','--',baseline,file],{encoding:'utf8',maxBuffer:10e6});assert.ok(diff.status===1);
 incremental+=diff.stdout;
 changed.push({file,beforeSha256:createHash('sha256').update(before).digest('hex'),afterSha256:createHash('sha256').update(after).digest('hex')});
}
await writeFile(`${out}/this-pass-tracked.diff`,incremental);
await writeFile(`${out}/preservation-audit.json`,JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),changed,unchangedTrackedCount:unchanged.length,unchangedTrackedFiles:unchanged},null,2));
console.log(JSON.stringify({changed:changed.map(c=>c.file),unchangedTracked:unchanged.length,safetySnapshotFiles:patches.size},null,2));
