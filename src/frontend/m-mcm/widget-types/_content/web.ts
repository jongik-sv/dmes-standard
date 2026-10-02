/**
 * 웹 주소 위젯의 주소 검사와 iframe 속성(스펙 2026-10-02-widget-admin-generic §6).
 * - http(s) 절대 주소만 받는다. `new URL` 을 기준 주소 없이 불러 상대 주소·`//host` 는 예외로 거절하고,
 *   해석한 뒤의 protocol 로 판정해 대소문자·탭이 섞인 `javascript:` 도 막는다.
 * - 포털과 같은 출처는 거절한다. iframe 이 allow-same-origin 을 가지므로 같은 출처 화면을 띄우면 그 안 스크립트가
 *   포털과 같은 권한을 얻는다(Review Focus 4). 포털 화면은 링크 모음 위젯으로 연다.
 * 순수 함수 — 시험은 web.test.ts.
 */

export const WEB_FRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups" as const;

export const WEB_URL_EMPTY_MESSAGE = "웹 주소를 입력하세요";
export const WEB_URL_FORMAT_MESSAGE = "http:// 또는 https:// 로 시작하는 주소를 입력하세요";
/** 포털과 같은 출처 주소 거절 문구(스펙 문구 그대로). */
export const SAME_ORIGIN_MESSAGE = "포털 화면은 링크 모음 위젯으로 여세요";
/** 본문 아래 늘 두는 안내(사이트가 iframe 을 막으면 빈 화면이 된다). */
export const WEB_HINT = "화면이 보이지 않으면 [새 탭으로 열기]를 누르세요";

export type WebUrlCheck = { ok: true; url: string } | { ok: false; message: string };

export interface WebFrameProps {
  src: string;
  sandbox: typeof WEB_FRAME_SANDBOX;
  referrerPolicy: "no-referrer";
}

/** http(s) 절대 주소로 해석되면 URL, 아니면 null. */
function parseHttpUrl(raw: string): URL | null {
  const text = raw.trim();
  if (!text) return null;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return u.hostname ? u : null;
}

function originOf(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** http(s) 절대 주소인지(링크 모음의 웹 링크 검사에도 쓴다 — 거기는 같은 출처도 된다). */
export function isHttpUrl(url: string): boolean {
  return parseHttpUrl(url) !== null;
}

/** 웹 주소 위젯 주소 검사. 통과하면 브라우저 표기(href)로 맞춘 주소를 돌려준다. */
export function checkWebUrl(url: string, portalOrigin: string): WebUrlCheck {
  if (!url.trim()) return { ok: false, message: WEB_URL_EMPTY_MESSAGE };
  const u = parseHttpUrl(url);
  if (!u) return { ok: false, message: WEB_URL_FORMAT_MESSAGE };
  const portal = originOf(portalOrigin);
  if (portal !== null && u.origin === portal) return { ok: false, message: SAME_ORIGIN_MESSAGE };
  return { ok: true, url: u.href };
}

/** 웹 주소 iframe 속성. 주소는 checkWebUrl 을 통과한 값만 넘긴다. */
export function webFrameProps(url: string): WebFrameProps {
  return { src: url, sandbox: WEB_FRAME_SANDBOX, referrerPolicy: "no-referrer" };
}
