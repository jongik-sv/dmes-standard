/**
 * html 위젯 「스크립트 허용」 칸의 iframe 속성(스펙 2026-10-02-widget-admin-generic §6, W-D25).
 * - sandbox 는 정확히 "allow-scripts" 다. allow-same-origin 을 함께 주면 iframe 안 스크립트가 sandbox 를 벗겨 내고
 *   포털 화면·쿠키에 닿으므로 절대 더하지 않는다. srcdoc 문서는 출처가 없는(opaque) 칸에서 돈다.
 * - srcDoc 는 관리자가 쓴 html 그대로다(정화는 스크립트를 끈 경우에만 — 그때는 iframe 을 쓰지 않는다).
 *   더하는 것은 인쇄 색 유지 style(HTML_FRAME_PRINT_STYLE) 하나뿐이다 — 위젯 화면 PDF(인쇄)에서 배경·그라데이션이
 *   빠지고 흰 글자가 회색이 되는 브라우저 기본 동작을 끈다. iframe 문서는 부모 스타일을 물려받지 않아 여기서 넣는다.
 *   style 은 늘 문서 맨 앞에 붙인다 — srcdoc 문서는 HTML 명세상 doctype 이 없거나 앞에 다른 것이 있어도 늘 표준(no-quirks) 모드라
 *   doctype 앞에 둬도 모드가 바뀌지 않는다(그래서 doctype 을 찾아 그 뒤에 끼우는 정규식은 두지 않는다 — 연속 주석에서 지수적으로 역추적했다).
 * 순수 함수 — 시험(html-frame.test.ts)이 속성 값을 고정한다.
 */

export const HTML_FRAME_SANDBOX = "allow-scripts" as const;

/** 편집기 「스크립트 허용」 경고 문구(스펙 문구 그대로). */
export const HTML_SCRIPT_WARNING =
  "스크립트는 포털과 분리된 칸에서 실행됩니다. 포털 화면·로그인 정보에는 접근할 수 없습니다";

/** 인쇄 때 배경·글자색을 화면 그대로 찍게 하는 style. 인쇄에만 걸리므로 화면 모양은 바뀌지 않는다. */
export const HTML_FRAME_PRINT_STYLE =
  "<style>@media print{*,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}</style>";

export interface HtmlFrameProps {
  sandbox: typeof HTML_FRAME_SANDBOX;
  srcDoc: string;
  referrerPolicy: "no-referrer";
}

export function htmlFrameProps(html: string): HtmlFrameProps {
  return { sandbox: HTML_FRAME_SANDBOX, srcDoc: HTML_FRAME_PRINT_STYLE + html, referrerPolicy: "no-referrer" };
}
