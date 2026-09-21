import {registerTrainingRowGesture,ROW_INTENT} from './trainingRowGesture.js';
import {DIRECT_SWIPE,ADD_SWIPE,addSwipeTranslation,trackDirectSwipe} from './directSwipeState.js';
import {interactionFeedback} from './interactionFeedback.js';

export const SWIPE_ROW = Object.freeze({intent:ROW_INTENT.slop,ratio:ROW_INTENT.ratio,threshold:DIRECT_SWIPE.arm,disarmThreshold:DIRECT_SWIPE.disarm,duration:200,cancelDuration:180});
const removals=new WeakMap();
export function registerSwipeRemoval(row,remove){removals.set(row,remove);return ()=>removals.delete(row);}
const interactive='button,a,input,textarea,select,[contenteditable],[role="button"],[role="slider"],[role="checkbox"],[data-no-swipe]';

/** Finger presentation only; the registered row callback owns removal/Undo. */
export function bindSwipeRowActions(list,{mode='remove',onAdd,feedback=interactionFeedback}={}) {
  const adding=mode==='add';
  const settles=new Set();
  const clearSettles=()=>{for(const clear of [...settles])clear();};
  for(const event of ['blur','resize','pagehide'])window.addEventListener(event,clearSettles);
  document.addEventListener('visibilitychange',clearSettles);
  window.visualViewport?.addEventListener('resize',clearSettles);
  const enabled=row=>row?.dataset.swipeEnabled==='true'&&!row.hasAttribute('data-removing')&&!row.hasAttribute('data-swipe-settling')&&!row.hasAttribute('data-swipe-committing')&&!row.closest('[inert],.is-reordering');
  const paint=(g,distance,animate=false)=>{
    const body=g.row.querySelector('[data-swipe-content]');if(!body)return;
    g.presentedDistance=distance;
    body.style.transition=animate&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?`transform ${SWIPE_ROW.cancelDuration}ms var(--rook-ease-standard, ease-out)`:'none';
    body.style.transform=distance?`translate3d(${adding?distance:-distance}px,0,0)`:'';
    g.row.style.setProperty('--swipe-distance',`${distance}px`);
    g.row.toggleAttribute('data-swipe-active',!adding&&distance>0);
    g.row.toggleAttribute('data-swipe-armed',distance>0&&g.state==='tracking-armed');
    g.row.toggleAttribute('data-swipe-adding',adding&&distance>0);
    g.row.dataset.swipeState=distance>0?g.state:'idle';
  };
  const distance=(g,p)=>Math.max(0,adding?p.clientX-g.x:g.x-p.clientX);
  const settleAdd=(g,shouldAdd)=>{
    const body=g.row.querySelector('[data-swipe-content]');
    if(!body)return;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration=reduced?ADD_SWIPE.reducedDuration:ADD_SWIPE.duration;
    const easing=reduced?'ease-out':getComputedStyle(body).getPropertyValue('--rook-ease-standard').trim()||'cubic-bezier(.2,0,0,1)';
    g.row.setAttribute('data-swipe-settling','');
    g.row.toggleAttribute('data-swipe-committing',shouldAdd);
    g.row.dataset.swipeState=shouldAdd?'settling-armed':'settling-unarmed';
    let animation,timer,finished=false;
    const finish=commit=>{
      if(finished)return;finished=true;
      clearTimeout(timer);animation?.cancel();
      g.row.removeAttribute('data-swipe-settling');g.row.removeAttribute('data-swipe-committing');
      paint(g,0);settles.delete(clear);
      // Keep the old foreground throughout the return. Only then invoke the
      // existing save-before-publish Add; failure never displays durable success.
      if(commit&&shouldAdd&&g.row.isConnected&&enabled(g.row))onAdd?.(g.row.dataset.catalogId);
    };
    const clear=()=>finish(false);
    settles.add(clear);
    const from=body.style.transform;
    // A static cue sits behind this opaque foreground. Returning it to zero
    // naturally shrinks the reveal; no width animation or success wipe.
    if(body.animate){
      animation=body.animate([{transform:from},{transform:'translate3d(0px,0,0)'}],{duration,easing,fill:'forwards'});
      animation.onfinish=()=>finish(true);
    }else{
      body.style.transition=`transform ${duration}ms ${easing}`;
      body.style.transform='translate3d(0px,0,0)';
    }
    timer=setTimeout(()=>finish(true),duration+(animation?34:0));
  };
  const release=registerTrainingRowGesture(list,'swipe',{
    candidate(target,p){
      const row=target.closest('[data-swipe-row]'),handle=target.closest('[data-reorder-kind]'),control=target.closest(interactive);
      if(!enabled(row)||!list.contains(row)||control&&!control.hasAttribute('data-swipe-body')&&(!handle||adding||control!==handle))return null;
      return {row,handle,x:p.clientX,width:row.getBoundingClientRect().width,state:'idle'};
    },
    accepts:dx=>adding?dx>0:dx<0,
    move(g,p){
      if(!enabled(g.row))return false;
      const raw=distance(g,p);
      const next=trackDirectSwipe(g.state,raw,g.width,{thresholds:adding?ADD_SWIPE:DIRECT_SWIPE});
      if(next==='tracking-armed'&&g.state!==next)feedback.threshold();
      g.state=next;
      paint(g,adding?addSwipeTranslation(raw,g.width):Math.min(raw,g.width));
    },
    end(g,commit,p){
      const next=trackDirectSwipe(g.state,distance(g,p),g.width,{release:true,cancel:!commit||!enabled(g.row),thresholds:adding?ADD_SWIPE:DIRECT_SWIPE});
      if(adding){
        if(commit&&enabled(g.row)){
          g.state=next==='commit'?'tracking-armed':'tracking-unarmed';
          paint(g,g.presentedDistance||0);
          settleAdd(g,next==='commit');
        }else paint(g,0);
        return;
      }
      if(next==='commit'){
        paint(g,Math.min(distance(g,p),g.width));
        g.row.dataset.swipeState='commit';
        if(removals.get(g.row)?.()!==false&&!g.row.isConnected)return;
      }
      g.state='cancel';
      paint(g,0,commit);
    },
  });
  return ()=>{
    release();clearSettles();
    for(const event of ['blur','resize','pagehide'])window.removeEventListener(event,clearSettles);
    document.removeEventListener('visibilitychange',clearSettles);
    window.visualViewport?.removeEventListener('resize',clearSettles);
  };
}
