"use client";

/**
 * 칼라BOM관리 — 포털 pageId mqc:qdb/colorBom, 레지스트리 키 qdb/colorBom.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qdb/colorBom/ColorBomPage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qdb/colorBom/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { ColorBomPage } from "@/qdb/colorBom/ColorBomPage";

export default function Page(props: PageProps) {
  return <ColorBomPage {...props} />;
}
