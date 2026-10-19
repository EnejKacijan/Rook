import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const root='artifacts/ROOK-DARK-THEME-AUDIT',out=`${root}/owner-evidence`;await mkdir(out,{recursive:true});
const pairs=[
 ['01-edit-block','before','after-final','edit-block-6-selected-deload-toggle'],
 ['02-editor-metadata','survey','final','edit-plan-exercise'],
 ['03-selected-units','survey','final','logging'],
 ['04-import-destructive','edge-final','import-parity-final','import-edit-source'],
 ['05-success-state','final','import-parity-final','history-hevy-success'],
 ['06-combine-choices','final','combine-final','combine-time'],
 ['07-photo-guidance','states-final','last-recheck','physique-upload'],
 ['08-suggestion-states','physique-final','last-recheck','physique-unselected'],
];
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:780,height:1776},deviceScaleFactor:1});
try{for(const [id,before,after,name]of pairs){const panels=[];for(const [phase,label]of [[before,'BEFORE'],[after,'AFTER']])for(const style of ['standard','premium']){const file=`${root}/${phase}/${style}-dark-390-${name}.png`;panels.push(`<section><header>${label} · ${style.toUpperCase()} DARK · ${name}</header><img src="data:image/png;base64,${(await readFile(file)).toString('base64')}"></section>`);}await p.setContent(`<style>html,body{margin:0;background:#242424;color:#fff;font:12px Arial}body{display:grid;grid-template-columns:390px 390px}header{height:44px;display:flex;align-items:center;justify-content:center}img{display:block;width:390px;height:844px}</style>${panels.join('')}`);await p.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));await p.screenshot({path:`${out}/${id}.png`});}
}finally{await b.close();}
await writeFile(`${out}/INDEX.md`,'# Compact before / after review\n\nActual product screenshots. Each sheet: BEFORE on top, AFTER below; Standard left, Premium right. Synthetic fixtures only. Full coverage and measurements are in the audit inventory.\n\n'+pairs.map(([id])=>`- [${id}](${id}.png)`).join('\n')+'\n');
console.log(`Created ${pairs.length} compact owner before/after sheets.`);
