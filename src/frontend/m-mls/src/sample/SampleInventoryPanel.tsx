"use client";

import type { CSSProperties } from "react";
import { ContentBody, ContentPanel, PageLayout } from "@dk-oasis/shared/layout";

export interface SampleInventoryPanelProps {
  /** 화면 제목. 호스트(m-mcm)가 메뉴 명칭을 내려주면 덮어쓴다. */
  title?: string;
}

interface SampleRow {
  code: string;
  name: string;
  status: string;
}

const SAMPLE_ROWS: SampleRow[] = [
  { code: "SMP-L-001", name: "샘플 재고 항목 A", status: "가용" },
  { code: "SMP-L-002", name: "샘플 재고 항목 B", status: "예약" },
  { code: "SMP-L-003", name: "샘플 재고 항목 C", status: "출고" },
];

const TABLE_STYLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const CELL_STYLE: CSSProperties = {
  border: "1px solid #d6dbe3",
  padding: "6px 10px",
  textAlign: "left",
};

/**
 * 물류·재고 도메인의 자리표시자 패널.
 * 실제 업무 화면은 이 파일을 지우고 src/{area}/ 아래에 영역별로 구현한다.
 */
export function SampleInventoryPanel({ title = "샘플 재고 화면" }: SampleInventoryPanelProps) {
  return (
    <PageLayout title={title} breadcrumb="샘플 > 재고">
      <ContentBody root>
        <ContentPanel>
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                <th style={{ ...CELL_STYLE, background: "#f2f4f7" }}>코드</th>
                <th style={{ ...CELL_STYLE, background: "#f2f4f7" }}>명칭</th>
                <th style={{ ...CELL_STYLE, background: "#f2f4f7" }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ROWS.map((row) => (
                <tr key={row.code}>
                  <td style={CELL_STYLE}>{row.code}</td>
                  <td style={CELL_STYLE}>{row.name}</td>
                  <td style={CELL_STYLE}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
