"use client";

/** 사용 전문 영향도(TSK-05-02 design.md §2) — 이 헤더를 쌓은 전문 전체. 헤더를 저장하면 이 전문들의 오프셋·총 길이가 다시 계산된다. */
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { empty, sectionTitle } from "@/layout/styles";
import type { UsedByRow } from "../types";

const COLUMNS: GridColumn[] = [
  { key: "LAYOUT_NAME", header: "전문 이름", width: 220 },
  { key: "SND_SYSTEM", header: "송신→수신", width: 110, render: (_v, r) => `${r.SND_SYSTEM ?? "-"} → ${r.RCV_SYSTEM ?? "-"}` },
  { key: "HEADER_SEQ", header: "쌓인 순서", width: 80, align: "center" },
  { key: "TOTAL_LENGTH", header: "총 길이", width: 80, align: "right" },
];

export function HeaderUsagePanel({ rows }: { rows: UsedByRow[] }) {
  return (
    <div data-testid="header-usage">
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>{`사용 전문(헤더 변경 영향도) ${rows.length}건`}</p>
      <div>
        {rows.length === 0 ? (
          <p style={empty}>이 헤더를 쓰는 전문이 없습니다</p>
        ) : (
          <AgDataGrid
            columnSizing="fit"
            columns={COLUMNS}
            data={rows as unknown as Record<string, unknown>[]}
            rowKey="LAYOUT_ID"
            height={120}
          />
        )}
      </div>
    </div>
  );
}
