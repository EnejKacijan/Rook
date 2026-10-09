import React,{forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {bindPressFeedback,clearPressFeedback} from './pressFeedback.js';
import './exerciseRowFeedback.css';
import './pressFeedback.css';
import './uiSelectionPolicy.css';

// Transient feedback only. Native click, scrolling and navigation keep ownership
// of the interaction; no pointer capture, prevented defaults or delayed actions.
export const ExerciseNavigationButton=forwardRef(function ExerciseNavigationButton(props,forwardedRef){
 const {as:Tag='button',...domProps}=props;
 const ref=useRef(null);
 useImperativeHandle(forwardedRef,()=>ref.current);
 useEffect(()=>{
  const node=ref.current,release=bindPressFeedback(node.ownerDocument);
  return()=>{clearPressFeedback(node);release();};
 },[]);
 useEffect(()=>{if(props.disabled)clearPressFeedback(ref.current);},[props.disabled]);
 return <Tag {...(Tag==='button'?{type:'button'}:{})} {...domProps} ref={ref} className={`${props.className||''} exercise-row-feedback rook-ui`.trim()}/>;
});
