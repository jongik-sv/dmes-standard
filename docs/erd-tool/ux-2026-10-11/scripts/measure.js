() => {
  const vw = innerWidth, vh = innerHeight, A = vw * vh;
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); const x0=Math.max(0,b.left), y0=Math.max(0,b.top), x1=Math.min(vw,b.right), y1=Math.min(vh,b.bottom); const w=Math.max(0,x1-x0), h=Math.max(0,y1-y0); return { x: Math.round(x0), y: Math.round(y0), w: Math.round(w), h: Math.round(h), pct: +(100*w*h/A).toFixed(1) }; };
  const app = document.querySelector('.erd-app').getBoundingClientRect();
  const ca = document.querySelector('.portal-shell__content-area')?.getBoundingClientRect();
  const out = {
    viewport: `${vw}x${vh}`,
    topHeader: r('header.mantine-AppShell-header'),
    leftMenu: r('.sidebar-container'),
    tabBar: r('.tabs-bar-wrapper'),
    pageTitlePx: ca ? Math.round(app.top - ca.top) : null,
    footerPx: Math.round(vh - app.bottom),
    erdBar: r('.erd-area-bar'),
    treeSide: r('.erd-area-side'),
    canvas: r('.erd-area-center'),
    rightPanel: r('.erd-area-grid'),
    columnGrid: r('.erd-area-grid .grid-panel'),
    reviewPanel: r('.erd-area-review'),
  };
  // node size at zoom 1
  const vp = document.querySelector('.react-flow__viewport');
  const s = vp ? +(vp.style.transform.match(/scale\(([\d.]+)\)/)||[0,1])[1] : 1;
  const ns = [...document.querySelectorAll('.react-flow__node')].map(n => { const b = n.getBoundingClientRect(); return [b.width / s, b.height / s]; }).filter(([w,h])=>w>0&&h>0);
  const avg = (i) => ns.length ? Math.round(ns.reduce((a, v) => a + v[i], 0) / ns.length) : 0;
  const nw = avg(0), nh = avg(1);
  const c = out.canvas;
  out.node = { avgW: nw, avgH: nh, sample: ns.length, zoomNow: s };
  if (c && nw && nh) { const gap = 60; out.nodesFitZoom1 = Math.max(0, Math.floor((c.w + gap) / (nw + gap))) * Math.max(0, Math.floor((c.h + gap) / (nh + gap))); out.nodesFitZoom1_cols = Math.floor((c.w + gap) / (nw + gap)); out.nodesFitZoom1_rows = Math.floor((c.h + gap) / (nh + gap)); }
  out.canvasShare = c ? c.pct : null;
  return out;
}
