import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import {PlanEditor} from './App.jsx';
import {AIService} from './aiService.js';
import {blankState,exerciseCatalog} from './domain.js';
import {rememberExerciseAlias} from './customExercises.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
afterEach(async()=>{await act(async()=>root?.unmount());host?.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
const active=()=>host.querySelector('.import-decision-content:not([hidden])');
const button=name=>[...host.querySelectorAll('button')].find(b=>!b.closest('[hidden]')&&(b.textContent.trim()===name||b.getAttribute('aria-label')===name));
const click=async name=>act(async()=>button(name).click());
const fill=async(label,value)=>act(async()=>{const el=active().querySelector(`[aria-label="Reviewed ${label}"]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
async function setup(text,configure=()=>{},legacyReview=false){
 const state=blankState();configure(state);const r=await AIService.importTrainingPlan(state.profile,text,{review:true});
 // Persisted pre-optional drafts can still contain unresolved identities.
 // Retain dependent-target revalidation coverage for that existing review path.
 if(legacyReview)for(const e of r.program.days.flatMap(d=>d.exercises))if(e.matchStatus==='original')e.matchStatus='unresolved';
 const saved=vi.fn();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',()=>{});Element.prototype.scrollIntoView=vi.fn();host=document.createElement('main');host.className='screen detail-screen import-plan-screen';document.body.append(host);root=createRoot(host);await act(async()=>root.render(<PlanEditor source={r.program} sourceReview={r.sourceReview} profile={r.profile} exerciseState={state} mode="import" onSave={saved} onCancel={()=>{}}/>));return {r,saved};
}
it('renders source count as static text and saves an explicit correction via real review',async()=>{
 const {r,saved}=await setup('Monday: Upper\nPlank 3 sets'),original=JSON.stringify(r.program);
 expect(active().querySelector('[aria-label="Source Sets"] strong').textContent).toBe('3');expect(active().querySelector('[aria-label="Reviewed Sets"]')).toBeNull();expect(active().querySelectorAll('input[readonly]')).toHaveLength(0);expect(button('REVIEW PLAN').disabled).toBe(true);
 expect(active().querySelectorAll('.plan-import-choice > p')).toHaveLength(1);expect(active().textContent).toContain('Set the reps target.');
 await click('Edit source values');await fill('Sets','2');await fill('Min reps','8');expect(button('REVIEW PLAN').disabled).toBe(true);await fill('Max reps','10');expect(button('REVIEW PLAN').disabled).toBe(false);
 await click('REVIEW PLAN');await click('Edit plank');expect(active().querySelector('[aria-label="Source Sets"] strong').textContent).toBe('2');expect(active().textContent).toContain('Your correction');await click('REVIEW PLAN');await click('USE THIS PLAN');
 expect(saved).toHaveBeenCalledOnce();const e=saved.mock.calls[0][0].days[0].exercises[0];expect(e.sets).toHaveLength(2);expect(e.importPrescriptionCorrections).toMatchObject({source:{sets:3},values:{sets:2},origin:'user'});expect(JSON.stringify(r.program)).toBe(original);
});
it('keeps timed and open targets static rather than pretending they are editable reps',async()=>{
 await setup('Monday: Upper\nPlank 30 sec\nPull Up AMRAP');expect(active().querySelector('[aria-label="Source Min seconds"] strong').textContent).toBe('30');expect(active().querySelector('[aria-label="Reviewed Min reps"]')).toBeNull();await fill('Sets','2');await click('CONTINUE');expect(active().textContent).toContain('AMRAP');expect(active().querySelector('[aria-label="Reviewed Min reps"]')).toBeNull();
});
it('invalidates only set-slot decisions when count changes, preserving other answers',async()=>{
 await setup('Monday: Upper\nPlank 3 sets\nBench Press 3x8 RIR 7');
 await fill('Min reps','8');await fill('Max reps','10');await click('CONTINUE');
 const rir=active().querySelector('select');await act(async()=>{rir.value='2';rir.dispatchEvent(new Event('change',{bubbles:true}));});await click('Back');await click('Edit source values');await fill('Sets','2');await click('CONTINUE');expect(active().querySelector('select').value).toBe('2');expect(button('REVIEW PLAN').disabled).toBe(false);
});
it('requires a fresh special-set choice after its source set count is corrected',async()=>{
 const {saved}=await setup('Monday: Upper\nPlank 3 sets last set dropset');await fill('Min reps','8');await fill('Max reps','10');
 const choose=async value=>act(async()=>{const e=active().querySelector('[aria-label="Reviewed set method"]');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));});
 await choose('drop');expect(button('REVIEW PLAN').disabled).toBe(false);await click('Edit source values');await fill('Sets','4');expect(active().querySelector('[aria-label="Reviewed set method"]').value).toBe('__choose');expect(button('REVIEW PLAN').disabled).toBe(true);
 await choose('drop');await click('REVIEW PLAN');await click('USE THIS PLAN');const e=saved.mock.calls[0][0].days[0].exercises[0];expect(e.sets).toHaveLength(4);expect(e.sets.filter(s=>s.setType==='drop')).toHaveLength(1);expect(e.sets.at(-1).setType).toBe('drop');
});
it('Next/Done moves only through editable values and never advances the decision',async()=>{
 await setup('Monday: Upper\nPlank 3 sets');const min=active().querySelector('[aria-label="Reviewed Min reps"]'),max=active().querySelector('[aria-label="Reviewed Max reps"]');
 const enter=async element=>act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 await act(async()=>min.focus());await enter(min);expect(document.activeElement).toBe(min);expect(button('REVIEW PLAN').disabled).toBe(true);await fill('Min reps','8');await enter(min);expect(document.activeElement).toBe(max);await fill('Max reps','10');await enter(max);expect(document.activeElement).not.toBe(max);expect(active()).not.toBeNull();expect(button('REVIEW PLAN').disabled).toBe(false);
});
it('can exclude optional work, revisit it from final review and include it without losing its source identity',async()=>{
 const {r,saved}=await setup('Monday: Upper\n(Optional)\nPlate front raises - 3 seti\nBench Press 3x8');
 const id=r.program.days[0].exercises[0].id;
 expect(active().querySelector('input')).toBeNull();
 await click('KEEP IN SOURCE NOTES ONLY');expect(button('REVIEW PLAN').disabled).toBe(false);await click('REVIEW PLAN');
 await click('Edit plate front raises');await click('INCLUDE IN THIS PLAN');expect(button('REVIEW PLAN').disabled).toBe(false);
 expect(active().querySelectorAll('input')).toHaveLength(0);await click('REVIEW PLAN');await click('USE THIS PLAN');
 const ex=saved.mock.calls[0][0].days[0].exercises;expect(ex).toHaveLength(2);expect(ex[0].id).toBe(id);expect(ex[0].hybridSource.optionalDecision).toBe('include');expect(ex[0].sets).toHaveLength(3);
});
it('keeps same-unit match answers but invalidates only dependent targets when the chosen measurement changes',async()=>{
 let now=0;vi.spyOn(Date,'now').mockImplementation(()=>now+=400);
 await setup('Monday: Upper\nChest flys - 4 seti vsaj 8 repi\nBench Press 3x8 RIR 7',()=>{},true);
 const search=async value=>act(async()=>{const el=active().querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
 await search('Cable Fly');await click('Cable Fly');await fill('Max reps','10');await click('CONTINUE');
 await act(async()=>{const el=active().querySelector('select');el.value='2';el.dispatchEvent(new Event('change',{bubbles:true}));});await click('Back');
 await click('Change exercise');await search('Pec Deck');await click('Pec Deck');expect(button('CONTINUE').disabled).toBe(false);expect(active().querySelector('[aria-label="Reviewed Max reps"]').value).toBe('10');
 await click('Change exercise');await search('Plank');await click('Plank');expect(button('CONTINUE').disabled).toBe(true);expect(active().textContent).toContain('Min seconds');
 await click('Edit source values');await fill('Min reps','20');await fill('Max reps','30');await click('CONTINUE');expect(active().querySelector('select').value).toBe('2');
});
it('shows genuine prescription alternatives before generic identity matching',async()=>{
 await setup('Monday: Upper\nLeg Press 3x9 155kg / Leg press machine 3x8 173kg');
 const choices=[...active().querySelectorAll('.choice-row')];expect(choices.length).toBeGreaterThanOrEqual(2);expect(choices[0].closest('[hidden]')).toBeNull();
 expect(button('REVIEW PLAN').disabled).toBe(true);await act(async()=>choices[0].click());expect(button('REVIEW PLAN').disabled).toBe(false);
});
it('does not create a review visit for an identity already resolved by an existing remembered alias',async()=>{
 await setup('Monday: Upper\nMy Flat Press 3x8\nCable Row 3 sets',state=>rememberExerciseAlias(state,'My Flat Press','barbell-bench-press',{builtInCatalog:exerciseCatalog}));
 expect(host.querySelectorAll('.import-decision-content')).toHaveLength(0);expect(button('USE THIS PLAN').disabled).toBe(false);
});
it('matching an open-target source preserves absence; a voluntary edit is a separate user correction',async()=>{
 let now=0;vi.spyOn(Date,'now').mockImplementation(()=>now+=400);
 const {r,saved}=await setup('Monday: Upper\nChest flys - 4 seti');const original=JSON.stringify(r.program);
 expect(button('USE THIS PLAN').disabled).toBe(false);
 await click('Review exercise matches · Optional');await click('CHOOSE ANOTHER');
 await act(async()=>{const el=active().querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Cable Fly');el.dispatchEvent(new Event('input',{bubbles:true}));});
 await click('Cable Fly');expect(host.querySelector('.import-resolution')).toBeNull();expect(button('USE THIS PLAN').disabled).toBe(false);
 await click('USE THIS PLAN');let ex=saved.mock.calls[0][0].days[0].exercises[0];expect(ex).toMatchObject({repMin:null,repMax:null,repTarget:'unspecified',restSeconds:null});expect(ex.sets).toHaveLength(4);
 await click('Edit Cable Fly');await click('EDIT PRESCRIPTION');const minimum=host.querySelector('[aria-label="Minimum reps for Cable Fly"]');expect(minimum.value).toBe('');
 await act(async()=>minimum.focus());await act(async()=>minimum.blur());expect(minimum.value).toBe('');
 await act(async()=>{minimum.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(minimum,'10');minimum.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>minimum.blur());
 await click('USE THIS PLAN');ex=saved.mock.calls.at(-1)[0].days[0].exercises[0];expect(ex).toMatchObject({repMin:10,repMax:10,importPrescriptionCorrections:{origin:'user',source:{repMin:null,repMax:null},values:{repMin:10,repMax:10}}});expect(ex.repTarget).toBeUndefined();expect(ex.sets.every(s=>s.reps===10&&s.weight===null&&!s.completed)).toBe(true);expect(JSON.stringify(r.program)).toBe(original);
});
it('a timed identity change stays blocked until an explicit duration is entered',async()=>{
 let now=0;vi.spyOn(Date,'now').mockImplementation(()=>now+=400);
 // An unresolved legacy identity allows a deliberate measurement change;
 // new optional suggestions filter incompatible modes instead.
 const {saved}=await setup('Monday: Upper\nChest flys - 4 seti',()=>{},true);
 await act(async()=>{const el=active().querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Plank');el.dispatchEvent(new Event('input',{bubbles:true}));});
 await click('Plank');expect(host.querySelector('.import-resolution')).toBeNull();expect(button('USE THIS PLAN').disabled).toBe(true);expect(host.textContent).toContain('Duration needs review');
 await click('Edit Plank');await click('EDIT PRESCRIPTION');const minimum=host.querySelector('[aria-label="Minimum seconds for Plank"]');expect(minimum.value).toBe('');
 await act(async()=>{minimum.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(minimum,'30');minimum.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>minimum.blur());
 expect(button('USE THIS PLAN').disabled).toBe(false);await click('USE THIS PLAN');const e=saved.mock.calls[0][0].days[0].exercises[0];expect(e).toMatchObject({exerciseId:'plank',repMin:30,repMax:30});expect(e.repTarget).toBeUndefined();expect(e.sets).toHaveLength(4);
});
