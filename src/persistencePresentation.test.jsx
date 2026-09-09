import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { SessionFeedbackPrompt } from './SessionFeedback.jsx';
import { FlexibleWeekSheet } from './FlexibleWeekSheet.jsx';
import { blankState, buildProgram, saveState } from './domain.js';

vi.mock('./domain.js',async original=>({...await original(),saveState:vi.fn()}));
let root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-06T12:00:00'));saveState.mockReset();});
afterEach(()=>{act(()=>root?.unmount());document.body.innerHTML='';vi.useRealTimers();});
const button=name=>[...document.querySelectorAll('button')].find(b=>b.textContent===name);
function render(element){const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(element));}
for(const outcome of ['retry','cancel'])it(`optional feedback failure → ${outcome} retains completed workout`,()=>{
 const workout={id:'completed',completedAt:'2026-09-06T10:00:00Z'},state={workouts:[workout]},before=structuredClone(state),update=vi.fn(),done=vi.fn();
 saveState.mockReturnValueOnce(false).mockReturnValue(true);
 render(<><SessionFeedbackPrompt state={state} workout={workout} update={update}/><button onClick={done}>DONE</button></>);
 act(()=>button('About right').click());expect(update).not.toHaveBeenCalled();expect(state).toEqual(before);expect(document.querySelector('[role="alert"]').textContent).toContain('unchanged');expect(button('DONE').disabled).toBe(false);
 if(outcome==='retry'){act(()=>button('TRY AGAIN').click());expect(saveState).toHaveBeenCalledTimes(2);expect(update).toHaveBeenCalledTimes(1);expect(update.mock.calls[0][0]().workouts[0].sessionFeedback).toBe('about_right');expect(button('TRY AGAIN')).toBeUndefined();}
 else{act(()=>button('DONE').click());expect(done).toHaveBeenCalledOnce();expect(saveState).toHaveBeenCalledOnce();expect(update).not.toHaveBeenCalled();}
});
for(const outcome of ['retry','cancel'])it(`schedule failure → ${outcome} preserves original until saved`,()=>{
 const state=blankState();Object.assign(state.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:60,equipment:['full gym'],priorities:['Balanced'],onboardingComplete:true});state.program=buildProgram(state.profile);
 const before=structuredClone(state),update=vi.fn(),close=vi.fn();saveState.mockReturnValueOnce(false).mockReturnValue(true);
 render(<FlexibleWeekSheet state={state} update={update} close={close} Header={()=>null}/>);
 act(()=>document.querySelectorAll('.adjust-option-list button')[2].click());act(()=>document.querySelector('.flexible-workout-list button').click());act(()=>document.querySelector('.flexible-week-dates button:not([disabled])').click());act(()=>button('USE THIS SCHEDULE').click());
 expect(update).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(state).toEqual(before);expect(button('TRY AGAIN').disabled).toBe(false);
 act(()=>button(outcome==='retry'?'TRY AGAIN':'CANCEL').click());expect(close).toHaveBeenCalledOnce();expect(saveState).toHaveBeenCalledTimes(outcome==='retry'?2:1);expect(update).toHaveBeenCalledTimes(outcome==='retry'?1:0);expect(state).toEqual(before);
});
