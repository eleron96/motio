import React, { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Строки-примеры выглядят как настоящая работа, а вопрос «оставить или убрать»
 * доходит не до всех: тур закрывают крестиком, на телефоне он не запускается,
 * приглашённый участник его не проходит. Полоса — единственное место, где о
 * примерах сказано вслух, поэтому она обязана появляться на любом экране
 * пространства и исчезать ровно тогда, когда примеров больше нет.
 */

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { from: () => { throw new Error('not used'); } },
  getSupabase: () => { throw new Error('not used'); },
}));

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { SampleDataBanner } from '@/features/onboarding/components/SampleDataBanner';

const BANNER_TEXT = /example data/i;
const REMOVE_LABEL = /remove examples/i;

const clearSampleData = vi.fn(async () => ({}));
const refreshSampleDataFlag = vi.fn(async () => {});

const renderBanner = async () => {
  let result: ReturnType<typeof render> | null = null;
  await act(async () => {
    result = render(<SampleDataBanner />);
  });
  return result as unknown as ReturnType<typeof render>;
};

const setUp = (options: { hasSampleData: boolean; role: 'admin' | 'member' }) => {
  useAuthStore.setState({
    currentWorkspaceId: 'ws-1',
    currentWorkspaceRole: options.role,
  } as never);
  usePlannerStore.setState({
    hasSampleData: options.hasSampleData,
    clearSampleData,
    refreshSampleDataFlag,
  } as never);
};

beforeEach(() => {
  clearSampleData.mockClear();
  refreshSampleDataFlag.mockClear();
});

describe('SampleDataBanner', () => {
  it('молчит в пространстве без примеров', async () => {
    setUp({ hasSampleData: false, role: 'admin' });

    const { container } = await renderBanner();

    expect(container).toBeEmptyDOMElement();
  });

  it('называет примеры примерами и предлагает их убрать администратору', async () => {
    setUp({ hasSampleData: true, role: 'admin' });

    await renderBanner();

    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
    expect(screen.getByRole('button', { name: REMOVE_LABEL })).toBeTruthy();
  });

  it('объясняет примеры обычному участнику, но не даёт их удалить', async () => {
    setUp({ hasSampleData: true, role: 'member' });

    await renderBanner();

    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
    expect(screen.queryByRole('button', { name: REMOVE_LABEL })).toBeNull();
  });

  it('удаляет примеры текущего пространства по нажатию', async () => {
    setUp({ hasSampleData: true, role: 'admin' });

    await renderBanner();
    await act(async () => {
      screen.getByRole('button', { name: REMOVE_LABEL }).click();
    });

    expect(clearSampleData).toHaveBeenCalledWith('ws-1');
  });

  it('спрашивает у сервера про примеры на любом экране пространства', async () => {
    setUp({ hasSampleData: false, role: 'admin' });

    await renderBanner();

    expect(refreshSampleDataFlag).toHaveBeenCalledWith('ws-1');
  });
});
