import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchInput } from './SearchInput.jsx';
import { Simulate } from 'react-dom/test-utils';

let root;
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; });
it('clears controlled search and returns focus without submitting the form', () => {
  const submit = vi.fn();
  function Harness() {
    const [value, setValue] = useState('Cable');
    return <form onSubmit={submit}><SearchInput aria-label="Search exercises" value={value} onChange={event => setValue(event.target.value)} onClear={() => setValue('')} /></form>;
  }
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Harness />));
  const input = host.querySelector('input'); const clear = host.querySelector('button');
  expect(clear.getAttribute('aria-label')).toBe('Clear search');
  expect(clear.type).toBe('button');
  act(() => clear.click());
  expect(input.value).toBe(''); expect(document.activeElement).toBe(input);
  expect(host.querySelector('button')).toBeNull(); expect(submit).not.toHaveBeenCalled();
});

it('resets only the edited scope after rendering results, including IME, and keeps return/rerender scroll', () => {
  let refresh, switchScope, replaceQuery;
  function Harness() {
    const [queries,setQueries]=useState({exercises:'cable',saved:'legs'}),[scope,setScope]=useState('exercises'),[tick,setTick]=useState(0);
    refresh=()=>setTick(tick+1);switchScope=setScope;replaceQuery=value=>setQueries(q=>({...q,[scope]:value}));
    return <main className="exercise-search-sheet"><SearchInput value={queries[scope]} searchScope={scope}
      resultsTarget={()=>document.getElementById(scope)} onChange={e=>replaceQuery(e.target.value)} onClear={()=>replaceQuery('')}/>
      <div id="exercises" data-query={queries.exercises}/><div id="saved" data-query={queries.saved}/></main>;
  }
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Harness/>));
  const input=host.querySelector('input'),list=host.querySelector('#exercises'),saved=host.querySelector('#saved');
  const edit=value=>act(()=>{input.value=value;Simulate.change(input);});
  for(const value of ['cable o','cable','overhead','a','ab','abc']){list.scrollTop=170;edit(value);expect(list.scrollTop).toBe(0);expect(list.dataset.query).toBe(value);}
  list.scrollTop=200;act(()=>refresh());expect(list.scrollTop).toBe(200);
  act(()=>replaceQuery('background'));expect(list.scrollTop).toBe(200);
  act(()=>switchScope('saved'));saved.scrollTop=125;edit('leg');expect(saved.scrollTop).toBe(0);expect(list.scrollTop).toBe(200);
  saved.scrollTop=90;act(()=>switchScope('exercises'));expect(list.scrollTop).toBe(200);expect(saved.scrollTop).toBe(90);
  act(()=>Simulate.compositionStart(input));edit('背');expect(list.scrollTop).toBe(200);edit('背中');expect(list.scrollTop).toBe(200);
  act(()=>Simulate.compositionEnd(input));expect(list.scrollTop).toBe(0);
  list.scrollTop=160;act(()=>host.querySelector('button').click());expect(list.scrollTop).toBe(0);expect(input.value).toBe('');
});
