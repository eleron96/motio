import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t, Trans } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useLocaleStore } from '@/shared/store/localeStore';
import { Button } from '@/shared/ui/button';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { trackGoogleEvent } from '@/shared/lib/analytics/googleTag';
import logoMotio from '@/shared/assets/branding/logo-motio.png';

// ── static animation data (outside component) ──────────────────────────────

const PEOPLE = [
  { name: 'Anna K.',    color: '#6366f1' },
  { name: 'Mark S.',    color: '#0ea5e9' },
  { name: 'Lisa P.',    color: '#ec4899' },
  { name: 'Denis R.',   color: '#f59e0b' },
  { name: 'Natalia T.', color: '#10b981' },
];

const BARS_DATA: [number, number, number, string][] = [
  [0, 0.00, 0.28, 'Design system'],
  [0, 0.35, 0.55, 'UI review'],
  [0, 0.60, 0.85, 'Handoff'],
  [1, 0.05, 0.40, 'API integration'],
  [1, 0.45, 0.72, 'Testing'],
  [2, 0.10, 0.32, 'User research'],
  [2, 0.38, 0.65, 'Wireframes'],
  [2, 0.70, 0.92, 'Prototype'],
  [3, 0.08, 0.35, 'DB migration'],
  [3, 0.50, 0.80, 'Deploy pipeline'],
  [4, 0.15, 0.50, 'Sprint planning'],
  [4, 0.55, 0.88, 'Retrospective'],
];

const DASH_BAR_DATA = [
  { label: 'Design',   value: 48, color: '#6366f1' },
  { label: 'Backend',  value: 72, color: '#0ea5e9' },
  { label: 'Research', value: 31, color: '#ec4899' },
  { label: 'DevOps',   value: 55, color: '#f59e0b' },
  { label: 'QA',       value: 40, color: '#10b981' },
];

const PIE_DATA = [
  { label: 'Done',        value: 58, color: '#10b981' },
  { label: 'In progress', value: 25, color: '#6366f1' },
  { label: 'Pending',     value: 17, color: '#e2e8f0' },
];

const AREA_POINTS = [4,12,8,22,18,30,24,38,30,50,38,58,44,62,50,70,56,66,62,72,68,76,74,70,80];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

// ── component ───────────────────────────────────────────────────────────────

const LandingPage = () => {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const signOut = useAuthStore((s) => s.signOut);
  const signOutRedirectInProgress = useAuthStore((s) => s.signOutRedirectInProgress);
  const setSignOutRedirectInProgress = useAuthStore((s) => s.setSignOutRedirectInProgress);

  const { locale, setLocale } = useLocaleStore();
  const [manualSignOutLoading, setManualSignOutLoading] = useState(false);
  const currentYear = new Date().getFullYear();

  // animation refs
  const tlRowsRef  = useRef<HTMLDivElement>(null);
  const tlBarsRef  = useRef<HTMLDivElement>(null);
  const dashBarRef = useRef<HTMLDivElement>(null);
  const dashPieRef = useRef<SVGSVGElement>(null);
  const dashPieLegendRef = useRef<HTMLDivElement>(null);
  const dashAreaRef = useRef<SVGSVGElement>(null);
  const dashSectionRef = useRef<HTMLElement>(null);
  const kpiRefs = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    if (!signOutRedirectInProgress) return;
    setSignOutRedirectInProgress(false);
  }, [setSignOutRedirectInProgress, signOutRedirectInProgress]);

  usePageSeo({
    title: t`Motio - Team planning in one timeline`,
    description: t`Motio is a simple workspace for planning projects, tasks, and team workload on a visual timeline.`,
    canonicalPath: '/',
    robots: 'index, follow',
  });

  const handleSignOut = async () => {
    setManualSignOutLoading(true);
    try { await signOut(); } finally { setManualSignOutLoading(false); }
  };

  // ── TIMELINE ANIMATION ────────────────────────────────────────────────────
  useEffect(() => {
    const rowsEl = tlRowsRef.current;
    const barsEl = tlBarsRef.current;
    if (!rowsEl || !barsEl) return;

    PEOPLE.forEach((person, i) => {
      const label = document.createElement('div');
      label.className = 'tl-row-label';
      label.innerHTML = `
        <div class="tl-avatar" style="background:${person.color}">${person.name[0]}</div>
        <span class="tl-row-name">${person.name}</span>`;
      rowsEl.appendChild(label);

      const rowBars = document.createElement('div');
      rowBars.className = 'tl-row-bars';
      rowBars.id = `tl-bars-${i}`;
      if (i === 0) {
        const line = document.createElement('div');
        line.className = 'tl-today';
        rowBars.appendChild(line);
      }
      barsEl.appendChild(rowBars);
    });

    function animateBars() {
      document.querySelectorAll<HTMLElement>('.tl-bar').forEach(el => el.remove());
      BARS_DATA.forEach(([pi, start, end, label], idx) => {
        const container = document.getElementById(`tl-bars-${pi}`);
        if (!container) return;
        const bar = document.createElement('div');
        bar.className = 'tl-bar';
        bar.textContent = label;
        bar.style.left = `${start * 100}%`;
        bar.style.width = `${(end - start) * 100}%`;
        bar.style.background = PEOPLE[pi].color;
        bar.style.animation = `tlBarGrow 0.45s ${300 + idx * 120}ms cubic-bezier(.34,1.3,.64,1) forwards`;
        container.appendChild(bar);
      });
    }

    animateBars();
    const interval = setInterval(() => {
      document.querySelectorAll<HTMLElement>('.tl-bar').forEach(el => {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
      });
      setTimeout(animateBars, 400);
    }, 5000);

    return () => {
      clearInterval(interval);
      rowsEl.innerHTML = '';
      barsEl.innerHTML = '';
    };
  }, []);

  // ── DASHBOARD ANIMATION ───────────────────────────────────────────────────
  useEffect(() => {
    const barContainer = dashBarRef.current;
    const pieSvg = dashPieRef.current;
    const pieLegend = dashPieLegendRef.current;
    const areaSvg = dashAreaRef.current;
    const dashSection = dashSectionRef.current;
    if (!barContainer || !pieSvg || !pieLegend || !areaSvg || !dashSection) return;

    const maxBar = Math.max(...DASH_BAR_DATA.map(d => d.value));
    DASH_BAR_DATA.forEach(d => {
      const heightPx = (d.value / maxBar) * 56;
      const group = document.createElement('div');
      group.className = 'db-bar-group';
      group.innerHTML = `
        <div class="db-bar-fill" style="height:${heightPx}px;background:${d.color};"></div>
        <span class="db-bar-label">${d.label}</span>`;
      barContainer.appendChild(group);
    });

    const circum = 2 * Math.PI * 30;
    const pieTotal = PIE_DATA.reduce((s, d) => s + d.value, 0);
    const pieCircles: { el: SVGCircleElement; finalOffset: number; delay: number }[] = [];
    let pieOffset = 0;
    PIE_DATA.forEach((d, i) => {
      const frac = d.value / pieTotal;
      const dash = frac * circum;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '40'); circle.setAttribute('cy', '40'); circle.setAttribute('r', '30');
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', d.color);
      circle.setAttribute('stroke-width', '14');
      circle.setAttribute('stroke-dasharray', `${dash} ${circum - dash}`);
      circle.setAttribute('transform', 'rotate(-90 40 40)');
      circle.setAttribute('stroke-dashoffset', String(circum));
      pieSvg.appendChild(circle);
      pieCircles.push({ el: circle, finalOffset: circum - pieOffset * circum, delay: i * 200 });
      pieOffset += frac;

      const item = document.createElement('div');
      item.className = 'db-pie-item';
      item.innerHTML = `<span class="db-pie-dot" style="background:${d.color}"></span>${d.label}`;
      pieLegend.appendChild(item);
    });

    const W = 400, H = 80, padY = 6;
    const maxV = Math.max(...AREA_POINTS);
    const pts = AREA_POINTS.map((v, i) => [
      (i / (AREA_POINTS.length - 1)) * W,
      H - padY - ((v / maxV) * (H - padY * 2)),
    ]);
    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${W},${H} L0,${H} Z`;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `<linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#6366f1" stop-opacity="0.02"/>
    </linearGradient>`;
    areaSvg.appendChild(defs);

    const areaFill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    areaFill.setAttribute('d', areaPath);
    areaFill.setAttribute('fill', 'url(#areaGrad)');
    areaFill.style.opacity = '0';
    areaSvg.appendChild(areaFill);

    const areaLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    areaLine.setAttribute('d', linePath);
    areaLine.setAttribute('fill', 'none');
    areaLine.setAttribute('stroke', '#6366f1');
    areaLine.setAttribute('stroke-width', '2');
    areaLine.setAttribute('stroke-linecap', 'round');
    areaLine.setAttribute('stroke-linejoin', 'round');
    areaLine.style.strokeDasharray = '600';
    areaLine.style.strokeDashoffset = '600';
    areaSvg.appendChild(areaLine);

    function animateCounter(el: HTMLSpanElement, target: number, duration: number) {
      el.textContent = '0';
      const start = performance.now();
      function tick(now: number) {
        const p = Math.min((now - start) / duration, 1);
        el.textContent = String(Math.round((1 - Math.pow(1 - p, 3)) * target));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    function runDashCycle() {
      kpiRefs.current.forEach(el => {
        animateCounter(el, parseInt(el.dataset.target ?? '0', 10), 1200);
      });
      barContainer.querySelectorAll<HTMLElement>('.db-bar-fill').forEach((el, i) => {
        el.style.transition = 'none';
        el.style.transform = 'scaleY(0)';
        el.style.opacity = '0';
        setTimeout(() => {
          el.style.transition = `transform 0.5s ${i * 80}ms cubic-bezier(.34,1.3,.64,1), opacity 0.3s ${i * 80}ms`;
          el.style.transform = 'scaleY(1)';
          el.style.opacity = '1';
        }, 30);
      });
      pieCircles.forEach(({ el, finalOffset, delay }) => {
        el.style.transition = 'none';
        el.setAttribute('stroke-dashoffset', String(circum));
        setTimeout(() => {
          el.style.transition = 'stroke-dashoffset 0.7s ease';
          el.setAttribute('stroke-dashoffset', String(finalOffset));
        }, delay + 30);
      });
      areaLine.style.transition = 'none';
      areaLine.style.strokeDashoffset = '600';
      areaFill.style.transition = 'none';
      areaFill.style.opacity = '0';
      setTimeout(() => {
        areaLine.style.transition = 'stroke-dashoffset 1.4s ease';
        areaLine.style.strokeDashoffset = '0';
        areaFill.style.transition = 'opacity 1s 0.4s ease';
        areaFill.style.opacity = '1';
      }, 30);
    }

    let started = false;
    let interval: ReturnType<typeof setInterval>;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !started) {
          started = true;
          runDashCycle();
          interval = setInterval(runDashCycle, 6000);
        }
      });
    }, { threshold: 0.3 });
    obs.observe(dashSection);

    return () => {
      obs.disconnect();
      clearInterval(interval);
      barContainer.innerHTML = '';
      pieSvg.innerHTML = '';
      pieLegend.innerHTML = '';
      areaSvg.innerHTML = '';
    };
  }, []);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">

      {/* injected keyframes */}
      <style>{`
        @keyframes tlBarGrow {
          from { opacity:0; transform:scaleX(0); }
          to   { opacity:1; transform:scaleX(1); }
        }
        @keyframes landFadeDown {
          from { opacity:0; transform:translateY(-10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes landFadeUp {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .tl-row-label {
          border-right:1px solid #e2e8f0; border-bottom:1px solid #f1f5f9;
          padding:10px 12px; display:flex; align-items:center; gap:8px; background:#fff;
        }
        .tl-avatar {
          width:22px; height:22px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          font-size:10px; font-weight:600; color:#fff; flex-shrink:0;
        }
        .tl-row-name { font-size:12px; color:#334155; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .tl-row-bars {
          position:relative; border-bottom:1px solid #f1f5f9; height:44px;
          display:grid; grid-template-columns:repeat(6,1fr);
          background:repeating-linear-gradient(90deg,transparent,transparent calc(100%/6 - 1px),#f1f5f9 calc(100%/6 - 1px),#f1f5f9 calc(100%/6));
        }
        .tl-today { position:absolute; top:0; bottom:0; width:1.5px; background:#3b82f6; opacity:0.5; left:33.3%; z-index:2; }
        .tl-bar {
          position:absolute; top:8px; height:28px; border-radius:6px;
          display:flex; align-items:center; padding:0 8px;
          font-size:11px; font-weight:500; color:#fff;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          transform-origin:left center; opacity:0; transform:scaleX(0);
        }
        .db-bar-group { display:flex; flex-direction:column; align-items:center; gap:4px; flex:1; }
        .db-bar-fill  { width:100%; border-radius:4px 4px 0 0; transform-origin:bottom; transform:scaleY(0); opacity:0; }
        .db-bar-label { font-size:9px; color:#94a3b8; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
        .db-pie-item  { display:flex; align-items:center; gap:5px; font-size:10px; color:#64748b; }
        .db-pie-dot   { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .land-reveal  { opacity:0; transform:translateY(20px); }
        .land-reveal.visible { animation:landFadeUp 0.5s ease forwards; }
      `}</style>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link to="/" className="flex items-center">
            <img src={logoMotio} alt="Motio" className="h-8 w-auto object-contain" />
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocale(locale === 'en' ? 'ru' : 'en')}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Switch language"
            >
              {locale === 'en' ? 'RU' : 'EN'}
            </button>

            {!loading && user ? (
              <>
                <span className="hidden max-w-[180px] truncate text-xs text-slate-500 sm:block">
                  {user.email ?? t`Signed in`}
                </span>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/app">{t`Go to timeline`}</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={manualSignOutLoading || signOutRedirectInProgress}
                >
                  {t`Sign out`}
                </Button>
              </>
            ) : (
              <Button
                asChild
                variant="outline"
                size="sm"
                onClick={() => trackGoogleEvent('login_cta_click', { placement: 'header' })}
              >
                <Link to="/app">{t`Sign in`}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">

        {/* ── HERO ── */}
        <section className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-20 lg:px-10">
          <h1
            className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl lg:text-6xl"
            style={{ animation: 'landFadeDown 0.5s 0.05s ease both', letterSpacing: '-1.5px' }}
          >
            <Trans>
              One <em className="not-italic text-blue-500">clear timeline</em>
              <br />for your whole team
            </Trans>
          </h1>

          <p
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-500 sm:text-lg"
            style={{ animation: 'landFadeDown 0.5s 0.15s ease both' }}
          >
            {t`Motio keeps tasks, projects and workload in one shared workspace — no chaos, no spreadsheets.`}
          </p>

          <div style={{ animation: 'landFadeDown 0.5s 0.25s ease both' }} className="mt-8">
            <Button
              asChild
              size="lg"
              onClick={() => trackGoogleEvent('start_free_click', { placement: 'hero' })}
            >
              <Link to="/app">{t`Start for free →`}</Link>
            </Button>
          </div>

          {/* animated timeline */}
          <div className="mx-auto mt-12 max-w-[860px]" style={{ animation: 'landFadeDown 0.6s 0.35s ease both' }}>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-md">
              <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <span className="ml-2 text-xs text-slate-400">motio.app — Acme Team · Timeline</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
                <span className="text-sm font-semibold text-slate-800">Acme — Projects</span>
                <div className="flex gap-1">
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{t`Timeline`}</span>
                  <span className="rounded-md px-2.5 py-1 text-xs text-slate-400">{t`Calendar`}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                <div className="border-b border-r border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-400">
                  {t`Members`}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)' }} className="border-b border-slate-200 bg-white">
                  {MONTHS.map(m => (
                    <div key={m} className="border-r border-slate-100 px-2 py-1.5 text-xs font-medium text-slate-400">{m}</div>
                  ))}
                </div>
                <div ref={tlRowsRef} />
                <div ref={tlBarsRef} />
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ── */}
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
              { icon: '🔔', bg: '#fff7ed', title: t`Notifications`,           body: t`Stay in the loop when tasks are assigned or updated. No more missed deadlines.` },
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

        {/* ── DASHBOARD ── */}
        <section ref={dashSectionRef} className="mx-auto w-full max-w-[1200px] px-4 pt-24 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-14">
            <div className="flex-shrink-0 lg:w-80">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t`Analytics`}</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" style={{ letterSpacing: '-0.5px' }}>
                {t`Your team's progress, always in view`}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                {t`KPI widgets, bar and area charts, pie breakdowns — build any dashboard you need. Filter by assignee, project or status.`}
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {[
                  t`📊 Tasks by project & assignee`,
                  t`📈 Completion trends over time`,
                  t`🥧 Status & workload breakdown`,
                  t`🎯 Milestones calendar`,
                ].map((item, i) => (
                  <li key={i} className="text-sm text-slate-600">{item}</li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 flex-1">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-md">
                <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="ml-2 text-xs text-slate-400">motio.app — Acme · Dashboard</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
                  <span className="text-sm font-semibold text-slate-800">{t`Dashboard`}</span>
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{t`This month`} ▾</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-white">
                  {([
                    { target: 247, label: t`Total tasks`,  delta: '↑ 12%', up: true  },
                    { target: 184, label: t`Completed`,    delta: '↑ 8%',  up: true  },
                    { target: 63,  label: t`In progress`,  delta: '↓ 3%',  up: false },
                  ] as const).map((kpi, i) => (
                    <div key={i} className="flex flex-col gap-0.5 p-3">
                      <span
                        ref={el => { if (el) kpiRefs.current[i] = el; }}
                        data-target={kpi.target}
                        className="text-xl font-bold tabular-nums text-slate-900"
                        style={{ letterSpacing: '-0.5px' }}
                      >0</span>
                      <span className="text-[10px] text-slate-400">{kpi.label}</span>
                      <span className={`text-[10px] font-semibold ${kpi.up ? 'text-green-600' : 'text-red-500'}`}>{kpi.delta}</span>
                    </div>
                  ))}
                </div>
                <div className="flex divide-x divide-slate-200 border-b border-slate-200">
                  <div className="flex-[1.6] bg-white p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t`Tasks by project`}</p>
                    <div ref={dashBarRef} className="flex h-14 items-end gap-1.5" />
                  </div>
                  <div className="flex-1 bg-white p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t`By status`}</p>
                    <div className="flex items-center gap-2">
                      <svg ref={dashPieRef} viewBox="0 0 80 80" className="h-16 w-16 flex-shrink-0" />
                      <div ref={dashPieLegendRef} className="flex flex-col gap-1" />
                    </div>
                  </div>
                </div>
                <div className="bg-white p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t`Completion trend`}</p>
                  <svg ref={dashAreaRef} viewBox="0 0 400 80" preserveAspectRatio="none" className="h-14 w-full" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="mx-auto w-full max-w-[900px] px-4 pt-24 text-center sm:px-6 lg:px-10">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" style={{ letterSpacing: '-0.5px' }}>
            {t`Up and running in minutes`}
          </h2>
          <div className="relative mt-12 grid grid-cols-3">
            <div className="absolute left-[17%] right-[17%] top-5 h-px bg-slate-200" />
            {([
              { n: 1, title: t`Create workspace`, body: t`Set up your team workspace in seconds. No credit card needed.` },
              { n: 2, title: t`Add tasks & dates`, body: t`Place tasks on the timeline. Assign them to people and projects.` },
              { n: 3, title: t`Invite your team`,  body: t`Everyone sees the same picture. Plan together, ship together.` },
            ] as const).map((step, i) => (
              <div key={step.n} className="land-reveal flex flex-col items-center gap-3 px-4" style={{ animationDelay: `${i * 120}ms` }}>
                <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {step.n}
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                <p className="text-xs leading-relaxed text-slate-500">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA BOTTOM ── */}
        <div className="mx-auto w-full max-w-[1200px] px-4 py-24 sm:px-6 lg:px-10">
          <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-16 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.15),transparent_70%)]" />
            <h2 className="relative text-2xl font-bold text-white sm:text-3xl lg:text-4xl" style={{ letterSpacing: '-0.5px' }}>
              {t`Ready to bring clarity to your team?`}
            </h2>
            <p className="relative mt-3 text-base text-slate-400">
              {t`Join teams already planning smarter with Motio.`}
            </p>
            <div className="relative mt-8">
              <Button
                asChild
                className="bg-white text-slate-900 hover:bg-slate-100"
                size="lg"
                onClick={() => trackGoogleEvent('start_free_click', { placement: 'cta_bottom' })}
              >
                <Link to="/app">{t`Get started for free →`}</Link>
              </Button>
            </div>
          </div>
        </div>

      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-0.5 px-4 py-3 text-[11px] leading-tight text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <p>© {currentYear} Motio. {t`Team planning workspace.`}</p>
          <p>
            <Trans>
              Designed and developed by{' '}
              <a
                href="https://nikog.net"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-blue-600"
              >
                NIKO G.
              </a>
            </Trans>
          </p>
        </div>
      </footer>

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
