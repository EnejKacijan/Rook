import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { blankState, buildProgram } from './domain.js';
import { addCalendarDays, applyFlexibleWeek, flexibleSessions, proposeFlexibleWeek } from './flexibleWeek.js';
const today='2026-09-06';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date(`${today}T12:00:00`));});afterEach(()=>vi.useRealTimers());
function fixture(){const s=blankState();Object.assign(s.profile,{goal:'Build muscle',experience:'Intermediate',daysPerWeek:5,availableDays:['Mon','Tue','Wed','Fri','Sat'],sessionMinutes:60,environment:'Commercial gym',equipment:['full gym'],priorities:['Balanced']});s.program=buildProgram(s.profile);s.program.trainingBlock.startDate=today;return s;}
const review=(s,indices,windowDays=7)=>proposeFlexibleWeek(s,{mode:'available',windowDays,availableDates:indices.map(i=>addCalendarDays(today,i))},today);
it('reproduces Sunday five-session/four-day contradiction as explicit insufficient capacity',()=>{
 const state=fixture(),before=structuredClone(state),result=review(state,[0,1,2,3]);expect(result).toMatchObject({status:'insufficient-capacity',remainingSessions:5,selectedDays:4});expect(result.error).not.toMatch(/No schedule changes/);expect(state).toEqual(before);expect(result.changes).toBeUndefined();expect(applyFlexibleWeek(state,result).status).not.toBe('applied');
});
it('returns no-change only when every effective remaining date fits',()=>{expect(review(fixture(),[1,2,3,5,6]).status).toBe('no-change');expect(review(fixture(),[0,1,2,3,4,5,6]).status).toBe('no-change');});
it('returns a complete selected-only original/adjusted review and applies once',()=>{
 const state=fixture(),result=review(state,[0,1,2,3,4]);expect(result.status).toBe('ready');expect(result.availabilitySchedule).toHaveLength(5);expect(result.availabilitySchedule.every(s=>s.toDate<='2026-09-10')).toBe(true);
 const next=applyFlexibleWeek(state,result).state;expect(next.program).toEqual(state.program);expect(next.profile).toEqual(state.profile);const upcoming=flexibleSessions(next).filter(s=>s.originalDate<='2026-09-12');expect(upcoming).toHaveLength(5);expect(new Set(upcoming.map(s=>s.logicalSessionId)).size).toBe(5);expect(upcoming.every(s=>s.scheduledDate<='2026-09-10')).toBe(true);expect(applyFlexibleWeek(next,result).status).toBe('stale');
});
it('expanded window accounts for both weeks and uses only selected carry dates',()=>{
 const indices=[0,1,2,3,7,8,9,10,12,13],state=fixture(),result=review(state,indices,14);expect(result.status).toBe('ready');expect(result.availabilitySchedule).toHaveLength(10);expect(result.availabilitySchedule.every(s=>indices.map(i=>addCalendarDays(today,i)).includes(s.toDate))).toBe(true);expect(result.availabilitySchedule.some(s=>s.fromDate<='2026-09-12'&&s.toDate>'2026-09-12')).toBe(true);
});
it('zero dates is capacity, not no-change; profile remains unchanged',()=>{const state=fixture(),profile=structuredClone(state.profile);expect(review(state,[])).toMatchObject({status:'insufficient-capacity',selectedDays:0});expect(state.profile).toEqual(profile);});
it('rejects hidden-window and invalid dates rather than silently discarding them',()=>{
 expect(review(fixture(),[0,1,2,3,7],7).status).toBe('conflict');
 expect(proposeFlexibleWeek(fixture(),{mode:'available',availableDates:['2026-02-30']},today).status).toBe('conflict');
});
