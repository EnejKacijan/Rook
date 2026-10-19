// Runtime-ID inventory and same-size visual evidence. Classification is human/model
// visual review, never inferred from filename, source library or SVG complexity.
import {readFile,readdir,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {exerciseCatalog,EXERCISE_ILLUSTRATION_EQUIVALENTS} from '../src/domain.js';
const out=process.env.ART_REVIEW_DIR||'artifacts/ROOK-FULL-CATALOG-ILLUSTRATION-REVIEW',art='src/assets/exercise-art';
const phase=process.env.ART_PHASE||'before';
await mkdir(`${out}/${phase}/contacts`,{recursive:true});await mkdir(`${out}/reference`,{recursive:true});
const catalog=Object.values(exerciseCatalog),ids=[...new Set(catalog.map(e=>e.artId).filter(Boolean))].sort();
const files=(await readdir(art)).filter(f=>f.endsWith('.svg'));
const hash=b=>createHash('sha256').update(b).digest('hex'),rows=[];
for(const id of ids){
 const buffer=await readFile(`${art}/${id}.svg`).catch(()=>null);
 if(phase==='before'&&buffer){await mkdir(`${out}/original-svg`,{recursive:true});await copyFile(`${art}/${id}.svg`,`${out}/original-svg/${id}.svg`,1).catch(error=>{if(error.code!=='EEXIST')throw error;});}
 rows.push({artId:id,records:catalog.filter(e=>e.artId===id).map(e=>({id:e.id,name:e.name,aliases:e.aliases||[],source:e.visualSource})),sha256:buffer&&hash(buffer),bytes:buffer?.length||0,classification:buffer?'UNREVIEWED':'MISSING'});
}
const hashes=new Map();for(const row of rows)if(row.sha256)hashes.set(row.sha256,[...(hashes.get(row.sha256)||[]),row.artId]);
const inventory={phase,catalogRecords:catalog.length,uniqueArtIds:ids.length,uniqueContents:hashes.size,missingRecords:catalog.filter(e=>!e.artId).map(e=>e.id),missingAssets:rows.filter(r=>!r.sha256),unusedSvgFiles:files.filter(f=>!ids.includes(f.slice(0,-4))),sharedArtIds:rows.filter(r=>r.records.length>1),identicalFiles:[...hashes.values()].filter(v=>v.length>1),documentedEquivalents:EXERCISE_ILLUSTRATION_EQUIVALENTS,rows};
await writeFile(`${out}/${phase}/inventory.json`,JSON.stringify(inventory,null,2));
const prior=JSON.parse(await readFile('artifacts/ROOK-BASELINE-CORRECTION-REVIEW/illustration-consistency/generated-sources.json'));
await copyFile(prior['leg-press'].source,`${out}/reference/approved-leg-press.png`);
const image=async id=>`data:image/svg+xml;base64,${(await readFile(`${art}/${id}.svg`)).toString('base64')}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1500,height:1590}});
 for(let offset=0;offset<ids.length;offset+=30){
  const cards=await Promise.all(ids.slice(offset,offset+30).map(async(id,i)=>`<article><img src="${await image(id)}"><p>${offset+i+1}. ${id}<br><small>${rows[offset+i].records.map(r=>r.name).join(' / ')}</small></p></article>`));
  await page.setContent(`<style>body{margin:15px;background:#f6f5f2;font:13px Arial;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}article{height:250px;background:white;text-align:center;border:1px solid #ddd;overflow:hidden}img{width:206px;height:206px;object-fit:contain}p{margin:0}small{font-size:11px;color:#48574c}</style>${cards.join('')}`);
  await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));await page.screenshot({path:`${out}/${phase}/contacts/page-${String(offset/30+1).padStart(2,'0')}.png`});
 }
 const suspects=['wg-leg-press','wg-rook-single-leg-leg-press','wg-step-down','wg-hip-adduction-machine','wg-hip-abduction-machine'];
 await page.setViewportSize({width:1300,height:1700});
 await page.setContent(`<style>body{margin:15px;font:18px Arial;background:#f6f5f2;display:grid;grid-template-columns:1fr 1fr;gap:15px}article{text-align:center;background:white;height:530px}img{width:470px;height:470px;object-fit:contain}p{margin:5px}</style>${(await Promise.all(suspects.map(async id=>`<article><img src="${await image(id)}"><p>${id}</p></article>`))).join('')}`);
 await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));await page.screenshot({path:`${out}/${phase}/equal-size-comparison.png`,fullPage:true});
 for(const id of suspects){await page.setViewportSize({width:1024,height:1024});await page.setContent(`<style>html,body{margin:0;background:white}img{width:1024px;height:1024px}</style><img src="${await image(id)}">`);await page.locator('img').evaluate(e=>e.decode());await page.screenshot({path:`${out}/${phase}/${id}.png`});}
}finally{await browser.close();}
console.log(JSON.stringify({records:catalog.length,artIds:ids.length,uniqueContents:hashes.size,missing:inventory.missingAssets.length,unused:inventory.unusedSvgFiles.length,shared:inventory.sharedArtIds.length,identical:inventory.identicalFiles}));
