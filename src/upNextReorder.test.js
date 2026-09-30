import {it,expect} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {startWorkout,serializeState,deserializeState} from './domain.js';
import {upNextReorderGroups,reorderUpNext,upNextMoveRequest,canMoveCurrentToUpNext,moveCurrentToUpNext} from './upNextReorder.js';
import {removeUpNext,undoUpNextRemoval,canUndoUpNextRemoval} from './upNextRemoval.js';
const make=()=>{const s=createReturningUserFixture(0);s.activeWorkout=startWorkout(s,s.program.days[0]);s.activeWorkout.exercises=s.activeWorkout.exercises.slice(0,5);s.activeWorkout.exercises.forEach((e,i)=>{e.id='ABCDE'[i];e.importedName='Same name';});s.activeWorkout.rest={endsAt:Date.now()+60000};return s;};
const ids=s=>s.activeWorkout.exercises.map(e=>e.id).join('');
const move=(s,id,beforeId)=>reorderUpNext(s,{sessionId:s.activeWorkout.id,currentId:s.activeWorkout.exercises[s.activeWorkout.exerciseIndex].id,exerciseId:id,expectedIds:upNextReorderGroups(s.activeWorkout).find(g=>g.ids.includes(id))?.ids,beforeId});
it('orders B below D, E above C, C first, first to last by stable IDs while preserving every object',()=>{
 let s=make();const original=structuredClone(s),refs=new Map(s.activeWorkout.exercises.map(e=>[e.id,e]));
 s=move(s,'B','E');expect(ids(s)).toBe('ACDBE');
 s=move(s,'E','C');expect(ids(s)).toBe('AECDB');
 s=move(s,'C','E');expect(ids(s)).toBe('ACEDB');
 s=move(s,'C',null);expect(ids(s)).toBe('AEDBC');
 for(const e of s.activeWorkout.exercises)expect(e).toBe(refs.get(e.id));
 expect(s.activeWorkout.exerciseIndex).toBe(0);expect(s.activeWorkout.id).toBe(original.activeWorkout.id);
 expect(s.activeWorkout.startedAt).toBe(original.activeWorkout.startedAt);expect(s.activeWorkout.rest).toEqual(original.activeWorkout.rest);
 expect(s.program).toEqual(original.program);expect(s.workouts).toEqual(original.workouts);
 expect(deserializeState(serializeState(s),{strict:true}).activeWorkout.exercises).toEqual(s.activeWorkout.exercises);
});
it.each(['current','completed','touched','side','segment','superset','warmup'])('pins %s work and never allows an untouched exercise to cross it',kind=>{
 const s=make(),e=s.activeWorkout.exercises[2];
 if(kind==='current')s.activeWorkout.exerciseIndex=2;
 if(kind==='completed')e.sets[0].completed=true;
 if(kind==='touched')e.sets[0].touched=true;
 if(kind==='side')e.sets[0].sides={left:{completed:true}};
 if(kind==='segment')e.sets[0].segments=[{touched:true}];
 if(kind==='superset')e.supersetId='pair';
 if(kind==='warmup')s.activeWorkout.warmup.stages=[{exerciseInstanceId:'C',completed:true}];
 expect(upNextReorderGroups(s.activeWorkout).some(g=>g.ids.includes('C'))).toBe(false);
 expect(move(s,'D','B')).toBe(s);expect(move(s,'C',null)).toBe(s);
});
it('visiting an unlogged exercise does not lock its Up Next reorder position',()=>{
 const s=make(),e=s.activeWorkout.exercises[2];e.startedAt=Date.now();
 expect(upNextReorderGroups(s.activeWorkout).some(g=>g.ids.includes(e.id))).toBe(true);
 expect(ids(move(s,'C',null))).toBe('ABDEC');
});
it.each(['session','current','stale','unknown','self'])('rejects %s targets rather than writing a stale order',kind=>{
 const s=make(),request={sessionId:s.activeWorkout.id,currentId:'A',exerciseId:'B',expectedIds:['B','C','D','E'],beforeId:null};
 if(kind==='session')request.sessionId='other';if(kind==='current')request.currentId='C';if(kind==='stale')request.expectedIds.reverse();if(kind==='unknown')request.beforeId='unknown';if(kind==='self')request.beforeId='B';
 expect(reorderUpNext(s,request)).toBe(s);
});
it('Move up/down is the same operation and respects both pinned boundaries',()=>{
 let s=make();expect(upNextMoveRequest(s.activeWorkout,'A',1)).toBeNull();expect(upNextMoveRequest(s.activeWorkout,'B',-1)).toBeNull();expect(upNextMoveRequest(s.activeWorkout,'E',1)).toBeNull();
 s=reorderUpNext(s,upNextMoveRequest(s.activeWorkout,'D',-1));expect(ids(s)).toBe('ABDCE');
});
it('reorder/remove/Undo/reload preserve the new queue and invalidate stale Undo after another reorder',()=>{
 let s=move(make(),'B','E');const removed=removeUpNext(s,'C');expect(ids(removed.state)).toBe('ADBE');
 expect(ids(deserializeState(serializeState(removed.state),{strict:true}))).toBe('ADBE');
 s=undoUpNextRemoval(removed.state,removed.undo);expect(ids(s)).toBe('ACDBE');
 const next=removeUpNext(s,'D');s=move(next.state,'E','C');expect(ids(s)).toBe('AECB');
 expect(canUndoUpNextRemoval(s,next.undo)).toBe(false);
 expect(undoUpNextRemoval(s,next.undo)).toBe(s);
});
it('retains freestyle, temporary/combined provenance and every pending per-side/timed value',()=>{
 let s=make();s.activeWorkout.source='freestyle';s.activeWorkout.exercises[1].sourceOccurrenceIds=['source-a','source-b'];s.activeWorkout.exercises[1].sets[0].sides={left:{reps:12},right:{reps:8}};s.activeWorkout.exercises[2].measure='seconds';s.activeWorkout.exercises[2].sets[0].reps=85;
 const before=structuredClone(s.activeWorkout.exercises);s=move(s,'B',null);
 for(const e of before)expect(s.activeWorkout.exercises.find(x=>x.id===e.id)).toEqual(e);
});
it('moves the first untouched exercise behind the next without changing session or plan identity',()=>{
 const s=make(),before=structuredClone(s),request={sessionId:s.activeWorkout.id,currentId:'A',nextId:'B'};
 const moved=moveCurrentToUpNext(s,request);
 expect(ids(moved)).toBe('BACDE');expect(ids(s)).toBe('ABCDE');
 expect(moved.activeWorkout.exercises[moved.activeWorkout.exerciseIndex].id).toBe('B');
 expect(moved.activeWorkout.exercises[1]).toBe(s.activeWorkout.exercises[0]);
 expect(moved.activeWorkout.id).toBe(before.activeWorkout.id);
 expect(moved.activeWorkout.rest).toEqual(before.activeWorkout.rest);
 expect(moved.program).toEqual(before.program);
 expect(deserializeState(serializeState(moved),{strict:true}).activeWorkout.exercises.map(e=>e.id).join('')).toBe('BACDE');
});
it.each(['current-work','next-work','current-pair','next-pair','last'])('refuses current move across %s',kind=>{
 const s=make(),active=s.activeWorkout;
 if(kind==='current-work')active.exercises[0].sets[0].touched=true;
 else if(kind==='next-work')active.exercises[1].sets[0].completed=true;
 else if(kind==='current-pair')active.exercises[0].supersetId='pair';
 else if(kind==='next-pair')active.exercises[1].supersetId='pair';
 else active.exercises=[active.exercises[0]];
 expect(canMoveCurrentToUpNext(active,'A')).toBe(false);
 expect(moveCurrentToUpNext(s,{sessionId:active.id,currentId:'A',nextId:'B'})).toBe(s);
});
it('rejects stale current move requests without changing any exercise',()=>{
 const s=make(),request={sessionId:s.activeWorkout.id,currentId:'A',nextId:'C'};
 expect(moveCurrentToUpNext(s,request)).toBe(s);
 request.nextId='B';request.sessionId='other';expect(moveCurrentToUpNext(s,request)).toBe(s);
});
