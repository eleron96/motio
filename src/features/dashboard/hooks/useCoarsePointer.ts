import { useEffect, useState } from 'react';

/** True on a touch screen: a coarse pointer anywhere, or any touch points. */
export const useCoarsePointer = () => {
  const [isTouchPointer, setIsTouchPointer] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    const anyCoarseQuery = window.matchMedia('(any-pointer: coarse)');

    const updateTouchPointer = () => {
      const hasTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
      setIsTouchPointer(coarseQuery.matches || anyCoarseQuery.matches || hasTouchPoints);
    };

    updateTouchPointer();

    const handleTouchMediaChange = () => {
      updateTouchPointer();
    };

    if (typeof coarseQuery.addEventListener === 'function') {
      coarseQuery.addEventListener('change', handleTouchMediaChange);
      anyCoarseQuery.addEventListener('change', handleTouchMediaChange);
    } else {
      coarseQuery.addListener(handleTouchMediaChange);
      anyCoarseQuery.addListener(handleTouchMediaChange);
    }

    return () => {
      if (typeof coarseQuery.removeEventListener === 'function') {
        coarseQuery.removeEventListener('change', handleTouchMediaChange);
        anyCoarseQuery.removeEventListener('change', handleTouchMediaChange);
      } else {
        coarseQuery.removeListener(handleTouchMediaChange);
        anyCoarseQuery.removeListener(handleTouchMediaChange);
      }
    };
  }, []);

  return isTouchPointer;
};
