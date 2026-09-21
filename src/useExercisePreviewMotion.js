import {useLayoutEffect,useRef} from 'react';

// Paint-only copies stay INSIDE the existing sheet. The real browser/search DOM
// stays mounted, so navigation never replaces its input or scroll container.
export function useExercisePreviewMotion(screen,preview) {
  const pending=useRef(null),clear=useRef(()=>{});
  const nodes=()=>[...screen.current.querySelectorAll(':scope > [data-preview-motion], :scope > .sheet-action-footer:not(.queue-preview-paint)')].filter(node=>!node.hidden);
  const capture=back=>{
    clear.current();
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||!screen.current.animate)return;
    const origin=screen.current.getBoundingClientRect();
    pending.current={back,copies:nodes().map(node=>{
      const rect=node.getBoundingClientRect(),copy=node.cloneNode(true),scrolls=[];
      const originals=[node,...node.querySelectorAll('*')];
      [copy,...copy.querySelectorAll('*')].forEach((child,index)=>{
        child.removeAttribute('id');child.removeAttribute('autofocus');
        if(child.matches('input,textarea,select'))child.value=originals[index].value;
        if(originals[index].scrollTop)scrolls.push([child,originals[index].scrollTop]);
      });
      copy.setAttribute('inert','');copy.setAttribute('aria-hidden','true');copy.removeAttribute('data-preview-motion');
      copy.classList.add('queue-preview-paint');
      Object.assign(copy.style,{position:'absolute',top:`${rect.top-origin.top}px`,left:`${rect.left-origin.left}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:'0',maxHeight:'none',flex:'none'});
      return {copy,scrolls};
    })};
  };
  useLayoutEffect(()=>{
    const captured=pending.current;pending.current=null;
    if(!captured)return;
    const root=screen.current,animations=[],x=captured.back?-5:5;
    const timing={duration:160,easing:getComputedStyle(root).getPropertyValue('--rook-ease-standard').trim()||'cubic-bezier(.2,0,0,1)',fill:'both'};
    for(const node of nodes())animations.push(node.animate([{opacity:0,transform:`translateX(${x}px)`},{opacity:1,transform:'translateX(0)'}],timing));
    for(const {copy,scrolls} of captured.copies){
      root.append(copy);scrolls.forEach(([node,top])=>{node.scrollTop=top;});
      animations.push(copy.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-x}px)`}],timing));
    }
    const cleanup=()=>{
      clearTimeout(timer);animations.forEach(a=>a.cancel());captured.copies.forEach(({copy})=>copy.remove());
      window.removeEventListener('resize',cleanup);window.removeEventListener('pagehide',cleanup);
      document.removeEventListener('visibilitychange',cleanup);root.removeEventListener('pointerdown',cleanup,true);root.removeEventListener('keydown',cleanup,true);root.removeEventListener('rook:before-sheet-close',cleanup);
    };
    const timer=setTimeout(cleanup,160);clear.current=cleanup;
    window.addEventListener('resize',cleanup);window.addEventListener('pagehide',cleanup);document.addEventListener('visibilitychange',cleanup);
    root.addEventListener('pointerdown',cleanup,true);root.addEventListener('keydown',cleanup,true);root.addEventListener('rook:before-sheet-close',cleanup);
  },[preview]);
  useLayoutEffect(()=>()=>{clear.current();pending.current=null;},[]);
  return capture;
}
