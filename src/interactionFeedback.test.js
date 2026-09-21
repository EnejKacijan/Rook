// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {createVibrationAdapter,createInteractionFeedback} from './interactionFeedback.js';
it('no API, denied API and throwing API never claim hardware feedback or retry rejection',()=>{
 for(const navigator of [{},{vibrate:vi.fn(()=>false)},{vibrate:vi.fn(()=>{throw Error('denied');})}]){
  const adapter=createVibrationAdapter({navigator:()=>navigator});
  expect(adapter.request('selection')).toBe('unavailable');expect(adapter.request('pickup')).toBe('unavailable');
  expect(adapter.capabilities().hardware).toBe('unverified');if(navigator.vibrate)expect(navigator.vibrate).toHaveBeenCalledOnce();
 }
});
it('accepted short pulses mean requested, not a verified motor; hidden and inactive pages are suppressed',()=>{
 const vibrate=vi.fn(()=>true),device={vibrate,userActivation:{hasBeenActive:false}},page={visibilityState:'visible'};
 const adapter=createVibrationAdapter({navigator:()=>device,document:()=>page});
 expect(adapter.request('pickup')).toBe('suppressed');device.userActivation.hasBeenActive=true;page.visibilityState='hidden';expect(adapter.request('pickup')).toBe('suppressed');
 page.visibilityState='visible';for(const event of ['selection','threshold','pickup','drop'])expect(adapter.request(event)).toBe('requested');
 expect(vibrate.mock.calls.map(([ms])=>ms)).toEqual([6,6,9,10]);expect(adapter.capabilities()).toMatchObject({transport:'vibration-api',hardware:'unverified'});
});
it('injected feedback respects preference/reduced motion, prevents storms and immediate duplicate drop',()=>{
 let time=0,enabled=true,reduced=false;const adapter={request:vi.fn(()=> 'requested')};
 const feedback=createInteractionFeedback({adapter,now:()=>time,enabled:()=>enabled,reducedMotion:()=>reduced});
 feedback.pickup();time=10;feedback.selection();time=40;feedback.selection();time=50;feedback.drop();time=150;feedback.drop();
 expect(adapter.request.mock.calls.flat()).toEqual(['pickup','selection','drop']);
 enabled=false;time=250;feedback.threshold();enabled=true;reduced=true;time=350;feedback.threshold();expect(adapter.request).toHaveBeenCalledTimes(3);
});
it('a future bridge exception does not escape the feedback abstraction',()=>{
 const feedback=createInteractionFeedback({adapter:{request(){throw Error('bridge offline');}},reducedMotion:()=>false});expect(()=>feedback.threshold()).not.toThrow();
});
