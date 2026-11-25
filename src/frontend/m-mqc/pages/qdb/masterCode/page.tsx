"use client";

/**
 * 마스터코드 — 포털 pageId mqc:qdb/masterCode, 레지스트리 키 qdb/masterCode.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qdb/masterCode/MasterCodePage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qdb/masterCode/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { MasterCodePage } from "@/qdb/masterCode/MasterCodePage";

export default function Page(props: PageProps) {
  return <MasterCodePage {...props} />;
}
