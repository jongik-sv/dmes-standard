"use client";

/**
 * 칼라부재료관리 — 포털 pageId mqc:qdb/colorSubmaterial, 레지스트리 키 qdb/colorSubmaterial.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qdb/colorSubmaterial/ColorSubmaterialPage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qdb/colorSubmaterial/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { ColorSubmaterialPage } from "@/qdb/colorSubmaterial/ColorSubmaterialPage";

export default function Page(props: PageProps) {
  return <ColorSubmaterialPage {...props} />;
}
