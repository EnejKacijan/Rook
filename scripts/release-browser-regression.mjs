import {writeFile,mkdir} from 'node:fs/promises';
import {releaseBrowserScripts as names} from './release-browser-manifest.mjs';
import {spawn} from 'node:child_process';
const out='artifacts/release-regression';await mkdir(`${out}/logs`,{recursive:true});
const requested=process.argv.slice(2),jobs=requested.length?requested:names;const results=[];
for(const name of jobs){console.log('START',name);const result=await new Promise(resolve=>{const child=spawn(process.execPath,['--import','./scripts/release-browser-hook.mjs',`scripts/${name}.mjs`],{windowsHide:true,env:{...process.env,ROOK_QA_URL:'http://127.0.0.1:4190'},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);const timer=setTimeout(()=>child.kill(),240000);child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,log});});});await writeFile(`${out}/logs/${name}.log`,result.log);results.push({script:name,exitCode:result.code,signal:result.signal});await writeFile(`${out}/${requested.length?'targeted':'browser'}-results.json`,JSON.stringify(results,null,2));console.log(result.code===0?'PASS':'FAIL',name,result.log.slice(-200));}
process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
