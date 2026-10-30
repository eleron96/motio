import { describe, expect, it } from 'vitest';
import {
  MAX_SUBTASK_IMAGES,
  MAX_TASK_IMAGE_BYTES,
  appendSubtaskImages,
  diffRemovedSubtaskImageIds,
  parseTaskSubtaskImages,
  selectSubtaskImageFiles,
} from '@/shared/domain/taskSubtaskImages';
import { pastedImageFiles } from '@/features/planner/lib/pastedImageFiles';

const ref = (id: string) => ({ id, token: `t-${id}` });
const file = (type: string, size = 1000, name = 'shot.png') => ({ type, size, name });

describe('taskSubtaskImages', () => {
  it('reads only well-formed references from the column, once each', () => {
    expect(parseTaskSubtaskImages(null)).toEqual([]);
    expect(parseTaskSubtaskImages('[]')).toEqual([]);
    expect(parseTaskSubtaskImages([
      ref('a'),
      { id: 'b' },
      { id: '', token: 'x' },
      'https://example.com/a.png',
      { ...ref('a'), extra: 1 },
      ref('c'),
    ])).toEqual([ref('a'), ref('c')]);
  });

  it('names the pictures a change took off a subtask', () => {
    expect(diffRemovedSubtaskImageIds([ref('a'), ref('b')], [ref('b')])).toEqual(['a']);
    expect(diffRemovedSubtaskImageIds([ref('a')], [ref('a'), ref('b')])).toEqual([]);
  });

  it('appends without repeats and never past the cap', () => {
    expect(appendSubtaskImages([ref('a')], [ref('a'), ref('b')])).toEqual([ref('a'), ref('b')]);
    const full = Array.from({ length: MAX_SUBTASK_IMAGES }, (_, index) => ref(`m${index}`));
    expect(appendSubtaskImages(full, [ref('extra')])).toEqual(full);
  });

  it('picks image files that fit, counting pictures already there and uploading', () => {
    const selection = selectSubtaskImageFiles(
      [file('image/png'), file('application/pdf'), file('image/jpeg', MAX_TASK_IMAGE_BYTES + 1), file('image/webp')],
      MAX_SUBTASK_IMAGES - 2,
      1,
    );
    expect(selection.accepted.map((item) => item.type)).toEqual(['image/png']);
    expect(selection.overLimit).toBe(1);
    expect(selection.rejected.map((item) => item.reason)).toEqual(['not-image', 'too-large']);
  });
});

describe('pastedImageFiles', () => {
  const clipboard = (text: string, files: Array<{ type: string }>) => ({
    getData: (type: string) => (type === 'text/plain' ? text : ''),
    items: files.map((item) => ({ kind: 'file', type: item.type, getAsFile: () => item })),
    files: [],
  }) as unknown as DataTransfer;

  it('takes a pasted screenshot', () => {
    const shot = file('image/png');
    expect(pastedImageFiles(clipboard('', [shot]))).toEqual([shot]);
  });

  it('leaves a paste that carries text alone, even with a rendered image attached', () => {
    expect(pastedImageFiles(clipboard('A1\tB1', [file('image/png')]))).toEqual([]);
    expect(pastedImageFiles(clipboard('', [file('text/html')]))).toEqual([]);
    expect(pastedImageFiles(null)).toEqual([]);
  });
});
