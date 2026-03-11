import { describe, expect, it, vi } from 'vitest';
import {
  readTimelineSidebarWidth,
  writeTimelineSidebarWidth,
} from '@/features/planner/lib/timelineSidebarWidthStorage';

describe('timelineSidebarWidthStorage', () => {
  it('reads and clamps a persisted width', () => {
    const storage = {
      getItem: vi.fn(() => '999'),
    };

    expect(readTimelineSidebarWidth(storage, 'planner-width')).toBe(520);
  });

  it('skips writes while sidebar width is still hydrating', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    writeTimelineSidebarWidth(storage, 'planner-width', undefined);

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('removes persisted width only after an explicit reset', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    writeTimelineSidebarWidth(storage, 'planner-width', null);

    expect(storage.removeItem).toHaveBeenCalledWith('planner-width');
  });
});
