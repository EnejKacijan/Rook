// Compact side-by-side evidence from actual product screenshots, not mockups.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const phase=process.argv[2]||'final',out='artifacts/ROOK-DARK-THEME-AUDIT';
const rows=JSON.parse(await readFile(`${out}/${phase}/results.json`,'utf8')).filter(r=>!r.error&&r.variant.endsWith('390'));
const names=[...new Set(rows.map(r=>r.name))];await mkdir(`${out}/contacts-${phase}`,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:780,height:888},deviceScaleFactor:1});
const index=[];
try{for(const name of names){
 const images=[];
 for(const style of ['standard','premium']){
  const row=rows.find(r=>r.name===name&&r.variant===`${style}-dark-390`);if(!row)continue;
  const file=`${out}/${phase}/${row.variant}-${name}.png`;
  images.push(`<section><header>${style.toUpperCase()} DARK · ${name}</header><img src="data:image/png;base64,${(await readFile(file)).toString('base64')}"></section>`);
 }
 if(images.length!==2)continue;
 await page.setContent(`<style>html,body{margin:0;background:#242424;color:#fff;font:12px Arial}body{display:flex}section{width:390px}header{height:44px;display:flex;align-items:center;justify-content:center}img{display:block;width:390px;height:844px}</style>${images.join('')}`);
 await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 await page.screenshot({path:`${out}/contacts-${phase}/${name}.png`});index.push(name);
} }finally{await browser.close();await writeFile(`${out}/contacts-${phase}/index.json`,JSON.stringify(index,null,2));}
console.log(`${index.length} paired contact sheets: ${out}/contacts-${phase}`);
