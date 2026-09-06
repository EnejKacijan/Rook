import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Fresh evidence only. Never imports a previous review package.
const packageJson=JSON.parse(await readFile('package.json','utf8'));
const extras=['landing-qa','onboarding-layout-qa','active-today-qa','workout-flow-qa','profile-logging-qa','flexible-week-qa','flexible-week-states-qa','flexible-week-integration-qa','flexible-week-polish-qa','flexible-availability-qa','edge-back-qa','edge-back-interactions-qa','today-day-header-qa','e1rm-polish-qa','progress-order-qa','profile-grouping-qa','other-active-day-polish-qa','block-metadata-qa','offline-pwa-qa'];
const scripts=[...new Set([...Object.entries(packageJson.scripts).filter(([key])=>key.startsWith('qa:')||['test:ui','test:edge'].includes(key)).flatMap(([,cmd])=>[...cmd.matchAll(/node (scripts\/[\w-]+\.mjs)/g)].map(m=>m[1])),...extras.map(n=>`scripts/${n}.mjs`)])];
const start=new Date(),root=path.resolve(process.env.ROOK_AUDIT_DIR||`artifacts/final-rook-review-${start.toISOString().slice(0,16).replace('T','-').replace(':','')}`);
await mkdir(path.join(root,'runtime-logs'),{recursive:true});
const status={startedAt:start.toISOString(),root,buildHash:createHash('sha256').update(await readFile('dist/index.html')).digest('hex'),scripts:[]};
await writeFile(path.join(root,'RUN.json'),JSON.stringify(status,null,2));console.log(root);
let index=0;
async function worker(){while(index<scripts.length){const script=scripts[index++],startedAt=new Date().toISOString();console.log(`START ${script}`);const result=await new Promise(resolve=>{const child=spawn(process.execPath,['--import','./scripts/qa-stable-screenshots.mjs',script],{cwd:process.cwd(),env:{...process.env,ROOK_QA_URL:'http://127.0.0.1:4173',QA_BASE_URL:'http://127.0.0.1:4173'},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);const timer=setTimeout(()=>child.kill(),600000);child.on('error',e=>output+=e.message);child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,output});});});const entry={script,startedAt,finishedAt:new Date().toISOString(),code:result.code,signal:result.signal};status.scripts.push(entry);await writeFile(path.join(root,'runtime-logs',path.basename(script)+'.log'),result.output);await writeFile(path.join(root,'RUN.json'),JSON.stringify(status,null,2));console.log(`${result.code===0?'PASS':'FAIL'} ${script}${result.code===0?'':' '+result.output.slice(-700)}`);}}
const workerCount=Number(process.env.ROOK_QA_WORKERS||2);
if(!Number.isInteger(workerCount)||workerCount<1||workerCount>4)throw new Error('ROOK_QA_WORKERS must be 1–4');
await Promise.all(Array.from({length:workerCount},()=>worker()));
status.finishedAt=new Date().toISOString();await writeFile(path.join(root,'RUN.json'),JSON.stringify(status,null,2));
console.log(`FINISHED ${status.scripts.filter(s=>s.code===0).length}/${scripts.length} passed. ${root}`);
