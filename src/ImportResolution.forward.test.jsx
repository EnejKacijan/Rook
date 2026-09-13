import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {ImportResolution} from './ImportResolution.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,changeProgram,changeReview;
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
const base={days:[{id:'d',name:'Upper',weekday:'Mon',exercises:[1,2,3].map(n=>({id:`e${n}`,exerciseId:`catalog${n}`,importedName:`Exercise ${n}`,matchStatus:'confirmed-match',sets:[{id:`s${n}`}],repMin:null,repMax:null}))}]};
const issues=[1,2,3].map(n=>({id:`p${n}`,field:'prescription',category:'decision',dayId:'d',exerciseId:`e${n}`,requiresReps:true,source:`Exercise ${n} 1 set`}));
function setup({matches=false,sourceIssues=issues}={}){
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
 let now=0;vi.spyOn(Date,'now').mockImplementation(()=>now+=400);
 const resolve=vi.fn(),match=vi.fn(),done=vi.fn(),back=vi.fn();
 const source=structuredClone(base);if(matches)source.days[0].exercises.forEach(e=>e.matchStatus='unresolved');
 function Harness(){
  const[p,setP]=useState(source),[resolved,setResolved]=useState({}),[review,setReview]=useState({issues:matches?[]:sourceIssues});
  changeProgram=setP;changeReview=setReview;
  return <ImportResolution review={review} program={p} resolved={resolved} matchIds={matches?['e1','e2','e3']:[]} candidates={()=>[{id:'bosu',name:'BOSU Balance'}]}
    onResolve={(issue,value)=>{resolve(issue.id,value);setResolved(r=>({...r,[issue.id]:value}));if(value)setP(p=>({...p,days:p.days.map(d=>({...d,exercises:d.exercises.map(e=>e.id===issue.exerciseId?{...e,repMin:value.repMin,repMax:value.repMax}:e)}))}));}}
    onMatch={(day,id,exerciseId)=>{match(id,exerciseId);setP(p=>({...p,days:p.days.map(d=>({...d,exercises:d.exercises.map(e=>e.id===id?{...e,exerciseId,matchStatus:'confirmed-match'}:e)}))}));}}
    onCustom={()=>{}} onDone={done} onBack={back}/>;
 }
 host=document.createElement('main');host.className='screen detail-screen import-plan-screen';host.getBoundingClientRect=()=>({left:0,width:390});document.body.append(host);root=createRoot(host);act(()=>root.render(<Harness/>));return {resolve,match,done,back};
}
const current=()=>host.querySelector('.import-decision-content:not([hidden])');
const step=()=>host.querySelector('.step-count')?.textContent;
const button=name=>[...host.querySelectorAll('button')].find(b=>!b.closest('[hidden]')&&(b.textContent===name||b.getAttribute('aria-label')===name));
const click=name=>act(()=>button(name).click());
function fill(label,value){act(()=>{const input=current().querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
function complete(){fill('Reviewed Min reps','8');fill('Reviewed Max reps','10');click('CONTINUE');}
function touch(type,x=387,target=host,y=200){const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:['touchend','touchcancel'].includes(type)?[]:[{identifier:1,clientX:x,clientY:y}]});act(()=>target.dispatchEvent(event));return event;}
function forward(cancel=false,target=host){touch('touchstart',387,target);touch('touchmove',180,target);touch(cancel?'touchcancel':'touchend',180,target);}

it('never submits unresolved or newly valid first-time fields by gesture',()=>{
 const f=setup();forward();expect(step()).toBe('STEP 1/3');expect(f.resolve).not.toHaveBeenCalled();
 fill('Reviewed Min reps','8');fill('Reviewed Max reps','10');expect(button('CONTINUE').disabled).toBe(false);
 f.resolve.mockClear();forward();expect(step()).toBe('STEP 1/3');expect(f.resolve).not.toHaveBeenCalled();expect(f.done).not.toHaveBeenCalled();
});
it('replays exactly one explicitly completed transition, preserving all nodes and answers',()=>{
 const f=setup();complete();fill('Reviewed Min reps','9');click('Back');
 const nodes=[...host.querySelectorAll('input')],before=nodes.map(n=>n.value);f.resolve.mockClear();
 for(let n=0;n<3;n++){forward();expect(step()).toBe('STEP 2/3');click('Back');expect(step()).toBe('STEP 1/3');}
 expect([...host.querySelectorAll('input')]).toEqual(nodes);expect(nodes.map(n=>n.value)).toEqual(before);expect(f.resolve).not.toHaveBeenCalled();expect(f.done).not.toHaveBeenCalled();
});
it('invalidates cleared AND newly valid edited resolutions until explicit Continue',()=>{
 setup();complete();complete();click('Back');expect(step()).toBe('STEP 2/3');
 fill('Reviewed Min reps','');forward();expect(step()).toBe('STEP 2/3');expect(button('CONTINUE').disabled).toBe(true);
 fill('Reviewed Min reps','7');forward();expect(step()).toBe('STEP 2/3');expect(button('CONTINUE').disabled).toBe(false);
 click('CONTINUE');click('Back');forward();expect(step()).toBe('STEP 3/3');
});
it('cancels without changing the completed answer and excludes input/selection controls',()=>{
 const f=setup();complete();click('Back');f.resolve.mockClear();forward(true);expect(step()).toBe('STEP 1/3');
 const input=current().querySelector('input');input.focus();forward();expect(step()).toBe('STEP 1/3');input.blur();forward(false,input);expect(step()).toBe('STEP 1/3');
 const vertical=touch('touchmove',386,host,120);expect(vertical.defaultPrevented).toBe(false);expect(f.resolve).not.toHaveBeenCalled();
 forward();expect(step()).toBe('STEP 2/3');
});
it('reuses an accepted exercise match without firing match/custom again; a search edit disables it',()=>{
 const f=setup({matches:true});forward();expect(step()).toBe('STEP 1/3');click('BOSU Balance');expect(step()).toBe('STEP 2/3');click('Back');forward();expect(step()).toBe('STEP 2/3');expect(f.match).toHaveBeenCalledOnce();
 click('Back');const search=current().querySelector('input');act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'new query');search.dispatchEvent(new Event('input',{bubbles:true}));});forward();expect(step()).toBe('STEP 1/3');expect(f.match).toHaveBeenCalledOnce();
});
for(const change of ['program','review'])it(`blocks a stale completed step after ${change} changes`,()=>{
 setup();complete();click('Back');
 act(()=>change==='program'?changeProgram(p=>({...p,days:p.days.map(d=>({...d,exercises:d.exercises.map(e=>({...e,repMin:5}))}))})):changeReview(r=>({...r,issues:[...r.issues,{id:'new',field:'day'}]})));
 forward();expect(step()).toBe('STEP 1/3');
});
it('never invokes final review/apply or bypasses an unsupported circuit',()=>{
 const f=setup();complete();complete();fill('Reviewed Min reps','8');fill('Reviewed Max reps','10');forward();expect(step()).toBe('STEP 3/3');expect(f.done).not.toHaveBeenCalled();click('REVIEW PLAN');expect(f.done).toHaveBeenCalledOnce();
});
it('does not advance an unsupported circuit group',()=>{
 const f=setup({sourceIssues:[{id:'c',field:'roundGroup',requiresSourceEdit:true,source:'3 rounds'},...issues]});complete();complete();complete();f.resolve.mockClear();forward();expect(step()).toBe('STEP 4/4');expect(button('EDIT NOTES')).toBeTruthy();expect(button('REVIEW PLAN')).toBeUndefined();expect(f.resolve).not.toHaveBeenCalled();expect(f.done).not.toHaveBeenCalled();
});
