import React,{useEffect,useId,useLayoutEffect,useMemo,useReducer,useRef,useState} from 'react';
import {WeekStrip,weekLabel} from './WeekPager.jsx';
import {calendarDayPresentation} from './workoutCalendar.js';
import {blankState,buildProgram,isoDay,weekDate,roundedEstimate,WEEKDAYS} from './domain.js';
import {NavigationChevron} from './NavigationChevron.jsx';
import {ExerciseIllustration} from './ExerciseIllustration.jsx';
import {exerciseArt} from './exerciseArt.js';
import './firstRunWelcome.css';

export const WELCOME_PAGE_KEY='rook.first-run-welcome-page.v1';
const pages=[
  ['Your training. Your week.','See your workouts and rest days at a glance.'],
  ['Every rep counts.','Log your sets and follow your progress.'],
];
export const WELCOME_TOTAL_PAGES=pages.length+1;
const landingPage=pages.length;
const noop=()=>{};
// Clamp presentation progress from the old four-panel intro to the new landing.
function initialPage(){try{const value=Number(localStorage.getItem(WELCOME_PAGE_KEY));return Number.isInteger(value)&&value>=0&&value<4?Math.min(value,landingPage):0;}catch{return 0;}}
function useSampleTapGuard(){
  const contact=useRef(null);
  const begin=(x,y)=>{contact.current={x,y,moved:false};};
  const move=(x,y)=>{if(contact.current&&Math.hypot(x-contact.current.x,y-contact.current.y)>10)contact.current.moved=true;};
  const cancel=()=>{if(contact.current)contact.current.moved=true;};
  return {
    onPointerDownCapture:event=>{if(event.button===0)begin(event.clientX,event.clientY);},
    onPointerMoveCapture:event=>move(event.clientX,event.clientY),
    onPointerUpCapture:event=>move(event.clientX,event.clientY),
    onPointerCancelCapture:cancel,
    onTouchStartCapture:event=>{const touch=event.touches[0];if(event.touches.length===1)begin(touch.clientX,touch.clientY);else cancel();},
    onTouchMoveCapture:event=>{const touch=event.touches[0];if(event.touches.length===1)move(touch.clientX,touch.clientY);else cancel();},
    onTouchEndCapture:event=>{const touch=event.changedTouches[0];if(touch)move(touch.clientX,touch.clientY);},
    onTouchCancelCapture:cancel,
    onClickCapture:event=>{if(event.detail!==0&&contact.current?.moved){event.preventDefault();event.stopPropagation();contact.current=null;}},
  };
}
const fullWeekday=(_day,date)=>new Intl.DateTimeFormat('en',{weekday:'long'}).format(date);
function WeekExample({onTrySet}){
  const [selectedDay,setSelectedDay]=useState('Mon');
  const tapGuard=useSampleTapGuard();
  const sample=useMemo(()=>{
    const state=blankState();
    state.profile={...state.profile,goal:'Build muscle',experience:'Intermediate',daysPerWeek:3,availableDays:['Mon','Wed','Fri'],sessionMinutes:45,environment:'Commercial gym',equipment:['full gym'],priorities:[],onboardingComplete:true};
    state.program=buildProgram(state.profile);
    const date=weekDate('Mon');date.setDate(date.getDate()+7);
    state.selectedDate=isoDay(date);state.selectedDay='Mon';
    const days=WEEKDAYS.map(day=>{const value=weekDate(day,date);return {day,date:value,key:isoDay(value)};});
    const statuses=calendarDayPresentation(state,days.map(day=>day.key));
    return {state,page:{offset:0,label:weekLabel(date),days:days.map(day=>({...day,status:statuses[day.key]}))}};
  },[]);
  const selected=sample.page.days.find(day=>day.day===selectedDay);
  const workout=sample.state.program.days.find(day=>day.weekday===selectedDay);
  return <div className="welcome-week-example today-screen" {...tapGuard}>
    <div className="week-selector">
      <div className="screen-top welcome-sample-week-heading"><span className="welcome-week-hint">Tap a day</span></div>
      <div className="week-pager-viewport" role="group" aria-label="Sample week" data-welcome-interactive="true"><div className="week-pager-page" data-week-offset="0">
        <WeekStrip page={sample.page} selected={selected.key} today="" selectDate={day=>setSelectedDay(day)} dayLabel={fullWeekday}/>
      </div></div>
      <section className="today-hero welcome-today-hero">
        <div className="welcome-sample-day" aria-live="polite" aria-atomic="true">
          <div className="today-day-header"><span className="eyebrow">{fullWeekday(selectedDay,selected.date)}</span></div>
          <h2 className="workout-title compact-workout-title"><span className="workout-title-primary">{workout?.name||'Rest day'}</span></h2>
          <p className="welcome-today-meta">{workout?`${workout.exercises.length} exercises · About ${roundedEstimate(workout.estimatedMinutes)} min`:'Rest and recover.'}</p>
        </div>
        <div className="welcome-sample-try-slot">{workout&&<button type="button" className="button primary today-start-button" data-welcome-interactive="true" data-welcome-try-set="true" onClick={onTrySet}>Try a set</button>}</div>
      </section>
    </div>
  </div>;
}
function SampleCounter({label,className,value,onChange,step=1,min=0,max=300,disabled=false}){
  // Use the production logger's grid, hit areas and number styling. Only the
  // value is an output here: the disposable intro keeps the keyboard closed.
  return <div className={`stepper welcome-sample-stepper ${className}`} role="group" aria-label={label}>
    <button type="button" aria-label={`Decrease ${label}`} disabled={disabled||value<=min} onClick={()=>onChange(Math.max(min,value-step))}><span className="stepper-sign" aria-hidden="true">−</span></button>
    <output className="stepper-value" aria-label={label} aria-live="polite" aria-atomic="true">{value}</output>
    <button type="button" aria-label={`Increase ${label}`} disabled={disabled||value>=max} onClick={()=>onChange(Math.min(max,value+step))}><span className="stepper-sign" aria-hidden="true">+</span></button>
  </div>;
}
function LogExample(){
  const [{weight,reps,logged},dispatch]=useReducer((sample,action)=>{
    if(action.type==='toggle-log')return {...sample,logged:!sample.logged};
    if(sample.logged)return sample;
    return {...sample,[action.field]:action.value};
  },{weight:40,reps:8,logged:false});
  const [completing,setCompleting]=useState(false);
  useEffect(()=>{
    if(!logged){setCompleting(false);return;}
    // Reuse the real logger's set-completing styles and 260ms feedback window.
    setCompleting(true);
    const timer=setTimeout(()=>setCompleting(false),260);
    return()=>clearTimeout(timer);
  },[logged]);
  return <div className="welcome-log-example workout-screen"><div className="welcome-example-heading"><span>EXERCISE 1 OF 5</span><span>Set 1 of 3</span></div>
    <section className="exercise-heading has-illustration welcome-exercise-heading">
      <div className="exercise-heading-body">
        <span className="exercise-heading-art-button"><ExerciseIllustration className="exercise-heading-art welcome-exercise-art" src={exerciseArt({exerciseId:'barbell-bench-press'})} alt="" aria-hidden="true" decoding="async" draggable={false}/></span>
        <div className="exercise-heading-content"><h2 className="welcome-exercise-name">Bench press</h2><p className="exercise-meta">Target 3 × 6–10</p><small className="exercise-history-meta">Last: 37.5 kg × 8 reps</small></div>
      </div>
    </section>
    <div className="welcome-sample-controls" data-welcome-interactive="true">
      <div className="sets welcome-sample-sets">
        <div className="set-labels" aria-hidden="true"><span/><span className="set-load-heading"><span className="logger-column-label set-unit-label">KG</span></span><span className="set-reps-heading"><span className="logger-column-label">REPS</span></span><span className="set-done-heading"/></div>
        <div className={`set-row ${logged?'set-done':'set-active'}${logged&&completing?' set-completing':''}`}>
          <span className="set-index-label"><b>1</b></span>
          <SampleCounter label="sample weight" className="logger-load" value={weight} disabled={logged} onChange={value=>dispatch({type:'edit',field:'weight',value})} step={2.5}/>
          <SampleCounter label="sample reps" className="logger-reps" value={reps} disabled={logged} onChange={value=>dispatch({type:'edit',field:'reps',value})} min={1} max={50}/>
          <button type="button" className="check welcome-log-action" role="checkbox" aria-label={logged?'Undo logged sample set':'Log sample set'} aria-checked={logged} onClick={()=>dispatch({type:'toggle-log'})}><span className="check-mark" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M3.2 7.3l2.5 2.5L10.8 4.6"/></svg></span></button>
        </div>
      </div>
      <div className="welcome-sample-action-row"><p className="welcome-sample-guidance">{logged?'Set logged. Tap ✓ to undo.':'Adjust a set, then tap ✓.'}</p></div>
      <span className="visually-hidden" role="status">{logged?'Sample set logged. Nothing was saved.':''}</span>
    </div>
  </div>;
}
export function WelcomeProgress({page,totalPages=WELCOME_TOTAL_PAGES,onPrevious,onNext,previousLabel='Previous introduction page'}){
  return <nav className="welcome-progress" aria-label="Introduction pages">
    <button type="button" className="welcome-page-arrow" aria-label={previousLabel} disabled={!onPrevious} onClick={onPrevious}><NavigationChevron direction="left"/></button>
    <span className="welcome-dots" role="img" aria-label={`Page ${page+1} of ${totalPages}`}>{Array.from({length:totalPages},(_,index)=><i key={index} className={page===index?'active':''}/>)}</span>
    <button type="button" className="welcome-page-arrow" aria-label="Next introduction page" disabled={!onNext} onClick={onNext}><NavigationChevron/></button>
  </nav>;
}

export function useWelcomeGestures(move,{keyboard=true,buttonSwipes=false,allowEdge=false,onDrag=noop}={}){
  const gesture=useRef(null),wheelGesture=useRef(null),suppressClick=useRef(null);
  const zoomed=()=>(window.visualViewport?.scale||1)>1.01;
  const editable=target=>target.closest('input,textarea,select,[contenteditable="true"],[role="slider"],[data-welcome-interactive]')&&!target.closest('[inert]');
  const start=(x,y,target)=>{
    suppressClick.current=null;
    onDrag(0,false);
    const control=target.closest('button,a');
    gesture.current=!zoomed()&&(allowEdge||x>24)&&!editable(target)&&(!control||buttonSwipes||target.closest('[inert]'))?{x,y,target,locked:false}:null;
  };
  const track=(x,y)=>{
    if(zoomed()){gesture.current=null;onDrag(0,false);return;}
    const origin=gesture.current;if(!origin)return;
    const dx=Math.abs(x-origin.x),dy=Math.abs(y-origin.y);
    if(!origin.locked&&dy>=10&&dy*1.3>=dx)gesture.current=null;
    else if(dx>=10&&dx>dy*1.3)origin.locked=true;
    if(origin.locked)onDrag(x-origin.x,true);
  };
  const end=(x,y)=>{
    track(x,y);
    const origin=gesture.current;gesture.current=null;
    onDrag(0,false);
    if(origin?.locked){
      // A swipe beginning on an action row must never also activate that row.
      suppressClick.current={target:origin.target,until:performance.now()+600};
      if(Math.abs(x-origin.x)>=48)move(x<origin.x?1:-1,{distance:x-origin.x});
    }
  };
  const wheel=event=>{
    if(event.ctrlKey||zoomed()||editable(event.target)||Math.abs(event.deltaX)<=Math.abs(event.deltaY)*1.5)return;
    const previous=wheelGesture.current;
    const current=previous&&event.timeStamp-previous.at<180?previous:{distance:0,locked:false};
    const unit=event.deltaMode===1?16:event.deltaMode===2?event.currentTarget.clientWidth||window.innerWidth:1;
    current.at=event.timeStamp;current.distance+=event.deltaX*unit;wheelGesture.current=current;
    if(!current.locked&&Math.abs(current.distance)>=48){current.locked=true;move(current.distance>0?1:-1);}
  };
  return {
    onKeyDown:keyboard?event=>{if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&!zoomed()&&!editable(event.target)&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}}:undefined,
    onTouchStart:event=>{const t=event.touches[0];if(event.touches.length===1)start(t.clientX,t.clientY,event.target);else{gesture.current=null;onDrag(0,false);}},
    onTouchMove:event=>{
      const t=event.touches[0];
      if(event.touches.length!==1){gesture.current=null;onDrag(0,false);}else track(t.clientX,t.clientY);
    },
    onTouchEnd:event=>{const t=event.changedTouches[0];if(event.touches?.length){gesture.current=null;onDrag(0,false);}else if(t)end(t.clientX,t.clientY);},
    onTouchCancel:()=>{gesture.current=null;onDrag(0,false);},
    onPointerDown:event=>{if(event.pointerType==='mouse'&&event.button===0){start(event.clientX,event.clientY,event.target);if(gesture.current&&!event.target.closest('button,a'))event.preventDefault();}},
    onPointerMove:event=>{if(event.pointerType==='mouse')track(event.clientX,event.clientY);},
    onPointerUp:event=>{if(event.pointerType==='mouse')end(event.clientX,event.clientY);},
    onPointerCancel:()=>{gesture.current=null;onDrag(0,false);},
    onPointerLeave:event=>{if(event.pointerType==='mouse'){gesture.current=null;onDrag(0,false);}},
    onWheel:wheel,
    onClickCapture:event=>{
      const blocked=suppressClick.current;
      if(event.detail!==0&&blocked&&performance.now()<blocked.until&&(event.target===blocked.target||blocked.target.closest('button,a')?.contains(event.target))){
        event.preventDefault();event.stopPropagation();suppressClick.current=null;
      }
    },
  };
}

function IntroOnlyWelcome({onContinue,onSignIn,onRestore,Stepper}){
  const [page,setPage]=useState(()=>Math.min(initialPage(),pages.length-1)),[direction,setDirection]=useState(1);
  const titleId=useId(),totalPages=pages.length+1;
  const sampleEntry=useRef(false);
  useLayoutEffect(()=>{if(page===1&&sampleEntry.current){sampleEntry.current=false;document.getElementById(`${titleId}-1`)?.focus({preventScroll:true});}},[page,titleId]);
  const finish=action=>{
    // Returning from the functional landing resumes its immediately preceding
    // introduction page, even if Get started or Skip jumped there early.
    setPage(pages.length-1);
    try{localStorage.setItem(WELCOME_PAGE_KEY,String(pages.length-1));}catch{/* Optional presentation progress. */}
    action?.();
  };
  const move=delta=>{
    if(page+delta>=pages.length){finish(onContinue);return;}
    const next=Math.max(0,page+delta);if(next===page)return;
    setDirection(Math.sign(delta));setPage(next);
    try{localStorage.setItem(WELCOME_PAGE_KEY,String(next));}catch{/* Optional presentation progress. */}
  };
  const gestures=useWelcomeGestures(move);
  return <main className="onboarding entry-screen welcome-screen" aria-labelledby={`${titleId}-${page}`}>
    <header className="welcome-header"><span className="brand">ROOK</span><button type="button" className="welcome-quiet" onClick={()=>finish(onContinue)}>Skip intro</button></header>
    <section className="welcome-carousel" role="region" aria-roledescription="carousel" aria-label="ROOK introduction" tabIndex={0}
      {...gestures}>
      {pages.map(([title,description],index)=><div key={index} className="welcome-slide" role="group" aria-roledescription="slide" aria-label={`${index+1} of ${totalPages}`} data-active={page===index||undefined} aria-hidden={page!==index||undefined} inert={page!==index?'':undefined} style={{'--welcome-direction':direction}}>
        <div className="welcome-story" aria-live="polite" aria-atomic="true"><h1 id={`${titleId}-${index}`} tabIndex={-1}>{title}</h1><p>{description}</p></div>
        <figure className="welcome-visual" aria-label={index===0?'Try selecting a day in a sample Full Body plan. Nothing is saved.':'Try logging a sample Bench press set. Nothing is saved.'}><div>{index===0?<WeekExample onTrySet={()=>{sampleEntry.current=true;move(1);}}/>:<LogExample/>}</div><figcaption>Sample only · Nothing is saved</figcaption></figure>
      </div>)}
    </section>
    <footer className="welcome-actions"><WelcomeProgress page={page} totalPages={totalPages} onPrevious={page>0?()=>move(-1):undefined} onNext={()=>move(1)}/><div>{onSignIn&&<button type="button" className="welcome-quiet" onClick={()=>finish(onSignIn)}>Sign in</button>}{onRestore&&<button type="button" className="welcome-quiet" onClick={()=>finish(onRestore)}>Restore backup</button>}</div></footer>
  </main>;
}

// All pages live in this one horizontal track. Choosing the final page
// never opens a route or invokes the child-screen page-stack animation.
function WelcomePager({onContinue,onSignIn,onRestore,Stepper,renderLanding,startAtLanding=false}){
  const [page,setPage]=useState(()=>startAtLanding?landingPage:initialPage());
  const [motion,setMotion]=useState({from:null,duration:360});
  const host=useRef(null),measure=useRef(noop);
  const sampleEntry=useRef(false);
  const previousPage=useRef(page),titleId=useId();
  const select=(next,{distance=0}={})=>{
    next=Math.max(0,Math.min(landingPage,next));
    if(next===page)return;
    const width=host.current?.getBoundingClientRect().width||390;
    const remaining=Math.max(0,1-Math.abs(distance)/width);
    setMotion({from:Math.abs(next-page)>1?page:null,duration:Math.round(Math.max(160,360*Math.sqrt(remaining)))});
    setPage(next);
    try{localStorage.setItem(WELCOME_PAGE_KEY,String(next));}catch{/* Optional presentation progress. */}
    if(next===landingPage)onContinue?.();
  };
  const finish=action=>{select(landingPage);action?.();};
  const updateDrag=(x,active)=>{
    const root=host.current;if(!root)return;
    const offset=page===0&&x>0||page===landingPage&&x<0?x*.18:x;
    // Only the composited track moves on each touch event. Re-rendering the
    // calendar, logger and action page here adds work to the swipe's hot path.
    root.style.setProperty('--welcome-drag',`${offset}px`);
    if(active)root.setAttribute('data-dragging','true');else root.removeAttribute('data-dragging');
    if(active&&motion.from!==null)setMotion(current=>({...current,from:null}));
  };
  const gestures=useWelcomeGestures((delta,gesture)=>select(page+delta,gesture),{
    buttonSwipes:true,allowEdge:true,
    onDrag:updateDrag,
  });
  useEffect(()=>{
    if(motion.from===null)return;
    const timer=setTimeout(()=>setMotion(current=>({...current,from:null})),260);
    return()=>clearTimeout(timer);
  },[motion.from,page]);
  useEffect(()=>{
    const viewport=window.visualViewport;if(!viewport)return;
    const update=()=>{
      const root=host.current,zoomed=(viewport.scale||1)>1.01;
      root.toggleAttribute('data-zoomed',zoomed);
      if(zoomed){root.style.setProperty('--welcome-drag','0px');root.removeAttribute('data-dragging');}
    };
    update();viewport.addEventListener('resize',update);
    return()=>viewport.removeEventListener('resize',update);
  },[]);
  useLayoutEffect(()=>{
    const root=host.current;
    const panels=[...root.querySelectorAll('.welcome-pager-page')];
    const update=()=>{
      if(root.closest('[hidden]'))return;
      let visual=0,story=0;
      for(const panel of panels.slice(0,pages.length)){
        const body=panel.querySelector('.welcome-visual > div'),caption=panel.querySelector('figcaption');
        const heading=panel.querySelector('h1'),copy=panel.querySelector('.welcome-story p');
        const bodyBounds=body.getBoundingClientRect();
        visual=Math.max(visual,(caption?.getBoundingClientRect().bottom||bodyBounds.bottom)-bodyBounds.top);
        story=Math.max(story,copy.getBoundingClientRect().bottom-heading.getBoundingClientRect().top);
      }
      const write=(key,value)=>{const next=`${Math.ceil(value)}px`;if(root.style.getPropertyValue(key)!==next)root.style.setProperty(key,next);};
      write('--welcome-shared-visual',visual);
      write('--welcome-shared-story',story);
      for(const panel of panels){
        const content=panel.firstElementChild;
        const scrollable=content.getBoundingClientRect().height>panel.clientHeight+1;
        panel.setAttribute('data-scrollable',String(scrollable));
      }
    };
    measure.current=update;update();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):null;
    for(const panel of panels){
      observer?.observe(panel);
      observer?.observe(panel.firstElementChild);
      panel.querySelectorAll('.welcome-visual > div,figcaption,h1,.welcome-story p').forEach(node=>observer?.observe(node));
    }
    const resize=()=>{root.style.setProperty('--welcome-drag','0px');root.removeAttribute('data-dragging');update();};
    window.addEventListener('resize',resize);
    return()=>{observer?.disconnect();window.removeEventListener('resize',resize);measure.current=noop;};
  },[]);
  useLayoutEffect(()=>{
    measure.current();
    if(previousPage.current===page)return;
    previousPage.current=page;
    const panels=host.current.querySelectorAll('.welcome-pager-page');
    panels[page].scrollTop=0;
    if(sampleEntry.current&&page===1){sampleEntry.current=false;panels[page].querySelector('h1')?.focus({preventScroll:true});return;}
    const focused=document.activeElement;
    if(host.current.contains(focused)&&!panels[page].contains(focused)){
      const label=focused.getAttribute('aria-label');
      const equivalent=[...panels[page].querySelectorAll('button')].find(node=>!node.disabled&&node.getAttribute('aria-label')===label);
      (equivalent||panels[page].querySelector('.welcome-progress button:not(:disabled)')||panels[page].querySelector('button:not(:disabled)'))?.focus({preventScroll:true});
    }
  },[page]);
  return <section ref={host} className="welcome-pager" role="region" aria-roledescription="carousel" aria-label="ROOK introduction" tabIndex={0}
    data-no-edge-back="true" data-page={page+1} data-jumping={motion.from!==null||undefined}
    style={{'--welcome-page':page,'--welcome-settle-duration':`${motion.duration}ms`,'--welcome-jump-offset':motion.from===null?0:page-motion.from}} {...gestures}>
    <div className="welcome-pager-track">
      {Array.from({length:WELCOME_TOTAL_PAGES},(_,index)=><div key={index} className="welcome-pager-page" role="group" aria-roledescription="slide" aria-label={`${index+1} of ${WELCOME_TOTAL_PAGES}`}
        data-kind={index===landingPage?'landing':'intro'} data-active={page===index||undefined} data-leaving={motion.from===index||undefined} aria-hidden={page!==index||undefined} inert={page!==index?'':undefined}>
        {index===landingPage?renderLanding({backToIntro:()=>select(landingPage-1),inWelcomePager:true}):<main className="onboarding entry-screen welcome-screen" aria-labelledby={`${titleId}-${index}`}>
          <header className="welcome-header"><span className="brand">ROOK</span><button type="button" className="welcome-quiet" onClick={()=>select(landingPage)}>Skip intro</button></header>
          <section className="welcome-carousel">
            <div className="welcome-story"><h1 id={`${titleId}-${index}`} tabIndex={-1}>{pages[index][0]}</h1><p>{pages[index][1]}</p></div>
            <figure className="welcome-visual" aria-label={index===0?'Try selecting a day in a sample Full Body plan. Nothing is saved.':'Try logging a sample Bench press set. Nothing is saved.'}>
              <div>{index===0?<WeekExample onTrySet={()=>{sampleEntry.current=true;select(1);}}/>:<LogExample/>}</div><figcaption>Sample only · Nothing is saved</figcaption>
            </figure>
          </section>
          <footer className="welcome-actions"><WelcomeProgress page={index} onPrevious={index>0?()=>select(index-1):undefined} onNext={()=>select(index+1)}/><div>{onSignIn&&<button type="button" className="welcome-quiet" onClick={()=>finish(onSignIn)}>Sign in</button>}{onRestore&&<button type="button" className="welcome-quiet" onClick={()=>finish(onRestore)}>Restore backup</button>}</div></footer>
        </main>}
      </div>)}
    </div>
    <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">Step {page+1} of {WELCOME_TOTAL_PAGES}</span>
  </section>;
}

export function FirstRunWelcome(props){
  return props.renderLanding?<WelcomePager {...props}/>:<IntroOnlyWelcome {...props}/>;
}
