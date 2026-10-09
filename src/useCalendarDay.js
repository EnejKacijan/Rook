import {useEffect,useState} from 'react';
import {isoDay} from './domain.js';

// Read-only clock for open action surfaces. It never changes selected dates or
// domain state, including when a historical day is selected across midnight.
export function useCalendarDay() {
  const [day,setDay]=useState(()=>isoDay());
  useEffect(()=>{
    const refresh=()=>setDay(isoDay());
    const timer=setInterval(refresh,30000);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  return day;
}
