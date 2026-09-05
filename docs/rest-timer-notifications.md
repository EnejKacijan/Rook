# Rest Timer Notifications capability audit

ROOK stores an absolute `activeWorkout.rest.endsAt` timestamp. UI remaining time is always recalculated from `endsAt - Date.now()`, including `visibilitychange`, `pageshow`, and reload recovery. Interval ticks are only a repaint trigger, never the source of truth.

## Runtime capability matrix

| Runtime | Behavior | Reliability |
| --- | --- | --- |
| Foreground page/PWA | Absolute countdown, immediate Rest Complete state, existing vibration where supported | Reliable while the page is active |
| Hidden browser tab | A granted system notification is attempted when the still-running page observes expiry | Best effort; background timers can be throttled or frozen |
| Installed Android Chromium PWA | Same page-lifetime attempt while the PWA process remains alive | Best effort; Android/Chrome may freeze or terminate it |
| Installed iOS/iPadOS Home Screen app | Permission may exist on supported OS versions, but ROOK has no local scheduling or server push | Foreground/return only; background attempt is best effort |
| Fully terminated app/browser | No notification | Unsupported |

ROOK does not use a Push subscription, push provider, or server-side timer scheduler. The existing backend only proxies AI/status functionality and is not an appropriate durable notification scheduler. Stable browsers do not expose a generally shipped local Notification Trigger API, so ROOK does not claim native-style closed-app delivery.

## Permission and privacy

Permission is requested only after the user explicitly enables **Rest timer notifications** under Logging. Denial leaves the preference off and ROOK does not prompt again. The durable preference is backed up, but effective enablement always also requires this device's live `Notification.permission === "granted"`; browser permission is never serialized or restored.

Notifications contain only `Rest complete` and `Ready for your next set.` They use one replacement tag to prevent stacked stale alerts. Notifications older than two minutes are not emitted on late background wake-up. Returning to an expired active rest still immediately shows the in-app completion state.
