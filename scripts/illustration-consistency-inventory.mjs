import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {exerciseCatalog} from '../src/domain.js';
import {approvedRedraws as redraws,remainingStyleBacklog,stylePrompt} from './illustration-consistency-jobs.mjs';
const art='src/assets/exercise-art',review='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/illustration-consistency';
const digest=data=>createHash('sha256').update(data).digest('hex');
const catalog=Object.values(exerciseCatalog),files=(await readdir(art)).filter(f=>/^wg-.*\.svg$/.test(f)).sort();
const inventory=[];
for(const file of files){
 const id=file.slice(0,-4),slug=id.slice(3),after=await readFile(`${art}/${file}`),replaced=Object.hasOwn(redraws,slug);
 const before=replaced?await readFile(`${review}/original-svg/${file}`):after;
 inventory.push({artId:id,catalogRecords:catalog.filter(e=>e.artId===id).map(e=>({id:e.id,name:e.name})),action:replaced?'REDRAWN':'KEPT',remainingStyleGap:remainingStyleBacklog.includes(slug),beforeSha256:digest(before),afterSha256:digest(after),beforeBytes:before.length,afterBytes:after.length});
}
for(const slug of remainingStyleBacklog)if(!inventory.some(e=>e.artId===`wg-${slug}`))throw new Error(`Unknown backlog artwork: ${slug}`);
await writeFile(`${review}/inventory.json`,JSON.stringify({status:'PARTIAL — remaining style outliers; image generation quota exhausted',catalogRecords:catalog.length,uniqueIllustrations:files.length,redrawn:inventory.filter(e=>e.action==='REDRAWN').length,kept:inventory.filter(e=>e.action==='KEPT').length,remainingStyleGaps:inventory.filter(e=>e.remainingStyleGap).length,inventory},null,2));
const sources=JSON.parse(await readFile(`${review}/generated-sources.json`,'utf8'));
await writeFile(`${art}/consistent-masters/prompts.json`,JSON.stringify({styleReference:'artifacts/art-corrections/source/rook-single-leg-leg-press.png',stylePrompt,subjects:redraws,finalPrompts:Object.fromEntries(Object.entries(sources).filter(([,s])=>s.revised).map(([id,s])=>[id,s.prompt]))},null,2));
await mkdir(`${review}/comparisons`,{recursive:true});
const samples=['leg-press','bench-press','dumbbell-skull-crusher','cable-fly','band-pull-apart','machine-lateral-raise','dumbbell-hip-thrust','nordic-hamstring-curl'];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1080,height:1260}});
 for(let start=0;start<samples.length;start+=4){const rows=[];
  for(const slug of samples.slice(start,start+4)){
   const images=await Promise.all([`${review}/original-svg/wg-${slug}.svg`,`${art}/wg-${slug}.svg`].map(async p=>`<img src="data:image/svg+xml;base64,${(await readFile(p)).toString('base64')}">`));
   rows.push(`<section><h2>${slug.replaceAll('-',' ')}</h2><div>${images[0]}${images[1]}</div></section>`);
  }
  await page.setContent(`<style>body{margin:20px;background:#f6f5f2;color:#34463c;font:15px Arial}header,section div{display:grid;grid-template-columns:1fr 1fr;text-align:center}h1{font-size:20px}h2{font-size:16px;margin:14px 0 0;text-align:center;text-transform:capitalize}section{border-bottom:1px solid #d9ddd9}img{height:250px;width:100%;object-fit:contain}</style><h1>ROOK illustration consistency</h1><header><b>BEFORE</b><b>AFTER</b></header>${rows.join('')}`);
  await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
  await page.screenshot({path:`${review}/comparisons/before-after-${start/4+1}.png`,fullPage:true});
 }
}finally{await browser.close();}
console.log(JSON.stringify({records:catalog.length,artwork:files.length,redrawn:Object.keys(redraws).length}));
