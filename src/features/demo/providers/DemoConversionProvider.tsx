import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type DemoConversionTrigger =
  | 'banner'
  | 'timer'
  | 'invite'
  | 'share'
  | 'export'
  | 'manual';

interface DemoConversionContextValue {
  isOpen: boolean;
  trigger: DemoConversionTrigger | null;
  open: (trigger: DemoConversionTrigger) => void;
  close: () => void;
}

const noop = () => undefined;

const DemoConversionContext = createContext<DemoConversionContextValue>({
  isOpen: false,
  trigger: null,
  open: noop,
  close: noop,
});

interface DemoConversionProviderProps {
  children: React.ReactNode;
}

export const DemoConversionProvider = ({ children }: DemoConversionProviderProps) => {
  const [trigger, setTrigger] = useState<DemoConversionTrigger | null>(null);

  const open = useCallback((next: DemoConversionTrigger) => {
    setTrigger(next);
  }, []);

  const close = useCallback(() => {
    setTrigger(null);
  }, []);

  const value = useMemo<DemoConversionContextValue>(
    () => ({ isOpen: trigger !== null, trigger, open, close }),
    [trigger, open, close],
  );

  return <DemoConversionContext.Provider value={value}>{children}</DemoConversionContext.Provider>;
};

// Returns a working handle when called inside the demo provider; outside
// demo (i.e. on /app or /), it returns a no-op so callers can invoke
// `open('invite')` unconditionally without needing an isDemo check.
export const useDemoConversion = () => useContext(DemoConversionContext);
