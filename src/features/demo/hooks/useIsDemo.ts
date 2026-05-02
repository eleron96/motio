import { useLocation } from 'react-router-dom';

export const isDemoPath = (pathname: string): boolean =>
  pathname === '/demo' || pathname.startsWith('/demo/');

export const useIsDemo = (): boolean => {
  const location = useLocation();
  return isDemoPath(location.pathname);
};

export const isDemoRoute = (): boolean =>
  typeof window !== 'undefined' && isDemoPath(window.location.pathname);
