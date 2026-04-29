import { describe, expect, it } from 'vitest';

import { toPublicTaskMediaUrl } from '../../../infra/supabase/functions/_shared/taskMediaPublicUrl';

describe('toPublicTaskMediaUrl', () => {
  it('rewrites an internal storage URL to the public app origin', () => {
    const url = toPublicTaskMediaUrl(
      'http://gateway:8080/storage/v1/object/sign/task-media/workspace/media.jpeg?token=abc',
      {
        publicBaseUrl: 'https://motio.nikog.net/app',
      },
    );

    expect(url).toBe(
      'https://motio.nikog.net/storage/v1/object/sign/task-media/workspace/media.jpeg?token=abc',
    );
  });

  it('falls back to the request origin when APP_URL is unavailable', () => {
    const url = toPublicTaskMediaUrl(
      'http://gateway:8080/storage/v1/object/sign/task-media/workspace/media.jpeg?token=abc',
      {
        requestUrl: 'https://test.motio.nikog.net/functions/v1/task-media/media-id?token=download',
      },
    );

    expect(url).toBe(
      'https://test.motio.nikog.net/storage/v1/object/sign/task-media/workspace/media.jpeg?token=abc',
    );
  });

  it('returns the original URL when no public origin can be resolved', () => {
    const originalUrl = 'http://gateway:8080/storage/v1/object/sign/task-media/workspace/media.jpeg?token=abc';

    expect(
      toPublicTaskMediaUrl(originalUrl, {
        publicBaseUrl: 'not-a-url',
        requestUrl: '',
      }),
    ).toBe(originalUrl);
  });
});
