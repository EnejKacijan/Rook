import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('./aiAuthorization.js',()=>({aiAuthorizationHeaders:async()=>({authorization:'Bearer synthetic-test-user'})}));
import {AIService} from './aiService.js';
import {createReturningUserFixture} from './demoFixture.js';
import {adaptedTemplateForToday,applyCoachAction,estimatePersonalWorkoutMinutes} from './domain.js';
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

it.each([
  ['jutri','Jutri imam samo 30 minut.',null],
  ['sobota','Za soboto skrajšaj trening na 30 min.',{missingDate:true}],
  ['exact date','Za 2026-10-24 skrajšaj trening na 30 minut.',{wrongDate:true}],
  ['English','Shorten Saturday to 30 minutes.',null],
  ['German','Morgen habe ich nur 30 Minuten.',null],
  ['Spanish','El sábado solo tengo 30 minutos por la mañana.',{wrongDate:true}],
  ['French','Mon entraînement de samedi doit tenir en 30 minutes.',{missingDate:true}],
  ['Italian','Domani ho solo 30 minuti.',null],
  ['Portuguese','No sábado só tenho 30 minutos.',{wrongDate:true}],
  ['Croatian','Sutra imam samo 30 minuta.',{missingDate:true}],
  ['Russian','В субботу у меня только 30 минут.',{wrongDate:true}],
  ['Ukrainian','У суботу маю лише 30 хвилин.',null],
  ['Chinese','星期六我只有３０分钟。',{missingDate:true}],
  ['Japanese','土曜日は30分だけです。',{wrongDate:true}],
  ['Korean','토요일에는 30분만 있어요.',{missingDate:true}],
  ['Arabic','يوم السبت لدي ٣٠ دقيقة فقط.',{wrongDate:true}],
])('fits the selected future workout for %s when the provider has no usable date',async(_label,prompt,provider)=>{
  const state=createReturningUserFixture(0), target=new Date('2026-10-24T12:00:00');
  state.program.days[0].weekday='Fri';
  const original=structuredClone(state.program), saturday=adaptedTemplateForToday(state,target);
  const duration=estimatePersonalWorkoutMinutes(state,saturday);
  state.workouts=Array.from({length:6},(_,index)=>({
    ...structuredClone(saturday),id:'future-pace-'+index,programDayId:saturday.id,status:'completed',
    completedAt:new Date(Date.now()-(index+1)*3*86400000).toISOString(),
    durationSeconds:Math.round(duration*1.45*60),
    exercises:saturday.exercises.map(exercise=>({...exercise,sets:exercise.sets.map(set=>({...set,completed:true}))})),
  }));
  const aiAction=provider?{
    type:'adapt-today',minutes:35,exerciseIds:saturday.exercises.map(exercise=>exercise.exerciseId),
    ...(provider.wrongDate?{targetDate:'2026-10-23'}:{}),
  }:null;
  fetcher.mockResolvedValue({ok:true,json:async()=>({data:{text:'Tukaj je krajši trening.',action:aiAction}})});
  const reply=await AIService.coach(state,prompt,{requireRemoteSuccess:true});
  expect(reply.action).toMatchObject({
    targetDate:'2026-10-24',programDayId:saturday.id,requestedMinutes:30,
    durationCalibration:{sampleCount:6},
  });
  expect(reply.action.estimatedMinutes).toBeLessThanOrEqual(30);
  expect(state.todayAdaptation).toBeNull();
  const todaysWorkout=adaptedTemplateForToday(state);
  applyCoachAction(state,reply.action);
  expect(state.todayAdaptation).toMatchObject({date:'2026-10-24',estimatedMinutes:reply.action.estimatedMinutes});
  expect(adaptedTemplateForToday(state)).toEqual(todaysWorkout);
  expect(state.program).toEqual(original);
});
