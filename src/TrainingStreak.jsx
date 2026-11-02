import {useEffect,useMemo,useRef,useState} from 'react';
import {useLocalDay,localCalendarDay} from './useLocalDay.js';
import {weeklyTrainingStreak,claimStreakPresentation,completedWorkoutStreakGain,completedActivityStreakGain,weekendStreakReminder,streakReminderHidden,setStreakReminderHidden} from './trainingStreak.js';
import {StreakAtRiskMoment,StreakGainMoment} from './StreakMoments.jsx';
import {ProfileInformation} from './ProfileInformation.jsx';
import {NavigationChevron} from './NavigationChevron.jsx';
import {AnimatedDetails} from './AnimatedDetails.jsx';
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
  const weeks=value=>`${value} ${value===1?'week':'weeks'}`;
  return <section className="training-streak-card" aria-label="Weekly training streak">
    <ProfileInformation label={`Weekly streak: ${weeks(streak.current)}. View details`} title="Your weekly streak" Modal={Modal} backgroundRef={backgroundRef}
      triggerClassName="training-streak-entry" triggerIcon={<NavigationChevron/>} sheetClassName="training-streak-detail"
      triggerContent={<><span className="training-streak-heading">Weekly streak</span><span className="training-streak-current"><StreakNumber value={streak.current}/><span>{streak.current===1?'week':'weeks'}</span></span></>}>
      <TrainingStreakDetails streak={streak}/>
    </ProfileInformation>
  </section>;
}
function TrainingStreakDetails({streak}) {
  const status=streak.earnedThisWeek?`${streak.workoutsThisWeek} ${streak.workoutsThisWeek===1?'workout':'workouts'} logged this week. This week counts.`:
    streak.current?'This week is still open. Log a workout by Sunday to keep your streak going.':
      streak.best?'Log a workout this week to start a new streak.':'Your first workout starts your streak.';
  const dateText=date=>new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric'}).format(date);
  const rangeText=key=>{const from=new Date(`${key}T12:00:00`),to=new Date(from);to.setDate(to.getDate()+6);return `${dateText(from)} – ${dateText(to)}`;};
  const symbols={counted:'✓',open:'○',missed:'–','no-history':'·'};
  return <>
    <dl className="streak-detail-stats">{[['Current',streak.current],['Best',streak.best]].map(([label,value])=><div key={label}><dt>{label}</dt><dd><strong>{value}</strong> <span>{value===1?'week':'weeks'}</span></dd></div>)}</dl>
    <p className="streak-detail-status">{status}</p>
    <section className="streak-week-history" aria-label="Last 6 training weeks">
      <h2>Last 6 weeks</h2>
      <ol className="streak-week-calendar">{streak.recentWeeks.map(week=>{
        const date=new Date(`${week.week}T12:00:00`),description=week.trained?`${week.count} ${week.count===1?'workout':'workouts'}, week counted`:week.status==='open'?'Still open':week.status==='missed'?'No workout logged, streak interrupted':'No training history yet';
        return <li key={week.week} className={`streak-week is-${week.status}${week.current?' is-current':''}`} aria-label={`${rangeText(week.week)}: ${description}${week.current?'. This week.':''}`}>
          <div aria-hidden="true"><time dateTime={week.week}><span>{new Intl.DateTimeFormat('en',{month:'short'}).format(date)}</span><strong>{date.getDate()}</strong></time><span className="streak-week-mark">{symbols[week.status]}</span></div>
        </li>;
      })}</ol>
      <p className="streak-week-legend"><span>✓ Counted</span><span>○ Still open</span><span>– No workout</span><span>· No history</span></p>
    </section>
    <p className="streak-detail-rule">One workout per week is enough, Monday to Sunday. Missing a planned workout won’t break your streak; a full week without one does.</p>
    <AnimatedDetails className="streak-counting-details"><summary>How it counts</summary><div>
      <p>Finish a strength workout with at least one logged set, or complete at least one minute of cardio, conditioning or mobility.</p>
      <p>Rest days fit your streak. You don’t need to train or open ROOK every day. More workouts in the same week won’t add extra weeks.</p>
      <p>Your saved history, including imported workouts, determines the count. Editing, removing or continuing a workout can update it.</p>
    </div></AnimatedDetails>
  </>;
}
export function CompletedWorkoutStreak({state,session,priorWorkouts,live=false,persistenceFailed=false,Modal}) {
  const gain=completedWorkoutStreakGain(state,session,priorWorkouts);
  return <StreakReward state={state} gain={gain} live={live} persistenceFailed={persistenceFailed} Modal={Modal}/>;
}
export function CompletedActivityStreak({state,session,priorOptionalSessions,Modal}) {
  const gain=completedActivityStreakGain(state,session,priorOptionalSessions);
  return <StreakReward state={state} gain={gain} live Modal={Modal}/>;
}
function StreakReward({state,gain,live,persistenceFailed=false,Modal}) {
  const animate=useStreakMotion({enabled:Boolean(gain&&live&&!persistenceFailed),profileId:state.profile.id,kind:'gain',stamp:gain?.week});
  // The big moment rides on the same once-per-week receipt as the counter roll.
  const [moment,setMoment]=useState(false);
  useEffect(()=>{if(animate&&Modal)setMoment(true);},[animate,Modal]);
  if(!gain||persistenceFailed)return null;
  return <>{moment&&<StreakGainMoment Modal={Modal} gain={gain} onClose={()=>setMoment(false)}/>}<section className={`completion-streak${animate?' is-gaining':''}`} aria-label={`${gain.current}-week streak`}>
    <div><span className="completion-streak-label">Weekly streak</span><strong><StreakNumber value={gain.current} previous={gain.previous} animate={animate}/><span>{gain.current===1?'week':'weeks'}</span></strong></div>
    {animate&&<span className="streak-gain-label">{gain.previous===0?'Streak started':'+1 week'}</span>}
  </section></>;
}
export function RestDayStreak({state,date}) {
  const streak=useTrainingStreak(state);
  const eligible=Boolean(date===localCalendarDay()&&streak.current&&streak.earnedThisWeek&&!state.activeWorkout&&!state.activeOptionalSession);
  if(!eligible)return null;
  return <p className="rest-streak-note"><span className="rest-streak-mark" aria-hidden="true">✓</span>
    <span>Rest day · {streak.current}-week streak secured</span></p>;
}

const REMINDER_EVENT='rook-streak-reminder-change';
function useWeekendStreakReminder(state,date) {
  const day=useLocalDay(),[,refresh]=useState(0);
  useEffect(()=>{const update=()=>refresh(count=>count+1);window.addEventListener(REMINDER_EVENT,update);return()=>window.removeEventListener(REMINDER_EVENT,update);},[]);
  const reminder=useMemo(()=>weekendStreakReminder(state,new Date(),date),
    [state.workouts,state.optionalSessions,state.activeWorkout,state.activeOptionalSession,date,day]);
  const profileId=state.profile?.id;
  const hidden=Boolean(reminder)&&streakReminderHidden(profileId,reminder.week);
  const setHidden=value=>{
    if(!reminder)return;
    setStreakReminderHidden(profileId,reminder.week,value);
    window.dispatchEvent(new Event(REMINDER_EVENT));
  };
  return {reminder,hidden,setHidden};
}
// The weekend reminder lives only in its once-per-week sheet. After dismissal
// Today has no persistent streak copy, extra row or Hide button.
export function WeekendStreakReminder({state,date,Modal,momentAllowed=true}) {
  const streak=useTrainingStreak(state),{reminder,hidden,setHidden}=useWeekendStreakReminder(state,date);
  const profileId=state.profile?.id;
  // Once per profile and week: the first Today visit of the weekend opens a
  // tall sheet. Never over another sheet; a blocked store means no sheet.
  const momentKey=reminder?`${profileId}:${reminder.week}`:null;
  const [moment,setMoment]=useState(null),momentTried=useRef(null);
  useEffect(()=>{
    if(!reminder||hidden||!momentAllowed||!Modal){setMoment(null);return;}
    const attempt=`${profileId}:${reminder.week}`;
    if(momentTried.current===attempt||document.querySelector('.modal-layer'))return;
    momentTried.current=attempt;
    setMoment(claimStreakPresentation(profileId,'riskMoment',reminder.week)?attempt:null);
  },[reminder,hidden,momentAllowed,Modal,profileId]);
  if(!reminder||hidden||!momentAllowed||moment!==momentKey)return null;
  return <StreakAtRiskMoment key={momentKey} Modal={Modal} reminder={reminder} best={streak.best}
    onClose={muted=>{setMoment(null);if(muted)setHidden(true);}}/>;
}
