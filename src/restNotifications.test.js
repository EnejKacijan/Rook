import { describe, expect, it, vi } from "vitest";
import {
  requestRestNotificationPermission,
  restNotificationCapability,
  restNotificationSettingCopy,
  shouldHandleRestCompletion,
  shouldShowBackgroundRestNotification,
  showRestCompleteNotification,
} from "./restNotifications.js";

const scope = ({ permission = "default", request = permission, standalone = false, ios = false } = {}) => ({
  Notification: { permission, requestPermission: vi.fn(async () => request) },
  navigator: {
    serviceWorker: { ready: Promise.resolve({ showNotification: vi.fn(async () => {}) }) },
    standalone,
    userAgent: ios ? "iPhone" : "Android",
  },
  matchMedia: () => ({ matches: standalone }),
});

describe("rest timer notification capability", () => {
  it("does not alert after skip/finish clears rest or permission is revoked", () => {
    const base = { now: 1001, enabled: true, hidden: true, permission: "granted" };
    expect(shouldHandleRestCompletion({ rest: null, now: 1001 })).toBe(false);
    expect(shouldShowBackgroundRestNotification({ ...base, rest: null })).toBe(false);
    for (const permission of ["default", "denied"])
      expect(shouldShowBackgroundRestNotification({ ...base, rest: { endsAt: 1000 }, permission })).toBe(false);
  });
  it("handles a new rest without repeating an already handled rest", () => {
    expect(shouldHandleRestCompletion({ rest: { endsAt: 1000 }, now: 3000, handledKey: "rest:1000" })).toBe(false);
    expect(shouldHandleRestCompletion({ rest: { endsAt: 2000 }, now: 3000, handledKey: "rest:1000" })).toBe(true);
  });
  it("never requests permission merely while detecting support", () => {
    const value = scope();
    expect(restNotificationCapability(value).permission).toBe("default");
    expect(value.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission only through the explicit action and handles denial", async () => {
    const granted = scope({ request: "granted" });
    expect((await requestRestNotificationPermission(granted)).outcome).toBe("granted");
    expect(granted.Notification.requestPermission).toHaveBeenCalledOnce();
    const denied = scope({ permission: "denied" });
    expect((await requestRestNotificationPermission(denied)).outcome).toBe("denied");
    expect(denied.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("marks all closed-app behavior unsupported, including installed iOS", () => {
    const capability = restNotificationCapability(scope({ permission: "granted", standalone: true, ios: true }));
    expect(capability.reliableWhenClosed).toBe(false);
    expect(restNotificationSettingCopy(capability)).toContain("Closing the app cancels");
  });

  it("reconciles an expired absolute timestamp once", () => {
    const rest = { endsAt: 1000 };
    expect(shouldHandleRestCompletion({ rest, now: 1001 })).toBe(true);
    expect(shouldHandleRestCompletion({ rest, now: 1001, handledKey: "rest:1000" })).toBe(false);
  });

  it("only attempts a fresh hidden-page alert with granted permission", () => {
    const base = { rest: { endsAt: 1000 }, now: 1001, enabled: true, permission: "granted", hidden: true };
    expect(shouldShowBackgroundRestNotification(base)).toBe(true);
    expect(shouldShowBackgroundRestNotification({ ...base, hidden: false })).toBe(false);
    expect(shouldShowBackgroundRestNotification({ ...base, permission: "denied" })).toBe(false);
    expect(shouldShowBackgroundRestNotification({
      ...base,
      rest: { endsAt: 1000, notificationAttemptedAt: 1001 },
    })).toBe(false);
    expect(shouldShowBackgroundRestNotification({ ...base, now: 200000 })).toBe(false);
  });

  it("uses the service worker notification surface when available", async () => {
    const value = scope({ permission: "granted" });
    expect(await showRestCompleteNotification(value)).toEqual({ status: "shown" });
    const registration = await value.navigator.serviceWorker.ready;
    expect(registration.showNotification).toHaveBeenCalledWith("Rest complete", expect.objectContaining({ tag: "rook-rest-complete" }));
  });
});
