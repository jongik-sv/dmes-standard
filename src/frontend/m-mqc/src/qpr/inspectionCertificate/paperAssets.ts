/**
 * 종이 그림·글꼴(약 430KB)을 처음 쓸 때 한 번만 불러온다(동적 import — 다른 화면 번들에 섞이지 않는다).
 * 종이 틀 CSS(목업 .paper·적용 기준 색·초안 띠·사본 표시·인쇄)와 위변조방지 보안 무늬도 여기서 만든다.
 */
import { FORM_KEYS } from "./engine/constants";
import { FORMDEF } from "./engine/formdef";

export interface PaperAssets {
  fontCss: string;
  imgs: Record<string, string>;
}

let cache: Promise<PaperAssets> | null = null;
export function loadPaperAssets(): Promise<PaperAssets> {
  if (!cache)
    cache = import("./data/paper-assets.json").then((m) => (m.default ?? m) as PaperAssets).catch((e: unknown) => {
      cache = null;
      throw e;
    });
  return cache;
}

/** 종이 배경 보안 무늬 — 작은 글씨 반복 + 물결(목업 수준, 인쇄에도 옅게 남는다). */
const SEC_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48">' +
  '<path d="M0 24 Q20 12 40 24 T80 24 T120 24 T160 24" fill="none" stroke="#6E8FC9" stroke-width="0.5"/>' +
  '<path d="M0 30 Q20 18 40 30 T80 30 T120 30 T160 30" fill="none" stroke="#9BB0D8" stroke-width="0.4"/>' +
  '<text x="2" y="9" font-family="Arial" font-size="5" fill="#6E8FC9" letter-spacing="0.6">DONGKUK CM · GENUINE MTC · 동국씨엠 정품 증명서 ·</text>' +
  '<text x="-30" y="44" font-family="Arial" font-size="5" fill="#6E8FC9" letter-spacing="0.6">GENUINE MTC · DONGKUK CM · 진위 확인 · GENUINE MTC ·</text>' +
  "</svg>";

const FRAME_CSS = `
html,body{margin:0;background:transparent}
body{padding:16px;font-family:sans-serif}
#ps{position:relative;margin:0 auto;overflow:hidden}
.paper{position:absolute;top:0;left:0;transform-origin:0 0;width:297mm;height:210mm;background:#fff;color:#000;box-shadow:0 2px 14px rgba(0,0,0,.18)}
.paper .simband{position:absolute;left:0;right:0;top:0;height:5mm;background:#C62828;color:#fff;text-align:center;font:700 9pt/5mm 'Malgun Gothic',sans-serif;z-index:5}
.paper .simwm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font:700 110pt Arial,sans-serif;color:rgba(0,0,0,.05);transform:rotate(-18deg);z-index:4}
.paper .secbg{position:absolute;inset:0;pointer-events:none;z-index:-1;opacity:.16;background-image:url("data:image/svg+xml;utf8,${encodeURIComponent(SEC_SVG)}");background-size:42mm 12.6mm}
.paper .verify{position:absolute;left:70mm;top:190.4mm;width:160mm;font:6.5pt/3.6mm "MtcSans","MtcKr",sans-serif;color:#1F3B6B;white-space:nowrap;letter-spacing:.02em}
.paper .verify b{font-family:monospace;font-size:7.5pt;letter-spacing:.08em}
.paper.origin [data-o="ovr"]{background:#FBDDC3!important;box-shadow:0 0 0 .4mm #D9822B}
.paper.origin [data-o="rule"]{background:#D9E2FB!important;box-shadow:0 0 0 .4mm #3B5FC0}
.paper [data-chg]{outline:.5mm dashed #E07B1F;outline-offset:.2mm}
@page{size:297mm 210mm;margin:0}
@media print{
  body{padding:0}
  *,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  #ps{width:auto!important;height:auto!important;overflow:visible}
  .paper{position:static;transform:none!important;box-shadow:none}
  .paper [data-o]{background:none!important;box-shadow:none!important}
  .paper [data-chg]{outline:none}
}`;

/** iframe 문서(머리만 — 본문 종이는 그 뒤 바꿔 넣는다). */
export function frameDoc(a: PaperAssets, title: string) {
  const formCss = FORM_KEYS.map((k) => FORMDEF[k].css).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${a.fontCss}\n${formCss}\n${FRAME_CSS}</style></head><body><div id="ps"><div id="paper" class="paper"></div></div></body></html>`;
}

/** 종이 크기(px, 96dpi): 297 × 210 mm. */
export const PAPER_W = (297 / 25.4) * 96;
export const PAPER_H = (210 / 25.4) * 96;
