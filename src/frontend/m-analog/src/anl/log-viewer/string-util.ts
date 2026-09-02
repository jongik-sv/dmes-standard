/**
 * 로그 분석 (anl/logViewer) — 문자열 유틸.
 * 원본: analog-express-ui-plate src/util/string.js 이식 (로직 동일).
 */

/**
 * UTF-8 안전 base64 인코딩 — 검색어(keyword)를 쿼리스트링으로 보낼 때 사용.
 * encodeURIComponent 로 UTF-8 바이트열을 만들고 %XX 를 원시 바이트로 되돌린 뒤 btoa 처리.
 */
export function base64EncodeUnicode(str: string): string {
  const utf8Bytes = encodeURIComponent(str).replace(
    /%([0-9A-F]{2})/g,
    (_match, p1: string) => String.fromCharCode(parseInt(p1, 16)),
  );
  return btoa(utf8Bytes);
}

/** 워크스페이스 식별자 — 랜덤 base36 5자리 대문자 (원본 getKey 동일). */
export function generateWorkspaceKey(): string {
  return (Math.random() * 1e18).toString(36).slice(0, 5).toUpperCase();
}
