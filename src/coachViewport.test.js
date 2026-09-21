import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {bindCoachViewport} from './coachViewport.js';
import {bindSheetVisibleViewport} from './sheetVisibleViewport.js';

let screen,transcript,vv,compact,resize,disconnect,release;
beforeEach(()=>{
 screen=document.createElement('main');transcript=document.createElement('div');screen.append(transcript);document.body.append(screen);
 Object.defineProperties(transcript,{clientHeight:{value:600,writable:true},scrollHeight:{value:1600,writable:true}});transcript.scrollTop=1000;
 vv=new EventTarget();Object.assign(vv,{height:844,offsetTop:0,scale:1});vi.stubGlobal('visualViewport',vv);vi.stubGlobal('innerHeight',844);vi.stubGlobal('innerWidth',390);
 compact=new EventTarget();compact.matches=true;vi.stubGlobal('matchMedia',()=>compact);
 disconnect=vi.fn();vi.stubGlobal('ResizeObserver',class{constructor(fn){resize=fn;}observe(){}disconnect(){disconnect();}});
});
afterEach(()=>{release?.();release=null;screen.remove();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('uses the shared viewport height/offset and removes the keyboard safe inset once',()=>{
 release=bindCoachViewport(screen,transcript);Object.assign(vv,{height:500,offsetTop:40});vv.dispatchEvent(new Event('resize'));
 expect(screen.style.height).toBe('500px');expect(screen.style.top).toBe('40px');expect(screen.style.maxHeight).toBe('500px');
 expect(screen.style.getPropertyValue('--sheet-action-safe-bottom')).toBe('0px');
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);
});
it('does not reserve navigation on focus loss while the keyboard remains visible',()=>{
 const input=document.createElement('textarea');screen.append(input);input.focus();
 release=bindCoachViewport(screen,transcript);vv.height=500;vv.dispatchEvent(new Event('resize'));input.blur();
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);
 vv.offsetTop=32;vv.dispatchEvent(new Event('scroll'));expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);
});
it('restores navigation when the keyboard closes even if the composer remains focused',()=>{
 const input=document.createElement('textarea');screen.append(input);input.focus();
 release=bindCoachViewport(screen,transcript);vv.height=500;vv.dispatchEvent(new Event('resize'));
 vv.height=844;vv.dispatchEvent(new Event('resize'));
 expect(document.activeElement).toBe(input);expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
});
it('focus alone is not keyboard evidence, including hardware keyboard use',()=>{
 const input=document.createElement('textarea');screen.append(input);release=bindCoachViewport(screen,transcript);input.focus();
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
});
it('accessory changes and repeated opening do not accumulate bottom insets',()=>{
 release=bindCoachViewport(screen,transcript);
 for(let i=0;i<4;i++)for(const height of [500,456,844]){
  vv.height=height;vv.dispatchEvent(new Event('resize'));
  expect(screen.style.height).toBe(`${height}px`);expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(height!==844);
  expect(screen.style.getPropertyValue('--sheet-action-safe-bottom')).toBe(height===844?'env(safe-area-inset-bottom, 0px)':'0px');
 }
});
it('reacts to Safari visual viewport pan independently of resize',()=>{
 release=bindCoachViewport(screen,transcript);vv.offsetTop=27;vv.dispatchEvent(new Event('scroll'));expect(screen.style.top).toBe('27px');
});
it('keyboard closure restores full geometry and the existing safe-area token',()=>{
 release=bindCoachViewport(screen,transcript);vv.height=450;vv.dispatchEvent(new Event('resize'));vv.height=844;vv.dispatchEvent(new Event('resize'));
 expect(screen.style.height).toBe('844px');expect(screen.style.getPropertyValue('--sheet-action-safe-bottom')).toBe('env(safe-area-inset-bottom, 0px)');
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
});
it('a reader away from bottom keeps their transcript position on viewport resize',()=>{
 transcript.scrollTop=200;release=bindCoachViewport(screen);transcript.clientHeight=330;vv.height=500;vv.dispatchEvent(new Event('resize'));
 expect(transcript.scrollTop).toBe(200);
});
it('owns geometry only, leaving even a near-bottom transcript to the central follow policy',()=>{
 release=bindCoachViewport(screen);transcript.clientHeight=320;vv.height=500;vv.dispatchEvent(new Event('resize'));expect(transcript.scrollTop).toBe(1000);
 expect(disconnect).not.toHaveBeenCalled();
 expect(resize).toBeUndefined();
});
it('short transcript stays usable without fabricating root scroll',()=>{
 transcript.scrollHeight=100;transcript.scrollTop=0;release=bindCoachViewport(screen,transcript);expect(screen.scrollTop).toBe(0);expect(screen.style.height).toBe('844px');
});
it('refreshes on foreground / restored page without timers or stale viewport state',()=>{
 release=bindCoachViewport(screen,transcript);vv.height=480;window.dispatchEvent(new Event('pageshow'));expect(screen.style.height).toBe('480px');
 Object.defineProperty(document,'hidden',{configurable:true,value:false});vv.height=600;document.dispatchEvent(new Event('visibilitychange'));expect(screen.style.height).toBe('600px');delete document.hidden;
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);
 vv.height=844;window.dispatchEvent(new Event('pageshow'));expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
});
it('leaves desktop sizing to the existing frame; media changes opt in/out cleanly',()=>{
 compact.matches=false;release=bindCoachViewport(screen,transcript);expect(screen.style.height).toBe('');
 compact.matches=true;compact.dispatchEvent(new Event('change'));expect(screen.style.height).toBe('844px');
 compact.matches=false;compact.dispatchEvent(new Event('change'));expect(screen.style.height).toBe('');
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
});
it('unmount removes listeners/observer and restores inline styles exactly',()=>{
 screen.style.top='12px';screen.style.maxHeight='90vh';release=bindCoachViewport(screen,transcript);release();release=null;
 expect(screen.style.top).toBe('12px');expect(screen.style.maxHeight).toBe('90vh');expect(disconnect).not.toHaveBeenCalled();
 vv.height=450;vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('pageshow'));compact.dispatchEvent(new Event('change'));
 expect(screen.style.height).toBe('');
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
});
it('works without a visual viewport or ResizeObserver; no interaction suppression',()=>{
 vi.stubGlobal('visualViewport',undefined);vi.stubGlobal('ResizeObserver',undefined);release=bindCoachViewport(screen,transcript);
 expect(screen.style.height).toBe('');expect(screen.style.getPropertyValue('touch-action')).toBe('');
 const event=new Event('touchmove',{bubbles:true,cancelable:true});transcript.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
});
it('keeps keyboard mode when innerHeight follows the shrunken visual viewport, including foreground',()=>{
 release=bindCoachViewport(screen,transcript);
 vi.stubGlobal('innerHeight',480);vv.height=480;vv.dispatchEvent(new Event('resize'));
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);
 window.dispatchEvent(new Event('pageshow'));
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);
 vi.stubGlobal('innerHeight',844);vv.height=844;vv.dispatchEvent(new Event('resize'));
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
});
it('does not mistake pinch zoom or browser chrome for a software keyboard',()=>{
 release=bindCoachViewport(screen,transcript);
 vv.height=756;vv.dispatchEvent(new Event('resize'));
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
 Object.assign(vv,{height:422,scale:2});vv.dispatchEvent(new Event('resize'));
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
});
it('can enter with a keyboard already open using the layout viewport, without a focus requirement',()=>{
 vi.spyOn(document.documentElement,'clientHeight','get').mockReturnValue(844);
 vi.stubGlobal('innerHeight',480);vv.height=480;release=bindCoachViewport(screen,transcript);
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);
});
it('preserves the baseline through resize event ordering, blur, toolbar changes and foreground',()=>{
 const input=document.createElement('textarea');screen.append(input);input.focus();release=bindCoachViewport(screen,transcript);
 vi.stubGlobal('innerHeight',480);window.dispatchEvent(new Event('resize'));
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
 for(const height of [480,436,500]){vv.height=height;vv.dispatchEvent(new Event('resize'));input.blur();window.dispatchEvent(new Event('pageshow'));expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);}
 vi.spyOn(document,'hidden','get').mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);
 input.focus();vv.height=844;vv.dispatchEvent(new Event('resize'));
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);expect(document.activeElement).toBe(input);
});
it('resets the unobscured reference on a width change instead of retaining portrait keyboard mode',()=>{
 release=bindCoachViewport(screen,transcript);vv.height=480;vv.dispatchEvent(new Event('resize'));
 vi.stubGlobal('innerWidth',430);vi.stubGlobal('innerHeight',600);vv.height=600;window.dispatchEvent(new Event('resize'));
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
 vv.height=360;vv.dispatchEvent(new Event('resize'));expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(true);
});
it('shares the retained keyboard decision with other sheets without adding Coach navigation behavior',()=>{
 release=bindSheetVisibleViewport(screen,()=>{}, {fullPage:true});
 vi.stubGlobal('innerHeight',480);vv.height=480;vv.dispatchEvent(new Event('resize'));
 expect(screen.style.getPropertyValue('--sheet-action-safe-bottom')).toBe('0px');
 expect(screen.hasAttribute('data-coach-keyboard-open')).toBe(false);
});
