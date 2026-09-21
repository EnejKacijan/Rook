// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {bindSwipeRowActions,registerSwipeRemoval} from './swipeRowAction.js';
import {ADD_SWIPE,addSwipeTranslation} from './directSwipeState.js';
let list,release,remove,unregister;
beforeEach(()=>{
 vi.useFakeTimers();
 vi.stubGlobal('matchMedia',()=>({matches:false}));
 list=document.createElement('main');list.className='screen';document.body.append(list);
 list.innerHTML=['a','b'].map(id=>`<article data-swipe-row data-swipe-enabled="true" id="${id}"><div data-swipe-content><span>${id}</span><button>Edit</button><button data-reorder-kind="exercise">Move</button><input/></div><button data-swipe-fallback>Fallback</button></article>`).join('');
 for(const el of list.children)el.getBoundingClientRect=()=>({width:320});
 remove=vi.fn();unregister=registerSwipeRemoval(row('a'),remove);release=bindSwipeRowActions(list);
});
afterEach(()=>{release();unregister();list.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const row=id=>list.querySelector(`#${id}`),body=id=>row(id).querySelector('[data-swipe-content] span');
function touch(type,target,x,y=100,multi=false,id=1){const e=new Event(type,{bubbles:true,cancelable:true}),p={identifier:id,clientX:x,clientY:y};Object.assign(e,{touches:type==='touchend'||type==='touchcancel'?[]:[p,...multi?[{...p,identifier:2}]:[]],changedTouches:[p]});target.dispatchEvent(e);return e;}
function swipe(id='a',x=280,to=200,y=100){touch('touchstart',body(id),x);const e=touch('touchmove',body(id),to,y);touch('touchend',body(id),to,y);return e;}
it.each([320,390,430])('uses exactly half of actual %spx row width, independent of velocity',width=>{
 row('a').getBoundingClientRect=()=>({width});
 for(const distance of [20,width*.2,width*.499,width*.5,width*.6]){
  remove.mockClear();swipe('a',width-20,width-20-distance);
  expect(remove).toHaveBeenCalledTimes(distance>=width*.5?1:0);
  expect(row('a').hasAttribute('data-swipe-active')).toBe(false);
 }
});
it.each(['body','handle'])('%s tracks continuously, arms without mutating, disarms on reversal and has no open state',origin=>{
 const target=origin==='body'?body('a'):row('a').querySelector('[data-reorder-kind]');
 touch('touchstart',target,280);touch('touchmove',target,272);expect(row('a').hasAttribute('data-swipe-active')).toBe(false);
 for(const distance of [20,80,160,200]){touch('touchmove',target,280-distance);expect(row('a').querySelector('[data-swipe-content]').style.transform).toContain(`-${distance}px`);expect(row('a').hasAttribute('data-swipe-armed')).toBe(distance>=160);expect(remove).not.toHaveBeenCalled();}
 touch('touchmove',target,250);expect(row('a').hasAttribute('data-swipe-armed')).toBe(false);
 touch('touchend',target,250);expect(remove).not.toHaveBeenCalled();expect(row('a').querySelector('[data-swipe-content]').style.transform).toBe('');
 touch('touchstart',target,280);touch('touchmove',target,80);touch('touchend',target,80);expect(remove).toHaveBeenCalledOnce();
});
it('release can disarm, but cannot commit a threshold that was never visibly armed',()=>{
 touch('touchstart',body('a'),280);touch('touchmove',body('a'),80);touch('touchend',body('a'),250);expect(remove).not.toHaveBeenCalled();
 touch('touchstart',body('a'),280);touch('touchmove',body('a'),200);touch('touchend',body('a'),80);expect(remove).not.toHaveBeenCalled();
 touch('touchstart',body('a'),280);touch('touchmove',body('a'),100);touch('touchend',body('a'),140);expect(remove).toHaveBeenCalledOnce();
});
it('vertical body, ambiguous diagonal, opposite direction and the reserved left edge never consume or mutate',()=>{
 for(const [x,to,y] of [[280,277,125],[280,260,120],[24,-200,100],[4,-200,100],[200,240,100]]){
  expect(swipe('a',x,to,y).defaultPrevented).toBe(false);expect(remove).not.toHaveBeenCalled();
 }
 touch('touchstart',body('a'),280);touch('touchmove',body('a'),277,130);touch('touchmove',body('a'),20,130);touch('touchend',body('a'),20,130);expect(remove).not.toHaveBeenCalled();
});
it('only consumes the release click on the affected row; a new tap and unrelated row tap work',()=>{
 const clicked=vi.fn();list.addEventListener('click',clicked);swipe();body('a').click();expect(clicked).not.toHaveBeenCalled();body('b').click();expect(clicked).toHaveBeenCalledOnce();
 swipe();body('a').dispatchEvent(new Event('pointerdown',{bubbles:true}));body('a').click();expect(clicked).toHaveBeenCalledTimes(2);
 for(const control of row('a').querySelectorAll('button:not([data-reorder-kind]),input')){touch('touchstart',control,280);touch('touchmove',control,40);touch('touchend',control,40);}
 expect(remove).not.toHaveBeenCalled();
});
it.each(['touchcancel','multi','identifier','resize','visibilitychange','scroll','blur','Escape','disabled','unmount','inert'])('resets armed state safely on %s',async reason=>{
 touch('touchstart',body('a'),280);touch('touchmove',body('a'),80);
 if(reason==='multi')touch('touchstart',body('a'),80,100,true);
 else if(reason==='identifier')touch('touchmove',body('a'),80,100,false,3);
 else if(reason==='touchcancel')touch('touchcancel',body('a'),80);
 else if(reason==='Escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
 else if(reason==='disabled'){row('a').dataset.swipeEnabled='false';touch('touchmove',body('a'),70);}
 else if(reason==='unmount'){const r=row('a');r.remove();await Promise.resolve();expect(r.hasAttribute('data-swipe-active')).toBe(false);return;}
 else if(reason==='inert'){list.setAttribute('inert','');await Promise.resolve();}
 else (['scroll','visibilitychange'].includes(reason)?document:window).dispatchEvent(new Event(reason));
 touch('touchend',body('a'),80);expect(remove).not.toHaveBeenCalled();expect(row('a').hasAttribute('data-swipe-active')).toBe(false);expect(row('a').hasAttribute('data-swipe-armed')).toBe(false);
});
it('reduced motion tracks immediately and returns without a settle animation',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));swipe();expect(row('a').querySelector('[data-swipe-content]').style.transition).toBe('none');
});
it('right-add retains release-only commits, reversibility, edge/button/scroll protection',()=>{
 release();const add=vi.fn();row('a').dataset.catalogId='plank';release=bindSwipeRowActions(list,{mode:'add',onAdd:add});
 touch('touchstart',body('a'),60);touch('touchmove',body('a'),240);expect(add).not.toHaveBeenCalled();touch('touchend',body('a'),240);touch('touchend',body('a'),240);expect(add).not.toHaveBeenCalled();vi.advanceTimersByTime(ADD_SWIPE.duration);expect(add).toHaveBeenCalledExactlyOnceWith('plank');
 for(const cancel of ['return','touchcancel','resize','scroll','multi']){touch('touchstart',body('a'),60);touch('touchmove',body('a'),150);if(cancel==='return')touch('touchmove',body('a'),90);else if(cancel==='multi')touch('touchstart',body('a'),150,100,true);else if(cancel==='touchcancel')touch('touchcancel',body('a'),150);else (cancel==='resize'?window:document).dispatchEvent(new Event(cancel));touch('touchend',body('a'),90);vi.advanceTimersByTime(200);}
 for(const [x,to,y] of [[4,120,100],[24,140,100],[60,80,200],[140,60,100]])swipe('a',x,to,y);
 for(const control of row('a').querySelectorAll('button,input')){touch('touchstart',control,60);touch('touchmove',control,150);touch('touchend',control,150);}
 expect(add).toHaveBeenCalledTimes(1);
});
it('semantic row-body buttons support right-add, suppress the release click and keep later taps',()=>{
 release();const add=vi.fn(),preview=vi.fn(),target=document.createElement('button');target.dataset.swipeBody='';target.textContent='Preview';target.onclick=preview;body('a').replaceWith(target);row('a').dataset.catalogId='plank';release=bindSwipeRowActions(list,{mode:'add',onAdd:add});
 touch('touchstart',target,60);touch('touchmove',target,245);touch('touchend',target,245);target.click();vi.advanceTimersByTime(ADD_SWIPE.duration);expect(add).toHaveBeenCalledExactlyOnceWith('plank');expect(preview).not.toHaveBeenCalled();
 target.dispatchEvent(new Event('pointerdown',{bubbles:true}));target.click();expect(preview).toHaveBeenCalledOnce();
});
it.each(['add','remove'])('%s shares visual/feedback/release hysteresis and exactly one event per re-arm',mode=>{
 release();const threshold=vi.fn(),add=vi.fn();row('a').dataset.catalogId='plank';release=bindSwipeRowActions(list,{mode,onAdd:add,feedback:{threshold}});
 const start=mode==='add'?60:280,sign=mode==='add'?1:-1,target=body('a');
 touch('touchstart',target,start);
 const steps=mode==='add'?[[.2,false,0],[.24,true,1],[.3,true,1],[.23,true,1],[.19,true,1],[.17,false,1],[.23,false,1],[.24,true,2]]:[[.2,false,0],[.5,true,1],[.6,true,1],[.49,true,1],[.41,true,1],[.39,false,1],[.49,false,1],[.5,true,2]];
 for(const [fraction,armed,ticks] of steps){
  touch('touchmove',target,start+sign*320*fraction);expect(row('a').hasAttribute('data-swipe-armed')).toBe(armed);expect(threshold).toHaveBeenCalledTimes(ticks);expect(add).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();
 }
 touch('touchend',target,start+sign*160);touch('touchend',target,start+sign*160);vi.advanceTimersByTime(ADD_SWIPE.duration);expect(mode==='add'?add:remove).toHaveBeenCalledOnce();
});
it.each([true,false])('Add returns immediately from the finger position without a wipe, and publishes only after settling (saved %s)',saved=>{
 release();const target=body('a'),content=row('a').querySelector('[data-swipe-content]');const animations=[];
 content.animate=vi.fn((frames,options)=>{const animation={cancel:vi.fn(),frames,options};animations.push(animation);return animation;});
 const add=vi.fn(()=>{expect(content.style.transform).toBe('');expect(content.style.opacity).toBe('');return saved;});row('a').dataset.catalogId='plank';release=bindSwipeRowActions(list,{mode:'add',onAdd:add});
 touch('touchstart',target,60);touch('touchmove',target,240);const position=content.style.transform;touch('touchend',target,240);
 expect(add).not.toHaveBeenCalled();expect(animations).toHaveLength(1);expect(animations[0].frames).toEqual([{transform:position},{transform:'translate3d(0px,0,0)'}]);expect(animations[0].options.duration).toBe(140);expect(row('a').hasAttribute('data-swipe-armed')).toBe(true);
 touch('touchstart',target,60);touch('touchmove',target,240);touch('touchend',target,240);expect(add).not.toHaveBeenCalled();
 animations[0].onfinish();animations[0].onfinish();vi.advanceTimersByTime(500);expect(add).toHaveBeenCalledExactlyOnceWith('plank');expect(animations).toHaveLength(1);expect(row('a').hasAttribute('data-swipe-committing')).toBe(false);expect(row('a').hasAttribute('data-swipe-adding')).toBe(false);expect(content.style.transform).toBe('');
});

it.each([280,350,390,450])('Add uses actual %spx row width; grey/green always predicts release',width=>{
 release();const add=vi.fn(),threshold=vi.fn();row('a').dataset.catalogId='plank';row('a').getBoundingClientRect=()=>({width});release=bindSwipeRowActions(list,{mode:'add',onAdd:add,feedback:{threshold}});
 for(const fraction of [.1,.2,.239,.24,.3,.8]){
  add.mockClear();threshold.mockClear();touch('touchstart',body('a'),60);touch('touchmove',body('a'),60+width*fraction);
  expect(row('a').hasAttribute('data-swipe-armed')).toBe(fraction>=.24);expect(threshold).toHaveBeenCalledTimes(fraction>=.24?1:0);expect(add).not.toHaveBeenCalled();
  touch('touchend',body('a'),60+width*fraction);vi.advanceTimersByTime(140);expect(add).toHaveBeenCalledTimes(fraction>=.24?1:0);
 }
 // A fast, short last visible movement cannot arm via an unseen release point.
 add.mockClear();touch('touchstart',body('a'),60);touch('touchmove',body('a'),60+width*.1);touch('touchend',body('a'),60+width*.7);vi.advanceTimersByTime(140);expect(add).not.toHaveBeenCalled();
});
it('Add is 1:1 around arm, resists only the extra travel and reverses without jumps',()=>{
 release();release=bindSwipeRowActions(list,{mode:'add'});const content=row('a').querySelector('[data-swipe-content]');touch('touchstart',body('a'),60);
 for(const distance of [40,76.8,95,160,260,95,65,50]){touch('touchmove',body('a'),60+distance);expect(parseFloat(content.style.transform.slice(12))).toBeCloseTo(addSwipeTranslation(distance,320),8);}
 expect(row('a').hasAttribute('data-swipe-armed')).toBe(false);touch('touchend',body('a'),110);vi.advanceTimersByTime(140);expect(content.style.transform).toBe('');
});
it.each(['blur','resize','pagehide','visibilitychange','unmount','dispose'])('pending Add is cancelled on %s without stale mutation',reason=>{
 release();const add=vi.fn();row('a').dataset.catalogId='plank';release=bindSwipeRowActions(list,{mode:'add',onAdd:add});const target=body('a'),content=row('a').querySelector('[data-swipe-content]');
 touch('touchstart',target,60);touch('touchmove',target,150);touch('touchend',target,150);
 if(reason==='unmount')row('a').remove();else if(reason==='dispose')release();else (reason==='visibilitychange'?document:window).dispatchEvent(new Event(reason));
 vi.advanceTimersByTime(500);expect(add).not.toHaveBeenCalled();expect(content.style.transform).toBe('');
});
it('reduced-motion Add keeps tracking/armed cue and uses a short non-spring return',()=>{
 release();vi.stubGlobal('matchMedia',()=>({matches:true}));const add=vi.fn();row('a').dataset.catalogId='plank';release=bindSwipeRowActions(list,{mode:'add',onAdd:add});
 touch('touchstart',body('a'),60);touch('touchmove',body('a'),140);expect(row('a').hasAttribute('data-swipe-armed')).toBe(true);touch('touchend',body('a'),140);
 expect(row('a').querySelector('[data-swipe-content]').style.transition).toBe('transform 70ms ease-out');vi.advanceTimersByTime(69);expect(add).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(add).toHaveBeenCalledOnce();
});
