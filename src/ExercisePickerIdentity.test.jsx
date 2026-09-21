import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,afterEach} from 'vitest';
import {ExercisePickerIdentity} from './ExercisePickerIdentity.jsx';
import {exerciseCatalog} from './domain.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
afterEach(()=>{act(()=>root?.unmount());host?.remove();root=null;host=null;});
function render(item,enabled=true){if(!root){host=document.createElement('div');document.body.append(host);root=createRoot(host);}act(()=>root.render(<button><ExercisePickerIdentity item={item} enabled={enabled}/></button>));}
it('loads only canonical art lazily with reserved dimensions and survives image failure',()=>{
 const item=Object.values(exerciseCatalog).find(i=>i.artId);render(item);const image=host.querySelector('img'),slot=host.querySelector('.exercise-picker-thumbnail');
 expect(image.getAttribute('loading')).toBe('lazy');expect(image.width).toBe(44);expect(image.height).toBe(44);expect(image.alt).toBe('');
 act(()=>image.dispatchEvent(new Event('error')));expect(host.querySelector('img')).toBeNull();expect(host.querySelector('.exercise-picker-thumbnail')).toBe(slot);expect(host.textContent).toContain(item.name);
});
it('never assigns nearest-name art to custom/imported unresolved candidates',()=>{
 root=null;render({id:'custom-x',name:'Barbell Bench Press',custom:true});expect(host.querySelector('img')).toBeNull();
 render({id:'unknown',name:'Barbell Bench Press',matchStatus:'unresolved'});expect(host.querySelector('img')).toBeNull();
 render({id:'unknown',name:'Barbell Bench Press'});expect(host.querySelector('img')).toBeNull();
});
it('respects existing image preference',()=>{root=null;render(Object.values(exerciseCatalog).find(i=>i.artId),false);expect(host.querySelector('.exercise-picker-thumbnail')).toBeNull();});
