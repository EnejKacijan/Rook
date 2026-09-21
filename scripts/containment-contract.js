// Browser-only development contract. Inspect rendered glyphs as well as boxes:
// a centred child can escape a perfectly contained button (the EXTRA regression).
export function measureContainment(root = document.querySelector('#root')) {
  const tolerance = 1;
  const issues = [];
  const box = node => { const r = node.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
  const name = node => `${node.tagName.toLowerCase()}.${String(node.className || '').split(/\s+/).slice(0,3).join('.')}`;
  // aria-hidden alone does not mean visually hidden (e.g. KG/REPS headers).
  const excluded = node => node.closest('[hidden],[inert],.visually-hidden,.sr-only,.main-tab-paint,.workout-motion-paint,.swipe-page-paint');
  const boundarySelector = 'button,.set-row,.list-row,.exercise-picker-label,.up-next-main,.profile-hub-row,.profile-setting-row,.coach-message,.user-message,.coach-reply,.sheet,.detail-screen,.screen,.action-card,.stat-grid,.plan-exercise-row,.weekly-review-metrics > div,.weekly-review-card,.exercise-performance-metrics > div';
  const invisible = node => {const s=getComputedStyle(node);return !node.getClientRects().length || s.visibility==='hidden' || s.display==='none' || s.clipPath==='inset(50%)' || (s.clip!=='auto'&&s.position==='absolute');};
  const intentional = node => {
    for(let p=node;p&&p!==root;p=p.parentElement){
      const s=getComputedStyle(p);
      if(s.textOverflow==='ellipsis'&&s.overflowX!=='visible')return true;
      if(Number(s.webkitLineClamp)>0&&s.overflowY==='hidden')return true;
      // Closed accordions retain layout boxes but paint no content.
      if(['hidden','clip'].includes(s.overflowY)&&p.clientHeight<1)return true;
    }
    return false;
  };
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let text;
  while((text=walker.nextNode())) {
    const node=text.parentElement;
    if(!text.textContent.trim()||excluded(node)||invisible(node)||intentional(node))continue;
    const range=document.createRange();range.selectNodeContents(text);
    const boundary=node.closest(boundarySelector), bounds=boundary&&box(boundary);
    for(const r of range.getClientRects()) {
      if(!r.width||!r.height)continue;
      const outsideViewport=r.left < -tolerance || r.right > innerWidth+tolerance;
      const outsideContainer=bounds&&(r.left<bounds.left-tolerance||r.right>bounds.right+tolerance||boundary.matches('button')&&(r.top<bounds.top-tolerance||r.bottom>bounds.bottom+tolerance));
      if(outsideViewport||outsideContainer)issues.push({kind:outsideViewport?'text/viewport':'text/container',element:name(node),container:boundary&&name(boundary),text:text.textContent.trim().slice(0,100),left:r.left,right:r.right,bounds});
      const parent=box(node);
      if(!outsideViewport&&!outsideContainer&&(r.left<parent.left-tolerance||r.right>parent.right+tolerance))issues.push({kind:'text/own-box',element:name(node),text:text.textContent.trim().slice(0,100),left:r.left,right:r.right,bounds:parent});
    }
  }
  for(const row of root.querySelectorAll('.set-row')) {
    if(invisible(row))continue;
    const controls=[...row.querySelectorAll('button,input')].filter(n=>!invisible(n));
    for(let a=0;a<controls.length;a++)for(let b=a+1;b<controls.length;b++){
      const x=box(controls[a]),y=box(controls[b]);
      if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>tolerance&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>tolerance)
        issues.push({kind:'controls/overlap',text:[controls[a].getAttribute('aria-label'),controls[b].getAttribute('aria-label')]});
    }
  }
  const extras=[...root.querySelectorAll('.extra-set-label')].map(n=>({button:box(n),label:box(n.querySelector('small')),row:box(n.closest('.set-row')),grid:getComputedStyle(n.closest('.set-row')).gridTemplateColumns}));
  const targets=[...root.querySelectorAll('.workout-screen .set-row .stepper > button')].map(n=>({name:n.getAttribute('aria-label'),...box(n)}));
  const documentWidth=document.documentElement.scrollWidth,bodyWidth=document.body.scrollWidth;
  if(!root.querySelector('main,.onboarding,.landing-screen'))issues.push({kind:'screen/missing',text:root.textContent.slice(0,120)});
  if(documentWidth>innerWidth+tolerance||bodyWidth>innerWidth+tolerance)issues.push({kind:'document/overflow',documentWidth,bodyWidth,viewport:innerWidth});
  return {width:innerWidth,heading:root.querySelector('h1')?.textContent,surface:root.querySelector('main')?.className,theme:{...document.documentElement.dataset},documentWidth,bodyWidth,issues,extras,targets};
}
