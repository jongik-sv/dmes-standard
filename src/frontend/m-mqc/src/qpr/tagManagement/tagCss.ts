/**
 * Tag관리 화면 범위 스타일 — 목업의 TAG 무대(칸 선택 · 겹침 · 칸 옮기기 상자), 코일 목록, 검사기(값 상자 · 출처 경로 · 규칙 줄 카드)를 옮겼다.
 * 모든 선택자는 `.tagm`(화면 루트) 또는 `tagm-` 접두 클래스 아래에 둔다. 색은 의미 토큰만 쓴다(TAG 종이 그림 자체의 색은 engine/sim.ts 가 SVG 속성으로 넣는다).
 */
export const TAG_CSS = `
.tagm-bar{display:flex;align-items:center;gap:var(--spacing-sm);flex-wrap:wrap;padding:var(--spacing-xs) var(--spacing-md)}
.tagm-grow{flex:1}
.tagm-title{margin:0;font-size:var(--font-size-lg);font-weight:700;min-width:0;flex:1 1 280px;overflow-wrap:anywhere}
.tagm-muted{color:var(--color-text-muted);font-size:var(--font-size-xs)}
.tagm-zoom{display:inline-flex;align-items:center;gap:2px}
.tagm-zoom span{min-width:44px;text-align:center;font-size:var(--font-size-xs);color:var(--color-text-secondary);font-variant-numeric:tabular-nums}
.tagm-stagebox{padding:var(--spacing-xs) var(--spacing-md) var(--spacing-md);display:flex;flex-direction:column;align-items:center;overflow:auto}
.tagm-wrap{position:relative;background:var(--color-bg);box-shadow:0 2px 16px var(--color-border-strong);flex:none}
.tagm-wrap.draft{margin-top:24px}
.tagm-wrap svg{display:block}
.tagm-wrap canvas.ras{display:block;image-rendering:pixelated}
.tagm-wrap svg.ghost{position:absolute;left:0;bottom:0;opacity:0}
.tagm-ribbon{position:absolute;left:0;right:0;top:-24px;height:24px;text-align:center;background:var(--color-danger);color:var(--color-on-primary);font-size:var(--font-size-xs);font-weight:600;line-height:24px;border-radius:5px 5px 0 0}
.tagm-ribbon.pending{background:var(--color-primary)}
.tagm-under{display:flex;align-items:center;gap:var(--spacing-md);flex-wrap:wrap;margin-top:var(--spacing-sm);font-size:var(--font-size-xs);color:var(--color-text-secondary)}
.tagm-lg{display:inline-flex;align-items:center;gap:5px}
.tagm-lg i{width:11px;height:11px;border-radius:3px;display:inline-block}
.tagm-alert{display:inline-flex;align-items:center;gap:var(--spacing-xs);color:var(--color-danger);background:var(--color-danger-soft);border-radius:6px;padding:3px 8px}
.tagm-stage svg .fld{cursor:pointer;outline:none}
.tagm-stage svg .fld:hover .hit,.tagm-stage svg .fld:focus .hit{stroke:var(--color-primary);stroke-dasharray:3 2;stroke-width:1}
.tagm-stage svg .fld.sel .hit{stroke:var(--color-primary);stroke-width:2.2;stroke-dasharray:none}
.tagm-stage svg .fld.over .hit{stroke:var(--color-danger);stroke-width:1.4;stroke-dasharray:4 2}
.tagm-stage svg .fld.sel.over .hit{stroke:var(--color-primary);stroke-dasharray:none}
.tagm-stage svg .fld.dim{opacity:.28}
.tagm-stage svg .fld.clash .hit{stroke:var(--color-danger);stroke-width:1.2;stroke-dasharray:3 2}
.tagm-stage svg .fld.clash2 .hit{stroke:var(--color-warning);stroke-width:1.2;stroke-dasharray:3 2}
.tagm-stage.lay svg{touch-action:none;user-select:none}
.tagm-stage svg .gbox{cursor:move;fill:transparent;stroke:var(--color-border-medium);stroke-dasharray:3 2;stroke-width:.8}
.tagm-stage svg .gbox:hover{stroke:var(--color-primary);stroke-width:1.4;fill:var(--color-primary-soft);fill-opacity:.4}
.tagm-stage svg .gbox.moved{stroke:var(--color-warning)}
.tagm-stage svg .gbox.sel{stroke:var(--color-primary);stroke-width:2;stroke-dasharray:none;fill:var(--color-primary-soft);fill-opacity:.5}
.tagm-stage svg .gbox.clash{stroke:var(--color-danger);stroke-width:1.6;stroke-dasharray:none;fill:var(--color-danger-soft);fill-opacity:.5}
.tagm-stage svg .gbox.clash2{stroke:var(--color-warning);stroke-width:1.4;stroke-dasharray:none;fill:var(--color-warning-soft);fill-opacity:.5}
.tagm-stage svg .hdl{fill:var(--color-bg);stroke:var(--color-primary);stroke-width:1.2}
.tagm-stage svg .hdl[data-h=nw],.tagm-stage svg .hdl[data-h=se]{cursor:nwse-resize}
.tagm-stage svg .hdl[data-h=ne],.tagm-stage svg .hdl[data-h=sw]{cursor:nesw-resize}
.tagm-stage svg .hdl[data-h=n],.tagm-stage svg .hdl[data-h=s]{cursor:ns-resize}
.tagm-stage svg .hdl[data-h=e],.tagm-stage svg .hdl[data-h=w]{cursor:ew-resize}
.tagm-stage svg .guide-l{stroke:var(--color-danger);stroke-width:.8;stroke-dasharray:4 3}
.tagm-tip{position:fixed;z-index:300;pointer-events:none;background:var(--color-text);color:var(--color-bg);border-radius:6px;padding:6px 10px;font-size:var(--font-size-xs);max-width:320px;display:none}
.tagm-tip b{display:block}
.tagm-tip span{display:block;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tagm-list{display:flex;flex-direction:column}
.tagm-grp{padding:var(--spacing-xs) 0 2px}
.tagm-grp h4{margin:0;padding:4px 12px;font-size:var(--font-size-xs);font-weight:700;color:var(--color-text-muted)}
.tagm-item{display:block;width:100%;text-align:left;border:0;background:none;padding:6px 10px 6px 12px;cursor:pointer;color:inherit;font:inherit}
.tagm-item:hover{background:var(--color-bg-hover)}
.tagm-item[aria-current=true]{background:var(--color-selection);box-shadow:inset 0 0 0 1px var(--color-selection-border)}
.tagm-item .n{font-size:var(--font-size-sm);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tagm-item .m{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
.tagm-valbox{border:1px solid var(--color-border);border-radius:8px;padding:10px 12px;background:var(--color-bg-light);font-size:var(--font-size-lg);font-weight:600;word-break:break-all;min-height:44px;display:flex;align-items:center;gap:10px}
.tagm-valbox.empty{font-size:var(--font-size-sm);font-weight:400;color:var(--color-text-muted)}
.tagm-valbox.chg{border-color:var(--color-warning);background:var(--color-warning-soft)}
.tagm-valbox img{max-height:52px;max-width:170px;background:var(--color-bg);border:1px solid var(--color-border-light);padding:3px;border-radius:4px}
.tagm-was{font-size:var(--font-size-xs);color:var(--color-text-muted)}
.tagm-was del{color:var(--color-danger)}
.tagm-box{border:1px solid var(--color-border);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px}
.tagm-box.bad{border-color:var(--color-danger);background:var(--color-danger-soft)}
.tagm-box.ok{border-color:var(--color-success);background:var(--color-success-soft)}
.tagm-box.warn{border-color:var(--color-warning);background:var(--color-warning-soft)}
.tagm-h3{margin:0 0 6px;font-size:var(--font-size-xs);color:var(--color-text-muted);font-weight:700}
.tagm-path{list-style:none;margin:0;padding:0}
.tagm-path li{position:relative;padding:0 0 12px 22px}
.tagm-path li:last-child{padding-bottom:0}
.tagm-path li::before{content:"";position:absolute;left:5px;top:6px;width:9px;height:9px;border-radius:50%;background:var(--color-bg);border:2px solid var(--color-border-medium)}
.tagm-path li::after{content:"";position:absolute;left:9px;top:18px;bottom:-2px;width:1px;background:var(--color-border)}
.tagm-path li:last-child::after{display:none}
.tagm-path li.key::before{border-color:var(--color-primary);background:var(--color-primary)}
.tagm-path .lab{font-size:var(--font-size-xs);font-weight:700;color:var(--color-text-muted);display:flex;align-items:center;gap:6px}
.tagm-path .body{font-size:var(--font-size-sm);margin-top:2px}
.tagm-edit{margin-top:6px;display:flex;flex-direction:column;gap:4px}
.tagm-edit label{font-size:var(--font-size-xs);color:var(--color-text-secondary)}
.tagm-edit.chg input,.tagm-edit.chg select{background:var(--color-warning-soft)}
.tagm-cards{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.tagm-cards li{border:1px solid var(--color-border-light);border-radius:8px;padding:7px 9px;display:flex;flex-direction:column;gap:3px;font-size:var(--font-size-sm)}
.tagm-cards li.cur{border-color:var(--color-primary);background:var(--color-primary-soft)}
.tagm-cards li.bad{border-color:var(--color-danger);background:var(--color-danger-soft)}
.tagm-cards li.warn{border-color:var(--color-warning);background:var(--color-warning-soft)}
.tagm-cards li.done{opacity:.6}
.tagm-cards .dv{display:flex;gap:6px;align-items:center;flex-wrap:wrap;word-break:break-all}
.tagm-cards .dw{font-size:var(--font-size-xs);color:var(--color-text-secondary)}
.tagm-cards .dn{display:flex;gap:6px;align-items:center;font-size:var(--font-size-xs);color:var(--color-text-muted)}
.tagm-cards .here{margin-left:auto;font-weight:700;color:var(--color-primary)}
.tagm-cards .gv{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.tagm-cards .gv>div{border:1px solid var(--color-border-light);border-radius:6px;padding:5px 7px;word-break:break-all;display:flex;flex-direction:column;gap:3px}
.tagm-vimg{max-height:28px;max-width:140px;object-fit:contain;align-self:flex-start;background:var(--color-bg)}
.tagm-stepper{display:inline-flex;align-items:center;gap:4px}
.tagm-stepper span{min-width:52px;text-align:center;font-variant-numeric:tabular-nums}
.tagm-geo{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px 8px;align-items:center}
.tagm-kv{display:grid;grid-template-columns:84px 1fr;gap:6px 10px;align-items:center}
.tagm-kv>label{font-size:var(--font-size-xs);color:var(--color-text-secondary)}
.tagm-kv .chg input,.tagm-kv .chg select{background:var(--color-warning-soft)}
.tagm-asset{display:grid;grid-template-columns:64px 1fr;gap:10px;align-items:center;border:1px solid var(--color-border-light);border-radius:8px;padding:8px}
.tagm-asset .th{background:var(--color-bg);border:1px solid var(--color-border-light);border-radius:5px;height:46px;display:grid;place-items:center;padding:3px}
.tagm-asset .th img{max-width:100%;max-height:40px}
.tagm-dots{grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap}
.tagm-dots figure{margin:0;display:flex;flex-direction:column;gap:2px}
.tagm-dots canvas{image-rendering:pixelated;border:1px solid var(--color-border-light);background:var(--color-bg);max-width:150px}
.tagm-dots figcaption{font-size:var(--font-size-xs);color:var(--color-text-muted)}
.tagm-gbar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--color-border-light)}
.tagm-gbar i.ok{background:var(--color-success)}
.tagm-gbar i.bad{background:var(--color-danger)}
.tagm-cmp{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.tagm-cmp h4{margin:0 0 6px;font-size:var(--font-size-sm);display:flex;gap:8px;align-items:center}
.tagm-print{display:flex;justify-content:center;padding:var(--spacing-md);background:var(--color-bg-app)}
.ag-row.tagm-row-hit{background:var(--color-primary-soft)}
.ag-cell.tagm-cell-chg{background:var(--color-warning-soft)}
`;
