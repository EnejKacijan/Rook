import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { bindPhotoComparisonGesture } from './photoComparisonGesture.js';
let stage, divider, controller, zoom, multitouch;
function pointer(type,x,y=200,id=1,target=stage) {
 const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});
 Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'}});target.dispatchEvent(event);return event;
}
const value=name=>stage.style.getPropertyValue(`--compare-${name}`);
const frame=()=>vi.advanceTimersByTime(16);
beforeEach(()=>{
 vi.useFakeTimers();vi.spyOn(window,'requestAnimationFrame').mockImplementation(cb=>setTimeout(cb,16));vi.spyOn(window,'cancelAnimationFrame').mockImplementation(clearTimeout);
 stage=document.createElement('div');divider=document.createElement('div');stage.append(divider);document.body.append(stage);
 stage.getBoundingClientRect=()=>({left:0,top:0,width:400,height:600});stage.setPointerCapture=vi.fn();stage.hasPointerCapture=()=>false;
 zoom=vi.fn();multitouch=vi.fn();controller=bindPhotoComparisonGesture({stage,divider,onZoom:zoom,onMultitouch:multitouch});
});
afterEach(()=>{controller.dispose();stage.remove();vi.restoreAllMocks();vi.useRealTimers();});
it('starts at 50 percent and 1x',()=>{expect(value('position')).toBe('50%');expect(value('scale')).toBe('1');expect(divider.getAttribute('aria-valuenow')).toBe('50');});
it('tracks the finger 1:1, coalesces visual writes and announces only the final value',()=>{
 pointer('pointerdown',190,200,1,divider);pointer('pointermove',210);pointer('pointermove',250);expect(value('position')).toBe('50%');frame();expect(value('position')).toBe('65%');expect(divider.getAttribute('aria-valuenow')).toBe('50');expect(zoom).toHaveBeenCalledTimes(1);
 pointer('pointerup',270);expect(value('position')).toBe('70%');expect(divider.getAttribute('aria-valuenow')).toBe('70');
});
it.each([[-800,'0%'],[1200,'100%']])('clamps an out-of-bounds drag to %s', (end,expected)=>{pointer('pointerdown',200,200,1,divider);pointer('pointermove',end);pointer('pointerup',end);expect(value('position')).toBe(expected);});
it('pointer cancellation and lost capture restore the pre-drag value',()=>{
 for(const type of ['pointercancel','lostpointercapture']){pointer('pointerdown',200,200,1,divider);pointer('pointermove',300);frame();expect(value('position')).toBe('75%');pointer(type,300);expect(value('position')).toBe('50%');expect(divider.getAttribute('aria-valuenow')).toBe('50');}
});
it('multitouch takes over the divider and uses one shared zoom transform without resuming a divider drag',()=>{
 pointer('pointerdown',200,200,1,divider);pointer('pointermove',240);frame();pointer('pointerdown',340,200,2);expect(multitouch).toHaveBeenCalledOnce();pointer('pointermove',440,200,2);frame();expect(value('scale')).toBe('2');expect(value('position')).toBe('60%');expect(controller.scale).toBe(2);
 pointer('pointerup',440,200,2);pointer('pointermove',300);frame();expect(value('position')).toBe('60%');pointer('pointerup',300);
});
it('pans only while zoomed and clamps at viewport bounds',()=>{
 pointer('pointerdown',100);expect(pointer('pointermove',200,400).defaultPrevented).toBe(false);pointer('pointerup',200,400);expect(value('x')).toBe('0px');
 controller.zoom(2);pointer('pointerdown',100);pointer('pointermove',1000,2000);frame();expect(value('x')).toBe('200px');expect(value('y')).toBe('300px');pointer('pointerup',1000,2000);
 controller.zoom(0);expect(value('scale')).toBe('1');expect(value('x')).toBe('0px');expect(value('y')).toBe('0px');controller.zoom(20);expect(controller.scale).toBe(4);
});
it('supports arrows, larger Shift steps and Home/End without live pointer announcements',()=>{
 const key=(key,shiftKey=false)=>divider.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey,cancelable:true}));key('ArrowRight');expect(value('position')).toBe('51%');key('ArrowLeft',true);expect(value('position')).toBe('41%');key('End');expect(value('position')).toBe('100%');key('Home');expect(value('position')).toBe('0%');
});
it('mode reset clears zoom before paint while preserving divider position',()=>{
 pointer('pointerdown',200,200,1,divider);pointer('pointerup',300);controller.zoom(3);controller.reset();expect(value('position')).toBe('75%');expect(value('scale')).toBe('1');expect(value('x')).toBe('0px');
});
it('disposal cancels a queued frame and all gesture listeners',()=>{
 pointer('pointerdown',200,200,1,divider);pointer('pointermove',300);controller.dispose();frame();expect(value('position')).toBe('50%');pointer('pointerup',300);expect(value('position')).toBe('50%');
});
it('disabled/inert comparison cannot change the divider',()=>{
 controller.dispose();controller=bindPhotoComparisonGesture({stage,divider,enabled:()=>false});pointer('pointerdown',200,200,1,divider);pointer('pointermove',300);pointer('pointerup',300);expect(value('position')).toBe('50%');
});

it('pinching back to base scale clears pan and clamps both layers at 1x',()=>{
 controller.zoom(2);pointer('pointerdown',80,200,1);pointer('pointerdown',320,200,2);pointer('pointermove',190,200,1);pointer('pointermove',210,200,2);frame();expect(controller.scale).toBe(1);expect(value('x')).toBe('0px');expect(value('y')).toBe('0px');pointer('pointerup',190,200,1);pointer('pointerup',210,200,2);
});
