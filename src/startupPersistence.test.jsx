import React,{act,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,afterEach} from 'vitest';
import {StartupBoundary} from './StartupBoundary.jsx';
import {readStartupState,deserializeState,serializeState,STORAGE_KEY} from './domain.js';
import {createReturningUserFixture} from './demoFixture.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root;
afterEach(()=>{act(()=>root?.unmount());root=null;document.body.innerHTML='';vi.restoreAllMocks();});
const fixture=()=>{const s=createReturningUserFixture(2);s.profile.name='Recovery fixture';s.profile.units='lb';s.profile.avoid='No jumping';s.workouts[0].sessionNote='Keep this note';s.customExercises=[{id:'custom-recovery',name:'Recovery exercise',equipment:['other'],primaryMuscle:'Full body',loggingType:'weight_reps',createdAt:'2026-09-01T12:00:00Z'}];return deserializeState(s);};
const storage=raw=>({getItem:vi.fn(()=>raw),setItem:vi.fn(),removeItem:vi.fn()});
const untouched=s=>{expect(s.setItem).not.toHaveBeenCalled();expect(s.removeItem).not.toHaveBeenCalled();};
it('ready read preserves existing migrations and every fixture field without any mutation',()=>{
 const s=fixture(),raw=serializeState(s),store=storage(raw),result=readStartupState(store);
 expect(result.status).toBe('ready');expect(result.state).toEqual(deserializeState(raw));expect(result.state.customExercises[0].id).toBe('custom-recovery');expect(result.state.workouts).toHaveLength(8);expect(store.getItem()).toBe(raw);untouched(store);
});
it('only a successful missing key is empty',()=>{const s=storage(null);expect(readStartupState(s)).toEqual({status:'empty'});untouched(s);});
it.each(['','null','{}','{broken',JSON.stringify({schemaVersion:999}),JSON.stringify({schemaVersion:3,profile:{},program:{days:'bad'}}),JSON.stringify({...fixture(),workouts:'bad'}),JSON.stringify({...fixture(),program:null})])('existing malformed/unsafe value is error, never empty (%s)',raw=>{
 const s=storage(raw);expect(readStartupState(s).status).toBe('error');expect(s.getItem()).toBe(raw);untouched(s);
});
it('one transient failure then retry returns the same normalized complete state',()=>{
 const raw=serializeState(fixture()),s=storage(raw);s.getItem.mockImplementationOnce(()=>{throw new DOMException('Temporary','SecurityError');});
 expect(readStartupState(s).status).toBe('error');untouched(s);expect(readStartupState(s).state).toEqual(deserializeState(raw));untouched(s);
});
it('repeated failures never mutate storage',()=>{const s=storage('unused');s.getItem.mockImplementation(()=>{throw new Error('unavailable');});for(let i=0;i<3;i++)expect(readStartupState(s).status).toBe('error');untouched(s);});
it('supported v2 state still migrates safely',()=>{const s=fixture();s.schemaVersion=2;expect(readStartupState(storage(serializeState(s))).state.schemaVersion).toBe(3);});
it('does not mount autosave while loading/error, and retries in place',async()=>{
 const saved=vi.fn(),ready=fixture();let finish;
 const load=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({status:'ready',state:ready});
 function Child({state}){useLayoutEffect(()=>saved(state),[state]);return <p>Recovered plan</p>;}
 const host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(<StartupBoundary load={load}>{s=><Child state={s.state}/>}</StartupBoundary>));
 expect(document.querySelector('[aria-busy=true]')).not.toBeNull();expect(saved).not.toHaveBeenCalled();
 await act(async()=>finish({status:'error',error:new Error('temporary')}));expect(saved).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('Create plan');
 await act(async()=>document.querySelector('button').click());expect(load).toHaveBeenCalledTimes(2);expect(saved).toHaveBeenCalledOnce();expect(saved).toHaveBeenCalledWith(ready);
});
it('a throwing normalizer also fails closed',async()=>{
 const saved=vi.fn(),host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(<StartupBoundary load={()=>{throw new Error('normalization');}}>{()=>{saved();return null;}}</StartupBoundary>));
 expect(saved).not.toHaveBeenCalled();expect(document.querySelector('[role=alert]')).not.toBeNull();
});
it('dev StrictMode does not consume a transient failed read through a cancelled effect',async()=>{
 const load=vi.fn().mockResolvedValue({status:'error',error:new Error('temporary')}),host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(<React.StrictMode><StartupBoundary load={load}>{()=>null}</StartupBoundary></React.StrictMode>));
 expect(load).toHaveBeenCalledOnce();expect(document.querySelector('[role=alert]')).not.toBeNull();
});
