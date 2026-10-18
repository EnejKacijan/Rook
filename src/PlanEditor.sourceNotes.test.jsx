import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PlanEditor} from './App.jsx';
import {createReturningUserFixture} from './demoFixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
beforeEach(()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('scrollTo',()=>{});
 host=document.createElement('main');host.className='screen';document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
function fixture(){
 const state=createReturningUserFixture(0),source=structuredClone(state.program);
 source.importMetadata={source:'notes',sourceNotes:[{scope:'workout',title:source.days[0].name,text:'Original exercise name 2 × 10\nUnedited source note.'}]};
 return {state,source};
}
const button=label=>[...host.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===label||node.textContent.trim()===label);

it('places notes below workouts and disclosure does not dirty or save the plan',async()=>{
 const {state,source}=fixture(),before=structuredClone(source),saved=vi.fn(),dirty=vi.fn();
 await act(async()=>root.render(<PlanEditor source={source} profile={state.profile} mode="edit" onSave={saved} onCancel={()=>{}} onDirtyChange={dirty}/>));
 const notes=host.querySelector('.original-plan-notes'),plan=host.querySelector('.plan-editor'),footer=host.querySelector('.sheet-action-footer');
 expect(plan.compareDocumentPosition(notes)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(notes.compareDocumentPosition(footer)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(host.querySelector('[aria-label="Import review"]')).toBeNull();
 expect(button('Original plan notes').getAttribute('aria-expanded')).toBe('false');
 await act(async()=>button('Original plan notes').click());
 expect(host.querySelector('.original-plan-note blockquote').textContent).toBe(source.importMetadata.sourceNotes[0].text);
 await act(async()=>button('Original plan notes').click());
 expect(saved).not.toHaveBeenCalled();expect(dirty.mock.calls.every(([value])=>value===false)).toBe(true);
 expect(source).toEqual(before);
 await act(async()=>button('SAVE CHANGES').click());
 expect(saved).toHaveBeenCalledOnce();
 expect(saved.mock.calls[0][0].importMetadata).toEqual(before.importMetadata);
 expect(source).toEqual(before);
});
it('keeps real pending decisions above workouts and notes cannot resolve them',async()=>{
 const {state,source}=fixture(),saved=vi.fn(),day=source.days[0],exercise=day.exercises[0];
 const review={version:1,issues:[{id:'rir-review',category:'decision',field:'rir',dayId:day.id,exerciseId:exercise.id,source:'Unclear RIR',message:'Choose the intended RIR.'}]};
 await act(async()=>root.render(<PlanEditor source={source} profile={state.profile} mode="edit" sourceReview={review} onSave={saved} onCancel={()=>{}}/>));
 const decisions=host.querySelector('[aria-label="Import review"]'),plan=host.querySelector('.plan-editor');
 expect(decisions.compareDocumentPosition(plan)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(decisions.textContent).toContain('1 decision remaining');
 expect(button('SAVE CHANGES').disabled).toBe(true);
 await act(async()=>button('Original plan notes').click());
 expect(decisions.querySelector('[aria-label="Reviewed RIR"]').value).toBe('__choose');
 expect(decisions.textContent).toContain('1 decision remaining');
 expect(button('SAVE CHANGES').disabled).toBe(true);expect(saved).not.toHaveBeenCalled();
});
