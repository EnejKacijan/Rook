import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {isoDay} from './domain.js';
import {calendarRange,calendarLocalDate,monthDays,shiftMonth,calendarDayPresentation} from './workoutCalendar.js';
import {bindWeekPager} from './weekPager.js';
import './monthCalendar.css';

export function CalendarIcon(){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-11 4h3v3H9z"/></svg>;}
// Status descriptions stay on the day control (or in the legend text).
// Both calendars use the same decorative ring / check / filled-dot rendering.
export function CalendarStatusMark({status, className = 'month-calendar-mark'}) {
  return <svg className={`calendar-status-mark ${className} is-${status}`} viewBox="0 0 10 10" width="8" height="8" aria-hidden="true" focusable="false">
    {status==='planned'&&<circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" className="calendar-status-ring"/>}
    {status==='active'&&<circle cx="5" cy="5" r="4.25" fill="currentColor"/>}
    {status==='completed'&&<path d="M1.2 5 4 7.8 8.8 2.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="calendar-status-check"/>}
  </svg>;
}
export function CalendarStatusSlot({statuses,week=false}) {
  const classes={active:'in-progress-dot',completed:'completed-dot',planned:'workout-dot'};
  return <span className="calendar-status-slot" aria-hidden="true">{statuses.map(status=><CalendarStatusMark key={status} status={status} className={week?classes[status]:'month-calendar-mark'}/>)}</span>;
}
export function MonthCalendar({state,selectedDate,header,onSelect,today=isoDay()}) {
  const [month,setMonth]=useState(()=>`${selectedDate.slice(0,7)}-01`);
  const [focused,setFocused]=useState(selectedDate),focusRequested=useRef(false),gridRef=useRef(null);
  const viewportRef=useRef(null),trackRef=useRef(null),pager=useRef(null),pagerOptions=useRef(null);
  const {min,max}=calendarRange(state,today),available=key=>key>=min&&key<=max;
  const pages=useMemo(()=>[-1,0,1].map(offset=>{
    const key=offset===0?month:shiftMonth(month,offset);
    return {key,offset,dates:monthDays(key)};
  }),[month]);
  const dates=pages[1].dates;
  // Disabled cells show only their date and "outside available dates". Avoid
  // deriving workout occurrences for days the calendar cannot display/select.
  const statuses=useMemo(()=>calendarDayPresentation(state,[...new Set(pages.flatMap(page=>page.dates))].filter(key=>key>=min&&key<=max)),[state,pages,min,max]);
  const formatters=useMemo(()=>({
    month:new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}),
    day:new Intl.DateTimeFormat('en',{weekday:'long',month:'long',day:'numeric',year:'numeric'}),
  }),[]);
  const monthLabel=formatters.month.format(calendarLocalDate(month));
  const dateLabel=key=>formatters.day.format(calendarLocalDate(key));
  const tabDate=dates.includes(focused)&&available(focused)?focused:dates.find(key=>available(key)&&key.slice(0,7)===month.slice(0,7));
  useLayoutEffect(()=>{if(focusRequested.current){gridRef.current?.querySelector(`[data-date="${tabDate}"]`)?.focus();focusRequested.current=false;}},[tabDate,month]);
  const moveMonth=direction=>{
    const next=shiftMonth(month,direction);
    if(next.slice(0,7)<min.slice(0,7)||next.slice(0,7)>max.slice(0,7))return;
    setMonth(next);
  };
  const canMove=direction=>{const next=shiftMonth(month,direction).slice(0,7);return next>=min.slice(0,7)&&next<=max.slice(0,7);};
  pagerOptions.current={canGoBack:canMove(-1),canGoForward:canMove(1),disabled:false};
  useLayoutEffect(()=>{
    pager.current=bindWeekPager({root:viewportRef.current,viewport:viewportRef.current,track:trackRef.current,
      dragSelector:'[data-month-drag]',phaseAttribute:'monthPhase',getOptions:()=>pagerOptions.current,
      onCommit:direction=>{
        if(gridRef.current?.contains(document.activeElement))focusRequested.current=true;
        flushSync(()=>setMonth(current=>shiftMonth(current,direction)));
      }});
    return ()=>{pager.current?.destroy();pager.current=null;};
  },[]);
  useLayoutEffect(()=>{pager.current?.reset();},[month,min,max]);
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
    <div className="month-calendar-viewport" ref={viewportRef} data-month-drag>
      <div className="month-calendar-pages" ref={trackRef}>
      {pages.map(page=><div key={page.key} className="month-calendar-grid" role="grid" aria-labelledby={page.offset===0?'workout-calendar-month':undefined} aria-hidden={page.offset!==0} inert={page.offset!==0} ref={page.offset===0?gridRef:undefined}>
      <div role="row" className="month-calendar-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><span role="columnheader" key={day}>{day}</span>)}</div>
      {Array.from({length:page.dates.length/7},(_,row)=><div role="row" key={row}>{page.dates.slice(row*7,row*7+7).map(key=>{
        const {markers=[],label:stateLabel}=statuses[key]||{};
        const enabled=available(key),selected=key===selectedDate,isToday=key===today;
        return <div role="gridcell" aria-selected={selected} key={key}><button type="button" data-date={key}
          data-sheet-initial-focus={page.offset===0&&key===tabDate?'true':undefined} tabIndex={page.offset===0&&key===tabDate?0:-1}
          disabled={!enabled} aria-current={isToday?'date':undefined} aria-pressed={selected}
          aria-label={`${dateLabel(key)}${isToday?', today':''}${selected?', selected':''}, ${enabled?stateLabel:'outside available dates'}`}
          className={`${selected?'is-selected ':''}${isToday?'is-today ':''}${key.slice(0,7)!==page.key.slice(0,7)?'is-other-month':''}`}
          onFocus={()=>setFocused(key)} onKeyDown={event=>keydown(event,key)} onClick={()=>choose(key)}>
          <span className="month-calendar-number">{calendarLocalDate(key).getDate()}</span>
          <CalendarStatusSlot statuses={enabled ? markers : []}/>
        </button></div>;
      })}</div>)}
      </div>)}
      </div>
    </div>
    <div className="month-calendar-legend" aria-label="Calendar legend">{state.program&&<span><CalendarStatusMark status="planned"/>Planned</span>}<span><CalendarStatusMark status="completed"/>Completed</span><span><CalendarStatusMark status="active"/>In progress</span></div>
    {selectedDate !== today && <button type="button" className="month-calendar-today" onClick={()=>choose(today)}>TODAY</button>}
  </main>;
}
