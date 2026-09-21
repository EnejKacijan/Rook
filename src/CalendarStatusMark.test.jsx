import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Today} from './App.jsx';
import {MonthCalendar} from './MonthCalendar.jsx';
import {moveToTodayFixture} from './moveToToday.fixture.js';
import {calendarStatusFixture,calendarStatusDate} from './calendarStatus.fixture.js';
import {weekday} from './domain.js';

let host,root;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T12:00:00'));
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
function draw(state,selectedDate='2026-09-20'){
  const selection={...state,selectedDate,selectedDay:weekday(selectedDate)};
  act(()=>root.render(<><Today state={selection} update={()=>{}} setPage={()=>{}} setDetail={()=>{}}/><MonthCalendar state={selection} selectedDate={selectedDate} onSelect={()=>{}}/></>));
}
const week=day=>host.querySelector('.week-strip button[aria-label^="'+day+' "]');
const month=date=>host.querySelector('[data-date="'+date+'"]');
const status=node=>[...node.querySelector('.calendar-status-mark')?.classList||[]].find(name=>name.startsWith('is-'))??null;

it.each(['active-planned','freestyle'])('shows the same active marker and accessible status for a %s, selected or not',kind=>{
  const state=moveToTodayFixture(kind),before=JSON.stringify(state);
  for(const selected of ['2026-09-20','2026-09-15']){
    draw(state,selected);
    for(const cell of [week('Sun'),month('2026-09-20')]){
      expect(status(cell)).toBe('is-active');
      expect(cell.getAttribute('aria-label')).toContain('workout in progress');
      expect(cell.getAttribute('aria-pressed')).toBe(String(selected==='2026-09-20'));
      expect(cell.querySelector('.calendar-status-mark').getAttribute('aria-hidden')).toBe('true');
      expect(cell.querySelector('.calendar-status-mark').textContent).toBe('');
    }
  }
  expect(JSON.stringify(state)).toBe(before);
});
it('keeps planned, completed and empty days distinct with the same glyphs as the legend',()=>{
  const state=moveToTodayFixture('freestyle');
  state.workouts.push({id:'completed-fixture',completedAt:'2026-09-18T12:00:00',workoutDateKey:'2026-09-18',exercises:[]});
  draw(state);
  for(const [day,date,expected] of [['Wed','2026-09-16','is-planned'],['Fri','2026-09-18','is-completed'],['Tue','2026-09-15',null]]){
    expect(status(week(day))).toBe(expected);expect(status(month(date))).toBe(expected);
  }
  expect(week('Fri').querySelector('.completed-dot path')).toBeTruthy();
  expect(month('2026-09-18').querySelector('.is-completed path')).toBeTruthy();
  expect(host.querySelector('.month-calendar-legend').textContent).toBe('PlannedCompletedIn progress');
});
it.each([
  ['planned',['planned']],['active-planned',['active']],['completed',['completed']],
  ['active-freestyle',['active']],['completed-freestyle',['completed','planned']],
  ['active-planned-completed',['active']],['all-three',['active']],
])('renders %s consistently with selection, Today, accessible labels and a non-interactive stable slot',(kind,expected)=>{
  vi.setSystemTime(new Date(`${calendarStatusDate}T12:00:00`));
  const state=calendarStatusFixture(kind),before=JSON.stringify(state);
  for(const selectedDate of [calendarStatusDate,'2026-09-22']){
    draw(state,selectedDate);
    for(const cell of [week('Mon'),month(calendarStatusDate)]){
      expect([...cell.querySelectorAll('.calendar-status-mark')].map(el=>el.classList.contains('is-planned')?'planned':el.classList.contains('is-active')?'active':'completed')).toEqual(expected);
      expect(cell.getAttribute('aria-current')).toBe('date');expect(cell.getAttribute('aria-pressed')).toBe(String(selectedDate===calendarStatusDate));
      expect(cell.querySelectorAll('.calendar-status-slot')).toHaveLength(1);
      expect(cell.querySelectorAll('.calendar-status-slot button,[role="checkbox"],.calendar-status-slot [tabindex]')).toHaveLength(0);
      for(const marker of cell.querySelectorAll('svg.calendar-status-mark')){
        expect(marker.getAttribute('aria-hidden')).toBe('true');expect(marker.getAttribute('focusable')).toBe('false');expect(marker.querySelector('rect')).toBeNull();
        const legend=host.querySelector(`.month-calendar-legend .is-${[...marker.classList].find(c=>c.startsWith('is-')).slice(3)}`);
        expect(marker.innerHTML).toBe(legend.innerHTML);
      }
      for(const item of expected)expect(cell.getAttribute('aria-label')).toContain({active:'workout in progress',completed:'completed workout',planned:'planned workout'}[item]);
    }
    expect(week('Tue').querySelector('.calendar-status-slot')).toBeTruthy();expect(week('Tue').querySelector('.calendar-status-mark')).toBeNull();
    expect(month('2026-09-22').querySelector('.calendar-status-slot')).toBeTruthy();expect(month('2026-09-22').querySelector('.calendar-status-mark')).toBeNull();
  }
  expect(JSON.stringify(state)).toBe(before);
});
it('retains month-calendar active priority when a different workout was completed on the same day',()=>{
  const state=moveToTodayFixture('completed-freestyle'),before=JSON.stringify(state);
  draw(state);
  expect(status(week('Sun'))).toBe('is-active');expect(status(month('2026-09-20'))).toBe('is-active');
  expect(week('Sun').classList.contains('workout-completed')).toBe(true);
  expect(JSON.stringify(state)).toBe(before);
});
it('does not attach an overnight active marker to the selected or current date',()=>{
  const state=moveToTodayFixture('freestyle');
  state.activeWorkout.startedAt=new Date('2026-09-19T23:50:00').getTime();
  state.activeWorkout.workoutDateKey='2026-09-19';
  draw(state);
  expect(status(week('Sat'))).toBe('is-active');expect(status(month('2026-09-19'))).toBe('is-active');
  expect(status(week('Sun'))).not.toBe('is-active');expect(status(month('2026-09-20'))).not.toBe('is-active');
});
