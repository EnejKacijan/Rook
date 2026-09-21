// @vitest-environment jsdom
import React, {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {ModalLayer} from './App.jsx';
import {bindNavigationFocus} from './navigationFocus.js';
let host,root,release;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{act(()=>root?.unmount());release?.();host?.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('moves focus into a replacement sheet without focusing its editor or replaying document ownership',async()=>{
 vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',vi.fn());
 vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);release=bindNavigationFocus();
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 function Options({open}){return <main className="sheet"><button onClick={open}>Add note</button></main>;}
 function Notes(){return <main className="sheet"><button aria-label="Close note">Close</button><textarea aria-label="Note"/></main>;}
 function Harness(){const[note,setNote]=useState(false);return <ModalLayer backgroundRef={{current:null}} close={()=>{}}>{note?<Notes/>:<Options open={()=>setNote(true)}/>}</ModalLayer>;}
 await act(async()=>{root.render(<Harness/>);});await act(async()=>vi.advanceTimersByTimeAsync(32));
 const add=host.querySelector('button');expect(document.activeElement).toBe(add);act(()=>add.click());await act(async()=>vi.advanceTimersByTimeAsync(32));
 expect(document.activeElement).toBe(host.querySelector('[aria-label="Close note"]'));
 const field=host.querySelector('textarea');act(()=>field.focus());await act(async()=>root.render(<Harness/>));await act(async()=>vi.advanceTimersByTimeAsync(32));expect(document.activeElement).toBe(field);
 expect(window.scrollTo).not.toHaveBeenCalled();
});
