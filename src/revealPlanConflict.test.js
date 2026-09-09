import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { revealPlanConflict } from './revealPlanConflict.js';
let screen, target, frames, clock;
beforeEach(() => {
  screen=document.createElement('div');target=document.createElement('article');target.tabIndex=-1;screen.append(target);document.body.append(screen);
  Object.defineProperties(screen,{clientHeight:{value:800},scrollHeight:{value:5000}});
  screen.getBoundingClientRect=()=>({top:0,bottom:800});target.getBoundingClientRect=()=>({top:3000-screen.scrollTop,bottom:3300-screen.scrollTop});
  frames=new Map();clock=0;let id=0;
  vi.spyOn(performance,'now').mockImplementation(()=>clock);
  vi.stubGlobal('requestAnimationFrame',callback=>{frames.set(++id,callback);return id;});
  vi.stubGlobal('cancelAnimationFrame',id=>frames.delete(id));
});
afterEach(()=>{screen.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
function advance(ms){clock=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(ms));}
it('uses a bounded 180ms reveal then focuses the card without scrolling the page',()=>{
  const focus=vi.spyOn(target,'focus'); revealPlanConflict(screen,target,80,false);
  expect(screen.scrollTop).toBe(2320);advance(90);expect(screen.scrollTop).toBeGreaterThan(2320);expect(screen.scrollTop).toBeLessThan(2920);
  advance(180);expect(screen.scrollTop).toBe(2920);expect(focus).toHaveBeenCalledWith({preventScroll:true});expect(frames.size).toBe(0);
});
it('reduced motion is instant',()=>{revealPlanConflict(screen,target,80,true);expect(screen.scrollTop).toBe(2920);expect(frames.size).toBe(0);});
it.each(['wheel','touchstart','pointerdown','keydown'])('cancels on user %s without stealing focus',event=>{
  revealPlanConflict(screen,target,80,false);const position=screen.scrollTop;screen.dispatchEvent(new Event(event));advance(180);expect(screen.scrollTop).toBe(position);expect(document.activeElement).not.toBe(target);
});
it('cleanup cancels pending motion',()=>{const cancel=revealPlanConflict(screen,target,80,false);cancel();expect(frames.size).toBe(0);});
it('clamps near the end of a sheet',()=>{target.getBoundingClientRect=()=>({top:4900,bottom:5100});revealPlanConflict(screen,target,80,true);expect(screen.scrollTop).toBe(4200);});
