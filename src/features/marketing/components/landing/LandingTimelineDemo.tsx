import { useEffect, useRef } from 'react';
import { t } from '@lingui/macro';

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

// "Up and running in minutes": three steps and a timeline mock whose bars
// grow in again every few seconds.
export const LandingTimelineDemo = () => {
  const tlRowsRef = useRef<HTMLDivElement>(null);
  const tlBarsRef = useRef<HTMLDivElement>(null);

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

  return (
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

      {/* animated illustration of planning months ahead (it used to be the hero) */}
      <div className="land-reveal mx-auto mt-14 max-w-[860px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-md">
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
            <span className="ml-2 text-xs text-slate-400">motio.nikog.net · Acme Team · Timeline</span>
          </div>
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
            <span className="text-sm font-semibold text-slate-800">Acme · Projects</span>
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
  );
};
