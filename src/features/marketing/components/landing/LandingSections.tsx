import { Link } from 'react-router-dom';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import heatmapImage from '@/features/marketing/assets/heatmap.webp';

// Four feature cards.
export const LandingFeatures = () => {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 pt-20 sm:px-6 lg:px-10">
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
        {t`Why Motio`}
      </p>
      <h2 className="mt-3 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl" style={{ letterSpacing: '-0.5px' }}>
        {t`Everything your team needs to stay aligned`}
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([
          { icon: '📅', bg: '#eff6ff', title: t`Visual timeline`,       body: t`See all tasks and who's doing what across any date range. Spot gaps and overlaps instantly.` },
          { icon: '🗂️', bg: '#f0fdf4', title: t`Projects & milestones`,  body: t`Group tasks by project, set milestones, and track progress without switching tools.` },
          { icon: '👥', bg: '#fdf4ff', title: t`Team workload`,           body: t`Understand who is overloaded before it becomes a problem. Balance work across the team.` },
          { icon: '☀️', bg: '#fff7ed', title: t`Daily Brief`,             body: t`Each morning starts with a short brief. What's on you today, which milestones are this week, where the team needs you. Before you open anything else.` },
        ] as const).map((card, i) => (
          <div
            key={i}
            className="land-reveal rounded-2xl border border-slate-200 bg-slate-50 p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-xl" style={{ background: card.bg }}>
              {card.icon}
            </div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{card.title}</h3>
            <p className="text-sm leading-relaxed text-slate-500">{card.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

// A real screenshot from the live demo: the board that sets Motio apart.
export const LandingHeatmap = () => {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 pt-24 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t`Workload heatmap`}</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" style={{ letterSpacing: '-0.5px' }}>
          {t`Spot overload months ahead`}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-500 sm:text-base">
          {t`Each day is coloured by how busy the team is: tasks per person who is actually there, with milestones and time off counted in. Click a hot day to jump straight to it on the timeline.`}
        </p>
      </div>
      <div className="land-reveal mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
        <img
          src={heatmapImage}
          alt={t`The workload heatmap: the team's load per day for the coming months`}
          width={1600}
          height={470}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full"
        />
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">
        {t`Experimental — a workspace admin switches it on in settings.`}
      </p>
    </section>
  );
};

// Own infrastructure is an option for those who need it, not the main promise: the main path stays "sign up and work".
export const LandingSelfHosted = () => {
  return (
    <section className="mx-auto w-full max-w-[900px] px-4 pt-24 sm:px-6 lg:px-10">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-8 sm:px-10">
        <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl" style={{ letterSpacing: '-0.3px' }}>
          {t`Need it on your own servers? That works too.`}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          {t`Most teams just sign up and start working. If your data has to stay inside your own perimeter, Motio deploys to your infrastructure — and you can export everything and walk away whenever you want.`}
        </p>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
          {([
            t`One-command install`,
            t`Behind your own reverse proxy`,
            t`SSO via Keycloak`,
            t`Backup & restore`,
            t`Full data export`,
          ] as const).map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-300" />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="font-medium text-slate-700">{t`Open source under AGPL-3.0`}</span>
          <a
            href="https://github.com/eleron96/motio/blob/main/docs/self-hosting.md"
            target="_blank"
            // noopener, not noreferrer: GitHub's traffic page should see this site as the referrer
            rel="noopener"
            className="font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
          >
            {t`Self-hosting guide on GitHub →`}
          </a>
        </div>
      </div>
    </section>
  );
};

// Why I built this.
export const LandingStory = () => {
  return (
    <section className="mx-auto w-full max-w-[760px] px-4 pt-24 sm:px-6 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        {t`Why I built this`}
      </p>
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" style={{ letterSpacing: '-0.5px' }}>
        {t`The tool I wanted to use`}
      </h2>
      <div className="mt-6 flex flex-col gap-4 text-sm leading-relaxed text-slate-600 sm:text-base">
        <p>
          {t`I'm Niko G. For years I've managed teams and projects around BIM, where I kept running into the same problem.`}
        </p>
        <p>
          {t`Most tools show what people are doing. Almost none let you quickly see when they're busy, when they're free, and how the work is spread across the week.`}
        </p>
        <p>
          {t`On Monday I'd open three different tabs to answer one simple question: who's free this week. By Wednesday it would turn out someone was already overloaded, and I'd find out too late. At the retro, in a chat thread, or after a missed deadline.`}
        </p>
        <p>
          {t`Motio grew out of exactly this boring but very real problem.`}
        </p>
        <p>
          {t`It doesn't try to be everything at once. No custom fields, no complex automations, no formulas. One main screen, the timeline, and a quick way to see who's working on what. A board of status columns is there too, if you want it.`}
        </p>
        <p>
          {t`Any task takes 10 seconds to add. Not because we forgot to ship more features. That's the product's position.`}
        </p>
        <p>
          {t`If the question "who's working on what this week" keeps coming up in your team, it's time to try Motio.`}
        </p>
      </div>
    </section>
  );
};

// The closing call to action.
export const LandingFinalCta = () => {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-24 sm:px-6 lg:px-10">
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-16 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(198,112,78,0.2),transparent_70%)]" />
        <h2 className="relative text-2xl font-bold text-white sm:text-3xl lg:text-4xl" style={{ letterSpacing: '-0.5px' }}>
          {t`Try Motio now`}
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-400">
          {t`We work with small teams that need one simple thing: to see who is busy, who is free, and how the work is spread across the week. Signing up takes a minute, no credit card needed.`}
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            asChild
            className="bg-white text-slate-900 hover:bg-slate-100"
            size="lg"
          >
            <Link to="/auth?intent=register">{t`Start now →`}</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            {/* Hard navigation — see header CTA above. */}
            <a href="/demo">{t`Try demo — no signup`}</a>
          </Button>
        </div>
      </div>
    </div>
  );
};
