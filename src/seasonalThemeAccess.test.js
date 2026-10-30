import {expect,it} from 'vitest';
import halloween from './seasons/halloween.js';
import {seasonalAccessPolicy,seasonalThemeAvailability,seasonalThemeCanApply,seasonalThemeChoices,seasonalThemeReleased} from './seasonalThemeAccess.js';

const at=day=>new Date(`${day}T12:00:00`);
const free={enabled:true,status:'free'},pro={enabled:true,status:'active'},unknown={enabled:true,status:'unknown'};
it.each([free,pro,unknown,undefined])('makes the entire inclusive season free regardless of subscription status: %j',access=>{
  for(const day of ['2026-10-01','2026-10-31','2026-11-02'])
    expect(seasonalThemeAvailability(halloween,{access,date:at(day),showAll:false})).toBe('free');
});
it('offers released out-of-season themes only with active access, without treating unknown as Free',()=>{
  const date=at('2026-11-03');
  expect(seasonalThemeAvailability(halloween,{access:pro,date})).toBe('pro');
  expect(seasonalThemeAvailability(halloween,{access:free,date})).toBe('pro-required');
  expect(seasonalThemeAvailability(halloween,{access:unknown,date})).toBe('unknown');
  expect(seasonalThemeAvailability(halloween,{date,showAll:false})).toBe('season-ended');
});
it('keeps legacy review visibility separate from a subscription capability',()=>{
  const date=at('2026-11-03');
  expect(seasonalThemeAvailability(halloween,{date,showAll:true})).toBe('free');
  expect(seasonalThemeAvailability(halloween,{access:free,date,showAll:true})).toBe('pro-required');
  expect(seasonalThemeAvailability(halloween,{access:unknown,date,showAll:true})).toBe('unknown');
});
it('does not fabricate active access from unrelated purchase or preference fields',()=>{
  for(const value of [{enabled:true,active:true},{enabled:true,status:'expired'},{enabled:true,status:'ACTIVE'},{enabled:true,keep:true},{status:'active'}]){
    expect(seasonalThemeCanApply(seasonalThemeAvailability(halloween,{access:value,date:at('2026-11-03'),showAll:false}))).toBe(false);
  }
  expect(seasonalAccessPolicy({enabled:true,status:'active',willRenew:false}).status).toBe('active');
});
it('never exposes an unregistered or not-yet-released season through the Pro collection',()=>{
  const future={...halloween,id:'future',releaseYear:2027},date=at('2026-10-28');
  expect(seasonalThemeAvailability(null,{access:pro,date})).toBe('unavailable');
  expect(seasonalThemeAvailability(future,{access:pro,date,showAll:true})).toBe('unavailable');
  expect(seasonalThemeChoices('forest',date,[halloween,future],pro,false)).toEqual({current:[halloween],yearRound:[]});
  expect(seasonalThemeReleased(future,at('2027-10-01'))).toBe(true);
});
it('groups currently free themes separately from the released year-round collection',()=>{
  const date=at('2026-11-03');
  expect(seasonalThemeChoices('halloween',date,[halloween],free,false)).toEqual({current:[],yearRound:[halloween]});
  expect(seasonalThemeChoices('halloween',date,[halloween],undefined,false)).toEqual({current:[],yearRound:[]});
});
it('handles cross-year windows and repeated free seasons without a claim or keep counter',()=>{
  const season={...halloween,releaseYear:2026,window:{start:'12-28',end:'01-07'}};
  for(const day of ['2026-12-28','2027-01-07','2027-12-28'])
    expect(seasonalThemeAvailability(season,{access:free,date:at(day)})).toBe('free');
  expect(seasonalThemeAvailability(season,{access:free,date:at('2027-01-08')})).toBe('pro-required');
});
