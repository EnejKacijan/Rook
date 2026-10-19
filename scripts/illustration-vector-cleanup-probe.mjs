// Native SVG contour cleanup experiment; no raster/image-generation substitution.
// Writes review candidates only. Never writes shipped assets.
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
const out='artifacts/ROOK-BASELINE-CORRECTION-REVIEW/illustration-consistency/contour-probe';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const p=await browser.newPage({viewport:{width:1400,height:1500}});
await p.addScriptTag({path:'artifacts/art-correction-tools/node_modules/paper/dist/paper-full.js'});
await p.addScriptTag({path:'artifacts/art-correction-tools/node_modules/clipper-lib/clipper.js'});
const names=['band-pull-apart','assisted-chin-up','cable-pallof-hold','belt-squat','dumbbell-sumo-deadlift','machine-lateral-raise','smith-machine-reverse-lunge','leg-swings-stretch'];const cards=[];
for(const name of names){const source=await fs.readFile(`src/assets/exercise-art/wg-${name}.svg`,'utf8');
const result=await p.evaluate(source=>{
 paper.setup(new paper.Size(512,512));const doc=new DOMParser().parseFromString(source,'image/svg+xml');
 const units=Number(doc.documentElement.getAttribute('viewBox').split(' ')[2])/512;
 for(const el of doc.querySelectorAll('path')){
  const item=new paper.CompoundPath(el.getAttribute('d')),polygons=[];
  for(const child of item.children){child.flatten(.12*units);polygons.push(child.segments.map(s=>({X:Math.round(s.point.x*1000),Y:Math.round(s.point.y*1000)})));}
  const filled=ClipperLib.Clipper.SimplifyPolygons(polygons,ClipperLib.PolyFillType.pftEvenOdd);
  const offset=new ClipperLib.ClipperOffset(2,.1*units*1000),expanded=[],closed=[];
  offset.AddPaths(filled,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);offset.Execute(expanded,.85*units*1000);
  const inset=new ClipperLib.ClipperOffset(2,.1*units*1000);inset.AddPaths(expanded,ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);inset.Execute(closed,-.35*units*1000);
  const clean=new paper.CompoundPath();for(const poly of closed){const path=new paper.Path({segments:poly.map(p=>[p.X/1000,p.Y/1000]),closed:true});path.simplify(.4*units);clean.addChild(path);}
  el.setAttribute('d',clean.pathData);el.setAttribute('fill-rule','evenodd');
 }return new XMLSerializer().serializeToString(doc);
},source);await fs.writeFile(`${out}/wg-${name}.svg`,result);
cards.push(`<article><strong>${name}</strong><div>${[source,result].map(s=>`<img src="data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}">`).join('')}</div><span>original / native contour candidate</span></article>`);
}
await p.setContent(`<style>body{background:#f6f5f2;display:grid;grid-template-columns:repeat(2,1fr);font:14px Arial;gap:12px}article{background:white;padding:12px}strong{display:block}img{width:300px;height:300px}</style>${cards.join('')}`);await p.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));await p.screenshot({path:`${out}/comparison.png`,fullPage:true});
}finally{await browser.close();}
