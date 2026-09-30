import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {createSheetDragMotion,freezeSheetMotion,fadeSheetBackdrop} from './sheetMotion.js';
import {useAnimationClock} from './testAnimationClock.js';
let motion,panel,layer,measure;
beforeEach(()=>{
  useAnimationClock();layer=document.createElement('div');panel=document.createElement('main');layer.className='modal-layer';layer.append(panel);document.body.append(layer);
  layer.style.backgroundColor='rgba(0, 0, 0, 0.6)';measure=vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({height:500});
  motion=createSheetDragMotion(()=>panel,()=>layer);
});
afterEach(()=>{motion.dispose();document.body.innerHTML='';vi.restoreAllMocks();vi.useRealTimers();});
it('coalesces a burst to one pre-pointerup transform/opacity frame, without layout reads or height animation',()=>{
  motion.begin();expect(measure).toHaveBeenCalledOnce();measure.mockClear();
  for(let n=1;n<=240;n++)motion.track(n);
  expect(vi.getTimerCount()).toBe(1);expect(panel.style.transform).toBe('');vi.advanceTimersToNextFrame();
  expect(panel.style.transform).toBe('translate3d(0, 240px, 0)');expect(layer.querySelector('.sheet-drag-scrim').style.opacity).toBe('0.52');
  expect(measure).not.toHaveBeenCalled();expect(panel.style.transition).toBe('none');expect(panel.style.height).toBe('');expect(panel.style.animation).toBe('none');
  expect(layer.firstElementChild).toBe(panel);expect(layer.querySelector('.sheet-drag-scrim').style.backgroundColor).toBe('rgba(0, 0, 0, 0.6)');
});
it('cancel consumes pending movement and returns to the rest pose with no stale frame, layer or promotion',()=>{
  motion.begin();motion.track(60);motion.reset();expect(panel.style.transform).toBe('');expect(panel.style.transition).toBe('transform 180ms ease-out');
  vi.advanceTimersByTime(200);expect(panel.style.transform).toBe('');expect(layer.children).toHaveLength(1);expect(panel.style.willChange).toBe('');expect(vi.getTimerCount()).toBe(0);
});
it('interrupting entry uses the resting theme scrim rather than its transient fade opacity',()=>{
 vi.spyOn(globalThis,'getComputedStyle').mockImplementation(()=>({backgroundColor:layer.style.animation==='none'?'rgba(0, 0, 0, 0.76)':'rgba(0, 0, 0, 0.1)'}));motion.begin();
 expect(layer.querySelector('.sheet-drag-scrim').style.backgroundColor).toBe('rgba(0, 0, 0, 0.76)');
});
it('restarting during cancellation keeps one scrim and one presentation owner',()=>{
  motion.begin();motion.track(30);motion.reset();motion.begin();motion.track(40);vi.advanceTimersByTime(200);
  expect(layer.querySelectorAll('.sheet-drag-scrim')).toHaveLength(1);expect(panel.style.transform).toBe('translate3d(0, 40px, 0)');
});
it('shared modal close flushes pending motion and fades the existing scrim',()=>{
  motion.begin();motion.track(180);freezeSheetMotion(layer,panel);fadeSheetBackdrop(layer,180);
  expect(panel.style.transform).toBe('translate3d(0, 180px, 0)');expect(layer.querySelector('.sheet-drag-scrim').style.opacity).toBe('0');expect(vi.getTimerCount()).toBe(0);
});
it('reduced-motion dismiss is immediate; unmount cancels pending frames and callbacks',()=>{
  const close=vi.fn();motion.begin();motion.track(180);motion.dismiss(0,close);expect(panel.style.transition).toBe('none');vi.advanceTimersByTime(0);expect(close).toHaveBeenCalledOnce();
  motion.begin();motion.track(90);motion.dispose();vi.advanceTimersByTime(500);expect(vi.getTimerCount()).toBe(0);expect(layer.children).toHaveLength(1);expect(close).toHaveBeenCalledOnce();
});
