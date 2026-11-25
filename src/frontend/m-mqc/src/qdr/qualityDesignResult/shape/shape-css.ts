/**
 * 설계 형상 스타일 — mes-to-be assets/shape/shape.css 를 DMES 의미 토큰으로 옮겼다. 포털이 원격 모듈의 CSS 파일을 싣지 않으므로
 * 컴포넌트가 <style href precedence> 로 한 번만 넣는다(shared Badge 와 같은 방식). 층 색은 SVG 속성에 있다.
 */
export const CIRCLED_SCENE = ["①", "②", "③", "④", "⑤", "⑥"];

const MONO = "var(--font-family-mono)";

export const SHAPE_CSS = `
.mqc-shape-root{container-type:inline-size}
.mqc-shape-empty{color:var(--color-text-muted);font-size:var(--font-size-sm);padding:8px 0}
.mqc-shape-warns{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.mqc-shape-warn{display:inline-flex;align-items:center;font-size:11px;font-weight:700;color:var(--color-danger);background:var(--color-danger-soft);border-radius:99px;padding:2px 9px}
.mqc-shape-strip{display:flex;gap:6px;align-items:stretch;flex-wrap:wrap}
.mqc-shape-cell{display:flex;gap:6px;align-items:stretch;flex:1 1 140px;min-width:140px}
.mqc-shape-sc{flex:1 1 auto;min-width:0;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:8px 8px 6px;background:var(--color-bg);cursor:pointer;text-align:left}
.mqc-shape-sc:hover{background:var(--color-bg-hover)}
.mqc-shape-sc.on{border-color:var(--color-primary);box-shadow:0 0 0 2px var(--color-primary-soft)}
.mqc-shape-sc:focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}
.mqc-shape-sc-t{font-weight:700;font-size:11.5px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mqc-shape-sc-t small{color:var(--color-text-muted);font-weight:400;margin-left:4px}
.mqc-shape-sc .mqc-shape-coil-sm{width:100%;height:56px;display:block}
.mqc-shape-sc-g{font-family:${MONO};font-size:11px;color:var(--color-primary);margin-top:4px;overflow-wrap:break-word;line-height:1.2}
.mqc-shape-sc-d{font-family:${MONO};font-size:10.5px;color:var(--color-danger);overflow-wrap:break-word;line-height:1.25;min-height:14px}
.mqc-shape-arr{align-self:center;color:var(--color-border-strong);font-size:14px;flex:0 0 auto}
.mqc-shape-det{display:grid;grid-template-columns:320px 1fr;gap:14px;margin-top:12px;border-top:1px dashed var(--color-border);padding-top:12px}
.mqc-shape-root.expanded .mqc-shape-det{grid-template-columns:1fr}
.mqc-shape-root.expanded .mqc-shape-coil-lg{max-width:720px;margin:0 auto}
.mqc-shape-fig{background:var(--color-bg-light);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:8px}
.mqc-shape-coil-lg{width:100%;height:auto;display:block;font-size:10.5px}
.mqc-shape-dim{stroke:var(--color-text);stroke-width:1}
.mqc-shape-lead{stroke:var(--color-primary);stroke-dasharray:3 2;stroke-width:1}
.mqc-shape-cut{fill:var(--color-bg);stroke:var(--color-primary);stroke-width:1.5}
.mqc-shape-txt{fill:var(--color-text)}
.mqc-shape-txt-dim{fill:var(--color-text-muted)}
.mqc-shape-txt-acc{fill:var(--color-primary)}
.mqc-shape-txt-onink{fill:var(--color-on-primary);font-weight:700}
.mqc-shape-layer:hover{stroke:var(--color-primary);stroke-width:1}
.mqc-shape-layers{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:3px;font-size:11px}
.mqc-shape-layers li{display:flex;align-items:center;gap:6px}
.mqc-shape-layers i,.mqc-shape-legend i{display:inline-block;width:12px;height:8px;border-radius:2px;flex:none}
.mqc-shape-layers b{margin-left:auto;font-family:${MONO};font-weight:600}
.mqc-shape-vals{display:grid;gap:6px;align-content:start}
.mqc-shape-det-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin-bottom:2px}
.mqc-shape-det-h b{font-size:12.5px}
.mqc-shape-delta{color:var(--color-danger);font-family:${MONO};font-size:11px}
.mqc-shape-note{color:var(--color-text-muted);font-size:11px;margin-left:auto}
.mqc-shape-v{display:grid;grid-template-columns:150px 1fr;gap:8px;align-items:start;padding:6px 8px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg)}
.mqc-shape-v:hover,.mqc-shape-v:focus-within{border-color:var(--color-primary)}
.mqc-shape-v:hover .mqc-shape-v-f,.mqc-shape-v:focus-within .mqc-shape-v-f{color:var(--color-text);font-weight:600}
.mqc-shape-v-k{color:var(--color-text-secondary);font-size:12px}
.mqc-shape-v-b{font-size:12.5px}
.mqc-shape-n{font-family:${MONO};font-weight:600}
.mqc-shape-missing{color:var(--color-text-muted)}
.mqc-shape-ref{font-family:${MONO};font-size:10.5px;color:var(--color-text-muted);margin-left:6px}
.mqc-shape-badge{display:inline-block;border:1px solid var(--color-primary);color:var(--color-primary);background:var(--color-primary-soft);border-radius:var(--radius-sm);padding:0 6px;margin-left:6px;vertical-align:middle;cursor:pointer;font:inherit;font-size:10.5px}
.mqc-shape-badge:hover{background:var(--color-primary);color:var(--color-on-primary)}
.mqc-shape-v-f{color:var(--color-text-muted);font-size:11px;margin-top:2px}
.mqc-shape-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--color-text-secondary);margin-top:10px}
.mqc-shape-legend i{margin-right:4px;vertical-align:middle}
@container (max-width:720px){
  .mqc-shape-det{grid-template-columns:1fr}
  .mqc-shape-v{grid-template-columns:1fr}
  .mqc-shape-note{margin-left:0}
}
`;
