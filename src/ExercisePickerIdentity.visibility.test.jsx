import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,afterEach,vi} from 'vitest';
import {ExercisePickerIdentity} from './ExercisePickerIdentity.jsx';
import {exerciseCatalog} from './domain.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
afterEach(()=>{act(()=>root?.unmount());root=null;host?.remove();vi.unstubAllGlobals();});
it('defers only opted-in offscreen art, retains its slot and action, and releases observation',()=>{
 let notify;const observe=vi.fn(),disconnect=vi.fn();
 vi.stubGlobal('IntersectionObserver',class{constructor(callback){notify=callback;}observe=observe;disconnect=disconnect;});
 const item=Object.values(exerciseCatalog).find(i=>i.artId),choose=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host);
 act(()=>root.render(<button onClick={choose}><ExercisePickerIdentity item={item} deferOffscreen/></button>));
 const slot=host.querySelector('.exercise-picker-thumbnail');expect(observe).toHaveBeenCalledWith(slot);expect(host.querySelector('img')).toBeNull();expect(host.textContent).toContain(item.name);
 act(()=>host.querySelector('button').click());expect(choose).toHaveBeenCalledOnce();
 act(()=>notify([{isIntersecting:false}]));expect(host.querySelector('img')).toBeNull();
 act(()=>notify([{isIntersecting:true}]));expect(host.querySelector('.exercise-picker-thumbnail')).toBe(slot);expect(host.querySelector('img').width).toBe(44);expect(disconnect).toHaveBeenCalled();
});
it('disconnects a deferred thumbnail if the picker closes before it becomes visible',()=>{
 const disconnect=vi.fn();vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect=disconnect;});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 act(()=>root.render(<ExercisePickerIdentity item={Object.values(exerciseCatalog).find(i=>i.artId)} deferOffscreen/>));
 act(()=>root.unmount());root=null;expect(disconnect).toHaveBeenCalledOnce();
});
