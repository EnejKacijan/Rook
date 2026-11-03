import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {prepareSheetEntry,sheetEntryDuration,freezeSheetMotion,closeSheetMotion} from './sheetMotion.js';
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{document.body.innerHTML='';vi.useRealTimers();vi.restoreAllMocks();});
function fixture(){const layer=document.createElement('div');layer.className='modal-layer';const panel=document.createElement('main');panel.className='screen';layer.append(panel);document.body.append(layer);return {layer,panel};}
it('uses one full-travel duration for compact and tall sheets',()=>{
 expect(sheetEntryDuration(100)).toBe(180);expect(sheetEntryDuration(300)).toBe(180);
 expect(sheetEntryDuration(500)).toBe(180);expect(sheetEntryDuration(820)).toBe(180);
});
it('does not retime or replay on content, theme or viewport changes',()=>{
 const {layer,panel}=fixture(),measure=vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({height:300});
 prepareSheetEntry(panel);expect(panel.style.getPropertyValue('--rook-sheet-enter-duration')).toBe('180ms');
 panel.textContent='More actions';measure.mockReturnValue({height:800});layer.classList.add('new-theme');
 prepareSheetEntry(panel);prepareSheetEntry(panel);expect(measure).not.toHaveBeenCalled();
 expect(panel.style.getPropertyValue('--rook-sheet-enter-duration')).toBe('180ms');
 const next=document.createElement('main');next.className='screen';layer.replaceChildren(next);
 vi.spyOn(next,'getBoundingClientRect').mockReturnValue({height:800});prepareSheetEntry(next);
 expect(next.style.getPropertyValue('--rook-sheet-enter-duration')).toBe('180ms');
});
it.each(['exercise-visual-layer','edit-plan-page-layer'])('does not change %s presentation',kind=>{
 const {layer,panel}=fixture();layer.classList.add(kind);const measure=vi.spyOn(panel,'getBoundingClientRect');
 prepareSheetEntry(panel);expect(measure).not.toHaveBeenCalled();expect(panel.style.cssText).toBe('');
});
it('starts panel and backdrop on the same frame and cancels pending work on unmount/StrictMode cleanup',()=>{
 const {layer,panel}=fixture(),measure=vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({height:300});
 const release=prepareSheetEntry(panel);expect(panel.style.getPropertyValue('--rook-sheet-enter-play-state')).toBe('paused');
 release();vi.advanceTimersToNextFrame();expect(panel.style.getPropertyValue('--rook-sheet-enter-play-state')).toBe('paused');
 prepareSheetEntry(panel);vi.advanceTimersToNextFrame();expect(measure).not.toHaveBeenCalled();
 expect(panel.style.getPropertyValue('--rook-sheet-enter-play-state')).toBe('running');expect(layer.style.getPropertyValue('--rook-sheet-enter-play-state')).toBe('running');
 prepareSheetEntry(panel);expect(vi.getTimerCount()).toBe(0);
});
it('freezes the current entry or drag pose before exit cancels CSS animation',()=>{
 const {layer,panel}=fixture();
 vi.spyOn(globalThis,'getComputedStyle').mockImplementation(node=>node===panel?{transform:'matrix(1, 0, 0, 1, 173, 58)'}:{backgroundColor:'rgba(27, 26, 25, 0.17)'});
 vi.spyOn(panel,'getBoundingClientRect').mockImplementation(()=>{
  expect(panel.style.transform).toBe('matrix(1, 0, 0, 1, 173, 58)');expect(panel.style.animation).toBe('none');expect(panel.style.transition).toBe('none');
  expect(layer.style.backgroundColor).toBe('rgba(27, 26, 25, 0.17)');return {height:300};
 });
 expect(freezeSheetMotion(layer,panel)).toBe(300);
});

it.each([100,500,820])('keeps information entry at the same duration for %i-pixel content',height=>{
 const {layer,panel}=fixture();panel.dataset.sheetMotion='information';
 vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({height});prepareSheetEntry(panel);
 expect(panel.style.getPropertyValue('--rook-sheet-enter-duration')).toBe('180ms');
 expect(layer.style.getPropertyValue('--rook-sheet-enter-duration')).toBe('180ms');
});

it('waits for the native slide to finish rather than unmounting on a wall-clock deadline',async()=>{
 const {layer,panel}=fixture(),close=vi.fn();let finish;
 panel.getAnimations=()=>[{transitionProperty:'transform',finished:new Promise(resolve=>{finish=resolve;})}];
 vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({height:500});
 layer.style.backgroundColor='rgba(0, 0, 0, 0.6)';closeSheetMotion(layer,panel,close);
 expect(panel.hasAttribute('data-sheet-closing')).toBe(true);expect(panel.style.willChange).toBe('transform');
 expect(panel.style.transform).toBe('translate3d(0, 524px, 0)');
 expect(layer.style.transition).toBe('none');expect(layer.style.backgroundColor).toBe('transparent');
 const scrim=layer.querySelector('.sheet-drag-scrim');expect(scrim.style.backgroundColor).toBe('rgba(0, 0, 0, 0.6)');
 expect(scrim.style.transition).toBe('opacity 180ms ease-out');expect(scrim.style.opacity).toBe('0');expect(layer.firstElementChild).toBe(panel);
 vi.advanceTimersByTime(300);expect(close).not.toHaveBeenCalled();
 finish();await Promise.resolve();expect(close).toHaveBeenCalledOnce();vi.advanceTimersByTime(2000);expect(close).toHaveBeenCalledOnce();
});
it('cancels stale completion when a panel is replaced or its owner unmounts',async()=>{
 const {layer,panel}=fixture(),close=vi.fn();let finish;
 panel.getAnimations=()=>[{transitionProperty:'transform',finished:new Promise(resolve=>{finish=resolve;})}];
 const cancel=closeSheetMotion(layer,panel,close);cancel();finish();await Promise.resolve();vi.advanceTimersByTime(2000);expect(close).not.toHaveBeenCalled();
});
it('ignores old completion even before the replacement observer runs',async()=>{
 const {layer,panel}=fixture(),close=vi.fn();let finish;
 panel.getAnimations=()=>[{transitionProperty:'transform',finished:new Promise(resolve=>{finish=resolve;})}];
 closeSheetMotion(layer,panel,close);layer.replaceChildren(document.createElement('section'));
 finish();await Promise.resolve();vi.advanceTimersByTime(2000);expect(close).not.toHaveBeenCalled();
});
it.each([0,180])('retains a bounded fallback without native animations (duration %i)',duration=>{
 const {layer,panel}=fixture(),close=vi.fn();closeSheetMotion(layer,panel,close,{duration});
 vi.advanceTimersByTime(Math.max(0,duration-1));expect(close).toHaveBeenCalledTimes(duration===0?1:0);
 vi.advanceTimersByTime(1);expect(close).toHaveBeenCalledOnce();
});
it('finishes once if the browser cancels the native transition',async()=>{
 const {layer,panel}=fixture(),close=vi.fn();let cancel;
 panel.getAnimations=()=>[{transitionProperty:'transform',finished:new Promise((resolve,reject)=>{cancel=reject;})}];
 closeSheetMotion(layer,panel,close);cancel();await Promise.resolve();expect(close).toHaveBeenCalledOnce();
 vi.advanceTimersByTime(2000);expect(close).toHaveBeenCalledOnce();
});
it.each([0,100])('clears the full coverage boundary from a keyboard/drag pose (%ipx)',drag=>{
 const {layer,panel}=fixture();
 vi.spyOn(globalThis,'getComputedStyle').mockImplementation(node=>node===panel?{transform:drag?`matrix(1, 0, 0, 1, 0, ${drag})`:'none'}:{backgroundColor:'rgba(0, 0, 0, 0.6)',opacity:'1'});
 vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({top:100+drag,height:300,bottom:400+drag});
 vi.spyOn(layer,'getBoundingClientRect').mockReturnValue({top:0,bottom:844,height:844});
 closeSheetMotion(layer,panel,()=>{});
 expect(panel.style.transform).toBe(`${drag?`matrix(1, 0, 0, 1, 0, ${drag}) `:''}translate3d(0, ${768-drag}px, 0)`);
});
