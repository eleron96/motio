import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/features/auth/store/authStore";
import { Button } from "@/shared/ui/button";
import { usePageSeo } from "@/shared/lib/seo/usePageSeo";
import { trackGoogleEvent } from "@/shared/lib/analytics/googleTag";
import logoMotio from "../../../../logo motio.png";

const LandingPage = () => {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const signOut = useAuthStore((state) => state.signOut);
  const signOutRedirectInProgress = useAuthStore((state) => state.signOutRedirectInProgress);
  const setSignOutRedirectInProgress = useAuthStore((state) => state.setSignOutRedirectInProgress);
  const [manualSignOutLoading, setManualSignOutLoading] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!signOutRedirectInProgress) return;
    setSignOutRedirectInProgress(false);
  }, [setSignOutRedirectInProgress, signOutRedirectInProgress]);

  const handleSignOut = async () => {
    setManualSignOutLoading(true);
    try {
      await signOut();
    } finally {
      setManualSignOutLoading(false);
    }
  };

  usePageSeo({
    title: "Motio - Team planning in one timeline",
    description: "Motio is a simple workspace for planning projects, tasks, and team workload on a visual timeline.",
    canonicalPath: "/",
    robots: "index, follow",
  });

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-10">
          <Link to="/" className="flex h-full items-center py-1">
            <img src={logoMotio} alt="Motio logo" className="h-full w-auto shrink-0 object-contain" />
          </Link>

          {!loading && user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="max-w-[140px] truncate text-xs text-slate-600 sm:max-w-[220px] sm:text-sm">
                {user.email ?? "Signed in"}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={handleSignOut}
                disabled={manualSignOutLoading || signOutRedirectInProgress}
              >
                Sign out
              </Button>
            </div>
          ) : (
            <Button asChild onClick={() => trackGoogleEvent("login_cta_click", { placement: "header" })}>
              <Link to="/app">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 sm:py-12 lg:px-10 lg:py-16 xl:py-20">
        <section
          id="overview"
          className="rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 sm:p-8 lg:p-12 xl:p-14"
        >
          <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl lg:text-5xl xl:text-6xl">
            One clear timeline for projects and people
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base lg:text-lg">
            Motio keeps tasks, milestones, and workload in one shared workspace.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-600 sm:mt-6 sm:text-xs">
            <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1">Tasks</span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1">Projects</span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1">Capacity</span>
          </div>
        </section>

        <section
          id="flow"
          className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 sm:mt-8 sm:p-8 lg:mt-10 lg:p-10"
        >
          <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">What you get</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:delay-75 motion-safe:transition-all motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md sm:p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">1. Plan</h3>
              <p className="mt-2 text-sm text-slate-600">Add tasks with dates and owners.</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:delay-150 motion-safe:transition-all motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md sm:p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">2. Coordinate</h3>
              <p className="mt-2 text-sm text-slate-600">Group work into projects and milestones.</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:delay-200 motion-safe:transition-all motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md sm:col-span-2 sm:p-5 xl:col-span-1">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">3. Balance</h3>
              <p className="mt-2 text-sm text-slate-600">See overload early and rebalance fast.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-1 px-4 py-2 text-[11px] text-slate-600 sm:px-6 lg:px-10 md:flex-row md:items-center md:justify-between">
          <p className="flex items-center gap-1.5">
            <img src={logoMotio} alt="Motio logo" className="h-3.5 w-3.5 shrink-0 object-contain" />
            <span>© {currentYear} Motio. Team planning workspace.</span>
          </p>
          <p>
            Designed and developed by{" "}
            <a
              href="https://nikog.net"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-sky-700"
            >
              NIKO G.
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
