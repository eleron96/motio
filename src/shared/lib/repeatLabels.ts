import { t } from '@lingui/macro';
import { RepeatCadence } from '@/shared/domain/repeatSeries';

export const formatRepeatCadenceLabel = (cadence: RepeatCadence) => {
  switch (cadence) {
    case 'daily':
      return t`Daily recurring`;
    case 'weekly':
      return t`Weekly recurring`;
    case 'monthly':
      return t`Monthly recurring`;
    case 'yearly':
      return t`Yearly recurring`;
    default:
      return t`Recurring`;
  }
};

export const formatRepeatSeriesRemainderLabel = (remaining: number) => (
  remaining > 0 ? t`${remaining} more` : t`Last in series`
);
