import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root=path.resolve('artifacts',`ROOK-current-review-${new Date().toISOString().replace(/[:.]/g,'-')}`);await mkdir(root,{recursive:true});
const groups=[
 ['01-main-navigation','main-navigation-qa'],['02-onboarding','onboarding-layout-qa'],['03-plan-preview','plan-preview-summary-qa'],
 ['04-training-priorities','training-priorities-qa'],['05-plan-import-review','import-source-review-qa'],['06-plan-editor','plan-exercise-chooser-qa'],
 ['07-restriction-conflicts','conflict-resolution-qa'],['08-active-workout','workout-logging-affordance-qa'],['09-advanced-logging','advanced-logging-qa'],
 ['10-warmups','warmup-sequencing-qa'],['11-completion-feedback','session-feedback-qa'],['12-history-correction','history-correction-qa'],
 ['13-flexible-week','flexible-week-qa'],['14-availability-changes','flexible-availability-qa'],['15-adjust-today','adjust-today-qa'],
 ['16-coach','coach-history-qa'],['17-coach-adjustments','coach-coverage-adapt-qa'],['18-performance','performance-insights-qa'],
 ['19-goal-progress','goal-progress-qa'],['20-training-block','training-blocks-qa'],['21-next-block','block-review-qa'],
 ['22-gym-profiles','gym-profiles-qa'],['23-substitutions','smart-substitutions-qa'],['24-plate-calculator','plate-calculator-qa'],
 ['25-plan-history','plan-history-qa'],['26-workout-photos','workout-photo-compare-qa'],['27-custom-exercises','custom-exercises-qa'],
 ['28-history-import','historical-workout-import-qa'],['29-history-export','workout-history-export-qa'],['30-plan-export','export-plan-qa'],
 ['31-backup-restore','backup-restore-qa'],['32-recovery','recovery-path-qa'],['33-settings','profile-logging-qa'],
 ['34-notifications','rest-notifications-qa'],['35-offline','offline-pwa-qa'],['36-appearance','appearance-qa'],
];
const run={startedAt:new Date().toISOString(),root,groups:[]};let next=0;
await mkdir(path.join(root,'internal-logs'),{recursive:true});console.log(root);
async function worker(){while(next<groups.length){const [group,script]=groups[next++];console.log(`CAPTURE ${group}`);
 const result=await new Promise(resolve=>{const child=spawn(process.execPath,['--import','./scripts/current-review-capture-hook.mjs',`scripts/${script}.mjs`],{windowsHide:true,env:{...process.env,ROOK_CURRENT_REVIEW:root,ROOK_CURRENT_REVIEW_GROUP:group},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);const timer=setTimeout(()=>child.kill(),150000);child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,log});});child.on('error',e=>log+=e.message);});
 await writeFile(path.join(root,'internal-logs',`${group}.log`),result.log);run.groups.push({group,script,result:result.code===0?'completed':'partial-or-blocked',exitCode:result.code,signal:result.signal});await writeFile(path.join(root,'RUN.json'),JSON.stringify(run,null,2));console.log(`${result.code===0?'DONE':'PARTIAL'} ${group}${result.code===0?'':' '+result.log.slice(-350)}`);
}}
await Promise.all([worker(),worker(),worker()]);run.finishedAt=new Date().toISOString();await writeFile(path.join(root,'RUN.json'),JSON.stringify(run,null,2));console.log(`FINISHED ${root}`);
