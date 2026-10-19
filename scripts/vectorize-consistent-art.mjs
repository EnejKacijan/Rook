// Conversion only: built-in imagegen creates the artwork. No runtime dependency.
// Uses the same isolated tools and green-ink extraction as vectorize-corrected-art.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright-core';
const require=createRequire(new URL('../artifacts/art-correction-tools/package.json',import.meta.url));
const sharp=require('sharp'),{trace}=require('potrace');
const root=path.resolve(import.meta.dirname,'..');
const review=path.resolve(root,process.env.ART_REVIEW_DIR||'artifacts/ROOK-BASELINE-CORRECTION-REVIEW/illustration-consistency');
const art=path.join(root,'src/assets/exercise-art'),masters=path.join(art,'consistent-masters');
const manifest=JSON.parse(await fs.readFile(path.join(review,'generated-sources.json'),'utf8'));
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
await fs.mkdir(masters,{recursive:true});await fs.mkdir(path.join(review,'source'),{recursive:true});await fs.mkdir(path.join(review,'original-svg'),{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage();
for(const [slug,{source:input,newAsset=false}] of Object.entries(manifest)){
 if(only&&!only.includes(slug))continue;
 const file=`wg-${slug}.svg`,target=path.join(art,file),master=path.join(masters,file);
 if(!process.argv.includes('--force')){try{await fs.access(master);continue;}catch{}}
 // Back up the exact pre-pass asset once; regeneration never replaces this copy.
 await fs.copyFile(target,path.join(review,'original-svg',file),1).catch(e=>{if(e.code!=='EEXIST'&&!(newAsset&&e.code==='ENOENT'))throw e;});
 const localSource=path.join(review,'source',`${slug}.png`);
 if(path.resolve(input)!==localSource)await fs.copyFile(input,localSource);
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const mono=Buffer.alloc(info.width*info.height,255);
 for(let i=0;i<mono.length;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2],a=data[i*4+3];if(a>80&&g-r>14&&g-b>8)mono[i]=0;}
 const bitmap=await sharp(mono,{raw:{width:info.width,height:info.height,channels:1}}).png().toBuffer();
 let svg=await new Promise((resolve,reject)=>trace(bitmap,{color:'#1f6b4c',background:'transparent',threshold:128,turdSize:8,optTolerance:.3},(err,value)=>err?reject(err):resolve(value)));
 svg=svg.replace(/width="[^"]+" height="[^"]+"/,'width="512" height="512"').replace(/ stroke="none"/g,'').replace('<path',`<title>${slug.replace(/^rook-/,'').replaceAll('-',' ')}</title><path`);
 await page.setContent(svg);const b=await page.locator('svg').evaluate(e=>{const b=e.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
 const side=Math.max(b.width,b.height)*1.14,box=[b.x+b.width/2-side/2,b.y+b.height/2-side/2,side,side].map(v=>Number(v.toFixed(3))).join(' ');
 svg=svg.replace(/viewBox="[^"]*"/,`viewBox="${box}"`);
 await fs.writeFile(master,svg);await fs.writeFile(target,svg);console.log(file);
}
}finally{await browser.close();}
