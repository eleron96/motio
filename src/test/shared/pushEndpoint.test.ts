import { describe, expect, it } from 'vitest';

import {
  MAX_PUSH_ENDPOINT_LENGTH,
  isPushServiceEndpoint,
} from '../../../infra/supabase/functions/_shared/pushEndpoint';
import {
  NOT_PUSH_SERVICE_ENDPOINTS,
  PUSH_SERVICE_ENDPOINTS,
} from '../../../tests/helpers/pushEndpointCases';

// The server POSTs to whatever a subscription stores, so only the browsers'
// push services are allowed. The same cases check the database rule in
// tests/integration/push-subscription-endpoint.test.ts.
describe('isPushServiceEndpoint', () => {
  it.each(PUSH_SERVICE_ENDPOINTS)('accepts a push service: %s', (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
  });

  it.each(NOT_PUSH_SERVICE_ENDPOINTS)('rejects %s', (_label, endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
  });

  it('rejects an endpoint longer than the limit', () => {
    const base = 'https://fcm.googleapis.com/fcm/send/';
    expect(isPushServiceEndpoint(base + 'a'.repeat(MAX_PUSH_ENDPOINT_LENGTH - base.length))).toBe(true);
    expect(isPushServiceEndpoint(base + 'a'.repeat(MAX_PUSH_ENDPOINT_LENGTH - base.length + 1))).toBe(false);
  });
});
