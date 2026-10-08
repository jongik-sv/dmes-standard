"use client";

import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

export interface SamplePlanningPanelProps {
  /** 화면 제목. 호스트(m-mcm)가 메뉴 명칭을 내려주면 덮어쓴다. */
  title?: string;
}

interface SampleRow extends Record<string, unknown> {
  code: string;
  name: string;
  status: string;
}

const SAMPLE_ROWS: SampleRow[] = [
  { code: "SMP-P-001", name: "샘플 계획 항목 A", status: "대기" },
  { code: "SMP-P-002", name: "샘플 계획 항목 B", status: "진행" },
  { code: "SMP-P-003", name: "샘플 계획 항목 C", status: "완료" },
];

const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 140, align: "left" },
  { key: "name", header: "명칭", width: 260, align: "left" },
  { key: "status", header: "상태", width: 120, align: "left" },
];

/**
 * 계획·스케줄링 도메인의 자리표시자 패널.
 * 실제 업무 화면은 이 파일을 지우고 src/{area}/ 아래에 영역별로 구현한다.
 */
export function SamplePlanningPanel({ title = "샘플 계획 화면" }: SamplePlanningPanelProps) {
  return (
    <PageLayout title={title} breadcrumb="샘플 > 계획">
      <ContentBody root>
        <ContentPanel>
          <AgDataGrid
            title="계획 항목 목록"
            columns={COLUMNS}
            data={SAMPLE_ROWS}
            rowKey="code"
            height="auto"
          />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
