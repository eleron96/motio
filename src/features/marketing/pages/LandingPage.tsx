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
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight text-slate-900">
            <img src={logoMotio} alt="Motio logo" className="h-8 w-8 shrink-0 object-contain" />
            <span>Motio</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#overview" className="transition-colors hover:text-slate-900">
              Overview
            </a>
            <a href="#flow" className="transition-colors hover:text-slate-900">
              Flow
            </a>
          </nav>

          {!loading && user ? (
            <div className="flex items-center gap-3">
              <span className="max-w-[200px] truncate text-sm text-slate-600">{user.email ?? "Signed in"}</span>
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

      <main className="mx-auto w-full max-w-6xl px-6 py-14">
        <section id="overview" className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm md:p-12">
          <h1 className="text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
            One clear timeline for projects and people
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            Motio keeps tasks, milestones, and workload in one shared workspace.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wide text-slate-600">
            <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1">Tasks</span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1">Projects</span>
            <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1">Capacity</span>
          </div>
        </section>

        <section id="flow" className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">What you get</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 motion-safe:transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">1. Plan</h3>
              <p className="mt-2 text-sm text-slate-600">Add tasks with dates and owners.</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 motion-safe:transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">2. Coordinate</h3>
              <p className="mt-2 text-sm text-slate-600">Group work into projects and milestones.</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 motion-safe:transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">3. Balance</h3>
              <p className="mt-2 text-sm text-slate-600">See overload early and rebalance fast.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <p className="flex items-center gap-2">
            <img src={logoMotio} alt="Motio logo" className="h-5 w-5 shrink-0 object-contain" />
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
