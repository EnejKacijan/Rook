// Discrete training-list feedback only. No audio session or native-control hacks.
const pulses = Object.freeze({selection:6, threshold:6, pickup:9, drop:10});

export function createVibrationAdapter({navigator: nav = () => globalThis.navigator, document: doc = () => globalThis.document} = {}) {
  let rejected = false;
  return {
    capabilities: () => ({transport:typeof nav()?.vibrate === 'function' ? 'vibration-api' : 'none', hardware:'unverified', rejected}),
    request(event) {
      const device=nav(), page=doc();
      if(rejected || typeof device?.vibrate !== 'function')return 'unavailable';
      if(page?.visibilityState === 'hidden' || device.userActivation?.hasBeenActive === false)return 'suppressed';
      try {
        // A true return only confirms API acceptance, never a physical motor.
        if(device.vibrate(pulses[event]) === false){rejected=true;return 'unavailable';}
        return 'requested';
      } catch {rejected=true;return 'unavailable';}
    },
  };
}

// An explicit adapter is also the future native-wrapper/test integration point.
export function createInteractionFeedback({adapter=createVibrationAdapter(), enabled=()=>true,
  reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  now=()=>performance.now()} = {}) {
  let lastRequest=-Infinity, lastDiscrete=-Infinity;
  const emit=event=>{
    const time=now(), duplicateDrop=event==='drop' && time-lastDiscrete<80;
    if(event!=='drop')lastDiscrete=time;
    if(!enabled() || reducedMotion() || duplicateDrop || time-lastRequest<24)return 'suppressed';
    lastRequest=time;
    try{return adapter.request(event);}catch{return 'unavailable';}
  };
  return Object.fromEntries(Object.keys(pulses).map(event=>[event,()=>emit(event)]));
}

export const interactionFeedback = createInteractionFeedback();
