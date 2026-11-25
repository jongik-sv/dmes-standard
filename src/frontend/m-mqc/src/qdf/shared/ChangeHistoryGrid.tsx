"use client";

/**
 * 「수정 이력」 그리드 — Maru 확정 버전끼리의 칸 단위 변경(버전·적용 시작·구분·항목·변경 전·변경 후).
 * 주문단중에러·생산가부 화면이 같은 모양으로 쓴다. 작업자·사유는 Maru 룰 편집 화면의 버전 정보에 있다.
 */
import { memo, type ReactNode } from "react";

import {
  AgDataGrid,
  GridBadge,
  GridPanel,
  type GridColumn,
} from "@dk-oasis/shared/grid";

export interface ChangeRow {
  key: string;
  ver: string;
  applyFrom: string;
  kind: string;
  item: string;
  before: string;
  after: string;
}

const KIND_STYLE: Record<
  string,
  { bg?: string; color?: string; muted?: boolean }
> = {
  "최초 등록": { muted: true },
  "셀 수정": { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  "셀 추가": { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  "셀 삭제": { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

const COLUMNS: GridColumn[] = [
  { key: "ver", header: "버전", width: 80, align: "center", meta: false },
  {
    key: "applyFrom",
    header: "적용 시작",
    width: 150,
    align: "center",
    meta: false,
  },
  {
    key: "kind",
    header: "구분",
    width: 90,
    align: "center",
    meta: false,
    render: (v) => {
      const s = KIND_STYLE[String(v)] ?? { muted: true };
      return (
        <GridBadge
          label={String(v)}
          bg={s.bg}
          color={s.color}
          muted={s.muted}
        />
      );
    },
  },
  {
    key: "item",
    header: "항목",
    width: 200,
    minWidth: 220,
    align: "left",
    meta: false,
  },
  { key: "before", header: "변경 전", width: 140, align: "left", meta: false },
  { key: "after", header: "변경 후", width: 140, align: "left", meta: false },
];

export interface ChangeHistoryGridProps {
  title: string;
  rows: ChangeRow[];
  loading: boolean;
  loaded: boolean;
  titleExtra?: ReactNode;
}

export const ChangeHistoryGrid = memo(function ChangeHistoryGrid({
  title,
  rows,
  loading,
  loaded,
  titleExtra,
}: ChangeHistoryGridProps) {
  return (
    <GridPanel title={title} count={rows.length} titleExtra={titleExtra}>
      <AgDataGrid
        gridId="changeHistory"
        rowKey="key"
        columns={COLUMNS}
        data={rows as unknown as Record<string, unknown>[]}
        columnSizing="fit"
        loading={loading}
        personalize={false}
        emptyMessage={loaded ? "확정된 버전이 없습니다" : undefined}
      />
    </GridPanel>
  );
});
