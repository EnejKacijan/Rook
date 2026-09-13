import {useRef,useState} from 'react';

const UNAVAILABLE = 'Paste isn’t available here. Tap and hold in the field to paste.';

// Local compose feedback only: never bypass the controlled textarea or import
// validation, and never query/request clipboard permission in the background.
export function useImportNotesPaste(inputRef,setText,onPasted){
  const [status,setStatus]=useState(''),[pasting,setPasting]=useState(false);
  const pending=useRef(false);
  const paste=async()=>{
    const input=inputRef.current;
    if(!input||input.disabled||pending.current)return;
    const current=()=>inputRef.current===input&&input.isConnected&&!input.disabled;
    const feedback=message=>{
      if(!current())return;
      setStatus(message);
      input.focus({preventScroll:true});
    };
    if(!globalThis.isSecureContext||typeof navigator.clipboard?.readText!=='function'){
      feedback(UNAVAILABLE);return;
    }
    pending.current=true;setPasting(true);setStatus('');
    try{
      // Called directly from the button gesture, before any await.
      const pasted=await navigator.clipboard.readText();
      if(!current())return;
      if(!pasted.trim()){feedback('Clipboard has no text to paste.');return;}
      // A permission prompt can outlive further typing/native paste. Read the
      // current controlled field, not the render captured before that prompt.
      const start=input.selectionStart,end=input.selectionEnd;
      const next=input.value.slice(0,start)+pasted+input.value.slice(end);
      setText(next);onPasted();
      requestAnimationFrame(()=>{
        if(!current()||input.value!==next)return;
        input.focus({preventScroll:true});
        input.setSelectionRange(start+pasted.length,start+pasted.length);
      });
    }catch{
      feedback(UNAVAILABLE);
    }finally{
      pending.current=false;
      setPasting(false);
    }
  };
  return {paste,pasting,status,clearStatus:()=>setStatus('')};
}
