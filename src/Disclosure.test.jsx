import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Disclosure } from './Disclosure.jsx';
import * as followModule from './disclosureFollow.js';
let root,host,animations,originalAnimate;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.stubGlobal('matchMedia',()=>({matches:false}));animations=[];originalAnimate=Element.prototype.animate;Element.prototype.animate=vi.fn(()=>{const animation={cancel:vi.fn(),onfinish:null};animations.push(animation);return animation;});vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){return {height:this.classList.contains('rook-disclosure-content')||this.style.height==='auto'?100:parseFloat(this.style.height)||0};});});
afterEach(()=>{act(()=>root.unmount());host.remove();Element.prototype.animate=originalAnimate;vi.restoreAllMocks();vi.unstubAllGlobals();});
const render=(open,text='Warm-up')=>act(()=>root.render(<Disclosure open={open}><button>{text}</button></Disclosure>));
const end=()=>act(()=>animations.at(-2)?.onfinish?.());
it('starts collapsed without mounting hidden content',()=>{render(false);expect(host.querySelector('button')).toBeNull();expect(host.firstChild.hasAttribute('inert')).toBe(true);});
it('retains visible content until collapse geometry finishes',()=>{render(true);render(false,'Changed after closing');expect(host.textContent).toBe('Warm-up');expect(host.firstChild.getAttribute('aria-hidden')).toBe('true');end();expect(host.textContent).toBe('');});
it('rapid reopening cancels collapse and exposes current content',()=>{render(true);render(false);const closing=animations[0];render(true,'Current warm-up');expect(closing.cancel).toHaveBeenCalled();end();expect(host.textContent).toBe('Current warm-up');expect(host.firstChild.hasAttribute('inert')).toBe(false);});
it('updates dynamic long content while expanded without scroll calls',()=>{const scroll=vi.fn();host.scrollIntoView=scroll;render(true);render(true,'Long content '.repeat(200));expect(host.textContent.length).toBeGreaterThan(2000);expect(scroll).not.toHaveBeenCalled();});
it('reduced motion removes closing content immediately',()=>{vi.stubGlobal('matchMedia',()=>({matches:true}));render(true);render(false);expect(host.textContent).toBe('');});
it('collapses into measured accessible compact content and cancels cleanly on reversal',()=>{
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){return {height:this.classList.contains('rook-disclosure-compact')?44:this.classList.contains('rook-disclosure-content')||this.style.height==='auto'?100:parseFloat(this.style.height)||0};});
  const show=open=>act(()=>root.render(<Disclosure open={open} collapsed={<button>Undo</button>}><button>Use values</button></Disclosure>));
  show(true);show(false);const closing=animations[0];
  expect(host.firstChild.hasAttribute('inert')).toBe(false);expect(host.querySelector('.rook-disclosure-content').hasAttribute('inert')).toBe(true);
  expect(host.firstChild.style.height).toBe('44px');expect(host.querySelector('.rook-disclosure-compact').textContent).toBe('Undo');
  show(true);expect(closing.cancel).toHaveBeenCalled();expect(host.querySelector('.rook-disclosure-compact')).toBeNull();
  show(false);act(()=>animations.at(-3).onfinish());expect(host.textContent).toBe('Undo');expect(host.firstChild.style.height).toBe('44px');
});
it('reduced motion switches directly to the compact target without hiding its action',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){return {height:this.classList.contains('rook-disclosure-compact')?44:100};});
  const show=open=>act(()=>root.render(<Disclosure open={open} collapsed={<button>Undo</button>}><button>Use values</button></Disclosure>));
  show(true);show(false);expect(host.textContent).toBe('Undo');expect(host.firstChild.style.height).toBe('44px');expect(animations).toHaveLength(0);
});

it('keeps user takeover when content resizes during the same opening',()=>{
  let resize,options,height=100;
  vi.stubGlobal('ResizeObserver',class{constructor(callback){resize=callback;}observe(){}disconnect(){}});
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(){return{height:this.classList.contains('rook-disclosure-content')?height:parseFloat(this.style.height)||0};});
  const follow=vi.spyOn(followModule,'followDisclosure').mockImplementation((node,next)=>{options=next;return{stop:vi.fn(),finish:vi.fn()};});
  render(false);render(true);
  expect(follow).toHaveBeenCalledOnce();
  options.onTakeover();height=200;act(()=>resize());
  expect(follow).toHaveBeenCalledOnce();
});
