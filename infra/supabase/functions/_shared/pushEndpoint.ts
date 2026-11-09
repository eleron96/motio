// Where a Web Push subscription may point. The endpoint comes from the browser,
// but the server is the one that POSTs to it — and a signed-in person can store
// any text there. Without this rule the `functions` container would send
// requests wherever it is told, internal services included (SSRF).
//
// A real endpoint always belongs to the browser vendor's push service:
//   Chrome, Android, Samsung Internet, Opera, Brave  fcm.googleapis.com
//                                    (older Chrome)  android.googleapis.com
//   Firefox                                          *.push.services.mozilla.com
//   Safari on macOS and iOS                          *.push.apple.com
//   Edge on Windows                                  *.notify.windows.com
// A browser that uses another service cannot subscribe until it is added here.
//
// The same rule is the CHECK of `push_subscriptions.endpoint` (migration
// 0175, `public.is_push_service_endpoint`); keep the two identical —
// `tests/integration/push-subscription-endpoint.test.ts` compares them.

export const MAX_PUSH_ENDPOINT_LENGTH = 2048;

// Lower-case host right after `https://` and then a `/`: no user info, no port,
// nothing that a URL parser could read as another host.
const PUSH_SERVICE_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)\//;

export const isPushServiceEndpoint = (endpoint: string): boolean =>
  endpoint.length <= MAX_PUSH_ENDPOINT_LENGTH && PUSH_SERVICE_ENDPOINT.test(endpoint);
