import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import {AIService} from './aiService.js';
import {blankState} from './domain.js';
import {ImportResolution} from './ImportResolution.jsx';
import {resolvePartialPrescription} from './importPartialPrescription.js';
import {PlanEditor} from './App.jsx';
import {importExerciseReviewGroups} from './importResolution.js';
let root,host;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{act(()=>root?.unmount());host?.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function setup(source){
 const r=await AIService.importTrainingPlan(blankState().profile,source,{review:true}),done=vi.fn();let current;
 function Form(){const[p,setP]=useState(r.program),[resolved,setResolved]=useState({});current=p;
 return <ImportResolution review={r.sourceReview} program={p} resolved={resolved} onResolve={(i,v)=>{if(v){const next=structuredClone(p),e=next.days.find(d=>d.id===i.dayId)?.exercises.find(e=>e.id===i.exerciseId);if(i.field==='prescription')expect(resolvePartialPrescription(e,v)).toBe(true);setP(next);}setResolved(old=>({...old,[i.id]:v}));}} candidates={()=>[]} onDone={done} onBack={()=>{}}/>;}
 host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Form/>));return {done,current:()=>current};
}
const click=text=>act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text||b.getAttribute('aria-label')===text).click());
it('inline rounds go directly to the editable preview, not a single-option decision',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 const r=await AIService.importTrainingPlan(blankState().profile,'Wednesday: Functional\nY Balance Reach – 2 kroga',{review:true}),saved=vi.fn();
 expect(importExerciseReviewGroups(r.sourceReview,r.program)).toEqual([]);
 host=document.createElement('main');host.className='screen';document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(<PlanEditor source={r.program} profile={r.profile} mode="import" sourceReview={r.sourceReview} onSave={saved} onCancel={()=>{}}/>));
 expect(host.textContent).toContain('2 rounds · Reps not specified');expect(host.textContent).not.toContain('INDEPENDENT SETS');
 click('Edit Y Balance Reach');click('EDIT PRESCRIPTION');const count=host.querySelector('[aria-label="Rounds for Y Balance Reach"]');expect(count.value).toBe('2');
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(count,'3');count.dispatchEvent(new Event('input',{bubbles:true}));count.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});
 expect(host.textContent).toContain('3 rounds · Reps not specified');expect(saved).not.toHaveBeenCalled();
 await act(async()=>click('USE THIS PLAN'));expect(saved).toHaveBeenCalledOnce();
 const e=saved.mock.calls[0][0].days[0].exercises[0];expect(e.sets).toHaveLength(3);expect(e.importedRoundPrescription).toEqual({count:2});expect(e.repMin).toBeNull();
 expect(r.program.days[0].exercises[0].sets).toHaveLength(2);
});
it('missing set count is the sole numerical field; absent reps never appear as failure',async()=>{
 const {current}=await setup('Monday: Upper\nBench Press 60kg');const input=host.querySelector('input');expect(input.getAttribute('aria-label')).toBe('Reviewed Sets');expect(host.querySelectorAll('input')).toHaveLength(1);expect(host.textContent).toContain('Reps not specified');expect(host.textContent).not.toContain('To failure');
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'3');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(current().days[0].exercises[0].sets.every(s=>s.reps===null&&s.weight===60)).toBe(true);expect([...host.querySelectorAll('button')].find(b=>b.textContent==='REVIEW PLAN').disabled).toBe(false);
});
