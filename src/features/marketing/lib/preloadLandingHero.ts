import posterUrl from '@/features/marketing/assets/motio-clip-poster.webp';

// The hero clip's poster is the largest thing on the landing's first screen — its LCP.
// It is referenced from the lazily loaded landing chunk, so on its own the browser asks
// for it only after that chunk has downloaded and rendered, about half a second late on
// a slow phone. Starting the request as soon as the app shell runs — and only on the
// landing itself, so /app never downloads it — lets it arrive together with the chunk.
export const preloadLandingHero = (pathname: string = window.location.pathname) => {
  if (pathname !== '/') return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.setAttribute('as', 'image');
  link.href = posterUrl;
  link.setAttribute('fetchpriority', 'high');
  document.head.appendChild(link);
};
