// Push subscription endpoints the server must and must not send to. One table
// for both sides of the rule: the Edge Function check (unit test,
// src/test/shared/pushEndpoint.test.ts) and the CHECK of
// push_subscriptions.endpoint (integration test,
// tests/integration/push-subscription-endpoint.test.ts).

export const PUSH_SERVICE_ENDPOINTS = [
  "https://fcm.googleapis.com/fcm/send/dXk2:APA91bH",
  "https://fcm.googleapis.com/wp/dXk2:APA91bH",
  "https://android.googleapis.com/gcm/send/abc",
  "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB",
  "https://web.push.apple.com/QGuQyavXutnMDxa",
  "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB",
];

export const NOT_PUSH_SERVICE_ENDPOINTS: Array<[label: string, endpoint: string]> = [
  ["an internal service", "http://storage:5000/object/x"],
  ["an internal service over https", "https://backup:7000/run"],
  ["plain http to a push service", "http://fcm.googleapis.com/fcm/send/x"],
  ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
  ["an IP address", "https://10.0.0.5/x"],
  ["localhost", "https://localhost/x"],
  ["another site", "https://evil.example/fcm.googleapis.com/"],
  ["a look-alike host", "https://fcm.googleapis.com.evil.example/x"],
  ["a look-alike suffix", "https://evilpush.apple.com/x"],
  ["user info before the host", "https://fcm.googleapis.com@evil.example/x"],
  ["user info with the push host as user", "https://user@fcm.googleapis.com/x"],
  ["an explicit port", "https://fcm.googleapis.com:8443/x"],
  ["a backslash after the host", "https://fcm.googleapis.com\\@evil.example/x"],
  ["no path", "https://fcm.googleapis.com"],
  ["upper case", "https://FCM.googleapis.com/x"],
  ["a bare windows host", "https://notify.windows.com/x"],
  ["not a URL", "fcm.googleapis.com/x"],
  ["empty", ""],
];
