import type { AppBasePath } from '@/features/workspace/lib/appNavigation';

export const isDemoPath = (pathname: string): boolean =>
  pathname === '/demo' || pathname.startsWith('/demo/');

export const isDemoRoute = (): boolean =>
  typeof window !== 'undefined' && isDemoPath(window.location.pathname);

// Stable for the lifetime of the React tree because entering and
// leaving /demo always goes through window.location (hard reload) for
// auth isolation — see supabaseClient + DemoBootstrap. This means
// useIsDemo() doesn't need to react to React Router updates and we can
// implement it as a plain function read of window.location, which lets
// the hook be called from components rendered outside <BrowserRouter>
// (DailyBriefController, test renders, etc.) without throwing.
export const useIsDemo = (): boolean => isDemoRoute();

export const useAppBasePath = (): AppBasePath => (isDemoRoute() ? '/demo' : '/app');
