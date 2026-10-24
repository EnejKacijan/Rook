import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AnimatedDetails} from './AnimatedDetails.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host,root,animations;
beforeEach(()=>{
  host=document.createElement('div');document.body.append(host);root=createRoot(host);animations=[];
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){
    return {height:this.classList.contains('rook-disclosure-content')||this.style.height==='auto'?100:parseFloat(this.style.height)||0};
  });
  Object.defineProperty(Element.prototype,'animate',{configurable:true,writable:true,value:vi.fn(function(frames,options){
    const animation={element:this,frames,options,cancel:vi.fn(),onfinish:null};animations.push(animation);return animation;
  })});
});
afterEach(()=>{act(()=>root.unmount());host.remove();delete Element.prototype.animate;vi.restoreAllMocks();vi.unstubAllGlobals();});
const summary=()=>host.querySelector('summary');
const click=()=>act(()=>{summary().focus();summary().click();});
const finish=()=>act(()=>animations.filter(a=>a.frames[0].height!==undefined).at(-1)?.onfinish?.());
const render=(props={})=>act(()=>root.render(<AnimatedDetails {...props}><summary>Previous workout</summary><input aria-label="Draft" defaultValue="35"/></AnimatedDetails>));

it('keeps closed fields mounted but inert, and links the native keyboard trigger to its body',()=>{
  render();expect(host.querySelector('details').open).toBe(false);expect(summary().getAttribute('aria-expanded')).toBe('false');
  const body=document.getElementById(summary().getAttribute('aria-controls'));
  expect(body.hasAttribute('inert')).toBe(true);expect(body.contains(host.querySelector('input'))).toBe(true);
  expect(animations).toHaveLength(0);
});
it('animates both directions with the shared timing and preserves an unsaved field across closure',()=>{
  render();const input=host.querySelector('input');input.value='42';click();finish();
  expect(host.querySelector('details').open).toBe(true);expect(summary().getAttribute('aria-expanded')).toBe('true');
  click();expect(host.querySelector('details').open).toBe(true);expect(summary().getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('.rook-disclosure').hasAttribute('inert')).toBe(true);finish();
  expect(host.querySelector('details').open).toBe(false);expect(document.activeElement).toBe(summary());
  click();finish();expect(host.querySelector('input')).toBe(input);expect(input.value).toBe('42');
  for(const animation of animations.filter(a=>a.frames[0].height!==undefined))
    expect(animation.options).toMatchObject({duration:200,easing:'cubic-bezier(.2,0,0,1)'});
});
it('cancels an interrupted collapse and ignores its stale completion',()=>{
  render();click();finish();click();const closing=animations.filter(a=>a.frames[0].height!==undefined).at(-1);
  click();expect(closing.cancel).toHaveBeenCalled();act(()=>closing.onfinish());finish();
  expect(summary().getAttribute('aria-expanded')).toBe('true');expect(host.querySelector('details').open).toBe(true);
  expect(host.querySelector('.rook-disclosure').hasAttribute('inert')).toBe(false);
});
it('notifies a controlled owner once per request, without native toggle feedback loops',()=>{
  const changed=vi.fn();
  function Harness(){const [open,setOpen]=useState(false);return <AnimatedDetails open={open} onOpenChange={next=>{changed(next);setOpen(next);}}><summary>Details</summary><p>Content</p></AnimatedDetails>;}
  act(()=>root.render(<Harness/>));click();finish();
  act(()=>host.querySelector('details').dispatchEvent(new Event('toggle')));expect(changed.mock.calls).toEqual([[true]]);
  click();finish();act(()=>host.querySelector('details').dispatchEvent(new Event('toggle')));
  expect(changed.mock.calls).toEqual([[true],[false]]);expect(host.querySelector('details').open).toBe(false);
});
it('keeps just one logical accordion item expanded while the previous one animates closed',()=>{
  function Harness(){const [selected,setSelected]=useState(null);return [0,1].map(index=><AnimatedDetails key={index} open={selected===index} onOpenChange={next=>setSelected(next?index:null)}><summary>Answer {index}</summary><p>Answer</p></AnimatedDetails>);}
  act(()=>root.render(<Harness/>));act(()=>host.querySelectorAll('summary')[0].click());finish();
  act(()=>host.querySelectorAll('summary')[1].click());
  expect([...host.querySelectorAll('summary')].map(el=>el.getAttribute('aria-expanded'))).toEqual(['false','true']);
  expect(host.querySelectorAll('.rook-disclosure:not([inert])')).toHaveLength(1);
});
it('accepts native opening such as find-in-page without replacing the fields',()=>{
  render();const input=host.querySelector('input');
  act(()=>{const details=host.querySelector('details');details.open=true;details.dispatchEvent(new Event('toggle'));});finish();
  expect(summary().getAttribute('aria-expanded')).toBe('true');expect(host.querySelector('input')).toBe(input);
});
it('respects reduced motion for opening and closing',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));render();click();expect(host.querySelector('details').open).toBe(true);
  click();expect(host.querySelector('details').open).toBe(false);expect(animations).toHaveLength(0);
});
it('supports privacy-sensitive content that should unmount after the closing animation',()=>{
  render({keepMounted:false});expect(host.querySelector('input')).toBeNull();click();finish();expect(host.querySelector('input')).not.toBeNull();
  click();expect(host.querySelector('input')).not.toBeNull();finish();expect(host.querySelector('input')).toBeNull();
});
