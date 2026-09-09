import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PlanImportIssues } from './PlanImportIssues.jsx';
import { importDecisionSummary } from './planImportReview.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
afterEach(()=>{if(root)act(()=>root.unmount());host?.remove();root=null;});
const program={days:[{id:'day',name:'Day 1 - Push',weekday:null,exercises:[{id:'exercise',importedName:'Bench Press',sets:[{id:'set'}],repMin:8,repMax:12}]}]};
function render(review,onResolve=vi.fn()){
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  act(()=>root.render(<PlanImportIssues review={review} program={program} resolved={{}} onResolve={onResolve}/>));return onResolve;
}
it('uses singular workout/exercise copy',()=>{
  render({issues:[]});expect(host.textContent).toContain('1 workout · 1 exercise');expect(host.textContent).not.toContain('1 exercises');
});
it('unsafe alternatives cannot be accepted through the old first-preview escape',()=>{
 const resolve=render({issues:[{id:'a',field:'alternative',requiresSourceEdit:true,options:[],dayId:'day',exerciseId:'exercise',source:'Bench Press or something else'}]});
 expect(host.textContent).toContain('Go Back to edit your notes');expect(host.textContent).not.toContain('USE PREVIEWED EXERCISE ONLY');expect(resolve).not.toHaveBeenCalled();
});
it('choice labels retain the source load unit rather than relabeling pounds as kilograms',()=>{
 render({issues:[{id:'a',field:'alternative',options:[{name:'Bench Press',sets:3,repMin:8,repMax:8,weight:83.91,sourceWeight:185,sourceUnit:'lb'}]}]});
 expect(host.textContent).toContain('185 lb');expect(host.textContent).not.toContain('185 kg');
});
it('does not repeat identical source and derived context',()=>{
  render({issues:[{id:'i',field:'day',dayId:'day',source:'Day 1 - Push',message:'Choose a day.'}]});

  expect(host.querySelector('.plan-import-issue > small')).toBeNull();
  expect(host.querySelector('blockquote').textContent).toBe('Day 1 - Push');
  expect(host.querySelector('.plan-import-issue button')).toBeNull();
});
it('requires an explicit calendar choice before resolving',()=>{
  const resolve=render({issues:[{id:'i',field:'day',dayId:'day',source:'Day 1 - Push',message:'Choose a day.'}]});

  const select=host.querySelector('select');
  act(()=>{select.value='Wed';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(resolve).toHaveBeenCalledWith(expect.objectContaining({id:'i'}),expect.objectContaining({value:'Wed'}));
});
it('preserved source is non-blocking and collapsed; true exclusions have one acknowledgement',()=>{
 const issues=[{id:'note',field:'source',category:'preserved',source:'Keep this note'},
 {id:'excluded',field:'source',category:'exclusion',source:'Unsupported binary data'}];
 const resolve=render({issues});
 expect(host.textContent).not.toContain('Keep this note');
 expect(host.textContent).toContain('CONFIRM EXCLUSIONS (1)');
 act(()=>host.querySelector('.plan-import-notes button').click());
 expect(resolve).toHaveBeenCalledExactlyOnceWith(issues[1],{});
});
const selectValue=(label,value)=>act(()=>{
  const select=host.querySelector(`[aria-label="${label}"]`);
  select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));
});
it('allows explicitly accepting unchanged prescription values without a fake edit',()=>{
 const issue={id:'rounds',field:'prescription',dayId:'day',exerciseId:'exercise',source:'2 rounds'};
 const resolve=render({issues:[issue]});
 expect(resolve).not.toHaveBeenCalled();
 const accept=[...host.querySelectorAll('button')].find(button=>button.textContent==='USE THESE SETS & REPS');
 expect(accept.disabled).toBe(false);act(()=>accept.click());
 expect(resolve).toHaveBeenCalledExactlyOnceWith(issue,expect.objectContaining({sets:1,repMin:8,repMax:12}));
 act(()=>root.render(<PlanImportIssues review={{issues:[issue]}} program={program} resolved={{rounds:true}} reviewRequest={1} onResolve={resolve}/>));
 expect(host.textContent).not.toContain('Choice resolved');expect(host.querySelector('[aria-label="Reviewed Min reps"]').value).toBe('8');expect(host.textContent).not.toContain('USE THESE SETS & REPS');
});
for(const [field,label,value] of [['rir','Reviewed RIR','2'],['rir','Reviewed RIR',''],['loggingMode','Reviewed logging mode','normal'],['loggingMode','Reviewed logging mode','per_side'],['advanced','Reviewed set method','note']]) {
  it(`resolves explicit ${field} ${value||'unspecified'} without default acceptance`,()=>{
    const resolve=render({issues:[{id:'i',field,dayId:'day',exerciseId:'exercise',source:'Ambiguous source'}]});

    expect(resolve).not.toHaveBeenCalled();
    expect(host.querySelector(`[aria-label="${label}"]`).value).toBe('__choose');
    selectValue(label,value);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({id:'i'}),expect.objectContaining({value}));
    expect(host.textContent).not.toContain('CONFIRM REVIEW');
  });
}
it('shows both choices together and allows changing a resolved day',()=>{
  const issues=['day','rir'].map(field=>({id:field,field,dayId:'day',exerciseId:'exercise',source:field}));
  const resolve=render({issues});
  expect(host.querySelectorAll('select')).toHaveLength(2);
  selectValue('Workout day','Mon');selectValue('Workout day','Tue');
  expect(resolve.mock.calls.map(([,value])=>value.value)).toEqual(['Mon','Tue']);
});
it('keeps optional blank load unresolved until explicitly chosen',()=>{
  const resolve=render({issues:[{id:'load',field:'load',dayId:'day',exerciseId:'exercise',source:'3x8 50'}]});

  act(()=>host.querySelector('input').dispatchEvent(new FocusEvent('focusout',{bubbles:true})));
  expect(resolve).not.toHaveBeenCalled();
  act(()=>host.querySelector('.plan-import-issue button').click());
  expect(resolve).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({value:''}));
});
it('asks only the source unit, resolving immediately without an optional-load escape',()=>{
  const resolve=render({issues:[{id:'unit',field:'sourceUnit',dayId:'day',exerciseId:'exercise',source:'3x8 185',sourceLoads:[185]}]});
  expect(resolve).not.toHaveBeenCalled();expect(host.querySelector('input')).toBeNull();
  expect(host.textContent).not.toContain('Leave load unspecified');
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='lb');
  act(()=>button.click());expect(resolve).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({field:'sourceUnit'}),{unit:'lb'});
});
it('distinguishes passive notes and active choices throughout the four-action flow',()=>{
  const review={issues:['source','instruction','day','rir'].map(field=>({id:field,field,category:['source','instruction'].includes(field)?'preserved':'decision'}))};
  expect(importDecisionSummary(review,{})).toBe('2 decisions remaining');
  expect(importDecisionSummary(review,{source:true,instruction:true})).toBe('2 decisions remaining');
  expect(importDecisionSummary(review,{source:true,instruction:true,day:true})).toBe('1 decision remaining');
  expect(importDecisionSummary(review,{source:true,instruction:true,day:true,rir:true})).toBe('Ready to use');
});
