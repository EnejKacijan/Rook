import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {SavedWorkouts} from './SavedWorkouts.jsx';
import {createReturningUserFixture} from './demoFixture.js';
import {createCustomExerciseRecord} from './customExercises.js';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,current,editorProps;
beforeEach(()=>{vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();});

// Create workout uses the plan builder's editor, so it must also get the
// plan builder's library actions (create custom exercise, remember alias).
it('gives Create workout the same custom exercise actions as the plan builder',()=>{
  const initial=createReturningUserFixture(0);
  const Editor=props=>{editorProps=props;return <div/>;};
  function Harness(){const [state,setState]=useState(initial);current=state;return <SavedWorkouts state={state} update={fn=>setState(s=>fn(structuredClone(s)))} close={()=>{}} Header={()=><header/>} Editor={Editor} Modal={({children})=>children} createNew/>;}
  act(()=>root.render(<Harness/>));
  expect(editorProps.workoutOnly).toBe(true);
  expect(typeof editorProps.onRegisterCustomExercise).toBe('function');
  expect(typeof editorProps.onRememberExerciseAlias).toBe('function');
  const record=createCustomExerciseRecord({name:'Owner landmine twist',equipment:['barbell'],primaryMuscle:'core',loggingType:'weight_reps'});
  act(()=>editorProps.onRegisterCustomExercise(record));
  expect(current.customExercises.some(item=>item.id===record.id&&!item.deletedAt)).toBe(true);
});
