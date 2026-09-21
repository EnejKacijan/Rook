import {useLayoutEffect} from 'react';

/** Inert paint of the actual row, including its notes and prescription. */
export function UpNextReorderPreview({view,listRef,previewRef}) {
  useLayoutEffect(()=>{
    const host=previewRef.current;
    const handle=[...listRef.current?.querySelectorAll('[data-exercise-id]')||[]]
      .find(node=>node.dataset.exerciseId===view.exerciseId);
    const source=handle?.closest('[data-swipe-row]');
    if(!host||!source)return;
    const paint=source.cloneNode(true);
    paint.classList.remove('reorder-live-source');
    paint.style.removeProperty('transform');
    paint.style.removeProperty('transition');
    // The preview has no gesture ownership, focus targets or duplicate IDs.
    for(const node of [paint,...paint.querySelectorAll('*')]) {
      for(const name of [...node.attributes].map(attribute=>attribute.name)) {
        if(name==='id'||name==='aria-describedby'||name==='data-exercise-id'||name==='data-day-id'||name.startsWith('data-reorder-')||name==='data-row-pressed'||(name.startsWith('data-swipe-')&&name!=='data-swipe-content'))node.removeAttribute(name);
      }
    }
    paint.querySelector('.swipe-remove-background')?.remove();
    paint.querySelector('.swipe-remove-fallback')?.remove();
    host.replaceChildren(paint);
    return ()=>host.replaceChildren();
  },[view,listRef,previewRef]);
  return <div ref={previewRef} className="queue-reorder-preview up-next" aria-hidden="true" inert=""
    style={{left:view.left,top:view.top,width:view.width,height:view.height}}/>;
}
