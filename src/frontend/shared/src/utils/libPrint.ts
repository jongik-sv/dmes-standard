/**
 * 요소 하나를 그 크기의 한 장짜리 페이지로 인쇄한다(인쇄 창에서 「PDF로 저장」을 고르면 PDF 한 장).
 *
 * 그림 캡처(html-to-image 등)는 다른 출처 iframe(외부 웹 주소 위젯, sandbox srcdoc)의 내용을 읽지 못해 쓰지 않고,
 * 브라우저 인쇄로 찍는다. 인쇄 동안만 아래를 건다.
 * - `@page { size: W×H; margin: 0 }` — 용지를 대상 크기(scrollWidth × scrollHeight)에 맞춘 한 장으로.
 * - 대상 밖은 visibility:hidden, 대상은 화면 왼쪽 위에 fixed 로 펼친다(안쪽 스크롤 없이 전체 높이).
 * - `print-color-adjust: exact` — 배경색·그라데이션을 빼는 브라우저 기본 동작을 끈다.
 *   iframe 안 문서는 부모 스타일을 물려받지 않으므로 srcdoc 문서는 스스로 같은 스타일을 넣어야 한다.
 * - 대상 안에서 `data-print-hide` 를 단 요소(도구 줄 단추 등)는 찍지 않는다.
 * - Chrome PDF 한 장의 한도(약 200인치 = 19,200px)를 넘으면 CSS zoom 으로 줄여 한 장에 넣는다.
 * - 내려받을 PDF 기본 파일 이름은 브라우저가 document.title 에서 가져오므로 인쇄 동안 opts.title 로 바꾼다.
 *
 * 정리(스타일·속성 제거, 제목·스크롤 복원)는 afterprint 에서 하고, 이벤트가 오지 않는 브라우저를 위해
 * print() 가 돌아온 뒤에도 한 번 더 부른다(두 번 불려도 안전). 정리 전에 다시 부르면 앞의 것을 먼저 정리한다.
 * Chrome 은 print() 가 인쇄 창이 닫힐 때까지 돌아오지 않는다(확인한 브라우저는 Chrome 뿐이다).
 */

/** Chrome PDF 한 장의 최대 변 길이(약 200인치 × 96px). 넘으면 zoom 으로 줄인다. */
export const PRINT_PAGE_MAX_PX = 19200;

/** 인쇄 대상에 다는 표시 속성. */
const TARGET_ATTR = "data-print-target";
/** 인쇄 동안 head 에 넣는 style 의 표시 속성. */
const STYLE_ATTR = "data-print-page";

export interface PrintElementOptions {
  /** 인쇄 동안의 document.title — Chrome 「PDF로 저장」의 기본 파일 이름이 된다. 없으면 제목을 바꾸지 않는다. */
  title?: string;
}

/** 지금 인쇄 중인 호출의 정리 함수(정리 전 다시 부르면 먼저 부른다). */
let pendingCleanup: (() => void) | null = null;

interface PageBox {
  /** 대상 원래 크기(px). */
  width: number;
  height: number;
  /** 1 이하 배율 — 1 이면 zoom 을 걸지 않는다. */
  zoom: number;
  /** 용지 크기(px) = 원래 크기 × zoom 올림. */
  pageWidth: number;
  pageHeight: number;
}

function pageBoxOf(width: number, height: number): PageBox {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const scale = Math.min(1, PRINT_PAGE_MAX_PX / w, PRINT_PAGE_MAX_PX / h);
  // 내림 — 줄인 크기가 한도를 넘지 않게.
  const zoom = scale < 1 ? Math.floor(scale * 10000) / 10000 : 1;
  const pageWidth = zoom < 1 ? Math.min(PRINT_PAGE_MAX_PX, Math.ceil(w * zoom)) : w;
  const pageHeight = zoom < 1 ? Math.min(PRINT_PAGE_MAX_PX, Math.ceil(h * zoom)) : h;
  return { width: w, height: h, zoom, pageWidth, pageHeight };
}

function printCss(box: PageBox): string {
  const t = `[${TARGET_ATTR}]`;
  const exact = "-webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;";
  return [
    `@page { size: ${box.pageWidth}px ${box.pageHeight}px; margin: 0; }`,
    "@media print {",
    `  html, body { height: ${box.pageHeight}px !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }`,
    "  body * { visibility: hidden !important; }",
    `  ${t}, ${t} * { visibility: visible !important; ${exact} }`,
    `  ${t} [data-print-hide], ${t} [data-print-hide] * { visibility: hidden !important; }`,
    `  ${t} { position: fixed !important; left: 0 !important; top: 0 !important; margin: 0 !important; box-sizing: border-box !important;` +
      ` width: ${box.width}px !important; height: ${box.height}px !important; max-width: none !important; max-height: none !important;` +
      ` overflow: visible !important;${box.zoom < 1 ? ` zoom: ${box.zoom} !important;` : ""} }`,
    "}",
  ].join("\n");
}

/**
 * el 을 그 크기(scrollWidth × scrollHeight)의 한 장짜리 페이지로 인쇄한다.
 * 브라우저 인쇄 창이 열리고, 대상을 「PDF로 저장」으로 고르면 PDF 한 장이 된다.
 */
export function printElementAsPage(el: HTMLElement, opts: PrintElementOptions = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  // 앞의 인쇄가 정리되지 않았으면 먼저 정리한다 — 아래에서 잡는 원래 제목·스크롤이 앞 호출 값이 되지 않게.
  pendingCleanup?.();

  const prevTitle = document.title;
  const prevScrollTop = el.scrollTop;
  const prevScrollLeft = el.scrollLeft;
  // 스타일을 바꾸기 전에 잰다. 0(숨은 요소·시험 환경)이면 보이는 크기, 그것도 없으면 1px.
  const box = pageBoxOf(Math.max(el.scrollWidth, el.clientWidth), Math.max(el.scrollHeight, el.clientHeight));

  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTR, "");
  style.textContent = printCss(box);
  document.head.appendChild(style);
  el.setAttribute(TARGET_ATTR, "");
  // 브라우저는 제목의 공백을 줄여 돌려주므로, 되돌릴 때 비교할 값은 넣은 뒤 다시 읽은 값이다.
  let appliedTitle: string | null = null;
  if (opts.title != null) {
    document.title = opts.title;
    appliedTitle = document.title;
  }
  // 스크롤한 상태여도 처음부터 찍히게.
  if (prevScrollTop !== 0) el.scrollTop = 0;
  if (prevScrollLeft !== 0) el.scrollLeft = 0;

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    window.removeEventListener("afterprint", cleanup);
    if (pendingCleanup === cleanup) pendingCleanup = null;
    style.remove();
    el.removeAttribute(TARGET_ATTR);
    // 인쇄 동안 화면이 제목을 바꿨으면 그 값을 둔다.
    if (appliedTitle != null && document.title === appliedTitle) document.title = prevTitle;
    if (prevScrollTop !== 0) el.scrollTop = prevScrollTop;
    if (prevScrollLeft !== 0) el.scrollLeft = prevScrollLeft;
  };
  pendingCleanup = cleanup;
  window.addEventListener("afterprint", cleanup);
  try {
    window.print();
  } finally {
    // afterprint 가 오지 않는 브라우저용 — 이미 정리했으면 아무 일도 하지 않는다.
    cleanup();
  }
}
