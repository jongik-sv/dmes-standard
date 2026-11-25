"use client";

/**
 * 품질판정 — 포털 pageId mqc:qjd/qualityJudgment, 레지스트리 키 qjd/qualityJudgment.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qjd/qualityJudgment/QualityJudgmentPage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qjd/qualityJudgment/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { QualityJudgmentPage } from "@/qjd/qualityJudgment/QualityJudgmentPage";

export default function Page(props: PageProps) {
  return <QualityJudgmentPage {...props} />;
}
