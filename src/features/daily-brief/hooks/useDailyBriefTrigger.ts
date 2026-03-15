import { useState, useEffect, useCallback, useRef } from 'react';
import { getMsUntilNext9AM, isLocallyShownToday, markShownToday, shouldShowNow } from '../lib/dailyBriefStorage';

export const useDailyBriefTrigger = (userId: string | null) => {
  const [isOpen, setIsOpen] = useState(false);
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (!userId) return;
    // Быстрый синхронный путь — не делаем лишних запросов к Supabase
    if (isLocallyShownToday(userId)) return;
    // Защита от параллельных вызовов (visibilitychange + setTimeout одновременно)
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const show = await shouldShowNow(userId);
      if (show) {
        markShownToday(userId);
        setIsOpen(true);
      }
    } finally {
      checkingRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    check();

    let timer: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      timer = setTimeout(() => {
        check();
        scheduleNext();
      }, getMsUntilNext9AM());
    };

    scheduleNext();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        check();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [check]);

  const dismiss = useCallback(() => setIsOpen(false), []);

  return { isOpen, dismiss };
};
