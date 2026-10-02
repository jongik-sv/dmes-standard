/**
 * html 위젯 「스크립트 허용」 칸의 iframe 속성(스펙 2026-10-02-widget-admin-generic §6, W-D25).
 * - sandbox 는 정확히 "allow-scripts" 다. allow-same-origin 을 함께 주면 iframe 안 스크립트가 sandbox 를 벗겨 내고
 *   포털 화면·쿠키에 닿으므로 절대 더하지 않는다. srcdoc 문서는 출처가 없는(opaque) 칸에서 돈다.
 * - srcDoc 는 관리자가 쓴 html 그대로다(정화는 스크립트를 끈 경우에만 — 그때는 iframe 을 쓰지 않는다).
 * 순수 함수 — 시험(html-frame.test.ts)이 속성 값을 고정한다.
 */

export const HTML_FRAME_SANDBOX = "allow-scripts" as const;

/** 편집기 「스크립트 허용」 경고 문구(스펙 문구 그대로). */
export const HTML_SCRIPT_WARNING =
  "스크립트는 포털과 분리된 칸에서 실행됩니다. 포털 화면·로그인 정보에는 접근할 수 없습니다";

export interface HtmlFrameProps {
  sandbox: typeof HTML_FRAME_SANDBOX;
  srcDoc: string;
  referrerPolicy: "no-referrer";
}

export function htmlFrameProps(html: string): HtmlFrameProps {
  return { sandbox: HTML_FRAME_SANDBOX, srcDoc: html, referrerPolicy: "no-referrer" };
}
