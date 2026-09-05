export const REST_NOTIFICATION_TITLE = "Rest complete";
export const REST_NOTIFICATION_BODY = "Ready for your next set.";
export const REST_NOTIFICATION_TAG = "rook-rest-complete";

export function restNotificationCapability(scope = globalThis) {
  const notification = scope?.Notification;
  const serviceWorker = scope?.navigator?.serviceWorker;
  const supported = Boolean(notification && serviceWorker);
  const permission = supported && ["default", "granted", "denied"].includes(notification.permission)
    ? notification.permission
    : "unsupported";
  const standalone = Boolean(
    scope?.navigator?.standalone === true ||
    scope?.matchMedia?.("(display-mode: standalone)")?.matches,
  );
  const ios = /iPad|iPhone|iPod/i.test(String(scope?.navigator?.userAgent || ""));
  return {
    supported,
    permission,
    standalone,
    ios,
    reliableWhenClosed: false,
    mode: supported ? "page-lifetime-best-effort" : "unsupported",
  };
}

export async function requestRestNotificationPermission(scope = globalThis) {
  const capability = restNotificationCapability(scope);
  if (!capability.supported) return { ...capability, outcome: "unsupported" };
  if (capability.permission === "granted") return { ...capability, outcome: "granted" };
  if (capability.permission === "denied") return { ...capability, outcome: "denied" };
  try {
    const permission = await scope.Notification.requestPermission();
    return {
      ...restNotificationCapability(scope),
      permission,
      outcome: permission === "granted" ? "granted" : permission === "denied" ? "denied" : "dismissed",
    };
  } catch {
    return { ...restNotificationCapability(scope), outcome: "error" };
  }
}

export function restNotificationSettingCopy(capability) {
  if (!capability?.supported)
    return "Notifications aren’t available in this browser.";
  if (capability.permission === "denied")
    return "Blocked in device settings. ROOK won’t ask again.";
  if (capability.permission === "granted")
    return "Best effort while ROOK is still running. Closing the app cancels local alerts.";
  if (capability.ios && !capability.standalone)
    return "Available only from an installed Home Screen app; closed-app alerts still aren’t supported.";
  return "Allow on this device. Alerts are best effort while ROOK is running; closing the app cancels them.";
}

export function restCompletionKey(rest) {
  const endsAt = Number(rest?.endsAt);
  return Number.isFinite(endsAt) ? `rest:${endsAt}` : null;
}

export function shouldHandleRestCompletion({ rest, now = Date.now(), handledKey = null } = {}) {
  const key = restCompletionKey(rest);
  return Boolean(key && Number(rest.endsAt) <= Number(now) && key !== handledKey);
}

export function shouldShowBackgroundRestNotification({
  rest,
  now = Date.now(),
  enabled = false,
  permission = "default",
  hidden = false,
  handledKey = null,
  freshnessMs = 120000,
} = {}) {
  if (!enabled || permission !== "granted" || !hidden) return false;
  if (Number.isFinite(Number(rest?.notificationAttemptedAt))) return false;
  if (!shouldHandleRestCompletion({ rest, now, handledKey })) return false;
  return Number(now) - Number(rest.endsAt) <= freshnessMs;
}

export async function showRestCompleteNotification(scope = globalThis) {
  const capability = restNotificationCapability(scope);
  if (!capability.supported || capability.permission !== "granted")
    return { status: capability.permission === "denied" ? "denied" : "unavailable" };
  try {
    const registration = await scope.navigator.serviceWorker.ready;
    await registration.showNotification(REST_NOTIFICATION_TITLE, {
      body: REST_NOTIFICATION_BODY,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: REST_NOTIFICATION_TAG,
      renotify: false,
      data: { url: "/" },
    });
    return { status: "shown" };
  } catch {
    return { status: "error" };
  }
}
