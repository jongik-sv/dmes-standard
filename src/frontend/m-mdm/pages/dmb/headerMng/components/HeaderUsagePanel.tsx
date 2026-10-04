"use client";

/**
 * 사용 전문 영향도(TSK-05-02 design.md §2, D-144 3단계) — 이 헤더를 쌓은 전문 버전 전체(같은 전문의 현재·DRAFT 가 따로 한 행).
 * 헤더 DRAFT 저장은 사용 전문을 바꾸지 않는다. 헤더 변경은 확정 apply_from 부터 사용 전문에 반영되고 전문 버전은 생기지 않는다.
 */
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { lengthText } from "@/layout/layout-calc";
import { hint, sectionTitle } from "@/layout/styles";
import { versionStateLabel } from "@/layout/version-rows";
import { fmtVer, normVer } from "@/shell";
import type { UsedByRow } from "../types";

const COLUMNS: GridColumn[] = [
  { key: "LAYOUT_NAME", header: "전문 이름", width: 220 },
  { key: "SND_SYSTEM", header: "송신→수신", width: 110, render: (_v, r) => `${r.SND_SYSTEM ?? "-"} → ${r.RCV_SYSTEM ?? "-"}` },
  { key: "HEADER_SEQ", header: "쌓인 순서", width: 80, align: "center" },
  { key: "TOTAL_LENGTH", header: "총 길이", width: 80, align: "right", render: (v) => lengthText(v as number | null) },
  { key: "VER", header: "버전", width: 70, render: (v) => fmtVer(v as string | null) },
  { key: "STATE", header: "상태", width: 70, render: (v) => versionStateLabel(v as string | null) },
];

export function HeaderUsagePanel({ rows }: { rows: UsedByRow[] }) {
  // 한 전문이 버전마다 한 행이라 LAYOUT_ID 만으로는 키가 겹친다.
  const keyed = rows.map((r) => ({ ...r, ROW_KEY: `${r.LAYOUT_ID}-${normVer(r.VER) ?? r.VER}` }));
  return (
    <div data-testid="header-usage">
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>
        {`사용 전문(헤더 변경 영향도) ${rows.length}건`}
        <span style={{ ...hint, fontWeight: "normal" }}> · 헤더 변경은 확정 apply_from 부터 사용 전문에 반영됩니다(전문 버전은 생기지 않음)</span>
      </p>
      <div>
        <AgDataGrid
          columnSizing="fit"
          columns={COLUMNS}
          data={keyed as unknown as Record<string, unknown>[]}
          rowKey="ROW_KEY"
          height={120}
          emptyMessage="이 헤더를 쓰는 전문이 없습니다"
        />
      </div>
    </div>
  );
}
