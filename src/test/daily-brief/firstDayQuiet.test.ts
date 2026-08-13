import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * В день регистрации сводке нечего подводить: своих задач ноль, примеры
 * назначены на выдуманных коллег, а вехи стоят за пределами недельного окна.
 * Хуже того, сводка открывалась поверх уже идущего онбординг-тура и, будучи
 * модальной, глушила его кнопки. Поэтому первый день молчим — но дату «показано»
 * не проставляем, чтобы завтра сводка пришла как обычно.
 */

const single = vi.fn();

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ single }),
      }),
    }),
  },
}));

import { shouldShowNow, toLocalDateString } from '@/features/daily-brief/lib/dailyBriefStorage';

const USER = 'user-1';

const profileRow = (createdAt: Date) => ({
  data: {
    daily_brief_shown_date: null,
    preferences: {},
    created_at: createdAt.toISOString(),
  },
});

const atTenToday = () => {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  return d;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(atTenToday());
  localStorage.clear();
  single.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('утренняя сводка в первый день', () => {
  it('молчит у того, кто зарегистрировался сегодня', async () => {
    single.mockResolvedValue(profileRow(new Date()));

    await expect(shouldShowNow(USER)).resolves.toBe(false);
  });

  it('приходит к тому, кто зарегистрировался вчера', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    single.mockResolvedValue(profileRow(yesterday));

    await expect(shouldShowNow(USER)).resolves.toBe(true);
  });

  it('не помечает день показанным, когда промолчала', async () => {
    single.mockResolvedValue(profileRow(new Date()));

    await shouldShowNow(USER);

    expect(localStorage.getItem(`motio_daily_brief_${USER}`)).toBeNull();
  });

  it('переживает профиль без даты регистрации', async () => {
    single.mockResolvedValue({
      data: { daily_brief_shown_date: null, preferences: {}, created_at: null },
    });

    await expect(shouldShowNow(USER)).resolves.toBe(true);
  });

  it('уважает выключенную настройку раньше всех прочих проверок', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    single.mockResolvedValue({
      data: {
        daily_brief_shown_date: null,
        preferences: { daily_brief_enabled: false },
        created_at: yesterday.toISOString(),
      },
    });

    await expect(shouldShowNow(USER)).resolves.toBe(false);
  });

  it('считает день регистрации по местному времени человека', () => {
    const localMidnightish = new Date();
    localMidnightish.setHours(0, 30, 0, 0);

    expect(toLocalDateString(localMidnightish)).toBe(toLocalDateString(new Date()));
  });
});
