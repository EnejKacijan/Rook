import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,afterEach} from 'vitest';
import {ExercisePickerIdentity} from './ExercisePickerIdentity.jsx';
import {exerciseCatalog} from './domain.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
afterEach(()=>{act(()=>root?.unmount());host?.remove();root=null;host=null;});
function render(item,enabled=true){if(!root){host=document.createElement('div');document.body.append(host);root=createRoot(host);}act(()=>root.render(<button><ExercisePickerIdentity item={item} enabled={enabled}/></button>));}
it('loads visible canonical art eagerly with reserved dimensions and survives image failure',()=>{
 const item=exerciseCatalog['barbell-bench-press'];render(item);const image=host.querySelector('img'),slot=host.querySelector('.exercise-picker-thumbnail');
 expect(image.getAttribute('loading')).toBe('eager');expect(image.width).toBe(44);expect(image.height).toBe(44);expect(image.alt).toBe('');
 expect(slot.querySelector('.exercise-picker-placeholder')).not.toBeNull();
 act(()=>image.dispatchEvent(new Event('load')));
 expect(slot.querySelector('.exercise-picker-placeholder')).toBeNull();

 const next=exerciseCatalog['leg-press'];render(next);
 expect(slot.querySelector('.exercise-picker-placeholder')).not.toBeNull();
 act(()=>slot.querySelector('img').dispatchEvent(new Event('error')));
 expect(host.querySelector('img')).toBeNull();expect(host.querySelector('.exercise-picker-thumbnail')).toBe(slot);
 expect(slot.querySelector('.exercise-picker-placeholder')).not.toBeNull();expect(host.textContent).toContain(next.name);
});
it('never assigns nearest-name art to custom/imported unresolved candidates',()=>{
 root=null;render({id:'custom-x',name:'Barbell Bench Press',custom:true});expect(host.querySelector('img')).toBeNull();
 render({id:'unknown',name:'Barbell Bench Press',matchStatus:'unresolved'});expect(host.querySelector('img')).toBeNull();
 render({id:'unknown',name:'Barbell Bench Press'});expect(host.querySelector('img')).toBeNull();
});
it('respects existing image preference',()=>{root=null;render(Object.values(exerciseCatalog).find(i=>i.artId),false);expect(host.querySelector('.exercise-picker-thumbnail')).toBeNull();});
