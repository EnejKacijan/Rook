import {readFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const root=path.resolve(process.argv[2]);
const groups=(await readdir(root)).filter(x=>/^\d\d-/.test(x)).sort();
const output=path.join(root,'internal-visual-check');await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1800},deviceScaleFactor:1});
for(let i=0;i<groups.length;i+=6){
 let html='';for(const group of groups.slice(i,i+6)){
  let captures=[];try{captures=JSON.parse(await readFile(path.join(root,group,'CAPTURES.json'),'utf8'));}catch{}
  const picked=[...new Set([0,Math.floor(captures.length/2),captures.length-1])].filter(n=>captures[n]);
  for(const n of picked){const c=captures[n],base64=(await readFile(path.join(root,c.file))).toString('base64');html+=`<div><p>${group}<br>${path.basename(c.file)}</p><img src="data:image/png;base64,${base64}"></div>`;}
 }
 await page.setContent(`<style>body{margin:12px;background:#bbb;display:grid;grid-template-columns:repeat(6,1fr);gap:8px;font:10px Arial}p{height:38px;margin:0;overflow-wrap:anywhere}img{width:228px;height:520px;object-fit:contain;object-position:top;background:#ddd}</style>${html}`);
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 await page.screenshot({path:path.join(output,`board-${i/6+1}.png`),fullPage:true});
}
await browser.close();console.log(output);
