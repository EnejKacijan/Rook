import {useEffect,useMemo,useRef,useState} from 'react';
import {useLocalDay,localCalendarDay} from './useLocalDay.js';
import {weeklyTrainingStreak,claimStreakPresentation,completedWorkoutStreakGain,completedActivityStreakGain} from './trainingStreak.js';
import {ProfileInformation} from './ProfileInformation.jsx';
import './trainingStreak.css';

function useTrainingStreak(state) {
  const day=useLocalDay();
  return useMemo(()=>weeklyTrainingStreak(state),[state.workouts,state.optionalSessions,day]);
}
function useStreakMotion({enabled,profileId,kind,stamp}) {
  const [animate,setAnimate]=useState(false),attempted=useRef(null);
  const key=`${profileId}:${kind}:${stamp}`;
  useEffect(()=>{
    if(!enabled){setAnimate(false);return;}
    if(attempted.current===key)return;
    attempted.current=key;setAnimate(claimStreakPresentation(profileId,kind,stamp));
  },[enabled,key,profileId,kind,stamp]);
  return animate;
}
function StreakNumber({value,previous,animate}) {
  return <span className={`streak-number${animate?' is-gaining':''}`}>
    <span className="visually-hidden">{value}</span>
    {animate&&<span className="streak-number-old" aria-hidden="true">{previous}</span>}
    <span className="streak-number-current" aria-hidden="true">{value}</span>
  </span>;
}
export function ProfileTrainingStreak({state,Modal,backgroundRef}) {
  const streak=useTrainingStreak(state);
  const status=streak.earnedThisWeek?'This week counted':streak.current?'This week is still open':'Your first workout starts your streak.';
  return <section className="training-streak-card" aria-label="Weekly training streak">
    <h2 className="training-streak-heading">Weekly streak</h2>
    <div className="training-streak-stats"><p><StreakNumber value={streak.current}/><span className="visually-hidden"> {streak.current===1?'week':'weeks'}</span></p>
      <span className="training-streak-best">Best <strong>{streak.best}</strong></span></div>
    <ProfileInformation label="About your weekly streak" title="Your weekly streak" Modal={Modal} backgroundRef={backgroundRef}>
        <p>{status}</p>
        <p>Log at least one workout each week to keep your streak going. Weeks run Monday to Sunday.</p>
        <p>Strength workouts count when you finish with at least one logged set. Completed cardio, conditioning and mobility sessions count after one minute.</p>
        <p>Rest days fit your streak. You don’t need to train or open ROOK every day. More workouts in the same week won’t add extra weeks.</p>
        <p>Your saved history, including imported workouts, determines the count. Editing, removing or continuing a workout can update it.</p>
      </ProfileInformation>
  </section>;
}
export function CompletedWorkoutStreak({state,session,priorWorkouts,live=false,persistenceFailed=false}) {
  const gain=completedWorkoutStreakGain(state,session,priorWorkouts);
  return <StreakReward state={state} gain={gain} live={live} persistenceFailed={persistenceFailed}/>;
}
export function CompletedActivityStreak({state,session,priorOptionalSessions}) {
  const gain=completedActivityStreakGain(state,session,priorOptionalSessions);
  return <StreakReward state={state} gain={gain} live/>;
}
function StreakReward({state,gain,live,persistenceFailed=false}) {
  const animate=useStreakMotion({enabled:Boolean(gain&&live&&!persistenceFailed),profileId:state.profile.id,kind:'gain',stamp:gain?.week});
  if(!gain||persistenceFailed)return null;
  return <section className={`completion-streak${animate?' is-gaining':''}`} aria-label={`${gain.current}-week streak`}>
    <div><span className="completion-streak-label">Weekly streak</span><strong><StreakNumber value={gain.current} previous={gain.previous} animate={animate}/><span>{gain.current===1?'week':'weeks'}</span></strong></div>
    {animate&&<span className="streak-gain-label">{gain.previous===0?'Streak started':'+1 week'}</span>}
  </section>;
}
export function RestDayStreak({state,date}) {
  const streak=useTrainingStreak(state);
  const eligible=Boolean(date===localCalendarDay()&&streak.current&&streak.earnedThisWeek&&!state.activeWorkout&&!state.activeOptionalSession);
  if(!eligible)return null;
  return <p className="rest-streak-note"><span className="rest-streak-mark" aria-hidden="true">✓</span>
    <span>Rest day · {streak.current}-week streak secured</span></p>;
}
