"use client";

/**
 * 품질설계결과 — 포털 pageId mqc:qdr/qualityDesignResult, 레지스트리 키 qdr/qualityDesignResult.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qdr/qualityDesignResult/QualityDesignResultPage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qdr/qualityDesignResult/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { QualityDesignResultPage } from "@/qdr/qualityDesignResult/QualityDesignResultPage";

export default function Page(props: PageProps) {
  return <QualityDesignResultPage {...props} />;
}
