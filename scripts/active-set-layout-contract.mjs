// Read-only browser contract for the approved Final C Active Workout logger.
export function measureActiveSetLayout() {
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 const header=document.querySelector('.set-labels'), rows=[...document.querySelectorAll('.workout-screen .set-row')], errors=[];
 const measured=rows.map((row,index)=>{
  const rect=box(row), compact=rect.width<=335, wide=rect.width>=396, perSide=row.matches('.per-side'), rir=row.matches('.with-rir');
  const identity=row.querySelector('.extra-set-label,.set-index-label');
  if(identity)for(const label of identity.querySelectorAll('b,small')){
   const range=document.createRange();range.selectNodeContents(label);
   const gutter=box(identity);
   for(const glyph of range.getClientRects())if(glyph.left<Math.max(rect.x,gutter.x)-.5||glyph.right>Math.min(rect.right,gutter.right)+.5)
    errors.push('Set identity escapes its gutter: '+label.textContent);
  }
  const controls=[...row.querySelectorAll('button,input')].filter(e=>e.getClientRects().length).map(e=>{
   const r=box(e), face=e.querySelector('.stepper-sign,.rir-face,.check-mark');
   const edges=[[r.x+1,r.y+r.height/2],[r.right-1,r.y+r.height/2],[r.x+r.width/2,r.y+1],[r.x+r.width/2,r.bottom-1]];
   const visible=edges.every(([,y])=>y>=0&&y<innerHeight);
   return {name:e.getAttribute('aria-label'),tag:e.tagName,disabled:e.disabled,...r,face:face?box(face):null,hitEdges:!visible||e.disabled||edges.every(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===e||e.contains(hit);}),font:getComputedStyle(e).fontSize};
  });
  for(const c of controls){if(c.tag==='BUTTON'&&!c.name?.startsWith('Remove extra')&&(c.width<31.9||c.height<51.9))errors.push('Small target '+c.name);if(!c.hitEdges)errors.push('Edge ownership '+c.name);}
  for(let a=0;a<controls.length;a++)for(let b=a+1;b<controls.length;b++){const x=controls[a],y=controls[b];if(Math.min(x.right,y.right)-Math.max(x.x,y.x)>.1&&Math.min(x.bottom,y.bottom)-Math.max(x.y,y.y)>.1)errors.push('Overlap '+x.name+' / '+y.name);}
  if(!perSide){const ys=controls.map(c=>c.y);if(Math.max(...ys)-Math.min(...ys)>.5)errors.push('Unexpected wrap '+index);const expected=wide?54:52;if(Math.abs(rect.height-expected)>1)errors.push('Height '+rect.height+' expected '+expected);}
  if(getComputedStyle(row).gridTemplateColumns!==getComputedStyle(header).gridTemplateColumns)errors.push('Header grid differs');
  const steppers=[...row.querySelectorAll(':scope > .stepper')],r=steppers.map(box),rr=row.querySelector('.rir-trigger'),done=row.querySelector('.check');
  const gaps={metrics:r.length===2?r[1].x-r[0].right:null,repsToRir:rr&&r.length?box(rr).x-r.at(-1).right:null,rirToDone:rr?box(done).x-box(rr).right:null};
  return {...rect,state:row.dataset.setState,grid:getComputedStyle(row).gridTemplateColumns,controls,gaps};
 });
 if(document.documentElement.scrollWidth>innerWidth+1)errors.push('Horizontal overflow');
 if(!rows.length)errors.push('No set rows');
 const help=header?.querySelector('button[aria-label="What is RIR?"]');
 if(help&&rows.length&&box(help).bottom>box(rows[0]).y+.1)errors.push('RIR help overlaps first row');
 if(measured.length>1&&!rows[0].matches('.per-side')&&Math.abs(measured[1].y-measured[0].bottom-4)>.5)errors.push('Row gap');
 if(errors.length)throw new Error(errors.join('; '));
 return {width:innerWidth,height:innerHeight,rir:rows[0]?.matches('.with-rir'),theme:{...document.documentElement.dataset},rows:measured,errors};
}
