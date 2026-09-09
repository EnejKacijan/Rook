import {readdir,readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const dir='src/assets/exercise-art',out='artifacts/art-contact-audit';await mkdir(out,{recursive:true});
const files=(await readdir(dir)).filter(f=>f.startsWith('wg-')&&f.endsWith('.svg')).sort();
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{const page=await browser.newPage({viewport:{width:1400,height:1500}});
for(let offset=0;offset<files.length;offset+=30){const cards=await Promise.all(files.slice(offset,offset+30).map(async f=>`<article><img src="data:image/svg+xml;base64,${Buffer.from(await readFile(`${dir}/${f}`)).toString('base64')}"><p>${f.replace('wg-','').replace('.svg','')}</p></article>`));await page.setContent(`<style>body{margin:16px;background:#f6f5f2;font:14px Arial;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}article{height:232px;background:white;text-align:center;border:1px solid #ddd}img{width:200px;height:200px}p{margin:0}</style>${cards.join('')}`);await page.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));await page.screenshot({path:`${out}/page-${String(offset/30+1).padStart(2,'0')}.png`});}console.log(`${files.length} assets, ${Math.ceil(files.length/30)} sheets`);}finally{await browser.close();}
