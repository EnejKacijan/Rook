// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {bindTrainingReorder} from './trainingReorder.js';
import {bindSwipeRowActions,registerSwipeRemoval} from './swipeRowAction.js';
let root,release,swipeRelease,view,commit,gesture,preview,feedback;
beforeEach(()=>{
 vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:false}));vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(()=>fn(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
 root=document.createElement('section');root.className='plan-editor';root.style.rowGap='2px';document.body.append(root);
 root.innerHTML=['b','c','d','e'].map((id,i)=>`<article data-swipe-row data-swipe-enabled="true" data-day-id="queue" data-reorder-block-index="${i}"><button data-swipe-action>Remove</button><div data-swipe-content><span>${id}</span><button class="rook-reorder-handle" data-reorder-kind="exercise" data-day-id="queue" data-exercise-id="${id}">Grip</button></div></article>`).join('');
 Object.defineProperties(root,{clientHeight:{value:200},scrollHeight:{value:500}});root.scrollTop=0;
 root.getBoundingClientRect=()=>({top:100,bottom:300,left:0,right:350,width:350,height:200});
 [...root.children].forEach((row,i)=>row.getBoundingClientRect=()=>({top:100+i*50-root.scrollTop,bottom:148+i*50-root.scrollTop,left:0,right:350,width:350,height:48}));
 preview=document.createElement('div');document.body.append(preview);view=vi.fn();commit=vi.fn(()=>true);gesture={current:null};
 feedback=Object.fromEntries(['pickup','selection','drop','threshold'].map(key=>[key,vi.fn()]));
 swipeRelease=bindSwipeRowActions(root,{feedback});
 release=bindTrainingReorder(root,{reorderGestureRef:gesture,reorderFrameRef:{current:null},reorderPreviewRef:{current:preview},cancelReorderRef:{current:null},suppressReorderClickUntil:{current:0},commitReorderRef:{current:commit},setReorderView:view,feedback,getCandidate:({exerciseId})=>({label:exerciseId}),getScroller:()=>root});
});
afterEach(()=>{release();swipeRelease();root.remove();preview.remove();vi.useRealTimers();vi.unstubAllGlobals();});
const handle=i=>root.children[i].querySelector('[data-reorder-kind]'),body=i=>root.children[i].querySelector('span');
function pointer(type,target,y,x=320,extra={}){const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,pointerType:'mouse',button:0,clientX:x,clientY:y,...extra});target.dispatchEvent(e);return e;}
function touch(type,target,y,x=320,multi=false){const e=new Event(type,{bubbles:true,cancelable:true});const point={identifier:1,clientX:x,clientY:y};Object.assign(e,{touches:type==='touchend'||type==='touchcancel'?[]:[point,...multi?[{...point,identifier:2}]:[]],changedTouches:[point]});target.dispatchEvent(e);return e;}
it('a handle tap is a no-op; movement starts mouse and pen immediately; row body never reorders',()=>{
 pointer('pointerdown',handle(0),125);pointer('pointerup',handle(0),125);expect(commit).not.toHaveBeenCalled();view.mockClear();
 pointer('pointerdown',body(0),125);pointer('pointermove',body(0),245);pointer('pointerup',body(0),245);expect(view).not.toHaveBeenCalled();
 for(const pointerType of ['mouse','pen']){pointer('pointerdown',handle(0),125,320,{pointerType});pointer('pointermove',handle(0),235,320,{pointerType});expect(gesture.current.active).toBe(true);pointer('pointerup',handle(0),235,320,{pointerType});}
 expect(commit).toHaveBeenCalledTimes(2);expect(commit.mock.calls[0][0]).toMatchObject({exerciseId:'b',targetIndex:2});
});
it('touch has no hold delay and no-movement touch does not commit or change order',()=>{
 touch('touchstart',handle(0),125);expect(gesture.current).toBeNull();touch('touchmove',handle(0),133,319);expect(gesture.current).toBeNull();
 touch('touchend',handle(0),125);expect(commit).not.toHaveBeenCalled();
 touch('touchstart',handle(0),125);touch('touchmove',handle(0),235);touch('touchend',handle(0),235);
 expect(commit).toHaveBeenCalledOnce();expect(commit.mock.calls[0][0].exerciseId).toBe('b');
});
it('one arbiter chooses direction on the handle and never switches until release',()=>{
 const remove=vi.fn(),unregister=registerSwipeRemoval(root.children[0],remove);
 touch('touchstart',handle(0),125);touch('touchmove',handle(0),128,300);
 expect(gesture.current).toBeNull();expect(root.children[0].hasAttribute('data-swipe-active')).toBe(true);
 touch('touchmove',handle(0),250,100);expect(gesture.current).toBeNull();expect(remove).not.toHaveBeenCalled();
 touch('touchend',handle(0),250,100);expect(remove).toHaveBeenCalledOnce();expect(commit).not.toHaveBeenCalled();
 touch('touchstart',handle(0),125);touch('touchmove',handle(0),145,317);expect(gesture.current.active).toBe(true);
 touch('touchmove',handle(0),235,80);expect(root.querySelector('[data-swipe-active]')).toBeNull();touch('touchend',handle(0),235,80);
 expect(commit).toHaveBeenCalledOnce();expect(remove).toHaveBeenCalledOnce();unregister();
});
it('pending diagonal does not lift or block scroll; clear body vertical yields for the entire gesture',()=>{
 touch('touchstart',handle(0),125);const diagonal=touch('touchmove',handle(0),145,300);expect(diagonal.defaultPrevented).toBe(false);expect(gesture.current).toBeNull();touch('touchcancel',handle(0),145,300);
 touch('touchstart',body(0),125);expect(touch('touchmove',body(0),145,317).defaultPrevented).toBe(false);touch('touchmove',body(0),235,60);touch('touchend',body(0),235,60);expect(commit).not.toHaveBeenCalled();expect(root.querySelector('[data-swipe-active]')).toBeNull();
});
it.each(['mouse','pen'])('%s handle left removes without reordering; unrelated pointer cannot release it',pointerType=>{
 const remove=vi.fn(),unregister=registerSwipeRemoval(root.children[0],remove);
 pointer('pointerdown',handle(0),125,320,{pointerType});pointer('pointermove',handle(0),128,100,{pointerType});
 pointer('pointerup',handle(0),128,100,{pointerType,pointerId:2});expect(remove).not.toHaveBeenCalled();
 pointer('pointerup',handle(0),128,100,{pointerType});expect(remove).toHaveBeenCalledOnce();expect(commit).not.toHaveBeenCalled();unregister();
});
it.each(['touchcancel','pointercancel','Escape','blur','resize','visibilitychange','cleanup','multitouch'])('cancels %s without a mutation, stale transforms or a scrolling timer',reason=>{
 touch('touchstart',handle(0),125);touch('touchmove',handle(0),245);
 if(reason==='cleanup')release();else if(reason==='multitouch')touch('touchstart',handle(0),245,320,true);
 else if(reason==='Escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
 else if(reason==='pointercancel')pointer(reason,handle(0),245,320,{pointerType:'touch'});
 else if(reason==='touchcancel')touch(reason,handle(0),245);
 else (reason==='visibilitychange'?document:window).dispatchEvent(new Event(reason));
 expect(commit).not.toHaveBeenCalled();expect(gesture.current).toBeNull();expect(root.querySelector('.reorder-live-source')).toBeNull();
 expect([...root.children].every(row=>row.style.transform==='')).toBe(true);
 const top=root.scrollTop;vi.advanceTimersByTime(300);expect(root.scrollTop).toBe(top);
});
it('autoscroll moves only the supplied list, stops away from its edge, and cancels on release',()=>{
 const documentTop=document.documentElement.scrollTop;
 touch('touchstart',handle(3),275);touch('touchmove',handle(3),295);vi.advanceTimersByTime(200);
 expect(root.scrollTop).toBeGreaterThan(0);expect(root.scrollTop).toBeLessThanOrEqual(300);expect(document.documentElement.scrollTop).toBe(documentTop);
 touch('touchmove',handle(3),200);const atMiddle=root.scrollTop;vi.advanceTimersByTime(200);expect(root.scrollTop).toBe(atMiddle);
 touch('touchend',handle(3),200);vi.advanceTimersByTime(200);expect(root.scrollTop).toBe(atMiddle);
});
it('reduced motion still follows touch and settles without positional animations',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));const animation=vi.fn();for(const row of root.children)row.animate=animation;
 touch('touchstart',handle(0),125);touch('touchmove',handle(0),235);expect(preview.style.getPropertyValue('--reorder-drag-y')).toBe('110px');touch('touchend',handle(0),235);expect(commit).toHaveBeenCalledOnce();expect(animation).not.toHaveBeenCalled();
});
it('the release click is suppressed, and cleanup removes ownership',()=>{
 const clicked=vi.fn();root.addEventListener('click',clicked);
 pointer('pointerdown',handle(0),125);pointer('pointermove',handle(0),235);pointer('pointerup',handle(0),235);handle(0).click();expect(clicked).not.toHaveBeenCalled();
 release();vi.advanceTimersByTime(500);body(0).click();expect(clicked).toHaveBeenCalledOnce();
});

it('feedback follows locked mode and canonical slots, including hysteresis and backwards motion',()=>{
 touch('touchstart',handle(3),275);expect(feedback.pickup).not.toHaveBeenCalled();
 touch('touchmove',handle(3),263);expect(feedback.pickup).toHaveBeenCalledOnce();expect(feedback.selection).not.toHaveBeenCalled();
 for(const [y,count] of [[215,1],[214,1],[225,1],[165,2],[115,3],[185,4],[180,4]]){
  touch('touchmove',handle(3),y);expect(feedback.selection).toHaveBeenCalledTimes(count);
 }
 expect(gesture.current.targetIndex).toBe(2);touch('touchend',handle(3),180);expect(feedback.drop).toHaveBeenCalledOnce();expect(feedback.pickup).toHaveBeenCalledOnce();
});
it.each(['horizontal','original','cancel','failed'])('%s does not emit a successful reorder drop',reason=>{
 if(reason==='failed')commit.mockReturnValue(false);
 touch('touchstart',handle(0),125);
 if(reason==='horizontal'){touch('touchmove',handle(0),125,100);expect(feedback.pickup).not.toHaveBeenCalled();touch('touchend',handle(0),125,100);}
 else {touch('touchmove',handle(0),reason==='original'?140:235);touch(reason==='cancel'?'touchcancel':'touchend',handle(0),reason==='original'?140:235);expect(feedback.pickup).toHaveBeenCalledOnce();}
 expect(feedback.drop).not.toHaveBeenCalled();
});
