import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {CoachCombineCard} from './CoachCombine.jsx';
import {combineExample} from './combineWorkouts.fixture.js';
import {combineSources,buildCombinedProposal,buildCombinedRevision,applyCombinedProposal} from './combineWorkouts.js';
let root,node;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-12T12:00:00'));globalThis.IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.append(node);root=createRoot(node);});
afterEach(()=>{act(()=>root.unmount());node.remove();vi.useRealTimers();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
function render(onAccept){const state=combineExample(),proposal=buildCombinedProposal(state,{sourceIds:combineSources(state).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes:60}).proposal;
 act(()=>root.render(<CoachCombineCard state={state} action={{type:'combine-workouts',proposal}} onAccept={onAccept}/>));
 act(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='REVIEW COMBINED WORKOUT').click());
 return ()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='USE THIS WORKOUT');
}
it('rapid Apply invokes the persistence callback once, even before parent publication',()=>{
 const accept=vi.fn(),button=render(accept);act(()=>{button().click();button().click();});expect(accept).toHaveBeenCalledTimes(1);
});
it('failure keeps review recoverable and allows an explicit retry',()=>{
 const accept=vi.fn().mockImplementationOnce(()=>{throw new Error('Could not save');}),button=render(accept);
 act(()=>button().click());expect(node.querySelector('[role=alert]').textContent).toBe('Could not save');
 act(()=>button().click());expect(accept).toHaveBeenCalledTimes(2);
});
it('Back exits review, restores trigger focus and never applies',()=>{
 const accept=vi.fn();render(accept);const back=node.querySelector('[aria-label="Back to combined workout proposal"]');
 expect(document.activeElement).toBe(back);act(()=>back.click());expect(accept).not.toHaveBeenCalled();
 expect(document.activeElement.textContent).toBe('REVIEW COMBINED WORKOUT');
});
it('revision shows factual changes and separate Apply; Cancel and Back never persist',()=>{
 let state=combineExample();const p=buildCombinedProposal(state,{sourceIds:combineSources(state).filter(s=>s.status==='missed').map(s=>s.logicalSessionId),minutes:45}).proposal;
 state=applyCombinedProposal(state,p,()=>true);const proposal=buildCombinedRevision(state,{base:state.todayAdaptation,minutes:75}).proposal,accept=vi.fn(),onReviewChange=vi.fn();
 act(()=>root.render(<CoachCombineCard state={state} action={{type:'combine-workouts',proposal}} onAccept={accept} onReviewChange={onReviewChange}/>));
 const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text);
 act(()=>button('REVIEW COMBINED WORKOUT').click());expect(node.querySelector('.combine-revision-summary').textContent).toContain('New total-time target: 75 min');
 expect(button('USE UPDATED WORKOUT')).toBeDefined();expect(button('USE THIS WORKOUT')).toBeUndefined();
 act(()=>button('CANCEL').click());expect(accept).not.toHaveBeenCalled();expect(state.todayAdaptation.requestedMinutes).toBe(45);
 act(()=>button('REVIEW COMBINED WORKOUT').click());const removable=node.querySelector('.adapt-review-list button:not(:disabled)');
 if(removable){act(()=>removable.click());expect(onReviewChange).toHaveBeenCalledOnce();}
 act(()=>{button('USE UPDATED WORKOUT').click();button('USE UPDATED WORKOUT').click();});expect(accept).toHaveBeenCalledOnce();
});
