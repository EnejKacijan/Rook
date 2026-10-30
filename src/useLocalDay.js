import {useEffect,useState} from 'react';
import {subscribeNativeForeground} from './nativeLifecycle.js';

export const localCalendarDay=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
// Presentation periods follow the device's local day without changing the
// selected workout date, editor state, active session or navigation intent.
export function useLocalDay() {
  const [day,setDay]=useState(localCalendarDay);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState!=='hidden')setDay(localCalendarDay());};
    const timer=setInterval(refresh,60000),releaseNative=subscribeNativeForeground(refresh);
    window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',refresh);
    return ()=>{clearInterval(timer);releaseNative();window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  return day;
}
