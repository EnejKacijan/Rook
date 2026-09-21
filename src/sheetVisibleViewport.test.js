import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { bindSheetVisibleViewport, observeVisibleViewport } from './sheetVisibleViewport.js';

let vv, layer, panel, releases;
beforeEach(() => {
  vv = new EventTarget(); Object.assign(vv, {height:844,offsetTop:0,scale:1});
  vi.stubGlobal('visualViewport',vv); vi.stubGlobal('innerHeight',844); vi.stubGlobal('innerWidth',390);
  vi.spyOn(document.documentElement,'clientHeight','get').mockReturnValue(0);
  layer=document.createElement('div'); layer.className='modal-layer'; panel=document.createElement('main'); layer.append(panel); document.body.append(layer);
  releases=[];
});
afterEach(() => { releases.reverse().forEach(release=>release()); layer.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const bind=(options)=>{const release=bindSheetVisibleViewport(panel,()=>{},options); releases.push(release);return release;};
const resize=(height,offsetTop=0)=>{vi.stubGlobal('innerHeight',height); Object.assign(vv,{height,offsetTop}); window.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('resize'));};

it('keeps normal sheet geometry closed, bounds co-resized sheets, and restores exactly on close',()=>{
  layer.style.height='700px'; layer.style.top='3px'; panel.style.maxHeight='650px';
  bind({keyboardOnly:true}); expect(layer.style.height).toBe('700px');
  resize(480,24); expect(layer.style.height).toBe('844px'); expect(layer.style.top).toBe('0px'); expect(layer.style.paddingTop).toBe('24px'); expect(layer.style.paddingBottom).toBe('340px'); expect(panel.style.maxHeight).toBe('468px');
  expect(panel.style.getPropertyValue('--sheet-action-safe-bottom')).toBe('0px');
  expect(panel.style.getPropertyValue('--rook-sheet-safe-bottom')).toContain('var(--sheet-action-safe-bottom)');
  resize(844); expect(layer.style.height).toBe('700px'); expect(layer.style.top).toBe('3px'); expect(panel.style.maxHeight).toBe('650px');
  expect(panel.hasAttribute('data-sheet-keyboard-open')).toBe(false);
});
it('retains closed geometry before a sheet opens even when both viewports already shrank',()=>{
  releases.push(observeVisibleViewport()); resize(480,24);
  bind({keyboardOnly:true}); expect(panel.hasAttribute('data-sheet-keyboard-open')).toBe(true);
  expect(layer.style.height).toBe('844px'); expect(layer.style.paddingBottom).toBe('340px');
});
it('has one listener set and one geometry owner for overlapping modal/footer/search subscriptions',()=>{
  const add=vi.spyOn(vv,'addEventListener'), remove=vi.spyOn(vv,'removeEventListener');
  const modal=bind({keyboardOnly:true}), search=bind(), footer=bind({keyboardOnly:true});
  expect(add.mock.calls.map(x=>x[0])).toEqual(['resize','scroll']);
  expect(layer.style.height).toBe('844px'); search(); expect(layer.style.height).toBe('');
  resize(480,72); expect(layer.style.top).toBe('0px'); expect(layer.style.paddingTop).toBe('72px'); modal(); expect(layer.style.height).toBe('844px');
  footer(); expect(layer.style.height).toBe(''); expect(remove.mock.calls.map(x=>x[0])).toEqual(['resize','scroll']);
  resize(436); expect(layer.style.height).toBe('');
});
it('preserves input identity, caret, scroll and draft across accessory changes, pan and foreground cycles',()=>{
  const input=document.createElement('textarea'); input.value='draft reminder'; panel.append(input); input.focus(); input.setSelectionRange(3,3); panel.scrollTop=140;
  bind();
  for(let cycle=0;cycle<3;cycle++)for(const height of [480,436,844]){
    resize(height,24); vv.offsetTop=72; vv.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('pageshow'));
    vi.spyOn(document,'hidden','get').mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
    expect(document.activeElement).toBe(input); expect(input.selectionStart).toBe(3); expect(input.value).toBe('draft reminder'); expect(panel.scrollTop).toBe(140);
    expect(panel.hasAttribute('data-sheet-keyboard-open')).toBe(height!==844);
  }
});
it('uses width-specific references on orientation and restores a known portrait reference while open',()=>{
  bind(); resize(480); vi.stubGlobal('innerWidth',844); resize(390); window.dispatchEvent(new Event('orientationchange'));
  expect(panel.hasAttribute('data-sheet-keyboard-open')).toBe(false);
  resize(240); expect(panel.hasAttribute('data-sheet-keyboard-open')).toBe(true);
  vi.stubGlobal('innerWidth',390); resize(480); expect(panel.hasAttribute('data-sheet-keyboard-open')).toBe(true);
});
it('restores prior owned tokens including priority and removes every global listener',()=>{
  panel.style.setProperty('--rook-sheet-safe-bottom','19px'); panel.style.setProperty('max-height','650px','important'); panel.setAttribute('data-sheet-keyboard-open','original');
  const add=vi.spyOn(window,'addEventListener'), remove=vi.spyOn(window,'removeEventListener');
  const release=bind(); release();
  expect(panel.style.getPropertyValue('--rook-sheet-safe-bottom')).toBe('19px'); expect(panel.style.getPropertyPriority('max-height')).toBe('important');
  expect(panel.getAttribute('data-sheet-keyboard-open')).toBe('original');
  expect(remove.mock.calls.map(x=>x[0])).toEqual(add.mock.calls.map(x=>x[0]));
});
it('safely leaves native layout alone when VisualViewport is unavailable',()=>{
  vi.stubGlobal('visualViewport',undefined); bind(); releases.push(observeVisibleViewport());
  expect(layer.getAttribute('style')).toBeNull(); expect(panel.getAttribute('style')).toBeNull();
});
it('writes one changed geometry for duplicate visual/layout notifications, without delaying keyboard frames',()=>{
 const changed=vi.fn();releases.push(bindSheetVisibleViewport(panel,changed));changed.mockClear();
 resize(480,24);vv.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));expect(changed).toHaveBeenCalledOnce();expect(panel.style.getPropertyValue('--sheet-visible-height')).toBe('480px');
 resize(436,24);expect(changed).toHaveBeenCalledTimes(2);expect(panel.style.getPropertyValue('--sheet-visible-height')).toBe('436px');
});

it.each([false,true])('keeps full coverage and independently bounds the panel (layout co-resizes: %s)',coResize=>{
  bind();
  for(const [height,offsetTop,event] of [[844,0,'resize'],[800,0,'resize'],[760,0,'resize'],[660,0,'resize'],[480,0,'resize'],[480,24,'scroll'],[436,24,'resize'],[480,72,'scroll'],[800,0,'resize'],[844,0,'resize']]){
    if(coResize)vi.stubGlobal('innerHeight',height);
    Object.assign(vv,{height,offsetTop}); vv.dispatchEvent(new Event(event));
    const coverage=parseFloat(layer.style.height),top=parseFloat(layer.style.paddingTop),bottom=parseFloat(layer.style.paddingBottom);
    expect(coverage).toBe(844); expect(layer.style.top).toBe('0px'); expect(layer.style.bottom).toBe('auto');
    expect(coverage-bottom).toBe(offsetTop+height); expect(coverage-top-bottom).toBe(height);
    expect(panel.style.maxHeight).toBe(`${height-12}px`);
    expect(layer.style.getPropertyValue('--sheet-obscured-bottom')).toBe(`${bottom}px`);
    expect(panel.style.getPropertyValue('--sheet-action-safe-bottom')).toBe(height<744?'0px':'env(safe-area-inset-bottom, 0px)');
  }
});

it('preserves focus moving between fields and keyboard closing while the same field stays focused',()=>{
  panel.innerHTML='<input value="Search query"><textarea>Notes draft</textarea>';
  const [input,notes]=panel.children; bind(); input.focus(); input.setSelectionRange(4,7); panel.scrollTop=110;
  resize(480); expect(document.activeElement).toBe(input); expect(input.selectionStart).toBe(4); expect(input.selectionEnd).toBe(7);
  notes.focus(); notes.setSelectionRange(2,4);
  for(const height of [436,480,844]){
    resize(height); expect(document.activeElement).toBe(notes); expect(notes.selectionStart).toBe(2); expect(notes.selectionEnd).toBe(4);
    expect(panel.children[0]).toBe(input); expect(panel.children[1]).toBe(notes); expect(panel.scrollTop).toBe(110);
    expect(input.value).toBe('Search query'); expect(notes.value).toBe('Notes draft');
  }
});

it('restores every owned inline value and priority after closed geometry and final release',()=>{
  layer.style.cssText='height:700px!important;top:3px!important;bottom:4px!important;padding-top:7px!important;padding-bottom:9px!important;--sheet-obscured-bottom:11px!important;color:red';
  panel.style.cssText='max-height:650px!important;--sheet-visible-height:600px!important;--sheet-reference-height:800px!important;--sheet-action-safe-bottom:19px!important;--rook-sheet-safe-bottom:23px!important;color:blue';
  panel.setAttribute('data-sheet-keyboard-open','original');
  const layerPrior=layer.style.cssText,panelPrior=panel.style.cssText;
  const release=bind({keyboardOnly:true}); resize(480,24); resize(844);
  expect(layer.style.cssText).toBe(layerPrior); release();
  expect(layer.style.cssText).toBe(layerPrior); expect(panel.style.cssText).toBe(panelPrior); expect(panel.getAttribute('data-sheet-keyboard-open')).toBe('original');
});

it('does not mistake pinch zoom for a keyboard and leaves full-page positioning separate',()=>{
  bind(); Object.assign(vv,{height:422,offsetTop:80,scale:2}); vv.dispatchEvent(new Event('resize'));
  expect(panel.hasAttribute('data-sheet-keyboard-open')).toBe(false); expect(layer.style.height).toBe('844px'); expect(layer.style.paddingBottom).toBe('342px');
  const page=document.createElement('main');document.body.append(page);
  const release=bindSheetVisibleViewport(page,()=>{},{fullPage:true});
  expect(page.style.height).toBe('422px');expect(page.style.top).toBe('80px');expect(page.style.maxHeight).toBe('422px');expect(page.style.paddingBottom).toBe('');
  release();expect(page.style.cssText).toBe('');page.remove();
});

function tallSheet() {
  vi.useFakeTimers();
  Object.defineProperty(panel,'offsetTop',{configurable:true,value:68});
  Object.defineProperty(panel,'offsetHeight',{configurable:true,value:776});
  panel.innerHTML='<header class="detail-header"></header><textarea>Preserve my note</textarea>';
  const input=panel.querySelector('textarea');
  vi.spyOn(panel,'getBoundingClientRect').mockImplementation(()=>({top:68+vv.offsetTop,bottom:vv.offsetTop+vv.height}));
  vi.spyOn(panel.firstChild,'getBoundingClientRect').mockImplementation(()=>({bottom:148+vv.offsetTop}));
  vi.spyOn(input,'getBoundingClientRect').mockImplementation(()=>({top:620-panel.scrollTop,bottom:696-panel.scrollTop,height:76}));
  bind({keyboardOnly:true,stableTop:true});
  return input;
}
it('pins the resting tall-sheet top before any resize and bounds every opening/closing frame',()=>{
  const input=tallSheet();input.focus();input.setSelectionRange(3,3);
  expect(panel.style.height).toBe('776px');expect(layer.style.alignItems).toBe('flex-start');
  for(const [height,offset] of [[760,0],[650,0],[540,0],[480,0],[436,24],[480,24],[540,0],[650,0],[760,0]]){
    resize(height,offset);
    expect(layer.style.paddingTop).toBe(`${68+offset}px`);
    expect(panel.style.height).toBe(`${height-68}px`);
    expect(panel.style.maxHeight).toBe(panel.style.height);
    expect(layer.style.height).toBe('844px');
    expect(parseFloat(layer.style.height)-parseFloat(layer.style.paddingBottom)).toBe(height+offset);
    expect(document.activeElement).toBe(input);expect(input.selectionStart).toBe(3);
    expect(panel.style.transform).toBe('');expect(panel.style.transition).toBe('');
  }
  panel.scrollTop=290;resize(844);
  expect(panel.style.height).toBe('');expect(layer.style.alignItems).toBe('');expect(panel.scrollTop).toBe(290);
  expect(document.activeElement).toBe(input);expect(panel.hasAttribute('data-sheet-keyboard-open')).toBe(false);
  input.dispatchEvent(new Event('pointerdown',{bubbles:true}));resize(480);
  expect(panel.style.height).toBe('412px');expect(panel.scrollTop).toBe(290);
});
it('reveals once after settled geometry, minimally, and does not restart on unchanged events or typing',()=>{
  const input=tallSheet();input.focus();
  for(const height of [760,650,540,480]){resize(height);vi.advanceTimersByTime(40);expect(panel.scrollTop).toBe(0);}
  vi.advanceTimersByTime(70);vv.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));
  input.value+=' draft';input.dispatchEvent(new Event('input',{bubbles:true}));
  vi.advanceTimersByTime(30);
  expect(panel.scrollTop).toBe(228); // Bottom 696 -> 468, never center the field.
  const position=panel.scrollTop;vi.advanceTimersByTime(500);expect(panel.scrollTop).toBe(position);
  resize(436);vi.advanceTimersByTime(150);expect(panel.scrollTop).toBe(272);
  resize(480);vi.advanceTimersByTime(150);expect(panel.scrollTop).toBe(272);
});
it('leaves an already visible field and latest user scroll unchanged through keyboard Done',()=>{
  const input=tallSheet();panel.scrollTop=300;input.focus();resize(480);vi.advanceTimersByTime(160);
  expect(panel.scrollTop).toBe(300);
  panel.scrollTop=600;for(const height of [540,650,760,844]){resize(height);vi.advanceTimersByTime(160);}
  expect(panel.scrollTop).toBe(600);expect(document.activeElement).toBe(input);
});
it('releases pending reveal work on blur/unmount and restores geometry ownership',()=>{
  const input=tallSheet();input.focus();resize(480);input.blur();vi.advanceTimersByTime(200);expect(panel.scrollTop).toBe(0);
  input.focus();releases[0]();vi.advanceTimersByTime(200);
  expect(panel.scrollTop).toBe(0);expect(panel.style.cssText).toBe('');expect(layer.style.cssText).toBe('');
  input.dispatchEvent(new Event('pointerdown',{bubbles:true}));resize(436);expect(panel.style.cssText).toBe('');
});
it('fits a very short viewport directly without an impossible resting-top gap',()=>{
  tallSheet().focus();resize(180,24);
  expect(layer.style.paddingTop).toBe('24px');expect(panel.style.height).toBe('180px');
  vi.advanceTimersByTime(180);expect(panel.scrollTop).toBe(0); // Let native caret reveal own this short viewport.
});
