"use client";

/**
 * 로그 분석 (anl/logViewer) — 화면 페이지 엔트리 (얇은 래퍼).
 * componentPath = anl/logViewer, pageId = analog:anl/logViewer.
 * 실제 구현은 src/anl/log-viewer/ (컨테이너 = analog-log-viewer.tsx).
 */

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { AnalogLogViewer } from "@/anl/log-viewer/analog-log-viewer";

export default function LogViewerPage(_props: PageProps) {
  return <AnalogLogViewer />;
}
