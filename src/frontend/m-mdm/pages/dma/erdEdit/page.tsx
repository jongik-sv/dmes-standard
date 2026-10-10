"use client";

/**
 * erdEdit — ERD 설계(단계 1: DB 가져오기·뷰어·추정 관계 검토). 정본: docs/superpowers/specs/2026-10-10-erd-tool-design.md,
 * 계획 docs/superpowers/plans/2026-10-10-erd-tool-stage1/. 메뉴: 용어·도메인(dma) > ERD 설계.
 */
import { MdmPageLayout } from "@/shell";

import { ErdViewer } from "./ErdViewer";
import { SCREEN_ID } from "./api";
import { ERD_CSS, ERD_STYLE_HREF } from "./canvas/erd-styles";

export default function ErdEditPage() {
  return (
    <>
      {/* 화면 스타일 — 포털이 dist 의 page.css 를 싣지 않으므로 문서 head 에 한 번만 넣는다(React 19 precedence, href 로 중복 제거). */}
      <style href={ERD_STYLE_HREF} precedence="default">
        {ERD_CSS}
      </style>
      <MdmPageLayout group="dma" screenId={SCREEN_ID} title="ERD 설계">
        <ErdViewer />
      </MdmPageLayout>
    </>
  );
}
