import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Coach,Today,TodayActionsSheet,useLiftState} from './App.jsx';
import {combineExample} from './combineWorkouts.fixture.js';
import {coachCombineReply} from './coachCombine.js';
import {AIService} from './aiService.js';
import {saveState,isoDay} from './domain.js';
vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn(()=>true)}));
vi.mock('./aiService.js',async original=>({...await original(),AIService:{...(await original()).AIService,coach:vi.fn()}}));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,current;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('requestAnimationFrame',callback=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 vi.stubGlobal('scrollTo',()=>{});saveState.mockReset().mockReturnValue(true);
 AIService.coach.mockReset().mockImplementation((state,text,options)=>coachCombineReply(state,text,options));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const button=name=>[...host.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===name||node.textContent.trim()===name);
function fixture(){
 const state=combineExample();state.activeCoachConversationId='current';state.conversations=[];state.coachDraft='Keep my unrelated draft';
 state.coachConversationMeta={current:{id:'current',createdAt:Date.now(),lastActivityAt:Date.now(),localDateStarted:isoDay()}};
 return state;
}
async function mountCoach(initial,props={},strict=false){
 function Owner(extra){const [state,setState]=useState(initial);current=state;
  return <Coach state={state} update={fn=>setState(previous=>fn(structuredClone(previous)))} setPage={()=>{}} setDetail={()=>{}} {...extra}/>;
 }
 const render=async extra=>act(async()=>{const node=<Owner {...extra}/>;root.render(strict?<React.StrictMode>{node}</React.StrictMode>:node);});
 await render(props);await act(async()=>vi.advanceTimersByTime(32));return extra=>render({...props,...extra});
}
const intent=state=>({id:'explicit-entry',profileId:state.profile.id,planId:state.program.id,date:isoDay()});
it('Coach shortcut opens source choices once and preserves draft, plan and history',async()=>{
 const state=fixture(),before=structuredClone(state);await mountCoach(state);
 await act(async()=>{button('Combine two workouts').click();button('Combine two workouts')?.click();});
 expect(AIService.coach,host.textContent).toHaveBeenCalledOnce();expect(AIService.coach.mock.calls[0][2].selection).toEqual({step:'sources'});
 expect(host.querySelector('.combine-choices input')).not.toBeNull();
 expect(current.coachDraft).toBe(before.coachDraft);expect(host.querySelector('textarea').value).toBe(before.coachDraft);
 for(const key of ['program','workouts','activeWorkout','todayAdaptation'])expect(current[key]).toEqual(before[key]);
});
it('Today handoff starts directly, consumes once under StrictMode and does not replace the draft',async()=>{
 const state=fixture(),entry=intent(state),handled=vi.fn(),render=await mountCoach(state,{entryIntent:entry,onEntryHandled:handled},true);
 expect(AIService.coach,host.textContent).toHaveBeenCalledOnce();expect(handled).toHaveBeenCalledExactlyOnceWith(entry.id);
 expect(host.querySelectorAll('.combine-choices input').length).toBeGreaterThanOrEqual(2);
 await render({entryIntent:{...entry}});expect(AIService.coach).toHaveBeenCalledOnce();
 expect(current.coachDraft).toBe('Keep my unrelated draft');
});
it('consuming the navigation intent works with the real durable app state owner',async()=>{
 const initial=fixture(),domain=await vi.importActual('./domain.js');
 saveState.mockImplementation(domain.saveState);expect(saveState(initial)).toBe(true);
 const startup=domain.readStartupState();
 function Owner(){
   const [state,update]=useLiftState(startup),[entry,setEntry]=useState(intent(initial));current=state;
   return <Coach state={state} update={update} entryIntent={entry} onEntryHandled={()=>setEntry(null)} setPage={()=>{}} setDetail={()=>{}}/>;
 }
 await act(async()=>root.render(<Owner/>));
 await act(async()=>vi.advanceTimersByTime(32));
 expect(AIService.coach).toHaveBeenCalledOnce();expect(host.querySelector('.combine-choices input')).not.toBeNull();
 expect(current.coachDraft).toBe(initial.coachDraft);
});
it('a stale handoff keeps an existing Coach review and gives an inline explanation',async()=>{
 const state=fixture();state.conversations=[{id:'other-review',conversationId:'current',createdAt:Date.now(),user:'Adjust week',reply:{text:'Review before applying',action:{type:'unsupported-review'}}}];
 const before=structuredClone(state.conversations);await mountCoach(state,{entryIntent:intent(state)});
 expect(AIService.coach).not.toHaveBeenCalled();expect(host.textContent).toContain('Finish or cancel your current Coach review');
 expect(current.conversations).toEqual(before);expect(current.coachDraft).toBe(state.coachDraft);
});
it.each(['profileId','planId','date'])('does not start a handoff with stale %s',async field=>{
 const state=fixture(),entry={...intent(state),[field]:'outdated'};await mountCoach(state,{entryIntent:entry});
 expect(AIService.coach).not.toHaveBeenCalled();expect(host.textContent).toContain('Your plan or date changed');
});
it('waits for Coach availability and does not replay an abandoned navigation',async()=>{
 const state=fixture(),render=await mountCoach(state,{entryIntent:intent(state),availability:{state:'checking'}});
 expect(AIService.coach).not.toHaveBeenCalled();await render({entryIntent:null,availability:{state:'ready'}});
 expect(AIService.coach).not.toHaveBeenCalled();
});
it('Today hint appears only on the real date in an actionable missed context',async()=>{
 const state=fixture(),start=vi.fn(),props={state,update:()=>{},setPage:()=>{},setDetail:()=>{},onCombineWorkouts:start};
 await act(async()=>root.render(<Today {...props}/>));
 expect(host.textContent).toContain('Choose two available sessions and review one workout.');
 act(()=>button('Combine two workouts for todayChoose two available sessions and review one workout.').click());expect(start).toHaveBeenCalledOnce();
 await act(async()=>root.render(<Today {...props} state={{...state,selectedDate:'2026-09-09'}}/>));
 expect(host.querySelector('.combine-discovery-hint')).toBeNull();
});
it('More options offers planned pairs without a missed-workout requirement and updates live',async()=>{
 vi.setSystemTime(new Date('2026-09-07T08:00:00'));const state=fixture(),start=vi.fn();
 const render=async value=>act(async()=>root.render(<TodayActionsSheet state={value} update={()=>{}} close={()=>{}} setDetail={()=>{}} date={isoDay()} hasWorkout onCombineWorkouts={start}/>));
 await render(state);const row=[...host.querySelectorAll('button')].find(node=>node.textContent.startsWith('Combine two workouts'));
 expect(row).toBeDefined();act(()=>row.click());expect(start).toHaveBeenCalledOnce();
 await render({...state,activeWorkout:{id:'started'}});expect(host.textContent).not.toContain('Combine two workouts');
});
