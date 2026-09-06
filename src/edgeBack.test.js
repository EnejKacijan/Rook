import { afterEach, expect, it, vi } from 'vitest';
import { backIntent, bindEdgeBack, commitBack, standaloneNavigation } from './edgeBack.js';
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks(); });
it('gates browser mode and permits standalone only', () => {
  expect(standaloneNavigation({ navigator: {}, matchMedia: () => ({ matches: false }) })).toBe(false);
  expect(standaloneNavigation({ navigator: { standalone: true } })).toBe(true);
});
it('locks only clear rightward intent', () => {
  expect(backIntent(9, 0)).toBe('pending'); expect(backIntent(20, 2)).toBe('back');
  expect(backIntent(-20, 0)).toBe('ignore'); expect(backIntent(12, 20)).toBe('ignore'); expect(backIntent(12, 12)).toBe('ignore');
});
it('uses displacement or a meaningful fast flick, not tiny movements', () => {
  expect(commitBack(130,390,0)).toBe(true); expect(commitBack(60,390,.8)).toBe(true);
  expect(commitBack(20,390,2)).toBe(false); expect(commitBack(70,390,0)).toBe(false);
});
function setup(enabled = true) {
  vi.useFakeTimers();
  const surface = document.createElement('main'); document.body.append(surface);
  surface.getBoundingClientRect = () => ({ left:0,width:390 });
  const onBack=vi.fn(), render=vi.fn(), clear=vi.fn();
  const dispose=bindEdgeBack(surface,{enabled:()=>enabled,onBack,render,clear});
  const fire=(type,x,y=100,count=1,target=surface)=>{
    const event=new Event(type,{bubbles:true,cancelable:true});
    Object.defineProperty(event,'touches',{value:Array.from({length:count},(_,i)=>({identifier:i,clientX:x+i,clientY:y}))});
    target.dispatchEvent(event); return event;
  };
  return {surface,onBack,render,clear,dispose,fire};
}
it('calls the same guarded Back exactly once, even repeated end events',()=>{
  const s=setup();s.fire('touchstart',4);s.fire('touchmove',160);s.fire('touchend',160,100,0);s.fire('touchend',160,100,0);
  expect(s.onBack).not.toHaveBeenCalled();vi.runAllTimers();expect(s.onBack).toHaveBeenCalledTimes(1);s.dispose();
});
for(const reason of ['disabled','short','vertical','wrong','center','multitouch','cancel','unmount','input']) it(`does not navigate for ${reason}`,()=>{
  const s=setup(reason!=='disabled');
  let target=s.surface;
  if(reason==='input'){target=document.createElement('input');s.surface.append(target);target.focus();}
  s.fire('touchstart',reason==='center'?90:4,100,1,target);
  s.fire('touchmove',reason==='short'?20:reason==='wrong'?-40:160,reason==='vertical'?350:100,reason==='multitouch'?2:1,target);
  if(reason==='unmount')s.dispose();
  s.fire(reason==='cancel'?'touchcancel':'touchend',160,100,0,target);vi.runAllTimers();
  expect(s.onBack).not.toHaveBeenCalled();s.dispose();
});
it('reduced motion settles immediately and cleanup removes listeners',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));const s=setup();s.fire('touchstart',4);s.fire('touchmove',160);s.fire('touchend',160,100,0);
  expect(s.render).toHaveBeenLastCalledWith(390,0);vi.runAllTimers();expect(s.onBack).toHaveBeenCalledTimes(1);
  s.dispose();s.fire('touchstart',4);s.fire('touchmove',180);s.fire('touchend',180,100,0);vi.runAllTimers();expect(s.onBack).toHaveBeenCalledTimes(1);vi.unstubAllGlobals();
});
it('an existing unsaved guard may refuse navigation; gesture never writes data',()=>{
 const s=setup();let dirty=true,screen='editor';s.onBack.mockImplementation(()=>{if(!dirty)screen='list';});
 s.fire('touchstart',4);s.fire('touchmove',160);s.fire('touchend',160,100,0);vi.runAllTimers();expect(screen).toBe('editor');expect(dirty).toBe(true);s.dispose();
});
it('interruptions clear a partial drag without navigation',()=>{
 const s=setup();s.fire('touchstart',4);s.fire('touchmove',160);window.dispatchEvent(new Event('resize'));s.fire('touchend',160,100,0);vi.runAllTimers();expect(s.onBack).not.toHaveBeenCalled();expect(s.surface.dataset.edgeBackActive).toBeUndefined();s.dispose();
});
