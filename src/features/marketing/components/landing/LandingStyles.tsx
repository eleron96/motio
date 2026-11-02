// Keyframes and classes for the landing page animations: the demo timeline
// and dashboard are drawn imperatively, so their classes live here, not in Tailwind.
export const LandingStyles = () => {
  return (
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

      /* Demo CTA emphasis: the hero button gently breathes via a
         transform-only scale pulse — no halo (it was getting visually
         clipped by the neighbouring "Start for free" button). Pure
         transform → composited on GPU, smooth on 120Hz displays. */
      @keyframes demoCtaBreath {
        0%, 100% { transform: scale(1);     }
        50%      { transform: scale(1.045); }
      }
      .demo-cta-button {
        animation: demoCtaBreath 2400ms cubic-bezier(0.45, 0, 0.55, 1) infinite;
        transform-origin: center;
        will-change: transform;
      }
      .demo-cta-button:hover { animation-play-state: paused; }
      @media (prefers-reduced-motion: reduce) {
        .demo-cta-button { animation: none; }
      }
    `}</style>
  );
};
