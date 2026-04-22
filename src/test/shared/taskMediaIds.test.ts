import { describe, expect, it } from 'vitest';

import {
  diffRemovedTaskMediaIds,
  extractTaskMediaIds,
} from '@/shared/domain/taskMediaIds';

describe('extractTaskMediaIds', () => {
  it('returns an empty array for empty, null, or non-media content', () => {
    expect(extractTaskMediaIds(null)).toEqual([]);
    expect(extractTaskMediaIds(undefined)).toEqual([]);
    expect(extractTaskMediaIds('')).toEqual([]);
    expect(extractTaskMediaIds('<p>no images here</p>')).toEqual([]);
    expect(extractTaskMediaIds('<img src="https://example.com/cat.png" />')).toEqual([]);
  });

  it('extracts a single media id from an img src', () => {
    const html =
      '<p>x</p><img src="https://api.motio.dev/functions/v1/task-media/abc-123?token=zzz" />';
    expect(extractTaskMediaIds(html)).toEqual(['abc-123']);
  });

  it('extracts multiple unique ids and dedupes repeats', () => {
    const html = [
      '<img src="https://a/functions/v1/task-media/one?token=t1">',
      '<img src="https://a/functions/v1/task-media/two?token=t2">',
      '<img src="https://a/functions/v1/task-media/one?token=t3">',
    ].join('');
    const ids = extractTaskMediaIds(html);
    expect(ids.sort()).toEqual(['one', 'two']);
  });

  it('decodes percent-encoded ids', () => {
    const html =
      '<img src="https://a/functions/v1/task-media/id%2Dwith%2Dpercent?token=t">';
    expect(extractTaskMediaIds(html)).toEqual(['id-with-percent']);
  });

  it('does not match similar-looking paths from other services', () => {
    const html =
      '<img src="https://a/functions/v2/task-media/abc?token=t">' +
      '<img src="https://a/something/task-media/xyz?token=t">';
    expect(extractTaskMediaIds(html)).toEqual([]);
  });
});

describe('diffRemovedTaskMediaIds', () => {
  const mediaUrl = (id: string) =>
    `<img src="https://api.motio.dev/functions/v1/task-media/${id}?token=t" />`;

  it('returns ids present in previous but not in next', () => {
    const previous = `${mediaUrl('a')}${mediaUrl('b')}${mediaUrl('c')}`;
    const next = `${mediaUrl('a')}${mediaUrl('c')}`;
    expect(diffRemovedTaskMediaIds(previous, next)).toEqual(['b']);
  });

  it('returns all ids when next is cleared', () => {
    const previous = `${mediaUrl('a')}${mediaUrl('b')}`;
    expect(diffRemovedTaskMediaIds(previous, null).sort()).toEqual(['a', 'b']);
    expect(diffRemovedTaskMediaIds(previous, '').sort()).toEqual(['a', 'b']);
  });

  it('returns nothing when previous is empty', () => {
    expect(diffRemovedTaskMediaIds(null, mediaUrl('a'))).toEqual([]);
    expect(diffRemovedTaskMediaIds('', mediaUrl('a'))).toEqual([]);
  });

  it('returns nothing when nothing was removed', () => {
    const previous = mediaUrl('a');
    const next = `${mediaUrl('a')}${mediaUrl('b')}`;
    expect(diffRemovedTaskMediaIds(previous, next)).toEqual([]);
  });
});
