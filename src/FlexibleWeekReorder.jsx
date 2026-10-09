import {useId,useLayoutEffect,useRef,useState} from 'react';
import {ReorderHandle} from './ReorderHandle.jsx';
import {useTrainingReorder} from './useTrainingReorder.js';

const dateLabel=date=>new Intl.DateTimeFormat('en',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${date}T12:00:00`));

/** Fixed calendar slots; the shared reorder owner lifts only the workout body. */
export function FlexibleWeekReorder({rows,identity,scrollRef,onReorder}) {
  const listRef=useRef(null),focusId=useRef(null),controlsId=useId();
  const [controls,setControls]=useState(null),[announcement,setAnnouncement]=useState('');
  const move=(id,targetIndex)=>{
    const order=rows.map(row=>row.logicalSessionId),index=order.indexOf(id);
    if(index<0 || targetIndex<0 || targetIndex>=order.length || index===targetIndex)return false;
    order.splice(targetIndex,0,...order.splice(index,1));
    if(!onReorder(order))return false;
    focusId.current=id;setAnnouncement(`${rows[index].name} moved to ${dateLabel(rows[targetIndex].toDate)}.`);return true;
  };
  const reorder=useTrainingReorder(listRef,{
    identity,fixedSlots:true,getScroller:()=>scrollRef.current,
    getViewport:screen=>({top:screen.querySelector('.detail-header')?.getBoundingClientRect().bottom||screen.getBoundingClientRect().top,
      bottom:screen.querySelector('.sheet-action-footer')?.getBoundingClientRect().top||screen.getBoundingClientRect().bottom}),
    beforeStart:()=>{setControls(null);return true;},
    getCandidate:({exerciseId})=>{const row=rows.find(row=>row.logicalSessionId===exerciseId);return row?{label:row.name,expectedIds:rows.map(row=>row.logicalSessionId)}:null;},
    onCommit:gesture=>gesture.expectedIds.join('|')===rows.map(row=>row.logicalSessionId).join('|') && move(gesture.exerciseId,gesture.targetIndex),
  });
  useLayoutEffect(()=>{
    const list=listRef.current;
    // A wrapped name must fit any slot, including while it floats over a slot
    // previously occupied by a shorter name. Dates keep their measured places.
    const measure=()=>list.style.setProperty('--flexible-reorder-row-height',`${Math.max(48,...[...list.querySelectorAll('.flexible-reorder-body > strong')].map(node=>Math.ceil(node.getBoundingClientRect().height)))}px`);
    measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
    observer?.observe(list);list.querySelectorAll('.flexible-reorder-body > strong').forEach(node=>observer?.observe(node));
    return ()=>observer?.disconnect();
  },[rows]);
  useLayoutEffect(()=>{
    if(!focusId.current)return;
    [...listRef.current.querySelectorAll('.rook-reorder-handle')].find(node=>node.dataset.exerciseId===focusId.current)?.focus({preventScroll:true});
    focusId.current=null;
  },[rows]);
  return <>
    <p className="flexible-reorder-instruction">Long-press a grip, then drag workouts into the order you want.</p>
    <p>This week only. Your permanent plan stays unchanged.</p>
    <div ref={listRef} className="flexible-reorder-list" aria-label="Workouts in date order">
      {rows.map((row,index)=><section key={row.toDate} className="flexible-reorder-slot" data-date-slot={row.toDate}>
        <p className="eyebrow">{dateLabel(row.toDate)}</p>
        <div key={row.logicalSessionId} data-day-id="adjust-week" data-reorder-block-index={index} className="flexible-reorder-body">
          <strong>{row.name}</strong>
          <ReorderHandle data-reorder-kind="exercise" data-day-id="adjust-week" data-exercise-id={row.logicalSessionId}
            aria-label={`Reorder ${row.name}, ${dateLabel(row.toDate)}`} aria-expanded={controls===row.logicalSessionId}
            aria-controls={`${controlsId}-${index}`} title="Long-press to drag; tap for move controls; use Up or Down arrow keys"
            onClick={()=>setControls(current=>current===row.logicalSessionId?null:row.logicalSessionId)}
            onKeyDown={event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();move(row.logicalSessionId,index+(event.key==='ArrowUp'?-1:1));}}}/>
        </div>
        {controls===row.logicalSessionId && <div id={`${controlsId}-${index}`} className="queue-order-option flexible-reorder-accessible" data-no-reorder>
          <button type="button" disabled={index===0} onClick={()=>move(row.logicalSessionId,index-1)}>Move earlier</button>
          <button type="button" disabled={index===rows.length-1} onClick={()=>move(row.logicalSessionId,index+1)}>Move later</button>
        </div>}
      </section>)}
    </div>
    <p role="status" className="visually-hidden">{announcement}</p>
    {reorder.view && <div ref={reorder.previewRef} className="flexible-reorder-body flexible-reorder-preview" aria-hidden="true" inert=""
      style={{left:reorder.view.left,top:reorder.view.top,width:reorder.view.width,height:reorder.view.height}}>
      <strong>{reorder.view.label}</strong><span className="flexible-reorder-grip"><i/></span>
    </div>}
  </>;
}
