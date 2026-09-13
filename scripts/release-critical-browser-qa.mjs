// Selected current successors only; never the historical full browser manifest.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const out='artifacts/release-2026-09-13';await mkdir(`${out}/critical-browser`,{recursive:true});
const defaultCases=[
 ['startup-persistence-qa'],['scratch-reentry-navigation-qa'],['scratch-drag-scroll-qa'],
 ['preview-reorder-mode-qa','--exit-toggle'],['split-taxonomy-qa'],['duration-fidelity-qa'],
 ['import-open-targets-qa'],['coach-time-revision-qa'],['coach-keyboard-inset-qa'],
 ['coach-tab-exit-qa'],['dark-theme-state-qa'],['illustration-surface-qa'],
];
const cases=process.argv.length>2?process.argv.slice(2).map(n=>[n]):defaultCases,results=[];
for(const [name,...args]of cases){
 console.log('START',name);let output='';
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[`scripts/${name}.mjs`,...args],{windowsHide:true,env:{...process.env,ROOK_QA_URL:process.env.ROOK_QA_URL||'http://127.0.0.1:4177'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',resolve);
 });
 await writeFile(`${out}/critical-browser/${name}.log`,output);results.push({name,args,code});
 await writeFile(`${out}/critical-browser/results.json`,JSON.stringify(results,null,2));console.log(code===0?'PASS':'FAIL',name,output.slice(-250));
}
process.exitCode=results.some(r=>r.code!==0)?1:0;
