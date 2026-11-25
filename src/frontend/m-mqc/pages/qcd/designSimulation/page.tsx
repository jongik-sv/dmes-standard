"use client";

/**
 * 시뮬레이션 — 포털 pageId mqc:qcd/designSimulation, 레지스트리 키 qcd/designSimulation.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qcd/designSimulation/DesignSimulationPage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qcd/designSimulation/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { DesignSimulationPage } from "@/qcd/designSimulation/DesignSimulationPage";

export default function Page(props: PageProps) {
  return <DesignSimulationPage {...props} />;
}
