import {it,expect,vi,afterEach} from 'vitest';
import {createReturningUserFixture} from './demoFixture.js';
import {deserializeState,serializeState,STORAGE_KEY,completeWorkout,startWorkout,adaptedTemplateForToday} from './domain.js';
import {prepareCompletedWorkoutDeletion,deleteCompletedWorkout} from './deleteCompletedWorkout.js';
import {commitPreparedRestore} from './backup.js';
import {recoverInterruptedRestore,finishRestoreTransaction,RESTORE_JOURNAL_KEY} from './restoreTransaction.js';
import {buildCombinedProposal,applyCombinedProposal,combineSources} from './combineWorkouts.js';
import {flexibleSessions} from './flexibleWeek.js';
afterEach(()=>vi.useRealTimers());
it('protects the source of a pending repeat without blocking unrelated history',()=>{
 const s=deserializeState(createReturningUserFixture(1));s.todayAdaptation={schemaVersion:1,mode:'repeat',sourceWorkoutId:s.workouts[0].id};
 expect(()=>prepareCompletedWorkoutDeletion(s,s.workouts[0].id)).toThrow(/cancel the repeated/);
 expect(prepareCompletedWorkoutDeletion(s,s.workouts[1].id).workouts).toHaveLength(s.workouts.length-1);
});
it.each(['planned','freestyle','imported-custom-open','legacy'])('deletes one %s record by ID with byte-identical unrelated history/plan',async kind=>{
 const s=deserializeState(createReturningUserFixture(2));const w=s.workouts[0];
 if(kind==='freestyle')w.source='freestyle';
 if(kind==='legacy'){delete w.logicalSessionId;delete w.sourcePlanSlotId;}
 if(kind==='imported-custom-open'){
  w.historicalImport={version:2,sourceLabel:'Synthetic CSV'};
  Object.assign(w.exercises[0],{exerciseId:'custom-test',exerciseSource:'custom',importedName:'Own movement',repMin:null,repMax:null,targetRir:null,prescriptionSource:'import'});
 }
 const twin={...structuredClone(w),id:'different-record'};s.workouts.push(twin);const before=structuredClone(s);
 const next=prepareCompletedWorkoutDeletion(s,w.id);expect(next.workouts).toEqual(before.workouts.filter(i=>i.id!==w.id));expect(next.program).toEqual(before.program);expect(s).toEqual(before);
 expect(deserializeState(serializeState(next)).workouts.map(i=>i.id)).not.toContain(w.id);
});
it('combined deletion releases only derived sources, including after reload',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-18T12:00:00'));
 let s=deserializeState(createReturningUserFixture(0));s.program.trainingBlock.startDate='2026-09-07';s.selectedDate='2026-09-18';
 const ids=combineSources(s).filter(i=>i.status==='missed').slice(0,2).map(i=>i.logicalSessionId);
 const p=buildCombinedProposal(s,{sourceIds:ids,minutes:75});expect(p.status,p.error).toBe('ready');
 s=applyCombinedProposal(s,p.proposal,()=>true);s.activeWorkout=startWorkout(s,adaptedTemplateForToday(s));for(const e of s.activeWorkout.exercises)for(const set of e.sets){set.completed=true;set.reps=e.repMin;}
 s=completeWorkout(s);expect(flexibleSessions(s).filter(i=>i.status==='combined')).toHaveLength(2);
 const next=deserializeState(serializeState(prepareCompletedWorkoutDeletion(s,s.workouts[0].id)));
 expect(flexibleSessions(next).filter(i=>['combined','reserved'].includes(i.status))).toHaveLength(0);expect(next.program).toEqual(s.program);
});
it.each([false,true])('real cross-store coordinator rolls back write failure and retries, photos=%s',async hasPhotos=>{
 const s=deserializeState(createReturningUserFixture(1)),target=s.workouts[0];if(hasPhotos)target.photoId='target-photo';
 const disk=new Map([[STORAGE_KEY,serializeState(s)]]);let fail=false;
 const storage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>{if(fail && k===STORAGE_KEY){fail=false;throw Error('synthetic write failure');}disk.set(k,v);},removeItem:k=>disk.delete(k)};
 let photos=hasPhotos?[{id:'target-photo',workoutId:target.id,blob:new Blob(['test'])},{id:'keep-photo',workoutId:s.workouts[1].id,blob:new Blob(['keep'])}]:[],snapshot;
 const original=photos.slice(),raw=disk.get(STORAGE_KEY);
 const discardSnapshot=async()=>{snapshot=null;};
 const recoverRestore=()=>recoverInterruptedRestore({storage,rollbackPhotos:async id=>{if(snapshot?.id===id)photos=snapshot.photos;},discardSnapshot});
 const commit=(prepared,options)=>commitPreparedRestore(prepared,{...options,stagePhotos:async(incoming,id)=>{snapshot={id,photos};photos=incoming;},recoverRestore,finishRestore:()=>finishRestoreTransaction({storage,discardSnapshot})});
 fail=true;await expect(deleteCompletedWorkout(s,target.id,{readPhotos:async()=>photos,commit,storage})).rejects.toMatchObject({stage:'persistence'});
 expect(disk.get(STORAGE_KEY)).toBe(raw);expect(photos).toEqual(original);expect(storage.getItem(RESTORE_JOURNAL_KEY)).toBeNull();
 const next=await deleteCompletedWorkout(s,target.id,{readPhotos:async()=>photos,commit,storage});expect(photos).toEqual(original.filter(p=>p.workoutId!==target.id));expect(deserializeState(disk.get(STORAGE_KEY)).workouts).toEqual(next.workouts);expect(next.program).toEqual(s.program);
});
