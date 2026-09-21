// Presence after a synchronous canonical mutation. The clone is inert paint,
// never an input target or a second copy of application/domain state.
const exits=new Set();
export function clearSwipeRowExits(){for(const clear of [...exits])clear();}
export function prepareSwipeRowExit(row) {
  const parent=row.parentElement,next=row.nextSibling,box=row.getBoundingClientRect(),ghost=row.cloneNode(true);
  ghost.setAttribute('aria-hidden','true');ghost.setAttribute('inert','');ghost.setAttribute('data-row-exit','');
  for(const node of [ghost,...ghost.querySelectorAll('*')])for(const attr of [...node.attributes])
    if(attr.name==='id'||attr.name==='data-swipe-row'||attr.name==='data-swipe-enabled'||attr.name.startsWith('data-reorder-'))node.removeAttribute(attr.name);
  ghost.querySelector('[data-swipe-fallback]')?.remove();
  return () => {
    if(!parent?.isConnected || row.isConnected || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    ghost.style.height=`${box.height}px`;ghost.style.minHeight='0';ghost.style.pointerEvents='none';
    parent.insertBefore(ghost,next?.parentElement===parent?next:null);
    const body=ghost.querySelector('[data-swipe-content]');
    ghost.getBoundingClientRect();ghost.setAttribute('data-removing','');
    body.style.transition='transform 120ms var(--rook-ease-standard, ease-out)';
    body.style.transform=`translate3d(${-box.width}px,0,0)`;
    ghost.style.setProperty('--swipe-distance',`${box.width}px`);
    // Continue the same reveal, then collapse it without fading red into grey.
    ghost.style.transition='height 100ms 100ms ease-out, margin-bottom 100ms 100ms ease-out';
    ghost.style.height='0px';
    const gap=parseFloat(getComputedStyle(parent).rowGap)||0;ghost.style.marginBottom=`-${gap}px`;
    const clear=()=>{clearTimeout(timer);ghost.remove();exits.delete(clear);for(const event of ['blur','resize','pagehide'])window.removeEventListener(event,clear);document.removeEventListener('visibilitychange',clear);window.visualViewport?.removeEventListener('resize',clear);};
    const timer=setTimeout(clear,220);exits.add(clear);
    for(const event of ['blur','resize','pagehide'])window.addEventListener(event,clear);
    document.addEventListener('visibilitychange',clear);window.visualViewport?.addEventListener('resize',clear);
  };
}
