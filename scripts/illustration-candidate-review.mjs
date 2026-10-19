// QA only: show unapproved image-generator outputs at equal scale.
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const root='artifacts/ROOK-ILLUSTRATION-SYSTEM-2026-09-12';
const entries=Object.entries(JSON.parse(await readFile(`${root}/candidate-sources.json`)));
await mkdir(`${root}/candidates`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1020}});
 for(let offset=0;offset<entries.length;offset+=6){
  const cards=[];
  for(const [slug,{source}] of entries.slice(offset,offset+6)){
   const png=(await readFile(source)).toString('base64');
   cards.push(`<article><h2>${slug}</h2><img src="data:image/png;base64,${png}"></article>`);
  }
  await page.setContent(`<style>body{margin:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#eee;font:14px Arial}article{background:white;height:490px}h2{text-align:center;font-size:16px;margin:6px}img{width:100%;height:450px;object-fit:contain}</style>${cards.join('')}`);
  await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
  await page.screenshot({path:`${root}/candidates/page-${String(offset/6+1).padStart(2,'0')}.png`,fullPage:true});
 }
}finally{await browser.close();}
