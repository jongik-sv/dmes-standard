"use client";

/**
 * DB 뷰어 (anl/dbViewer) — 화면 페이지 엔트리 (얇은 래퍼).
 * componentPath = anl/dbViewer, pageId = analog:anl/dbViewer.
 * 실제 구현은 src/anl/db-viewer/ (컨테이너 = analog-db-viewer.tsx).
 */

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { AnalogDbViewer } from "@/anl/db-viewer/analog-db-viewer";

export default function DbViewerPage(_props: PageProps) {
  return <AnalogDbViewer />;
}
