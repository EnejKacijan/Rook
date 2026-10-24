import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('./aiAuthorization.js',()=>({aiAuthorizationHeaders:async()=>({authorization:'Bearer synthetic-test-user'})}));
import {AIService} from './aiService.js';
import {createReturningUserFixture} from './demoFixture.js';
import {createCoachDayContext} from './coachDayContext.js';
let fetcher;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T12:00:00'));fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{text:'Here is the selected workout.',action:null}})});vi.stubGlobal('fetch',fetcher);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('sends the actual selected future prescription to the backend and does not run today’s deterministic shortening',async()=>{
  const state=createReturningUserFixture(0),requestContext=createCoachDayContext(state,'2026-10-24');
  await AIService.coach(state,'Shorten this workout to 30 minutes.',{requestContext,requireRemoteSuccess:true});
  expect(fetcher).toHaveBeenCalledOnce();const body=JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.operation).toBe('coach');expect(body.payload.context.selectedDay).toMatchObject({date:'2026-10-24',occurrenceId:requestContext.occurrenceId,workout:{id:state.program.days[3].id}});
  expect(body.payload.context.todayStatus.date).toBe('2026-10-23');
});
it('routes an exact personal workout request before calling a model or the generic optional generator',async()=>{
  const state=createReturningUserFixture(0);const name=state.program.days[0].workoutName||state.program.days[0].name;
  const reply=await AIService.coach(state,`Repeat my same ${name} workout.`,{requireRemoteSuccess:true});
  expect(reply.action.type).toBe('reuse-existing-workout');expect(reply.action.choices[0].reference.dayId).toBe(state.program.days[0].id);expect(fetcher).not.toHaveBeenCalled();
});
it('replaces a model’s invented named optional session with the real original for review',async()=>{
  const state=createReturningUserFixture(0);const name=state.program.days[0].workoutName||state.program.days[0].name;
  fetcher.mockResolvedValueOnce({ok:true,json:async()=>({data:{text:'An optional workout.',action:{type:'add-today-workout',name:`${name} — optional (normal)`,targetDate:'2026-10-23',exerciseIds:['plank'],minutes:30}}})});
  const reply=await AIService.coach(state,'I want to train.',{requireRemoteSuccess:true});
  expect(fetcher).toHaveBeenCalledOnce();expect(reply.action.type).toBe('reuse-existing-workout');expect(reply.action.choices[0].reference.dayId).toBe(state.program.days[0].id);
});
