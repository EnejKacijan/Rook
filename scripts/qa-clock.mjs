// A Wednesday leaves both past and future occurrences in the same fixture week.
// Keep elapsed time/timers live; only move the calendar origin. Node fixtures
// and browser startup must agree, including near local midnight.
export const qaClockOffset = new Date('2026-09-23T12:00:00').getTime() - Date.now();
export function installQaCalendarClock(offset) {
 const NativeDate=Date;
 class CalendarDate extends NativeDate {
  constructor(...args){super(...(args.length?args:[NativeDate.now()+offset]));}
  static now(){return NativeDate.now()+offset;}
 }
 globalThis.Date=CalendarDate;
}
installQaCalendarClock(qaClockOffset);
