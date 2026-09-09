import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {for(const style of ['standard','premium'])for(const appearance of ['light','dark']) {
 const views=[['Edit — 320',320,'edit-two-sets'],['Edit — 390',390,'edit-two-sets'],['Import — 320',320,'import-reordered'],['Import — 390',390,'import-two-sets'],['Generated — 320',320,'generated-reordered'],['Generated — 390',390,'generated-two-sets'],['Empty field — 320',320,'edit-empty'],['Add — 390',390,'generated-add']];
 const cards=await Promise.all(views.map(async([label,width,state])=>`<figure><figcaption>${label}</figcaption><img src="data:image/png;base64,${(await readFile(`artifacts/plan-editor-input/${width}-${style}-${appearance}-${state}.png`)).toString('base64')}"></figure>`));
 const page=await browser.newPage({viewport:{width:1040,height:1500}});
 await page.setContent(`<style>body{margin:0;background:#ddd;font:14px Arial}h1{font-size:18px;margin:12px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}figure{margin:0;background:#ddd}figcaption{padding:8px}img{display:block;width:100%}</style><h1>ROOK — ${style} ${appearance} — actual app screenshots</h1><main>${cards.join('')}</main>`);
 await page.screenshot({path:`artifacts/plan-editor-input/overview-${style}-${appearance}.png`,fullPage:true});await page.close();
}}finally{await browser.close();}
