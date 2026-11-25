"use client";

/**
 * 품질보증서관리 — 포털 pageId mqc:qpr/qualityCertificate, 레지스트리 키 qpr/qualityCertificate.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qpr/qualityCertificate/QualityCertificatePage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qpr/qualityCertificate/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { QualityCertificatePage } from "@/qpr/qualityCertificate/QualityCertificatePage";

export default function Page(props: PageProps) {
  return <QualityCertificatePage {...props} />;
}
