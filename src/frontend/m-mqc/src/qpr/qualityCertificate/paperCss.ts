/**
 * 품질보증서 종이 iframe 문서 — 목업 종이 CSS(.paper·.doc·비교 표시·인쇄)를 그대로 옮겼다. 포털 화면으로 새지 않게 iframe 안에서만 쓴다.
 * 글꼴은 목업과 같이 Google Fonts(Noto Serif KR·IBM Plex Sans KR)를 읽고, 못 읽으면 기본 명조·고딕으로 그린다.
 */
const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@400;500;700&display=swap";

const PAPER_CSS = `
:root{--paper:#FCFBF7;--paper-ink:#1A1A1A;--paper-ink-2:#555049;--paper-line:#D8D3C8}
*{box-sizing:border-box}
html,body{margin:0;background:transparent}
body{padding:16px 0;font-family:'IBM Plex Sans KR',system-ui,sans-serif;font-size:14px;line-height:1.55;overflow:hidden}
#ps{margin:0 auto;position:relative}
.paper{width:794px;transform-origin:top left;background:var(--paper);color:var(--paper-ink);box-shadow:0 2px 18px rgba(16,24,32,.22);position:relative}
.paper .breaks{position:absolute;inset:0;pointer-events:none}
.paper .brk{position:absolute;left:0;right:0;border-top:1px dashed #C0392B;opacity:.55}
.paper .brk span{position:absolute;right:6px;top:-18px;font-size:10.5px;color:#C0392B;background:var(--paper);padding:0 4px}
.ribbon{position:absolute;top:0;left:0;right:0;text-align:center;background:#B4541A;color:#fff;font-size:12px;font-weight:600;letter-spacing:1px;padding:4px}
.doc{position:relative}
.doc .hd{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
.doc .hdl{color:var(--paper-ink-2)}
.logo{font-weight:700;letter-spacing:-.3px;color:#17494A;border:2px solid #17494A;padding:4px 9px;border-radius:3px;white-space:nowrap}
.doc h1{font-family:'Noto Serif KR',serif;font-weight:700;text-align:center;margin:0;text-wrap:balance}
.doc .sub{text-align:center;color:var(--paper-ink-2);font-family:'Noto Serif KR',serif}
.doc .rule{border:0;border-top:1.5px solid var(--paper-line);margin:0}
.doc p{margin:0;font-family:'Noto Serif KR',serif}
.doc .cl{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:start}
.doc .cl .n{font-family:'Noto Serif KR',serif;font-weight:700;white-space:nowrap}
.doc .cl.l2{padding-left:20px}
.doc .bstack{display:block}
.doc .bstack>*+*{margin-top:6px}
.doc .bstack::after{content:"";display:table;clear:both}
.doc .fig{margin:0;display:block}
.doc .fig svg,.doc .fig img{width:100%;height:auto;display:block}
.doc .fig figcaption{color:var(--paper-ink-2);margin-top:3px;text-align:center;font-family:'IBM Plex Sans KR',sans-serif}
.doc .fig.al-center{margin-left:auto;margin-right:auto}
.doc .fig.al-right{margin-left:auto}
.doc .fig.fl-right{float:right;margin:2px 0 8px 12px}
.doc .fig.fl-left{float:left;margin:2px 12px 8px 0}
.doc .two{display:grid;gap:12px}
.doc .warnv{color:#B4541A}
body.live .doc [data-b]{cursor:pointer}
body.live .doc [data-b]:hover{outline:1px dashed rgba(14,110,110,.5);outline-offset:3px}
.doc [data-b].sel{outline:2px solid #0E6E6E;outline-offset:3px}
.doc [data-b][draggable="true"]:active{cursor:grabbing}
.doc [data-b].dz-drag{opacity:.32}
.doc [data-b].dz-top{box-shadow:0 -3px 0 0 #0E6E6E}
.doc [data-b].dz-bot{box-shadow:0 3px 0 0 #0E6E6E}
body.live .doc [data-go]{cursor:pointer}
body.live .doc [data-go]:hover{outline:1px dashed rgba(14,110,110,.5);outline-offset:3px}
.doc table.wt{width:100%;border-collapse:collapse;font-family:'Noto Serif KR',serif}
.doc table.wt td{border:1px solid var(--paper-line);padding:4px 7px;vertical-align:top}
.doc table.wt tr.h td{background:#EFECE3;font-weight:700}
.doc .sign{display:flex;justify-content:flex-end}
.doc .sign .col{text-align:center;font-family:'Noto Serif KR',serif}
.doc .sign .sig{font-weight:500;font-style:italic;border-bottom:1px solid var(--paper-ink);padding:0 14px 2px;display:inline-block;color:#2B3A4A}
.doc .sign .sigimg{display:block;margin:0 auto;width:auto;height:auto;max-width:300px;border-bottom:1px solid var(--paper-ink);padding:0 14px 3px}
.doc .sign .sgt{color:var(--paper-ink-2)}
.doc .meta{display:flex;justify-content:space-between;color:var(--paper-ink-2);font-family:'IBM Plex Sans KR',sans-serif}
.doc mark{background:#FFE08A;color:#1A1A1A;padding:0 1px;border-radius:2px}
.doc [data-b].chg{background:#FFF7E6;box-shadow:-7px 0 0 0 #D98C25}
body.cmpA .doc [data-b].chg{background:#FBE9E4;box-shadow:-7px 0 0 0 #B4381F}
body.cmpB .doc [data-b].chg{background:#FFF3DE;box-shadow:-7px 0 0 0 #D98C25}
.doc [data-b].chg.act{outline:2px solid #0E6E6E;outline-offset:4px}
body.cmpA del{background:#F6CEC4;color:#8A2615;text-decoration:line-through;text-decoration-thickness:1.5px;padding:0 1px;border-radius:2px}
body.cmpB ins{background:#FFE1A8;color:#6F4204;text-decoration:none;padding:0 1px;border-radius:2px;box-shadow:inset 0 -2px 0 #D98C25}
@media print{
  @page{size:A4;margin:0}
  html,body{background:#fff;padding:0;overflow:visible}
  *,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  #ps{width:auto!important;height:auto!important}
  .paper{width:210mm!important;transform:none!important;box-shadow:none!important}
  .paper .breaks{display:none!important}
  .doc .cl,.doc .fig,.doc table.wt,.doc .sign{break-inside:avoid}
  .doc [data-b]{outline:none!important;box-shadow:none!important;background:transparent!important;cursor:auto}
  .doc mark{background:transparent!important}
}`;

/** 웹 글꼴을 읽을지(시험 환경은 끈다 — 바깥 네트워크를 부르지 않게). */
export const paperFonts = { on: true };

/** iframe 문서(머리만 — 종이 본문은 그 뒤 바꿔 넣는다). `mode`: live(클릭·끌기) · cmpA · cmpB(비교 표시). */
export function frameDoc(title: string, mode: "live" | "cmpA" | "cmpB") {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${paperFonts.on ? `<link rel="stylesheet" href="${FONT_LINK}">` : ""}<style>${PAPER_CSS}</style></head><body class="${mode}"><div id="ps"><div id="paper" class="paper"></div></div></body></html>`;
}
