// One-off format conversion of approved, single-green-ink generated illustrations.
// Tool dependencies are isolated from the app: npm install --prefix artifacts/art-correction-tools --no-save potrace sharp
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../artifacts/art-correction-tools/package.json',import.meta.url));
const sharp=require('sharp'),{trace}=require('potrace');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'artifacts/art-corrections');
const manifest=JSON.parse(await fs.readFile(path.join(out,'sources.json'),'utf8'));
const masters=path.join(root,'src/assets/exercise-art/corrected-masters');await fs.mkdir(masters,{recursive:true});await fs.mkdir(path.join(out,'source'),{recursive:true});
for(const [slug,file] of Object.entries(manifest)){
 const master=path.join(masters,`wg-${slug}.svg`);if(!process.argv.includes('--force')){try{await fs.access(master);continue;}catch{}}
 await fs.copyFile(file,path.join(out,'source',`${slug}.png`));
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 // Select only the requested green ink, never a generated transparency preview.
 // This also handles genuine alpha output; gray/white background is not ink.
 const mono=Buffer.alloc(info.width*info.height,255);
 for(let i=0;i<mono.length;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2],a=data[i*4+3];if(a>80&&g-r>14&&g-b>8)mono[i]=0;}
 const bitmap=await sharp(mono,{raw:{width:info.width,height:info.height,channels:1}}).png().toBuffer();
 const svg=await new Promise((resolve,reject)=>trace(bitmap,{color:'#1f6b4c',background:'transparent',threshold:128,turdSize:8,optTolerance:.3},(err,value)=>err?reject(err):resolve(value)));
 const label=slug.replace(/^rook-/,'').replaceAll('-',' ');
 const normalized=svg.replace(/width="[^"]+" height="[^"]+"/,`width="512" height="512"`).replace(/ stroke="none"/g,'').replace('<path',`<title>${label}</title><path`);
 await fs.writeFile(master,normalized);await fs.writeFile(path.join(root,'src/assets/exercise-art',`wg-${slug}.svg`),normalized);console.log(`${slug}: vectorized`);
}
