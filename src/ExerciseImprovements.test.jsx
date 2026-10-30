import React,{act,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {Progress,Detail,ModalLayer} from './App.jsx';
import {ImprovementRow} from './ExerciseImprovements.jsx';
import {exerciseName} from './domain.js';
import {improvementsFixture} from './exerciseImprovements.fixture.js';

vi.mock('./useWorkoutPhotoCollection.js',()=>({useWorkoutPhotoCollection:()=>({entries:[],status:'ready'})}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,current,edit,detail;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T12:00:00'));localStorage.clear();
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));vi.stubGlobal('cancelAnimationFrame',clearTimeout);vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{}]);HTMLElement.prototype.getAnimations=()=>[];
  HTMLElement.prototype.scrollTo=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();delete HTMLElement.prototype.scrollTo;vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function mount(initial=improvementsFixture()) {
  function Owner(){const[state,setState]=useState(initial),[request,setRequest]=useState(null),background=useRef(null);current=state;detail=request;
    edit=fn=>setState(previous=>fn(structuredClone(previous)));
    return <div ref={background}><Progress state={state} update={edit} setDetail={setRequest} setPage={()=>{}}/>
      {request&&<ModalLayer close={()=>setRequest(null)} backgroundRef={background}>{close=><Detail detail={request} state={state} update={edit} close={close} setPage={()=>{}} setDetail={setRequest}/>}</ModalLayer>}</div>;}
  act(()=>root.render(<Owner/>));
}
const tick=()=>act(()=>vi.advanceTimersByTime(350));
const buttons=(scope=document)=>[...scope.querySelectorAll('button')];
const click=(name,scope=document)=>{const target=buttons(scope).find(button=>button.getAttribute('aria-label')===name||button.textContent.trim()===name);expect(target).toBeTruthy();act(()=>target.click());tick();};
const open=()=>click([...host.querySelectorAll('.improvements-view-all')][0].textContent.trim());
const sheet=()=>host.querySelector('.exercise-improvements-sheet');
const type=value=>act(()=>{const input=sheet().querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});

it('keeps the main preview to three distinct exercises with an explicit This week label and the full history count',()=>{
  mount();const section=host.querySelector('.recent-improvements-section');expect(section.querySelector('.improvements-heading').textContent).toBe('IMPROVEMENTSThis week');
  expect(section.querySelectorAll('.improvement-row')).toHaveLength(3);expect(section.querySelector('.improvements-view-all').textContent).toBe('View improvement history (11)');
});
it('All improvements opens the full read-only dated history with period controls, including more than three rows',()=>{
  const initial=improvementsFixture(),before=structuredClone(initial);mount(initial);open();
  expect(sheet().querySelectorAll('.improvement-row')).toHaveLength(11);expect(buttons(sheet()).find(button=>button.textContent==='All time').getAttribute('aria-pressed')).toBe('true');
  expect([...sheet().querySelectorAll('.improvement-date-group h2')].map(heading=>heading.textContent)).toEqual(['Yesterday','Mon, Oct 26','Thu, Oct 22']);
  expect(current).toEqual(before);expect(buttons(sheet()).some(button=>/Apply|Use values/i.test(button.textContent))).toBe(false);
});
it('This week filters by the actual event date without dropping its earlier-week comparison',()=>{
  mount();open();click('This week',sheet());expect(sheet().querySelectorAll('.improvement-row')).toHaveLength(6);expect(sheet().querySelector('.statistics-heading').textContent).toBe('6 improvements');
  expect(sheet().querySelector('.improvement-history-list').textContent).not.toContain('Oct 22');
});
it('older gains stay available when this week is empty, rather than being presented as new',()=>{
  mount(improvementsFixture({olderOnly:true}));const section=host.querySelector('.recent-improvements-section');expect(section.querySelector('.improvements-empty').textContent).toBe('No improvements logged this week yet.');
  expect(section.querySelectorAll('.improvement-row')).toHaveLength(0);open();expect(sheet().querySelectorAll('.improvement-row')).toHaveLength(5);click('This week',sheet());expect(sheet().querySelector('[role="status"]').textContent).toBe('No improvements logged this week yet.');
});
it('retains the existing Recent training fallback when there are no measured gains at all',()=>{
  mount(improvementsFixture({flat:true}));expect(host.querySelector('.recent-improvements-section')).toBeNull();expect(host.textContent).toContain('RECENT TRAINING');expect(host.querySelector('.improvements-view-all')).toBeNull();
});
it('the existing typo-tolerant search filters by exercise while keeping all of its dated events',()=>{
  mount();open();const name=exerciseName(current.workouts[0].exercises[0]),typo=name.slice(0,2)+name.slice(3);type(typo);
  expect(sheet().querySelectorAll('.improvement-row')).toHaveLength(3);expect([...sheet().querySelectorAll('.improvement-row strong')].every(row=>row.textContent===name)).toBe(true);
  type('nothing matches xyz');expect(sheet().querySelector('[role="status"]').textContent).toContain('No improvements match');click('Clear search',sheet());expect(sheet().querySelectorAll('.improvement-row')).toHaveLength(11);
});
it('returning from actual exercise details restores the chosen period, query, scroll and focused improvement',()=>{
  mount();open();const name=exerciseName(current.workouts[0].exercises[0]);type(name);sheet().scrollTop=240;
  const row=sheet().querySelector('.improvement-row'),id=row.dataset.improvementId;act(()=>row.click());tick();
  expect(detail.returnToImprovements).toMatchObject({period:'all',query:name,scroll:240,focusId:id});
  click('Back to improvements');expect(sheet().querySelector('input[type="search"]').value).toBe(name);expect(sheet().scrollTop).toBe(240);expect(document.activeElement.dataset.improvementId).toBe(id);
});
it('opens the shared information sheet and closes it back to the unchanged improvements list',()=>{
  mount();open();sheet().scrollTop=150;click('About improvements',sheet());
  const info=document.querySelector('[role="dialog"][data-sheet-motion="information"]');expect(info.textContent).toContain('not necessarily personal records');
  click('Close Your improvements');expect(document.querySelector('[data-sheet-motion="information"]')).toBeNull();expect(sheet().scrollTop).toBe(150);expect(sheet().querySelectorAll('.improvement-row')).toHaveLength(11);
});
it('closing improvements returns directly to Progress without editing any history',()=>{
  mount();open();click('Back to Progress',sheet());expect(sheet()).toBeNull();expect(host.querySelector('.progress-screen')).not.toBeNull();expect(current.workouts).toHaveLength(4);
});
it('an open period refreshes across a local week boundary without changing its selected period or training history',()=>{
  mount();open();click('This week',sheet());vi.setSystemTime(new Date('2026-11-02T12:00:00'));act(()=>window.dispatchEvent(new Event('focus')));
  expect(buttons(sheet()).find(button=>button.textContent==='This week').getAttribute('aria-pressed')).toBe('true');expect(sheet().querySelectorAll('.improvement-row')).toHaveLength(0);
  expect(host.querySelector('.recent-improvements-section .improvements-empty')).not.toBeNull();expect(current.workouts).toHaveLength(4);
});
it('editing or deleting logs refreshes both the history count and current period',()=>{
  mount();open();act(()=>edit(state=>{state.workouts=state.workouts.slice(0,2);return state;}));
  expect(sheet().querySelectorAll('.improvement-row')).toHaveLength(5);expect(host.querySelector('.improvements-view-all').textContent).toBe('View improvement history (5)');
  act(()=>edit(state=>{state.workouts=[state.workouts[0]];return state;}));expect(sheet().querySelector('.improvements-empty').textContent).toBe('No comparable improvements logged yet.');
});
it('converts gains into the selected weight unit and does not label a per-side rep gain as a gain on both sides',()=>{
  const exercise=improvementsFixture().workouts[0].exercises[0];act(()=>root.render(<ImprovementRow item={{id:'gain',exercise,type:'weight',deltaWeight:2.5}} units="lb" onClick={()=>{}}/>));
  expect(host.textContent).toContain('+5.51 lb since last session');
  act(()=>root.render(<ImprovementRow item={{id:'gain',exercise,type:'reps',deltaReps:1,weight:0,loggingMode:'per_side'}} units="kg" onClick={()=>{}}/>));
  expect(host.textContent).toContain('+1 rep on the lower side');expect(host.textContent).not.toContain('at 0');
});
