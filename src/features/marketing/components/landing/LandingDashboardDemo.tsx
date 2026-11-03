import { useEffect, useRef } from 'react';
import { t } from '@lingui/macro';

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

// The analytics section: a dashboard mock whose counters, bars, pie and
// trend line replay every few seconds once the section scrolls into view.
export const LandingDashboardDemo = () => {
  const dashBarRef = useRef<HTMLDivElement>(null);
  const dashPieRef = useRef<SVGSVGElement>(null);
  const dashPieLegendRef = useRef<HTMLDivElement>(null);
  const dashAreaRef = useRef<SVGSVGElement>(null);
  const dashSectionRef = useRef<HTMLElement>(null);
  const kpiRefs = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    const barContainer = dashBarRef.current;
    const pieSvg = dashPieRef.current;
    const pieLegend = dashPieLegendRef.current;
    const areaSvg = dashAreaRef.current;
    const dashSection = dashSectionRef.current;
    if (!barContainer || !pieSvg || !pieLegend || !areaSvg || !dashSection) return;

    const maxBar = Math.max(...DASH_BAR_DATA.map(d => d.value));
    DASH_BAR_DATA.forEach(d => {
      const heightPx = (d.value / maxBar) * 48;
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
      if (!barContainer) return;
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

  return (
    <section ref={dashSectionRef} className="mx-auto w-full max-w-[1200px] px-4 pt-24 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-14">
        <div className="flex-shrink-0 lg:w-80">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t`Analytics`}</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" style={{ letterSpacing: '-0.5px' }}>
            {t`Your team's progress, always in view`}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-500">
            {t`KPI widgets, bar and area charts, pie breakdowns. Build any dashboard you need. Filter by assignee, project or status.`}
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
              <span className="ml-2 text-xs text-slate-400">motio.nikog.net · Acme · Dashboard</span>
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
                <div ref={dashBarRef} className="flex h-20 items-end gap-1.5" />
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
  );
};
