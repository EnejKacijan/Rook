import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {flushSync} from 'react-dom';
import {isoDay, weekDate, weekday, WEEKDAYS} from './domain.js';
import {calendarDayPresentation} from './workoutCalendar.js';
import {CalendarIcon, CalendarStatusSlot} from './MonthCalendar.jsx';
import {bindWeekPager} from './weekPager.js';

export function weekLabel(date) {
  const monday = weekDate('Mon', date), sunday = weekDate('Sun', date);
  const month = value => new Intl.DateTimeFormat('en', {month: 'short'}).format(value);
  const day = value => new Intl.DateTimeFormat('en', {day: 'numeric'}).format(value);
  return monday.getMonth() === sunday.getMonth() && monday.getFullYear() === sunday.getFullYear()
    ? `${month(monday)} ${day(monday)}–${day(sunday)}`
    : `${month(monday)} ${day(monday)}–${month(sunday)} ${day(sunday)}`;
}

function WeekStrip({page, today, selectDate}) {
  return <div className="week-strip" aria-label={page.label}>
    {page.days.map(({day, date, key, status}) => {
      const selected = key === page.selected, isToday = key === today;
      const workoutState = status.statuses.includes('completed') ? 'workout-completed'
        : status.planned || status.markers.length ? 'workout-planned' : 'workout-rest';
      return <button key={day} type="button"
        tabIndex={page.offset ? -1 : undefined}
        aria-label={`${day} ${date.getDate()}${isToday ? ', today' : ''}, ${status.label}`}
        aria-current={isToday ? 'date' : undefined} aria-pressed={selected}
        className={`${selected ? 'selected-day' : ''} ${isToday ? 'today-date' : ''} ${workoutState}`}
        onClick={() => { if (!page.offset && !selected) selectDate(day, date); }}>
        <small>{day[0]}</small><CalendarStatusSlot statuses={status.markers} week/><strong>{date.getDate()}</strong>
      </button>;
    })}
  </div>;
}

export function WeekPager({state, date, canGoBack, canGoForward, selectDate, onCommit,
  programName, openCalendar, calendarOpen}) {
  const root = useRef(null), viewport = useRef(null), track = useRef(null), labelTrack = useRef(null);
  const controller = useRef(null), options = useRef(null);
  const selected = isoDay(date), today = isoDay();
  const pages = useMemo(() => [0, -1, 1].map(offset => {
    const reference = new Date(`${selected}T12:00:00`);
    reference.setDate(reference.getDate() + offset * 7);
    const days = WEEKDAYS.map(day => { const date = weekDate(day, reference); return {day, date, key: isoDay(date)}; });
    const statuses = calendarDayPresentation(state, days.map(day => day.key));
    return {offset, label: weekLabel(reference), selected: isoDay(reference),
      days: days.map(day => ({...day, status: statuses[day.key]}))};
  }), [state, selected, today]);
  useLayoutEffect(() => {
    options.current = {canGoBack, canGoForward, disabled: calendarOpen, commit(direction) {
      const target = new Date(`${selected}T12:00:00`);
      target.setDate(target.getDate() + direction * 7);
      flushSync(() => selectDate(weekday(target), target));
      onCommit();
    }};
  });
  useLayoutEffect(() => {
    controller.current = bindWeekPager({root: root.current, viewport: viewport.current,
      track: track.current, labelTrack: labelTrack.current, getOptions: () => options.current,
      onCommit: direction => options.current.commit(direction)});
    return () => { controller.current.destroy(); controller.current = null; };
  }, []);
  useLayoutEffect(() => { controller.current?.reset(); }, [selected, canGoBack, canGoForward, calendarOpen]);
  const available = page => !page.offset || (page.offset < 0 ? canGoBack : canGoForward);
  return <div className="week-selector" ref={root}>
    <div className="screen-top">
      <div className="week-navigation" aria-label="Change week">
        <button type="button" aria-label="Previous week" disabled={!canGoBack} onClick={() => controller.current.arrow(-1)}>‹</button>
        <button type="button" className="week-calendar-trigger" data-week-drag
          aria-label={`Open calendar, ${pages[0].label}`} aria-haspopup="dialog" aria-expanded={calendarOpen} onClick={openCalendar}>
          <CalendarIcon/>
          <span className="week-range-viewport" aria-hidden="true"><span className="week-range-track" ref={labelTrack}>
            {pages.map(page => <span key={page.offset} style={{order: page.offset + 1}}>{available(page) ? page.label : ''}</span>)}
          </span></span>
        </button>
        <button type="button" aria-label="Next week" disabled={!canGoForward} onClick={() => controller.current.arrow(1)}>›</button>
      </div>
      <strong className="today-program-name">{programName}</strong>
    </div>
    <div className="week-pager-viewport" ref={viewport} data-week-drag>
      <div className="week-pager-track" ref={track}>
        {pages.map(page => <div key={page.offset} className="week-pager-page" data-week-offset={page.offset}
          style={{order: page.offset + 1}} aria-hidden={page.offset ? true : undefined} inert={page.offset ? '' : undefined}>
          {available(page) && <WeekStrip page={page} today={today} selectDate={selectDate}/>}
        </div>)}
      </div>
    </div>
  </div>;
}
