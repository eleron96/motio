import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { t, Trans } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Button } from '@/shared/ui/button';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { HeroClip } from '@/features/marketing/components/HeroClip';
import { LandingStyles } from '@/features/marketing/components/landing/LandingStyles';
import { LandingHeader } from '@/features/marketing/components/landing/LandingHeader';
import { LandingDashboardDemo } from '@/features/marketing/components/landing/LandingDashboardDemo';
import { LandingTimelineDemo } from '@/features/marketing/components/landing/LandingTimelineDemo';
import {
  LandingFeatures,
  LandingFinalCta,
  LandingGuide,
  LandingHeatmap,
  LandingSelfHosted,
  LandingStory,
} from '@/features/marketing/components/landing/LandingSections';
import { LandingFooter } from '@/features/marketing/components/landing/LandingFooter';

const LandingPage = () => {
  const signOutRedirectInProgress = useAuthStore((s) => s.signOutRedirectInProgress);
  const setSignOutRedirectInProgress = useAuthStore((s) => s.setSignOutRedirectInProgress);

  useEffect(() => {
    if (!signOutRedirectInProgress) return;
    setSignOutRedirectInProgress(false);
  }, [setSignOutRedirectInProgress, signOutRedirectInProgress]);

  usePageSeo({
    title: t`Motio — see who’s doing what this week, across every project`,
    description: t`Free, open-source team planner: people, projects and workload on one shared timeline. Spot overload early. Live demo, no sign-up.`,
    canonicalPath: '/',
    robots: 'index, follow',
  });

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <LandingStyles />
      <LandingHeader />

      <main className="flex-1">
        {/* ── HERO ── */}
        <section className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-20 lg:px-10">
          <h1
            className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl lg:text-6xl"
            style={{ animation: 'landFadeDown 0.5s 0.05s ease both', letterSpacing: '-1.5px' }}
          >
            <Trans>
              See who’s doing what <em className="not-italic text-primary">this week</em>
              <br />{' '}across every project
            </Trans>
          </h1>

          <p
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-500 sm:text-lg"
            style={{ animation: 'landFadeDown 0.5s 0.15s ease both' }}
          >
            {t`One shared timeline for people, projects and workload. Spot overload before it hits a deadline.`}
          </p>

          <div
            style={{ animation: 'landFadeDown 0.5s 0.25s ease both' }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button asChild size="lg">
              {/* Straight to the Keycloak registration form (prompt=create via
                  /auth), not the sign-in screen — "start" must mean sign-up. */}
              <Link to="/auth?intent=register">{t`Start for free →`}</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="demo-cta-button border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
            >
              {/* Hard navigation — see header CTA above. */}
              <a href="/demo">{t`Try demo — no signup`}</a>
            </Button>
          </div>

          {/* the product itself, recorded in the live demo. No fade-in here: the poster
              is the largest thing on the first screen, and a delayed fade pushed it
              (and the page's LCP) back by a third of a second. */}
          <div className="mx-auto mt-12 max-w-[860px]">
            <HeroClip />
          </div>
        </section>

        <LandingFeatures />
        <LandingHeatmap />
        <LandingDashboardDemo />
        <LandingGuide />
        <LandingSelfHosted />
        <LandingTimelineDemo />
        <LandingStory />
        <LandingFinalCta />
      </main>

      <LandingFooter />
      <RevealObserver />
    </div>
  );
};

function RevealObserver() {
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.land-reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return null;
}

export default LandingPage;
