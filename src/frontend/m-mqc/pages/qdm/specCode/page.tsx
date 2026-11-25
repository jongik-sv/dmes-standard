"use client";

/**
 * 규격약호관리 — 포털 pageId mqc:qdm/specCode, 레지스트리 키 qdm/specCode.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qdm/specCode/SpecCodePage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qdm/specCode/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { SpecCodePage } from "@/qdm/specCode/SpecCodePage";

export default function Page(props: PageProps) {
  return <SpecCodePage {...props} />;
}
