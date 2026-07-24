// Browser-side orchestration of Web Push: capability detection, permission,
// service-worker registration, and subscribe/unsubscribe. All DB/edge calls are
// delegated to pushSubscriptionRepository so this file stays about browser APIs.
import {
  deletePushSubscriptionByEndpoint,
  upsertPushSubscription,
} from '@/infrastructure/notifications/pushSubscriptionRepository';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY as string | undefined) ?? '';
const SW_URL = '/sw.js';

export type PushSubscribeReason =
  | 'unsupported'
  | 'not-configured'
  | 'denied'
  | 'sw-failed'
  | 'error';

export interface PushSubscribeResult {
  ok: boolean;
  reason?: PushSubscribeReason;
  message?: string;
}

// Push needs a service worker, the Push API, and the Notification API. iOS
// Safari outside an installed PWA lacks PushManager, so this naturally hides the
// feature there instead of us maintaining a device blocklist.
export const isPushSupported = (): boolean =>
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window;

export const isPushConfiguredClient = (): boolean => VAPID_PUBLIC_KEY.length > 0;

// iPhone/iPad detection. iPadOS 13+ masquerades as macOS Safari, so a
// Macintosh UA with a multi-touch screen counts as iPad.
export const isIosDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  return navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1;
};

// True when running as an installed Home Screen app rather than a browser tab.
export const isStandaloneDisplayMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
};

// iOS Safari only exposes the Push API inside an installed Home Screen app
// (iOS 16.4+). True when we're on iOS in a plain tab without push — i.e. the
// user could unlock notifications by installing Motio to the Home Screen.
export const needsIosInstallForPush = (): boolean =>
  isIosDevice() && !isStandaloneDisplayMode() && !isPushSupported();

export const getNotificationPermission = (): NotificationPermission =>
  ('Notification' in window ? Notification.permission : 'denied');

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
};

// Registers the SW if needed and resolves once it is active/ready. Returns null
// if registration fails (e.g. insecure context).
export const ensureServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!existing) {
      await navigator.serviceWorker.register(SW_URL);
    }
    return await navigator.serviceWorker.ready;
  } catch (_e) {
    return null;
  }
};

export const getExistingPushSubscription = async (): Promise<PushSubscription | null> => {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!registration) return null;
  return registration.pushManager.getSubscription();
};

// True when this browser already holds an active push subscription — used to
// reflect the real state of the master toggle on load.
export const hasActivePushSubscription = async (): Promise<boolean> => {
  const sub = await getExistingPushSubscription();
  return Boolean(sub);
};

export const subscribeToPush = async (): Promise<PushSubscribeResult> => {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (!isPushConfiguredClient()) return { ok: false, reason: 'not-configured' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const registration = await ensureServiceWorker();
  if (!registration) return { ok: false, reason: 'sw-failed' };

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (error) {
      return { ok: false, reason: 'error', message: String((error as Error).message ?? error) };
    }
  }

  const json = subscription.toJSON();
  const keys = json.keys ?? {};
  const result = await upsertPushSubscription({
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh ?? '',
    auth: keys.auth ?? '',
    userAgent: navigator.userAgent.slice(0, 400),
  });
  if (result.error) {
    return { ok: false, reason: 'error', message: result.error };
  }

  return { ok: true };
};

export const unsubscribeFromPush = async (): Promise<void> => {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  try {
    await subscription.unsubscribe();
  } catch (_e) {
    /* best-effort — still remove the server row below */
  }
  await deletePushSubscriptionByEndpoint(endpoint);
};
