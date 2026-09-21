import React,{forwardRef,useCallback,useEffect,useImperativeHandle,useRef} from 'react';
import './exerciseRowFeedback.css';

// Transient feedback only. Native click, scrolling and navigation keep ownership
// of the interaction; no pointer capture, prevented defaults or delayed actions.
export const ExerciseNavigationButton=forwardRef(function ExerciseNavigationButton(props,forwardedRef){
 const {as:Tag='button',...domProps}=props;
 const ref=useRef(null),pointer=useRef(null),release=useRef(null);
 useImperativeHandle(forwardedRef,()=>ref.current);
 const clear=useCallback(()=>{
  pointer.current=null;
  release.current?.();release.current=null;
 },[]);
 useEffect(()=>clear,[clear]);
 useEffect(()=>{if(props.disabled)clear();},[props.disabled,clear]);
 const press=()=>{
  const node=ref.current;if(!node||props.disabled)return;
  node.setAttribute('data-row-pressed','');
  const doc=node.ownerDocument,win=doc.defaultView;
  doc.addEventListener('scroll',clear,{capture:true,passive:true});
  doc.addEventListener('visibilitychange',clear);win.addEventListener('blur',clear);
  release.current=()=>{node.removeAttribute('data-row-pressed');doc.removeEventListener('scroll',clear,true);doc.removeEventListener('visibilitychange',clear);win.removeEventListener('blur',clear);};
 };
 const inputKind=event=>{
  if(event.pointerType==='touch')ref.current?.setAttribute('data-row-touch','');
  else if(event.pointerType==='mouse'||event.pointerType==='pen')ref.current?.removeAttribute('data-row-touch');
 };
 const feedback={
  onPointerEnter:inputKind,
  onPointerDown:event=>{
   clear();inputKind(event);
   if(props.disabled||event.button!==0||event.isPrimary===false)return;
   pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY};press();
  },
  onPointerMove:event=>{
   inputKind(event);const start=pointer.current;if(!start||start.id!==event.pointerId)return;
   const r=ref.current.getBoundingClientRect();
   if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>8||event.clientX<r.left||event.clientX>=r.right||event.clientY<r.top||event.clientY>=r.bottom)clear();
  },
  onPointerUp:clear,onPointerCancel:clear,onPointerLeave:clear,onLostPointerCapture:clear,
  onBlur:clear,onClick:clear,
  onKeyDown:event=>{if(!event.repeat&&(event.key===' '||event.key==='Enter')){clear();press();}},
  onKeyUp:event=>{if(event.key===' '||event.key==='Enter')clear();},
 };
 const handlers=Object.fromEntries(Object.entries(feedback).map(([name,handle])=>[name,event=>{handle(event);props[name]?.(event);} ]));
 return <Tag {...domProps} {...handlers} ref={ref} className={`${props.className||''} exercise-row-feedback`.trim()}/>;
});
