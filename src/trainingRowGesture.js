import {EDGE_BACK} from './edgeBack.js';

export const ROW_INTENT = Object.freeze({slop:10, ratio:1.3});
const owners = new WeakMap();

/** One input owner per list. Adapters supply presentation, never domain state. */
export function registerTrainingRowGesture(root, kind, adapter) {
  let owner=owners.get(root);
  if(!owner){owner=createOwner(root);owners.set(root,owner);}
  owner.adapters.set(kind,adapter);
  const release=()=>{
    owner.cancel();owner.adapters.delete(kind);
    if(!owner.adapters.size){owner.dispose();owners.delete(root);}
  };
  release.cancel=owner.cancel;
  return release;
}

function createOwner(root) {
  const adapters=new Map();
  let gesture=null,suppress=null;
  const blocked=()=>root.closest('[inert]')||document.querySelector('[data-edge-back-active]')||root.querySelector('[role="dialog"]');
  const consume=e=>{if(e.cancelable)e.preventDefault();e.stopPropagation();};
  const end=(commit=false,point=null,event=null)=>{
    const g=gesture;if(!g)return;gesture=null;unlisten();
    if(g.capture?.hasPointerCapture?.(g.id))g.capture.releasePointerCapture(g.id);
    if(g.lock){
      suppress={row:g.row,until:performance.now()+500};
      g.adapter.end(g.candidate,commit,point||g.point);
      if(event)consume(event);
    }
  };
  const cancel=()=>end(false);
  const valid=()=>gesture&&root.isConnected&&gesture.row.isConnected&&!blocked();
  const start=(event,point,pointerType)=>{
    cancel();suppress=null;
    if(blocked())return;
    const bounds=(root.closest('.screen,.sheet')||root).getBoundingClientRect();
    if(point.clientX-bounds.left<=EDGE_BACK.edge)return;
    const swipe=adapters.get('swipe')?.candidate(event.target,point,pointerType);
    const reorder=adapters.get('reorder')?.candidate(event.target,point,pointerType);
    if(!swipe&&!reorder)return;
    gesture={swipe,reorder,row:swipe?.row||reorder.activator.closest('[data-reorder-block-index],[data-reorder-workout-section]')||reorder.activator,
      startX:point.clientX,startY:point.clientY,point,pointerType,id:pointerType==='touch'?point.identifier:point.pointerId,lock:null};
    listen();
  };
  const move=(event,point)=>{
    const g=gesture;if(!g)return;
    if(!valid()){cancel();return;}
    g.point=point;
    const dx=point.clientX-g.startX,dy=point.clientY-g.startY;
    if(!g.lock){
      if(Math.max(Math.abs(dx),Math.abs(dy))<ROW_INTENT.slop)return;
      if(Math.abs(dx)>=Math.abs(dy)*ROW_INTENT.ratio){
        if(!g.swipe||!adapters.get('swipe').accepts(dx)){cancel();return;}
        g.lock='swipe';g.candidate=g.swipe;
      }else if(Math.abs(dy)>=Math.abs(dx)*ROW_INTENT.ratio){
        if(!g.reorder){cancel();return;}
        g.lock='reorder';g.candidate=g.reorder;
      }else return;
      g.adapter=adapters.get(g.lock);
      if(g.adapter.begin?.(g.candidate)===false){cancel();return;}
      if(g.pointerType!=='touch'){
        g.capture=g.reorder?.activator||g.row;
        g.capture.setPointerCapture?.(g.id);
      }
    }
    // Handle touch-action:none already owns scrolling. A body move claimed by
    // the browser must yield rather than cause a removal.
    if(g.lock==='swipe'&&!event.cancelable&&!g.candidate.handle){cancel();return;}
    if(g.adapter.move(g.candidate,point)===false){cancel();return;}
    consume(event);
  };
  const touchStart=e=>{
    if(e.touches.length!==1){cancel();return;}
    start(e,e.touches[0],'touch');
  };
  const touchMove=e=>{
    if(gesture?.pointerType!=='touch')return;
    const point=Array.from(e.touches).find(p=>p.identifier===gesture.id);
    if(e.touches.length!==1||!point){cancel();return;}
    move(e,point);
  };
  const touchEnd=e=>{
    if(gesture?.pointerType!=='touch')return;
    if(e.type==='touchcancel'){cancel();return;}
    const point=Array.from(e.changedTouches||[]).find(p=>p.identifier===gesture.id);
    if(point)end(e.type==='touchend'&&!!valid(),point,e);
  };
  const pointerDown=e=>{
    suppress=null;
    if(e.pointerType==='touch')return;
    if(gesture){cancel();return;}
    if(e.button===0)start(e,e,e.pointerType||'mouse');
  };
  const pointerMove=e=>{if(gesture&&gesture.pointerType!=='touch'&&e.pointerId===gesture.id)move(e,e);};
  const pointerEnd=e=>{
    if(!gesture)return;
    if(gesture.pointerType==='touch'){if(e.type==='pointercancel'&&e.pointerType==='touch')cancel();return;}
    if(e.pointerId===gesture.id)end(e.type==='pointerup'&&!!valid(),e,e);
  };
  const click=e=>{
    if(suppress&&performance.now()<suppress.until&&suppress.row.contains(e.target)){
      e.preventDefault();e.stopImmediatePropagation();suppress=null;
    }
  };
  const key=e=>{if(e.key==='Escape'&&gesture){if(gesture.lock)consume(e);cancel();}};
  const scroll=()=>{if(gesture?.lock!=='reorder')cancel();};
  const multitouch=e=>{if(e.touches.length!==1)cancel();};
  const live=[['touchmove',touchMove],['touchend',touchEnd],['touchcancel',touchEnd],['touchstart',multitouch],['pointermove',pointerMove],['pointerup',pointerEnd],['pointercancel',pointerEnd],['lostpointercapture',pointerEnd]];
  const listen=()=>live.forEach(([name,fn])=>window.addEventListener(name,fn,{capture:true,passive:false}));
  const unlisten=()=>live.forEach(([name,fn])=>window.removeEventListener(name,fn,true));
  const observer=new MutationObserver(()=>{if(gesture&&!valid())cancel();});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['inert']});
  root.addEventListener('touchstart',touchStart,{passive:true});root.addEventListener('pointerdown',pointerDown);root.addEventListener('click',click,true);
  window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);
  window.visualViewport?.addEventListener('resize',cancel);
  document.addEventListener('visibilitychange',cancel);document.addEventListener('scroll',scroll,true);
  return {adapters,cancel,dispose(){
    cancel();observer.disconnect();unlisten();
    root.removeEventListener('touchstart',touchStart);root.removeEventListener('pointerdown',pointerDown);root.removeEventListener('click',click,true);
    window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);
    window.visualViewport?.removeEventListener('resize',cancel);
    document.removeEventListener('visibilitychange',cancel);document.removeEventListener('scroll',scroll,true);
  }};
}
