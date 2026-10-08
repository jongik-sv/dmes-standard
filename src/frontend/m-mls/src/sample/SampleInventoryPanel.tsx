"use client";

import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

export interface SampleInventoryPanelProps {
  /** 화면 제목. 호스트(m-mcm)가 메뉴 명칭을 내려주면 덮어쓴다. */
  title?: string;
}

interface SampleRow extends Record<string, unknown> {
  code: string;
  name: string;
  status: string;
}

const SAMPLE_ROWS: SampleRow[] = [
  { code: "SMP-L-001", name: "샘플 재고 항목 A", status: "가용" },
  { code: "SMP-L-002", name: "샘플 재고 항목 B", status: "예약" },
  { code: "SMP-L-003", name: "샘플 재고 항목 C", status: "출고" },
];

const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", meta: false, width: 140, align: "left" },
  { key: "name", header: "명칭", meta: false, width: 260, align: "left" },
  { key: "status", header: "상태", meta: false, width: 120, align: "left" },
];

/**
 * 물류·재고 도메인의 자리표시자 패널.
 * 실제 업무 화면은 이 파일을 지우고 src/{area}/ 아래에 영역별로 구현한다.
 */
export function SampleInventoryPanel({ title = "샘플 재고 화면" }: SampleInventoryPanelProps) {
  return (
    <PageLayout title={title} breadcrumb="샘플 > 재고">
      <ContentBody root>
        <ContentPanel>
          <AgDataGrid
            title="재고 항목 목록"
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
