"use client";

import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

export interface SampleInspectionPanelProps {
  /** 화면 제목. 호스트(m-mcm)가 메뉴 명칭을 내려주면 덮어쓴다. */
  title?: string;
}

interface SampleRow extends Record<string, unknown> {
  code: string;
  name: string;
  status: string;
}

const SAMPLE_ROWS: SampleRow[] = [
  { code: "SMP-Q-001", name: "샘플 검사 항목 A", status: "판정대기" },
  { code: "SMP-Q-002", name: "샘플 검사 항목 B", status: "합격" },
  { code: "SMP-Q-003", name: "샘플 검사 항목 C", status: "불합격" },
];

const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 140, align: "left" },
  { key: "name", header: "명칭", width: 260, align: "left" },
  { key: "status", header: "상태", width: 120, align: "left" },
];

/**
 * 품질·검사 도메인의 자리표시자 패널.
 * 실제 업무 화면은 이 파일을 지우고 src/{area}/ 아래에 영역별로 구현한다.
 */
export function SampleInspectionPanel({ title = "샘플 검사 화면" }: SampleInspectionPanelProps) {
  return (
    <PageLayout title={title} breadcrumb="샘플 > 검사">
      <ContentBody root>
        <ContentPanel>
          <AgDataGrid
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
