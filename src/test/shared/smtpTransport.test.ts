import { describe, expect, it } from 'vitest';

import { usesImplicitTls } from '../../../infra/supabase/functions/_shared/smtpTransport';

describe('usesImplicitTls', () => {
  it('keeps implicit TLS on 465 (the motio.nikog.net setup)', () => {
    expect(usesImplicitTls(465)).toBe(true);
  });

  it('uses STARTTLS on the submission ports self-hosted installs use', () => {
    expect(usesImplicitTls(587)).toBe(false);
    expect(usesImplicitTls(25)).toBe(false);
    expect(usesImplicitTls(2525)).toBe(false);
  });
});
