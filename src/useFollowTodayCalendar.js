import {useCallback,useEffect,useLayoutEffect} from 'react';
import {calendarTodaySelection,withCalendarSelection} from './calendarNavigation.js';
import {subscribeNativeForeground} from './nativeLifecycle.js';

// The owner stays mounted across tabs. Editors/loggers keep their exact context;
// reconcile the viewing date before Today is painted again, never the session.
export function useFollowTodayCalendar({enabled,intent,update}) {
  const refresh=useCallback(()=>{
    if(!enabled || !intent.current.followToday)return;
    const selection=calendarTodaySelection();
    if(intent.current.date===selection.date)return;
    update(state=>withCalendarSelection(state,selection), {
      navigationDate:{...selection,followToday:true,onlyIfFollowingToday:true},
    });
  },[enabled,intent,update]);

  useLayoutEffect(()=>{refresh();},[refresh]);
  useEffect(()=>{
    if(!enabled)return;
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    const timer=setInterval(visible,30000);
    window.addEventListener('focus',refresh);
    window.addEventListener('pageshow',refresh);
    document.addEventListener('visibilitychange',visible);
    const releaseNative=subscribeNativeForeground(refresh);
    return ()=>{
      clearInterval(timer);
      window.removeEventListener('focus',refresh);
      window.removeEventListener('pageshow',refresh);
      document.removeEventListener('visibilitychange',visible);
      releaseNative();
    };
  },[enabled,refresh]);
}
