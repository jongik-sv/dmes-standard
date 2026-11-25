"use client";

/**
 * 압연두께Set보정관리 — 포털 pageId mqc:qdm/rollingThicknessSet, 레지스트리 키 qdm/rollingThicknessSet.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qdm/rollingThicknessSet/RollingThicknessSetPage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qdm/rollingThicknessSet/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { RollingThicknessSetPage } from "@/qdm/rollingThicknessSet/RollingThicknessSetPage";

export default function Page(props: PageProps) {
  return <RollingThicknessSetPage {...props} />;
}
