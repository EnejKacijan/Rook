import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {bindTrainingReorder} from './trainingReorder.js';
export function useTrainingReorder(ref,options) {
  const latest=useRef(options);latest.current=options;
  const binding=useRef(null),gesture=useRef(null),frame=useRef(null),preview=useRef(null),cancel=useRef(null),suppress=useRef(0),commit=useRef(null);
  const [view,setView]=useState(null);
  commit.current=value=>latest.current.onCommit(value);
  useLayoutEffect(()=>{
    const node=options.enabled!==false?ref.current:null,key=options.identity;
    if(binding.current?.node===node&&binding.current?.key===key)return;
    binding.current?.release();
    binding.current=node?{node,key,release:bindTrainingReorder(node,{
      reorderGestureRef:gesture,reorderFrameRef:frame,reorderPreviewRef:preview,cancelReorderRef:cancel,
      suppressReorderClickUntil:suppress,commitReorderRef:commit,setReorderView:setView,
      getCandidate:value=>latest.current.getCandidate(value),beforeStart:value=>latest.current.beforeStart?.(value),
      getScroller:element=>latest.current.getScroller?.(element),getViewport:element=>latest.current.getViewport?.(element),
    })}:null;
  });
  useLayoutEffect(()=>{if(view&&preview.current&&gesture.current)preview.current.style.setProperty('--reorder-drag-y',`${gesture.current.clientY-gesture.current.startY}px`);},[view]);
  useEffect(()=>()=>{
    // StrictMode replays mount effects. A released binding is no longer an
    // owner, even when the same list/session identity mounts again.
    const previous=binding.current;
    binding.current=null;
    previous?.release();
  },[]);
  return {view,previewRef:preview,cancel:()=>cancel.current?.()};
}
