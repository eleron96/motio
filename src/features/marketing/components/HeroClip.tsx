import { useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import clipUrl from '@/features/marketing/assets/motio-clip.mp4';
import posterUrl from '@/features/marketing/assets/motio-clip-poster.webp';

// The hero shows the product itself: a 23-second clip recorded in the live demo — a
// task added from a double-click, dragged to Monday, stretched over two days, then that
// day checked on the workload heatmap. The poster paints first; the video is attached
// only once the page has loaded, so it never competes with the page for bandwidth, and
// it plays only while it is on screen. With reduced motion the poster stays still.
export const HeroClip = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const attach = () => setSrc(clipUrl);
    if (document.readyState === 'complete') {
      attach();
      return undefined;
    }
    window.addEventListener('load', attach, { once: true });
    return () => window.removeEventListener('load', attach);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;
    // React sets `muted` as a property only; autoplay policies want it before play().
    video.muted = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    }, { threshold: 0.2 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [src]);

  return (
    // Hard navigation, like the other demo links: AuthProvider has to remount under
    // /demo so the sandbox client is wired from the start.
    <a
      href="/demo"
      aria-label={t`Open the live demo`}
      className="group block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-md transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-xs text-slate-400">motio.nikog.net/demo</span>
        <span
          aria-hidden="true"
          className="ml-auto text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {t`Open the live demo →`}
        </span>
      </div>
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl}
        width={1280}
        height={880}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        className="block h-auto w-full bg-white"
      />
    </a>
  );
};
