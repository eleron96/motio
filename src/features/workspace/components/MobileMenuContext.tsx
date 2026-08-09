import React from 'react';

export interface MobileMenuContextValue {
  /** Whether the bottom menu sheet is showing. */
  open: boolean;
  openMenu: () => void;
  closeMenu: () => void;
}

const noop = () => {};

const MobileMenuContext = React.createContext<MobileMenuContextValue>({
  open: false,
  openMenu: noop,
  closeMenu: noop,
});

/**
 * The mobile menu lives in the workspace header, but the screens it opens
 * (workspace settings, account settings) are mounted by the pages. This context
 * is how those screens hand control back — "back" from a settings stack reopens
 * the sheet it was launched from.
 *
 * Outside the provider it degrades to no-ops, so a component rendered on its own
 * (desktop, tests) simply has no menu to return to.
 */
export const MobileMenuProvider: React.FC<{
  value: MobileMenuContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <MobileMenuContext.Provider value={value}>{children}</MobileMenuContext.Provider>
);

export const useMobileMenu = (): MobileMenuContextValue => React.useContext(MobileMenuContext);
