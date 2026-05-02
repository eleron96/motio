import { useLocation } from 'react-router-dom';
import type { AppBasePath } from '@/features/workspace/lib/appNavigation';

export const isDemoPath = (pathname: string): boolean =>
  pathname === '/demo' || pathname.startsWith('/demo/');

export const useIsDemo = (): boolean => {
  const location = useLocation();
  return isDemoPath(location.pathname);
};

export const isDemoRoute = (): boolean =>
  typeof window !== 'undefined' && isDemoPath(window.location.pathname);

export const useAppBasePath = (): AppBasePath => (useIsDemo() ? '/demo' : '/app');
