import { useEffect, useRef, useState } from 'react';
import { AIService } from './aiService.js';
import { watchCoachAuth } from './aiAuthorization.js';
import { createCoachAvailability } from './coachAvailability.js';
import { subscribeNativeForeground } from './nativeLifecycle.js';
import { trackFunnelEvent } from './analytics.js';

export function useCoachAvailability({ profileId, enabled = true, visiting = false }) {
  const [value, setValue] = useState({ state: 'connecting', reason: 'unknown', auth: 'pending', network: navigator.onLine ? 'online' : 'offline' });
  const controller = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const runtime = createCoachAvailability({ status: () => AIService.status(),
      watchAuth: watchCoachAuth,
      onChange: setValue,
      telemetry: properties => trackFunnelEvent('coach_availability_changed', properties),
    });
    controller.current = runtime;
    runtime.start();
    const online = () => void runtime.check('online');
    const offline = () => runtime.offline();
    const resume = () => { if (document.visibilityState === 'visible') void runtime.check('resume'); };
    const pageshow = event => { if (event.persisted) resume(); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('pageshow', pageshow);
    document.addEventListener('visibilitychange', resume);
    const release = subscribeNativeForeground(() => void runtime.check('resume'));
    return () => {
      runtime.stop();
      if (controller.current === runtime) controller.current = null;
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('pageshow', pageshow);
      document.removeEventListener('visibilitychange', resume);
      release();
    };
  }, [profileId, enabled]);
  useEffect(() => { if (visiting) void controller.current?.check('visit'); }, [visiting]);
  return { ...value, retry: () => controller.current?.check('manual'),
    failure: error => controller.current?.failure(error), success: () => controller.current?.success() };
}
