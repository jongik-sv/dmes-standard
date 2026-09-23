"use client";

/**
 * mdmSample — TSK-01-01 mdm 모듈 스캐폴드 검증용 샘플 화면.
 * TSK-01-02 에서 그룹 dma(용어·도메인)로 이동.
 *
 * design.md D5 — 실 업무 화면이 아니라 "포털에서 mdm 모듈 화면이 뜨는지" 만 증명하는 빈 화면이다.
 * 그리드·조회조건·API 호출이 없다(§3.3 — 서버 오류 표시 스모크 해당 없음 사유와 동일).
 * OBJECT_ID/screenId/componentPath 는 전부 'mdmSample' 로 일치해야 한다(불변 규칙 6).
 */
import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";

export default function MdmSamplePage() {
  return (
    <PageLayout
      title="MDM 샘플"
      breadcrumb="마루 MDM > 용어·도메인 > MDM 샘플"
      objId="mdmSample"
    >
      <ContentBody root>
        <ContentPanel>
          <p style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
            mdm 모듈 스캐폴드 검증용 빈 화면입니다. 실 업무 화면은 후속 Task 에서 이 자리를
            대체합니다.
          </p>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
