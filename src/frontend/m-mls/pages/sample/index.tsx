"use client";

/**
 * 샘플 화면 엔트리 (얇은 래퍼).
 * componentPath = sample, pageId = mls:sample.
 * 실제 구현은 src/sample/ 에 둔다 — 새 업무 영역은 pages/{area}/ + src/{area}/ 쌍으로 추가한다.
 */

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { SampleInventoryPanel } from "@/sample/SampleInventoryPanel";

export default function SamplePage(_props: PageProps) {
  return <SampleInventoryPanel />;
}
