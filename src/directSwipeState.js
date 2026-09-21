// The same hysteresis drives paint, threshold feedback and release for both directions.
export const DIRECT_SWIPE = Object.freeze({arm:.5, disarm:.4});
// Add has a modest commit distance; Remove retains its more deliberate pull.
export const ADD_SWIPE = Object.freeze({arm:.24, disarm:.18, resistanceStart:.3, resistanceRange:.45, duration:140, reducedDuration:70});
export function addSwipeTranslation(distance,width) {
  if(width<=0)return 0;
  const start=width*ADD_SWIPE.resistanceStart,range=width*ADD_SWIPE.resistanceRange;
  return distance<=start?Math.max(0,distance):start+range*(1-Math.exp(-(distance-start)/range));
}
export function trackDirectSwipe(state, distance, width, {release=false, cancel=false, thresholds=DIRECT_SWIPE}={}) {
  if(cancel || !width)return 'cancel';
  const wasArmed=state==='tracking-armed';
  const armed=wasArmed ? distance>=width*thresholds.disarm
    : !release && distance>=width*thresholds.arm;
  // An unseen pointerup coordinate can disarm, but cannot newly arm an unarmed row.
  return release ? armed?'commit':'cancel' : armed?'tracking-armed':'tracking-unarmed';
}
