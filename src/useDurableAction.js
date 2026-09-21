import {useRef} from 'react';
import {flushSync} from 'react-dom';
import {saveState} from './domain.js';

// Publish only after the existing atomic state write succeeds. A synchronous
// latest ref also protects consecutive taps before React publishes new props.
export function useDurableAction(state,update) {
  const latest=useRef(state),busy=useRef(false);latest.current=state;
  const commit=operation=>{
    if(busy.current)throw Error('Please wait for the current change.');
    busy.current=true;
    try {
      const before=latest.current,next=operation(before);
      if(next===before)return {changed:false,state:before};
      if(!saveState(next))throw Error('Could not save. Your previous data is unchanged. Try again.');
      latest.current=next;
      flushSync(()=>update(()=>next,{planVersion:false,persistedState:next}));
      return {changed:true,state:next};
    } finally {busy.current=false;}
  };
  return {commit,latest};
}
