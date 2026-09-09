import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {ImportResolution} from './ImportResolution.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();vi.restoreAllMocks();});
const program={days:[{id:'d',name:'Lower',exercises:[{id:'e',importedName:'Y Balance Reach',matchStatus:'confirmed-match',sets:[{id:'s'},{id:'s2'}],repMin:null,repMax:null}]}]};
const prescription={id:'p',field:'prescription',requiresReps:true,dayId:'d',exerciseId:'e',source:'2 kroga'};
function setup(issues,source=program,acceptMatch=true){
 let time=0;vi.spyOn(Date,'now').mockImplementation(()=>time+=400);
 const done=vi.fn(),back=vi.fn(),match=vi.fn();
 function Harness(){const[p,setP]=useState(source),[resolved,setResolved]=useState({});return <ImportResolution review={{issues}} program={p} resolved={resolved} matchIds={source.days[0].exercises.filter(e=>e.matchStatus==='unresolved').map(e=>e.id)} onResolve={(issue,value)=>setResolved(current=>({...current,[issue.id]:value}))} onMatch={(day,id,catalogId)=>{match(id,catalogId);if(acceptMatch)setP(current=>({...current,days:current.days.map(d=>({...d,exercises:d.exercises.map(e=>e.id===id?{...e,exerciseId:catalogId,matchStatus:'confirmed-match'}:e)}))}));}} onCustom={(day,id)=>{match(id);setP(current=>({...current,days:current.days.map(d=>({...d,exercises:d.exercises.map(e=>e.id===id?{...e,matchStatus:'confirmed-custom'}:e)}))}));}} candidates={()=>[{id:'bosu',name:'BOSU Balance'}]} onDone={done} onBack={back}/>;}
 Element.prototype.scrollIntoView=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Harness/>));return {done,back,match};
}
const visible=()=>host.querySelector('.import-decision-content:not([hidden])');
const button=text=>[...host.querySelectorAll('button')].find(b=>!b.closest('[hidden]')&&(b.textContent===text||b.getAttribute('aria-label')===text));
const fill=(label,value)=>act(()=>{const input=visible().querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
it('shares onboarding step fractions through five decisions and Back without a loading announcement',()=>{
 setup(Array.from({length:5},(_,i)=>({id:`a${i}`,category:'exclusion',field:'source',source:'Preserved note'})));
 const progress=()=>host.querySelector('[role="progressbar"]');
 expect(progress().getAttribute('aria-valuetext')).toBe('Step 1 of 5');expect(progress().firstChild.style.width).toBe('20%');
 act(()=>button('ACKNOWLEDGE EXCLUSION').click());act(()=>button('CONTINUE').click());expect(progress().getAttribute('aria-valuetext')).toBe('Step 2 of 5');expect(progress().firstChild.style.width).toBe('40%');
 act(()=>button('Back').click());expect(progress().getAttribute('aria-valuenow')).toBe('1');act(()=>button('CONTINUE').click());
 for(let i=2;i<5;i++){act(()=>button('ACKNOWLEDGE EXCLUSION').click());act(()=>button('CONTINUE').click());}
 expect(host.querySelector('.step-count').textContent).toBe('STEP 5/5');expect(progress().firstChild.style.width).toBe('100%');expect(progress().hasAttribute('aria-live')).toBe(false);
});
it('omits progress entirely for one decision',()=>{setup([prescription]);expect(host.querySelector('.step-progress')).toBeNull();});
it('one prescription has no default resolution; valid input unlocks REVIEW PLAN',()=>{
 const {done}=setup([prescription]);expect(visible().textContent).not.toContain('1/1');expect(button('REVIEW PLAN').disabled).toBe(true);
 expect(visible().querySelector('[aria-label="Reviewed Min reps"]').value).toBe('');
 fill('Reviewed Min reps','8');expect(button('REVIEW PLAN').disabled).toBe(true);fill('Reviewed Max reps','10');expect(button('REVIEW PLAN').disabled).toBe(false);
 expect(host.textContent).not.toContain('Choice resolved');expect(host.textContent).not.toContain('CONFIRM REVIEW');act(()=>button('REVIEW PLAN').click());expect(done).toHaveBeenCalledOnce();
});
it('identifies only the incomplete field without stealing keyboard focus',()=>{
 setup([prescription]);const min=visible().querySelector('[aria-label="Reviewed Min reps"]'),max=visible().querySelector('[aria-label="Reviewed Max reps"]');
 act(()=>min.focus());fill('Reviewed Min reps','8');expect(document.activeElement).toBe(min);expect(min.getAttribute('aria-invalid')).toBeNull();expect(max.getAttribute('aria-invalid')).toBe('true');expect(document.getElementById(max.getAttribute('aria-describedby')).textContent).toBe('Enter maximum reps.');
 fill('Reviewed Max reps','6');expect(min.getAttribute('aria-invalid')).toBe('true');expect(max.getAttribute('aria-invalid')).toBe('true');
 fill('Reviewed Max reps','10');expect(max.getAttribute('aria-invalid')).toBeNull();expect(max.getAttribute('aria-describedby')).toBeNull();
});
it('same-type choices are separate focused decisions and partial form answers survive Back',()=>{
 setup([prescription,{...prescription,id:'p2'}, {id:'l',field:'loggingMode',dayId:'d',exerciseId:'e'}]);
 expect(host.querySelector('.step-count').textContent).toContain('STEP 1/3');expect(visible().querySelectorAll('.plan-import-choice')).toHaveLength(1);
 fill('Reviewed Min reps','8');fill('Reviewed Max reps','10');act(()=>button('CONTINUE').click());
 expect(host.querySelector('.step-count').textContent).toContain('STEP 2/3');fill('Reviewed Min reps','6');expect(button('CONTINUE').disabled).toBe(true);
 act(()=>button('Back').click());expect(visible().querySelector('[aria-label="Reviewed Max reps"]').value).toBe('10');
 act(()=>button('CONTINUE').click());expect(visible().querySelector('[aria-label="Reviewed Min reps"]').value).toBe('6');
});
it('back preserves logging choice, schedule stays unresolved, only top Back exists',()=>{
 const {back}=setup([{id:'l',field:'loggingMode',dayId:'d',exerciseId:'e'},{id:'day',field:'day',dayId:'d'}]);
 const select=visible().querySelector('[aria-label="Reviewed logging mode"]');
 act(()=>{select.value='per_side';select.dispatchEvent(new Event('change',{bubbles:true}));});
 act(()=>button('CONTINUE').click());expect(button('REVIEW PLAN').disabled).toBe(true);
 act(()=>button('Back').click());expect(select.value).toBe('per_side');expect(button('CONTINUE').disabled).toBe(false);
 expect(host.querySelector('footer').querySelectorAll('button')).toHaveLength(1);act(()=>button('Back').click());expect(back).toHaveBeenCalledOnce();
});
it('custom choices advance once each, with no redundant Continue and final review still separate',()=>{
 const source=structuredClone(program);source.days[0].exercises=[1,2,3].map(n=>({...source.days[0].exercises[0],id:`e${n}`,importedName:`Unknown ${n}`,matchStatus:'unresolved'}));
 const {done,match}=setup([],source);
 for(let i=1;i<=3;i++){expect(host.querySelector('.step-count').textContent).toContain(`STEP ${i}/3`);expect(button('CONTINUE')).toBeUndefined();expect(button('REVIEW PLAN')).toBeUndefined();act(()=>button('KEEP AS CUSTOM').click());expect(match).toHaveBeenCalledTimes(i);}
 expect(done).toHaveBeenCalledOnce();
});
it('ignores a double activation across steps and preserves the choice on Back',()=>{
 const source=structuredClone(program);source.days[0].exercises=[1,2].map(n=>({...source.days[0].exercises[0],id:`e${n}`,importedName:`Unknown ${n}`,matchStatus:'unresolved'}));
 const {done,match}=setup([],source);Date.now.mockReturnValue(1000);
 act(()=>button('KEEP AS CUSTOM').click());act(()=>button('KEEP AS CUSTOM').click());expect(match).toHaveBeenCalledOnce();expect(done).not.toHaveBeenCalled();expect(host.querySelector('.step-count').textContent).toContain('STEP 2/2');
 act(()=>button('Back').click());expect(button('KEEP AS CUSTOM').getAttribute('aria-pressed')).toBe('true');Date.now.mockReturnValue(1500);act(()=>button('KEEP AS CUSTOM').click());expect(host.querySelector('.step-count').textContent).toContain('STEP 2/2');expect(done).not.toHaveBeenCalled();
});
it('catalog choice advances, focuses the next heading and remains selected when revisited',()=>{
 const source=structuredClone(program);source.days[0].exercises=[1,2].map(n=>({...source.days[0].exercises[0],id:`e${n}`,matchStatus:'unresolved'}));
 const {match,done}=setup([],source);act(()=>button('BOSU Balance').click());expect(match).toHaveBeenCalledExactlyOnceWith('e1','bosu');expect(document.activeElement).toBe(visible().querySelector('h1'));expect(done).not.toHaveBeenCalled();
 act(()=>button('Back').click());expect(button('BOSU Balance ✓').getAttribute('aria-pressed')).toBe('true');expect(done).not.toHaveBeenCalled();act(()=>button('KEEP AS CUSTOM').click());expect(host.querySelector('.step-count').textContent).toContain('STEP 2/2');
});
it('does not advance if the parent rejects a catalog choice',()=>{
 const source=structuredClone(program);source.days[0].exercises[0].matchStatus='unresolved';const {done}=setup([],source,false);act(()=>button('BOSU Balance').click());expect(done).not.toHaveBeenCalled();expect(visible().querySelector('h1').textContent).toBe('Match this exercise');
});
