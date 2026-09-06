import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv[2]);
await mkdir(path.join(root,'theme-runtime-logs'),{recursive:true});
const results=[];
for(const theme of ['light:standard','dark:standard','light:premium','dark:premium']){
 for(const script of ['custom-exercises-qa','advanced-logging-qa','historical-workout-import-qa','rest-notifications-qa','onboarding-layout-qa','coach-history-qa','coach-coverage-adapt-qa','backup-restore-qa']){
  console.log(`START ${theme} ${script}`);
  const result=await new Promise(resolve=>{
   const child=spawn(process.execPath,['--import','./scripts/qa-stable-screenshots.mjs',`scripts/${script}.mjs`],{windowsHide:true,env:{...process.env,ROOK_QA_THEME:theme,ROOK_QA_EMPTY_THEME:script==='onboarding-layout-qa'?'1':'0'},stdio:['ignore','pipe','pipe']});
   let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('close',code=>resolve({code,output}));
  });
  results.push({theme,script,code:result.code});
  await writeFile(path.join(root,'theme-runtime-logs',`${theme.replace(':','-')}-${script}.log`),result.output);
  await writeFile(path.join(root,'THEME-RUN.json'),JSON.stringify(results,null,2));
  console.log(`${result.code===0?'PASS':'FAIL'} ${theme} ${script}`);
 }
}
console.log(`${results.filter(r=>r.code===0).length}/${results.length} theme runtime runs passed`);
