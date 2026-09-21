import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {prepareSheetEntry,sheetEntryDuration,freezeSheetMotion} from './sheetMotion.js';
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{document.body.innerHTML='';vi.useRealTimers();vi.restoreAllMocks();});
function fixture(){const layer=document.createElement('div');layer.className='modal-layer';const panel=document.createElement('main');panel.className='screen';layer.append(panel);document.body.append(layer);return {layer,panel};}
it('scales full-travel entry duration within compact/tall bounds',()=>{
 expect(sheetEntryDuration(100)).toBe(160);expect(sheetEntryDuration(300)).toBe(169);
 expect(sheetEntryDuration(500)).toBe(199);expect(sheetEntryDuration(820)).toBe(240);
});
it('measures each panel once, without retiming on content, theme or viewport changes',()=>{
 const {layer,panel}=fixture(),measure=vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({height:300});
 prepareSheetEntry(panel);expect(panel.style.getPropertyValue('--rook-sheet-enter-duration')).toBe('169ms');
 panel.textContent='More actions';measure.mockReturnValue({height:800});layer.classList.add('new-theme');
 prepareSheetEntry(panel);prepareSheetEntry(panel);expect(measure).toHaveBeenCalledOnce();
 expect(panel.style.getPropertyValue('--rook-sheet-enter-duration')).toBe('169ms');
 const next=document.createElement('main');next.className='screen';layer.replaceChildren(next);
 vi.spyOn(next,'getBoundingClientRect').mockReturnValue({height:800});prepareSheetEntry(next);
 expect(next.style.getPropertyValue('--rook-sheet-enter-duration')).toBe('240ms');
});
it.each(['exercise-visual-layer','edit-plan-page-layer'])('does not change %s presentation',kind=>{
 const {layer,panel}=fixture();layer.classList.add(kind);const measure=vi.spyOn(panel,'getBoundingClientRect');
 prepareSheetEntry(panel);expect(measure).not.toHaveBeenCalled();expect(panel.style.cssText).toBe('');
});
it('starts panel and backdrop on the same frame and cancels pending work on unmount/StrictMode cleanup',()=>{
 const {layer,panel}=fixture(),measure=vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({height:300});
 const release=prepareSheetEntry(panel);expect(panel.style.getPropertyValue('--rook-sheet-enter-play-state')).toBe('paused');
 release();vi.advanceTimersToNextFrame();expect(panel.style.getPropertyValue('--rook-sheet-enter-play-state')).toBe('paused');
 prepareSheetEntry(panel);vi.advanceTimersToNextFrame();expect(measure).toHaveBeenCalledOnce();
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
