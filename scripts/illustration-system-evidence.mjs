// Render actual runtime SVGs, not PNG candidates: visual approval happens after this.
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const root='artifacts/ROOK-ILLUSTRATION-SYSTEM-2026-09-12';
const sources=JSON.parse(await readFile(`${root}/generated-sources.json`));
const slugs=Object.keys(sources);
const image=async file=>`data:image/svg+xml;base64,${(await readFile(file)).toString('base64')}`;
await mkdir(`${root}/evidence`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1260,height:1380}});
 for(let offset=0;offset<slugs.length;offset+=8){
  const cards=[];
  for(const slug of slugs.slice(offset,offset+8)){
   const before=await image(`${root}/original-svg/wg-${slug}.svg`);
   const after=await image(`src/assets/exercise-art/wg-${slug}.svg`);
   cards.push(`<article><h2>${slug}</h2><div><figure><img src="${before}"><figcaption>Before</figcaption></figure><figure><img src="${after}"><figcaption>Current SVG</figcaption></figure></div></article>`);
  }
  await page.setContent(`<style>body{margin:12px;background:#eee;font:14px Arial;display:grid;grid-template-columns:1fr 1fr;gap:12px}article{background:white;height:326px}h2{font-size:15px;margin:8px;text-align:center}article div{display:flex;justify-content:center}figure{margin:0;text-align:center}img{width:292px;height:280px;object-fit:contain}figcaption{font-size:12px;color:#444}</style>${cards.join('')}`);
  await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
  await page.screenshot({path:`${root}/evidence/batch-${String(offset/8+1).padStart(2,'0')}.png`,fullPage:true});
 }
 const samples=['archer-push-up','banded-squat','cable-lateral-raise','leg-press-calf-raise','cossack-squat','seated-leg-curl'];
 await page.setViewportSize({width:1080,height:1080});
 const samplesHtml=[];
 for(const slug of samples){
  const before=await image(`${root}/original-svg/wg-${slug}.svg`);
  const after=await image(`src/assets/exercise-art/wg-${slug}.svg`);
  samplesHtml.push(`<article><h2>${slug}</h2><div><figure><img src="${before}"><figcaption>Before this pass</figcaption></figure><figure><img src="${after}"><figcaption>Reviewed SVG</figcaption></figure></div></article>`);
 }
 await page.setContent(`<style>body{margin:12px;background:#eee;font:14px Arial;display:grid;grid-template-columns:1fr 1fr;gap:12px}article{background:white;height:340px}h2{font-size:15px;margin:8px;text-align:center}article div{display:flex;justify-content:center}figure{margin:0;text-align:center}img{width:252px;height:282px;object-fit:contain}figcaption{font-size:12px;color:#444}</style>${samplesHtml.join('')}`);
 await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));
 await page.screenshot({path:`${root}/evidence/owner-before-after.png`});
}finally{await browser.close();}
