import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {bindPressFeedback} from './pressFeedback.js';
let host,button,release;
beforeEach(()=>{
 host=document.createElement('div');host.innerHTML='<button><span>Choose a missed session</span></button><button aria-pressed="true">Selected day</button><textarea>Copy this note</textarea><p class="coach-message">Copyable Coach content</p>';
 document.body.append(host);button=host.querySelector('button');release=bindPressFeedback();
 vi.spyOn(button,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:300,bottom:60});
});
afterEach(()=>{release();host.remove();vi.restoreAllMocks();});
function pointer(type,node=button,patch={}) {
 const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:7,pointerType:'touch',button:0,isPrimary:true,clientX:50,clientY:25,...patch});node.dispatchEvent(event);return event;
}
const pressed=()=>button.hasAttribute('data-row-pressed');
it('raw sheet/tab/icon/CTA buttons share immediate press feedback without starting an action',()=>{
 const click=vi.fn();button.addEventListener('click',click);
 expect(pointer('pointerdown',button.firstChild).defaultPrevented).toBe(false);expect(pressed()).toBe(true);expect(click).not.toHaveBeenCalled();
 pointer('pointerup',document.body);expect(pressed()).toBe(false);button.click();expect(click).toHaveBeenCalledOnce();
});
it.each(['pointercancel','touchcancel','lostpointercapture','scroll','visibilitychange'])('clears on %s even when the event is outside the pressed control',type=>{
 pointer('pointerdown');document.dispatchEvent(new Event(type,{bubbles:true}));expect(pressed()).toBe(false);
});
it.each(['blur','pagehide','popstate','hashchange'])('clears on foreground/history lifecycle event %s',type=>{pointer('pointerdown');window.dispatchEvent(new Event(type));expect(pressed()).toBe(false);});
it('scroll/drag intent clears before gesture ownership changes, with no re-entry residue',()=>{
 pointer('pointerdown');expect(pointer('pointermove',document.body,{clientY:36}).defaultPrevented).toBe(false);expect(pressed()).toBe(false);
 pointer('pointermove');expect(pressed()).toBe(false);
});
it('moving between child labels keeps the same press but leaving the row clears it',()=>{
 pointer('pointerdown');pointer('pointerout',button.firstChild,{relatedTarget:button});expect(pressed()).toBe(true);
 pointer('pointerout',button,{relatedTarget:document.body});expect(pressed()).toBe(false);
});
it('navigation click clears before the existing handler; ten repeated taps navigate once each',()=>{
 const checks=[];button.addEventListener('click',()=>checks.push(pressed()));
 for(let i=0;i<10;i++){pointer('pointerdown');pointer('pointerup');button.click();}
 expect(checks).toEqual(Array(10).fill(false));expect(pressed()).toBe(false);
});
it.each(['remove','hidden','disabled'])('sheet dismiss/unmount/disable clears a held control (%s)',async mode=>{
 pointer('pointerdown');if(mode==='remove')button.remove();else if(mode==='hidden')host.setAttribute('aria-hidden','true');else button.disabled=true;
 await Promise.resolve();expect(pressed()).toBe(false);
});
it('selected state is independent and is not mutated by down, cancellation or release',()=>{
 const selected=host.querySelector('[aria-pressed]');pointer('pointerdown',selected);expect(selected.getAttribute('aria-pressed')).toBe('true');
 pointer('pointercancel',selected);expect(selected.getAttribute('aria-pressed')).toBe('true');expect(selected.hasAttribute('data-row-pressed')).toBe(false);
});
it('keyboard focus remains native; activation keys are observed without interception',()=>{
 button.focus();const event=new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});button.dispatchEvent(event);
 expect(event.defaultPrevented).toBe(false);expect(pressed()).toBe(true);
 button.dispatchEvent(new KeyboardEvent('keyup',{key:' ',bubbles:true}));expect(pressed()).toBe(false);expect(document.activeElement).toBe(button);
});
it('inputs and copyable content do not become press owners or lose selection',()=>{
 const note=host.querySelector('textarea');pointer('pointerdown',note);expect(host.querySelector('[data-row-pressed]')).toBeNull();note.setSelectionRange(0,4);expect(note.value.slice(note.selectionStart,note.selectionEnd)).toBe('Copy');
 pointer('pointerdown',host.querySelector('p'));expect(host.querySelector('[data-row-pressed]')).toBeNull();
});
it('multiple component users share one binding and teardown is safe/idempotent',()=>{
 const second=bindPressFeedback();release();release();pointer('pointerdown');expect(pressed()).toBe(true);second();expect(pressed()).toBe(false);pointer('pointerdown');expect(pressed()).toBe(false);
});
it('blocking modal backgrounds and disabled radio labels do not acquire a press',()=>{
 host.setAttribute('inert','');pointer('pointerdown');expect(pressed()).toBe(false);host.removeAttribute('inert');
 host.insertAdjacentHTML('beforeend','<fieldset disabled><button type="button">Apply theme</button></fieldset>');
 pointer('pointerdown',host.querySelector('fieldset button'));expect(host.querySelector('[data-row-pressed]')).toBeNull();
});
it('press CSS has no scale/travel/background, while canonical keyboard focus and selected styles remain',()=>{
 const css=readFileSync('src/pressFeedback.css','utf8');
 expect(css).not.toMatch(/(?:transform|background(?:-color)?|outline)\s*:/);expect(css).toContain('--rook-press-opacity: .84');expect(css).not.toMatch(/^\s*\*\s*\{/m);
 const swipe=readFileSync('src/swipeActionRow.css','utf8');expect(swipe).toContain('.swipe-up-next-body:focus-visible');expect(swipe).toContain('.swipe-up-next-body:has(button:focus-visible)');expect(swipe).not.toContain('.swipe-up-next-body:focus-within');
 expect(readFileSync('src/segmentedControl.css','utf8')).toContain('button:focus-visible');
 const coach=readFileSync('src/coach.css','utf8');expect(coach).toContain('coach-latest-enter 160ms ease-out backwards');expect(coach).not.toContain('scale(1.12)');
});
