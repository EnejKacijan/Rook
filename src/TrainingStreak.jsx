import {useEffect,useMemo,useState} from 'react';
import {useCalendarDay} from './useCalendarDay.js';
import {weeklyTrainingStreak,claimStreakGain} from './trainingStreak.js';
import {StreakGainMoment} from './StreakMoments.jsx';
import {ProfileInformation} from './ProfileInformation.jsx';
import {AnimatedDetails} from './AnimatedDetails.jsx';
import {observeVisibleMotion} from './visibleMotion.js';
import './trainingStreak.css';

export function ProfileTrainingStreak({state,Modal,backgroundRef}) {
  const day = useCalendarDay();
  const streak = useMemo(() => weeklyTrainingStreak(state), [state.workouts, state.optionalSessions, day]);
  const weeks=value=>`${value} ${value===1?'week':'weeks'}`;
  return <section className="training-streak-card" aria-label="Weekly training streak">
    <ProfileInformation label={`Weekly streak: ${weeks(streak.current)}. View details`} title="Your weekly streak" Modal={Modal} backgroundRef={backgroundRef}
      triggerClassName="training-streak-entry" sheetClassName="training-streak-detail"
      triggerContent={<><span className="training-streak-heading">Weekly streak</span><span className="training-streak-current"><strong>{streak.current}</strong><span>{streak.current===1?'week':'weeks'}</span></span></>}>
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
export function StreakReward({gain, profileId, Modal, backgroundRef, headingRef, allowMoment=true}) {
  const [moment, setMoment] = useState(false);
  const week = gain?.week;
  useEffect(() => {
    const heading = headingRef.current;
    if (!week || !allowMoment || !heading) return undefined;
    let unobserve = () => {};
    const observe = () => {
      unobserve();
      if (document.visibilityState === 'hidden') return;
      unobserve = observeVisibleMotion([heading], () => {
        if (document.visibilityState !== 'hidden' && claimStreakGain(profileId, week)) setMoment(true);
      }, { after: [backgroundRef.current] });
    };
    observe();
    document.addEventListener('visibilitychange', observe);
    return () => {
      unobserve();
      document.removeEventListener('visibilitychange', observe);
    };
  }, [week, allowMoment, profileId, headingRef, backgroundRef]);
  if (!gain) return null;
  return <>
    {moment && <StreakGainMoment Modal={Modal} gain={gain} onClose={() => setMoment(false)}
      backgroundRef={backgroundRef} returnFocusRef={headingRef}/>}
    <section className="completion-streak" aria-label={`${gain.current}-week streak`}>
      <span className="completion-streak-label">Weekly streak</span>
      <strong>{gain.current} {gain.current === 1 ? 'week' : 'weeks'}</strong>
    </section>
  </>;
}
