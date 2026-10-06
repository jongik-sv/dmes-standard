import { parsePageId } from "@dk-oasis/shared/portal-shell-core";

/** 탭 분리 창 경로 규칙 — `/popup/{moduleId}/{pageName…}?h={token}` (설계 2026-10-06-portal-tab-popout §5.6). */
export function popupSlugToPageId(slug: string[]): string | null {
  if (slug.length < 2) return null;
  let parts: string[];
  try {
    parts = slug.map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  // parsePageId 는 moduleId 를 검증하지 않는다 — pageId 구분자(`:`)·경로 구분자(`/`)가 섞이면 거른다.
  if (/[:/]/.test(parts[0])) return null;
  const pageId = `${parts[0]}:${parts.slice(1).join("/")}`;
  return parsePageId(pageId) ? pageId : null;
}

export function buildPopoutUrl(pageId: string, token: string): string {
  const parsed = parsePageId(pageId);
  if (!parsed) throw new Error(`잘못된 pageId: ${pageId}`);
  const path = [parsed.moduleId, ...parsed.pageName.split("/")].map(encodeURIComponent).join("/");
  return `/popup/${path}?h=${encodeURIComponent(token)}`;
}
