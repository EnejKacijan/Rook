import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {isoDay} from './domain.js';
import {calendarRange,calendarLocalDate,monthDays,shiftMonth,calendarDayStates} from './workoutCalendar.js';
import './monthCalendar.css';

export function CalendarIcon(){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-11 4h3v3H9z"/></svg>;}
export function MonthCalendar({state,selectedDate,header,onSelect,today=isoDay()}) {
  const [month,setMonth]=useState(()=>`${selectedDate.slice(0,7)}-01`);
  const [focused,setFocused]=useState(selectedDate),focusRequested=useRef(false),gridRef=useRef(null);
  const {min,max}=calendarRange(state,today),available=key=>key>=min&&key<=max;
  const dates=useMemo(()=>monthDays(month),[month]);
  const statuses=useMemo(()=>calendarDayStates(state,dates),[state,dates]);
  const monthLabel=new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(calendarLocalDate(month));
  const dateLabel=key=>new Intl.DateTimeFormat('en',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(calendarLocalDate(key));
  const tabDate=dates.includes(focused)&&available(focused)?focused:dates.find(key=>available(key)&&key.slice(0,7)===month.slice(0,7));
  useLayoutEffect(()=>{if(focusRequested.current){gridRef.current?.querySelector(`[data-date="${tabDate}"]`)?.focus();focusRequested.current=false;}},[tabDate,month]);
  const moveMonth=direction=>{
    const next=shiftMonth(month,direction);
    if(next.slice(0,7)<min.slice(0,7)||next.slice(0,7)>max.slice(0,7))return;
    setMonth(next);
  };
  const choose=key=>{const latest=calendarRange(state,today);if(key>=latest.min&&key<=latest.max)onSelect(key);};
  const keydown=(event,key)=>{
    const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};let next;
    const date=calendarLocalDate(key);
    if(event.key in offsets){date.setDate(date.getDate()+offsets[event.key]);next=isoDay(date);}
    else if(event.key==='Home'||event.key==='End'){date.setDate(date.getDate()-(date.getDay()+6)%7+(event.key==='End'?6:0));next=isoDay(date);}
    else if(event.key==='PageUp'||event.key==='PageDown')next=shiftMonth(key,event.key==='PageUp'?-1:1);
    else return;
    event.preventDefault();next=next<min?min:next>max?max:next;if(next===key)return;focusRequested.current=true;
    setFocused(next);setMonth(`${next.slice(0,7)}-01`);
  };
  return <main className="screen detail-screen content-fit-screen month-calendar-screen" role="dialog" aria-modal="true" aria-label="Workout calendar">
    {header}
    <div className="month-calendar-toolbar">
      <button type="button" aria-label="Previous month" disabled={month.slice(0,7)<=min.slice(0,7)} onClick={()=>moveMonth(-1)}>‹</button>
      <h2 id="workout-calendar-month" aria-live="polite">{monthLabel}</h2>
      <button type="button" aria-label="Next month" disabled={month.slice(0,7)>=max.slice(0,7)} onClick={()=>moveMonth(1)}>›</button>
    </div>
    <div className="month-calendar-grid" role="grid" aria-labelledby="workout-calendar-month" ref={gridRef}>
      <div role="row" className="month-calendar-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><span role="columnheader" key={day}>{day}</span>)}</div>
      {Array.from({length:dates.length/7},(_,row)=><div role="row" key={row}>{dates.slice(row*7,row*7+7).map(key=>{
        const {complete,planned,active}=statuses[key],status=active?'active':complete?'completed':planned?'planned':null;
        const enabled=available(key),selected=key===selectedDate,isToday=key===today;
        const stateLabel=status==='active'?'workout in progress':status==='completed'?'completed workout':status==='planned'?'planned workout':'rest day';
        return <div role="gridcell" aria-selected={selected} key={key}><button type="button" data-date={key}
          data-sheet-initial-focus={key===tabDate?'true':undefined} tabIndex={key===tabDate?0:-1}
          disabled={!enabled} aria-current={isToday?'date':undefined} aria-pressed={selected}
          aria-label={`${dateLabel(key)}${isToday?', today':''}${selected?', selected':''}, ${enabled?stateLabel:'outside available dates'}`}
          className={`${selected?'is-selected ':''}${isToday?'is-today ':''}${key.slice(0,7)!==month.slice(0,7)?'is-other-month':''}`}
          onFocus={()=>setFocused(key)} onKeyDown={event=>keydown(event,key)} onClick={()=>choose(key)}>
          <span className="month-calendar-number">{calendarLocalDate(key).getDate()}</span>
          <span className={`month-calendar-mark ${enabled&&status?`is-${status}`:''}`} aria-hidden="true">{enabled&&status==='completed'?'✓':''}</span>
        </button></div>;
      })}</div>)}
    </div>
    <div className="month-calendar-legend" aria-label="Calendar legend"><span><i className="month-calendar-mark is-planned" aria-hidden="true"/>Planned</span><span><i className="month-calendar-mark is-completed" aria-hidden="true">✓</i>Completed</span><span><i className="month-calendar-mark is-active" aria-hidden="true"/>In progress</span></div>
    <p className="month-calendar-range">Browse recorded weeks and your current schedule.</p>
    <button type="button" className="month-calendar-today" disabled={!available(today)} onClick={()=>choose(today)}>TODAY</button>
  </main>;
}
