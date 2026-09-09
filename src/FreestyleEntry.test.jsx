import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FreestyleEntry } from './FreestyleWorkout.jsx';

const workouts = ['a','b','c'].map((id,index)=>({id,name:'Same name',source:index?'freestyle':'planned',workoutDateKey:index===2?'2026-09-09':'2026-09-08',completedAt:`2026-09-0${index===2?9:8}T10:00:00Z`}));
const view=(id,date='2026-09-08',rows=workouts)=>renderToStaticMarkup(<FreestyleEntry state={{workouts:rows}} date={date} historyOnly representedWorkoutId={id}/>);
it('excludes only the represented session, including when identical names are used',()=>{
 expect(view('a')).toContain('data-workout-id="b"');expect(view('a')).not.toContain('data-workout-id="a"');
 expect(view('b')).toContain('data-workout-id="a"');expect(view('b')).not.toContain('data-workout-id="b"');
});
it('leaves no wrapper or gap when no additional sessions exist',()=>{expect(view('a','2026-09-08',[workouts[0]])).toBe('');});
it('recomputes for a different date and preserves the full list when no completed hero exists',()=>{
 expect(view(null)).toContain('Completed workouts · 2');expect(view(null)).toContain('data-workout-id="a"');
 expect(view('a','2026-09-09')).toContain('data-workout-id="c"');expect(view('a','2026-09-09')).not.toContain('data-workout-id="b"');
 expect(view('c','2026-09-09')).toBe('');
});
