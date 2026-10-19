import {readFile,writeFile} from 'node:fs/promises';
const out='artifacts/today-sheet-motion',read=name=>readFile(`${out}/${name}`,'utf8').then(JSON.parse);
const stats=values=>{values=values.filter(Number.isFinite).sort((a,b)=>a-b);return {min:values[0],median:values[Math.floor(values.length/2)],p95:values[Math.floor(values.length*.95)],max:values.at(-1)};};
const result={};
for(const file of ['before-chromium.json','results-chromium.json','results-webkit.json']){
 const rows=(await read(file)).filter(r=>r.key.endsWith('-motion'));
 result[file]={cases:rows.length,mountMs:stats(rows.map(r=>r.probe.mount)),firstMotionMs:stats(rows.map(r=>r.probe.frames.find(f=>f.top<r.probe.frames[0].top-.1)?.time)),commitMs:stats(rows.flatMap(r=>r.probe.commits.map(c=>c.duration))),frameGapMs:stats(rows.flatMap(r=>r.probe.frames.slice(2).map((f,i)=>f.time-r.probe.frames[i+1].time))),longTasks:rows.flatMap(r=>r.probe.longTasks),heights:[...new Set(rows.map(r=>r.probe.final.height))],durations:[...new Set(rows.flatMap(r=>r.probe.animation.map(a=>a.timing.duration)))]};
}
for(const file of ['before.cpuprofile','after.cpuprofile']){
 const p=await read(file),nodes=new Map(p.nodes.map(n=>[n.id,n])),parents=new Map(),sums={};
 for(const n of p.nodes)for(const c of n.children||[])parents.set(c,n.id);
 p.samples.forEach((id,i)=>{const path=[];while(id){path.push(nodes.get(id).callFrame.functionName);id=parents.get(id);}for(const name of ['Today','TodayActionsSheet','canUseWorkoutToday','proposeFlexibleWeek','ModalLayer','updateHeader'])if(path.includes(name))sums[name]=(sums[name]||0)+p.timeDeltas[i]/1000;});result[file]=sums;
}
await writeFile(`${out}/summary.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
