"use client";

/**
 * mdmSample — TSK-01-01 mdm 모듈 스캐폴드 검증용 샘플 화면.
 * TSK-01-02 에서 그룹 dma(용어·도메인)로 이동.
 * TSK-01-03: 공통 셸 적용·미리보기(D11).
 *
 * design.md D5 — 실 업무 화면이 아니라 "포털에서 mdm 모듈 화면이 뜨는지" 만 증명하는 빈 화면이다.
 * 그리드·조회조건·API 호출이 없다(§3.3 — 서버 오류 표시 스모크 해당 없음 사유와 동일).
 * OBJECT_ID/screenId/componentPath 는 전부 'mdmSample' 로 일치해야 한다(불변 규칙 6).
 */
import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { DraftLockBadge, MdmPageLayout, VersionStatusBadge } from "@/shell";

const previewRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--spacing-sm)",
  padding: "0 var(--spacing-md) var(--spacing-md)",
} as const;

const previewTitleStyle = {
  padding: "0 var(--spacing-md) var(--spacing-sm)",
  color: "var(--color-text-secondary)",
  fontWeight: 600,
} as const;

const previewLabelStyle = {
  minWidth: "72px",
  color: "var(--color-text-secondary)",
  fontSize: "var(--font-size-xs)",
} as const;

export default function MdmSamplePage() {
  return (
    <MdmPageLayout group="dma" screenId="mdmSample" title="MDM 샘플">
      <ContentBody root>
        <ContentPanel>
          <p style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
            mdm 모듈 스캐폴드 검증용 빈 화면입니다. 실 업무 화면은 후속 Task 에서 이 자리를
            대체합니다.
          </p>
          <p style={previewTitleStyle}>공통 셸 미리보기</p>
          <div style={previewRowStyle}>
            <span style={previewLabelStyle}>상태 배지</span>
            <VersionStatusBadge status="DRAFT" />
            <VersionStatusBadge status="RELEASED" applyFrom="2024-01-01 00:00:00" />
            <VersionStatusBadge status="RELEASED" applyFrom="9999-12-30 00:00:00" />
            <VersionStatusBadge status="REQUESTED" />
            <VersionStatusBadge status="APPROVED" />
            <VersionStatusBadge status="CANCELLED" />
          </div>
          <div style={previewRowStyle}>
            <span style={previewLabelStyle}>잠금 배지</span>
            <DraftLockBadge status="DRAFT" ownerId={null} currentUserId="me" />
            <DraftLockBadge status="DRAFT" ownerId="me" currentUserId="me" />
            <DraftLockBadge status="DRAFT" ownerId="kim" currentUserId="me" />
          </div>
        </ContentPanel>
      </ContentBody>
    </MdmPageLayout>
  );
}
