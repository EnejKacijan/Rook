// Read-only owner-video inspection. The original recording is never modified.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
const source=process.argv[2];
if(!source)throw new Error('Pass the original screen recording path');
const out=process.env.ROOK_VIDEO_OUTPUT||'artifacts/SCRATCH-REENTRY-REVIEW/video';
await mkdir(out,{recursive:true});
const bytes=await readFile(source), browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1100}});
 await page.route('http://video.local/',r=>r.fulfill({contentType:'text/html',body:'<video muted preload="auto" src="/original.mp4"></video><canvas></canvas>'}));
 await page.route('http://video.local/original.mp4',r=>{
  const range=r.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
  if(!range)return r.fulfill({contentType:'video/mp4',headers:{'accept-ranges':'bytes'},body:bytes});
  const start=Number(range[1]),end=range[2]?Number(range[2]):bytes.length-1;
  return r.fulfill({status:206,contentType:'video/mp4',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`},body:bytes.subarray(start,end+1)});
 });
 await page.goto('http://video.local/');
 await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const meta=await page.evaluate(()=>{const v=document.querySelector('video');return {duration:v.duration,width:v.videoWidth,height:v.videoHeight};});
 await writeFile(`${out}/metadata.json`,JSON.stringify({source,sha256:createHash('sha256').update(bytes).digest('hex'),...meta},null,2));
 console.log(meta);
 const interval=Number(process.env.ROOK_VIDEO_INTERVAL||1);
 const start=Number(process.env.ROOK_VIDEO_START||0),end=Math.min(meta.duration,Number(process.env.ROOK_VIDEO_END||meta.duration));
 let batch=[];
 for(let t=start;t<end;t+=interval){
  const data=await page.evaluate(async t=>{
   const v=document.querySelector('video');
   await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=t+.001;});
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const c=document.querySelector('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL('image/png').split(',')[1];
  },t);
  batch.push({t,data});
  if(batch.length===8||t+interval>=end){
   const sheet=await page.evaluate(frames=>new Promise(async resolve=>{
    const c=document.createElement('canvas');c.width=1120;c.height=1280;const x=c.getContext('2d');x.fillStyle='#333';x.fillRect(0,0,c.width,c.height);
    for(let i=0;i<frames.length;i++){const img=new Image();img.src='data:image/png;base64,'+frames[i].data;await img.decode();const left=(i%4)*280,top=Math.floor(i/4)*640;x.drawImage(img,left,top+24,280,610);x.fillStyle='white';x.font='16px sans-serif';x.fillText(frames[i].t.toFixed(2)+' s',left+6,top+18);}
    resolve(c.toDataURL('image/png').split(',')[1]);
   }),batch);
   const path=`${out}/frames-${batch[0].t.toFixed(2)}.png`;await writeFile(path,Buffer.from(sheet,'base64'));console.log(path);batch=[];
  }
 }
}finally{await browser.close();}
