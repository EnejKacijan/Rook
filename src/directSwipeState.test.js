// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {DIRECT_SWIPE,ADD_SWIPE,addSwipeTranslation,trackDirectSwipe} from './directSwipeState.js';
it.each([320,390,430])('shared %spx state stays armed in the hysteresis band and release never arms',width=>{
 let state='idle';
 for(const [fraction,wanted] of [[.2,'tracking-unarmed'],[.499,'tracking-unarmed'],[.5,'tracking-armed'],[.55,'tracking-armed'],[.49,'tracking-armed'],[.4,'tracking-armed'],[.399,'tracking-unarmed'],[.48,'tracking-unarmed'],[.5,'tracking-armed']]){
  state=trackDirectSwipe(state,width*fraction,width);expect(state).toBe(wanted);
  expect(trackDirectSwipe(state,width*fraction,width,{release:true})).toBe(wanted==='tracking-armed'?'commit':'cancel');
 }
 expect(trackDirectSwipe('tracking-unarmed',width*.8,width,{release:true})).toBe('cancel');
 expect(trackDirectSwipe(state,width*.1,width,{release:true})).toBe('cancel');expect(trackDirectSwipe(state,width*.8,width,{cancel:true})).toBe('cancel');
});
it.each([280,350,390,450])('Add %spx arms at 24%, disarms below 18%, and never changes Remove thresholds',width=>{
 expect(ADD_SWIPE.arm).toBeLessThan(DIRECT_SWIPE.arm);expect(DIRECT_SWIPE).toEqual({arm:.5,disarm:.4});let state='idle';
 for(const [fraction,wanted] of [[.1,'tracking-unarmed'],[.2,'tracking-unarmed'],[.239,'tracking-unarmed'],[.24,'tracking-armed'],[.23,'tracking-armed'],[.18,'tracking-armed'],[.179,'tracking-unarmed'],[.23,'tracking-unarmed'],[.24,'tracking-armed']]){
  state=trackDirectSwipe(state,width*fraction,width,{thresholds:ADD_SWIPE});expect(state).toBe(wanted);expect(trackDirectSwipe(state,width*fraction,width,{thresholds:ADD_SWIPE,release:true})).toBe(wanted==='tracking-armed'?'commit':'cancel');
 }
 expect(trackDirectSwipe('tracking-unarmed',width*.8,width,{thresholds:ADD_SWIPE,release:true})).toBe('cancel');
 expect(addSwipeTranslation(width*.24,width)).toBe(width*.24);expect(addSwipeTranslation(width*.3,width)).toBe(width*.3);
 expect(addSwipeTranslation(width*.6,width)).toBeGreaterThan(width*.3);expect(addSwipeTranslation(width*.6,width)).toBeLessThan(width*.6);
 expect(addSwipeTranslation(width*10,width)).toBeLessThan(width*.75);
});
