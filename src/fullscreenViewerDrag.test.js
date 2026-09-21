import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindFullscreenViewerDrag, viewerDragIntent, commitViewerDrag } from './fullscreenViewerDrag.js';

let layer, visual, scroller, close, release, now, reduced;
const touch = (type, x, y, count = 1, target = visual) => {
  const point = { identifier: 1, clientX: x, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : [point, ...Array.from({ length: count - 1 }, (_, i) => ({ ...point, identifier: i + 2 }))] }, changedTouches: { value: [point] } });
  target.dispatchEvent(event); return event;
};
const advance = ms => { now += ms; vi.advanceTimersByTime(ms); };
function pull(distance = 70, ms = 200) { touch('touchstart', 160, 180); advance(ms); return touch('touchmove', 160, 180 + distance); }
beforeEach(() => {
  vi.useFakeTimers(); now = 0; reduced = false;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  layer = document.createElement('div'); layer.innerHTML = '<main><div class="scroller"><img><button>Action</button></div></main>';
  document.body.append(layer); visual = layer.firstElementChild; scroller = visual.firstElementChild; close = vi.fn();
  release = bindFullscreenViewerDrag({ layer, visual, scroller, onDismiss: close });
});
afterEach(() => { release(); layer.remove(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each([[0,9,'pending'],[0,11,'drag'],[10,12,'pending'],[12,20,'drag'],[30,12,'yield'],[0,-11,'yield']])('arbitrates (%s, %s) as %s', (x,y,intent) => expect(viewerDragIntent(x,y)).toBe(intent));
it('uses viewport fraction and a minimum fresh-flick displacement', () => {
  expect(commitViewerDrag(207,800,0)).toBe(false); expect(commitViewerDrag(208,800,0)).toBe(true);
  expect(commitViewerDrag(55,800,2)).toBe(false); expect(commitViewerDrag(56,800,.65)).toBe(true);
});
it('does not move before lock; follows directly and cancels in 180 ms', () => {
  touch('touchstart',160,180); advance(100); touch('touchmove',160,189);
  expect(visual.style.transform).toBe(''); advance(200); const e=touch('touchmove',160,250);
  expect(e.defaultPrevented).toBe(true); expect(visual.style.transform).toContain('70px'); expect(visual.style.transform).toContain('scale(0.97');
  expect(Number(layer.style.getPropertyValue('--viewer-scrim-opacity'))).toBeLessThan(1);
  advance(120); touch('touchend',160,250); expect(close).not.toHaveBeenCalled(); advance(180);
  expect(visual.style.transform).toBe(''); expect(layer.style.getPropertyValue('--viewer-scrim-opacity')).toBe('');
});
it.each(['distance','velocity'])('%s dismissal closes once after motion, including duplicate transitionend', kind => {
  pull(kind==='distance'?240:70,kind==='distance'?500:50); touch('touchend',160,kind==='distance'?420:250);
  expect(close).not.toHaveBeenCalled(); expect(visual.style.transform).toContain('824px');
  const end=()=>{const e=new Event('transitionend',{bubbles:true});Object.defineProperty(e,'propertyName',{value:'transform'});visual.dispatchEvent(e);};
  end(); end(); advance(500); expect(close).toHaveBeenCalledOnce();
});
it('a fast move followed by a hold cannot use stale velocity', () => {
  pull(70,40); advance(101); touch('touchend',160,250); advance(500); expect(close).not.toHaveBeenCalled();
});
it('reverse release cannot borrow downward velocity', () => {
  pull(70,40); touch('touchend',160,230); advance(500); expect(close).not.toHaveBeenCalled();
});
it('release coordinates below the distance threshold cancel even without a final move', () => {
  pull(240,400);touch('touchend',160,300);advance(500);expect(close).not.toHaveBeenCalled();
});
it.each([[240,190],[160,140]])('yields horizontal/upward intent permanently until a new touch', (x,y) => {
  touch('touchstart',160,180); touch('touchmove',x,y); touch('touchmove',160,600); touch('touchend',160,600); advance(500);
  expect(visual.style.transform).toBe(''); expect(close).not.toHaveBeenCalled();
});
it('does not reclassify a locked drag', () => {
  pull(); advance(100); touch('touchmove',300,260); expect(visual.style.transform).toContain('80px');
});
it('scrolled photo content yields the entire gesture even after reaching top', () => {
  scroller.scrollTop=20; pull(100); scroller.scrollTop=0; touch('touchmove',160,600); touch('touchend',160,600); advance(500);
  expect(close).not.toHaveBeenCalled(); expect(visual.style.transform).toBe('');
  pull(240); touch('touchend',160,420); advance(220); expect(close).toHaveBeenCalledOnce();
});
it('does not acquire a gesture already owned by native scrolling', () => {
  touch('touchstart',160,180); const e=new Event('touchmove',{bubbles:true,cancelable:false});Object.defineProperty(e,'touches',{value:[{identifier:1,clientX:160,clientY:500}]});visual.dispatchEvent(e);
  expect(visual.style.transform).toBe(''); expect(close).not.toHaveBeenCalled();
});
it('buttons remain tappable and do not start dismiss', () => {
  const button=layer.querySelector('button'), click=vi.fn();button.addEventListener('click',click);
  touch('touchstart',160,180,1,button);touch('touchmove',160,600,1,button);touch('touchend',160,600,1,button);button.click();advance(500);
  expect(click).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();
});
it('multitouch aborts immediately and yields pinch', () => {
  pull(); const event=touch('touchstart',170,250,2); expect(event.defaultPrevented).toBe(false);
  expect(visual.style.transform).toBe('');touch('touchmove',160,600,2);touch('touchend',160,600);advance(500);expect(close).not.toHaveBeenCalled();
});
it('zoomed viewport or image cannot begin dismissal', () => {
  const viewport=new EventTarget();viewport.scale=2;vi.stubGlobal('visualViewport',viewport);pull(300);expect(visual.style.transform).toBe('');
  release();viewport.scale=1;release=bindFullscreenViewerDrag({layer,visual,onDismiss:close,zoomScale:()=>2});pull(300);expect(visual.style.transform).toBe('');
});
it.each(['resize','orientationchange','blur','pagehide','visibilitychange','pointercancel','touchcancel'])('%s cleans up drag and pending exit', name => {
  for(const exiting of [false,true]) {
    pull(240);if(exiting)touch('touchend',160,420);
    const e=new Event(name,{bubbles:true});Object.defineProperty(e,'pointerType',{value:'touch'});
    (name==='visibilitychange'?document:window).dispatchEvent(e);advance(500);
    expect(visual.style.transform).toBe('');expect(close).not.toHaveBeenCalled();
  }
});
it('unmount cancels pending close and a fresh binding starts neutral', () => {
  pull(240);touch('touchend',160,420);release();advance(500);expect(close).not.toHaveBeenCalled();
  release=bindFullscreenViewerDrag({layer,visual,onDismiss:close});expect(visual.style.transform).toBe('');pull(240);touch('touchend',160,420);advance(220);expect(close).toHaveBeenCalledOnce();
});
it('only the topmost viewer can own movement', () => {
  const top=document.createElement('div');top.innerHTML='<main></main>';document.body.append(top);
  const releaseTop=bindFullscreenViewerDrag({layer:top,visual:top.firstChild,onDismiss:vi.fn()});pull(240);expect(visual.style.transform).toBe('');releaseTop();top.remove();
  pull(240);expect(visual.style.transform).toContain('240px');
});
it('reduced motion keeps direct tracking without scale and settles promptly', () => {
  reduced=true;pull();expect(visual.style.transform).toContain('scale(1)');advance(120);touch('touchend',160,250);expect(visual.style.transform).toBe('');
  pull(240);touch('touchend',160,420);expect(close).toHaveBeenCalledOnce();
});
it('guards the release click across removal, but permits a new physical press', () => {
  pull();advance(120);touch('touchend',160,250);const click=vi.fn();document.body.addEventListener('click',click,{once:true});
  document.body.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));expect(click).not.toHaveBeenCalled();
  document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));document.body.click();expect(click).toHaveBeenCalledOnce();
});
it('tracks non-touch pointer release outside the original element', () => {
  const pointer=(type,target,y)=>{const e=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:160,clientY:y,button:0});Object.defineProperties(e,{pointerId:{value:1},pointerType:{value:'mouse'}});target.dispatchEvent(e);};
  pointer('pointerdown',visual,180);advance(300);pointer('pointermove',document.body,450);pointer('pointerup',document.body,450);advance(220);expect(close).toHaveBeenCalledOnce();
});
