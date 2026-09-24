"use client";

/**
 * 선분 타임라인 — 항목 이력 화면과 항목 관리 「이력」 패널이 같이 쓰는 표시 전용 컴포넌트(D8).
 *
 * 서버가 준 행을 valid_from 순서 그대로 그리고, `gapFrom` 이 있는 행 앞에 "닫혀 있던 구간" 줄을 서버 값 그대로 끼운다.
 * 사건·상태를 다시 계산하지 않는다(H2 — 계산은 서버 한 곳).
 */
import { useMemo } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle, type MdmBadgeTone } from "@/shell";

import {
  EVENT_LABELS,
  GAP_LABEL,
  ROW_STATE_LABELS,
  STATE_LABELS,
  type DataHistoryResult,
  type HistoryRowState,
} from "./types";

export interface DataHistoryTimelineProps {
  result: DataHistoryResult | null;
}

const ROW_TONE: Record<HistoryRowState, MdmBadgeTone> = { OPEN: "success", PAST: "neutral", CLOSED: "muted" };

function badge(text: string, tone: MdmBadgeTone) {
  return <span style={badgeStyle(tone)}>{text}</span>;
}

export function DataHistoryTimeline({ result }: DataHistoryTimelineProps) {
  const target = result?.target ?? "ITEM";
  const header = result?.header ?? null;

  const gridRows = useMemo(() => {
    const out: Record<string, unknown>[] = [];
    (result?.rows ?? []).forEach((row, i) => {
      if (row.gapFrom) {
        out.push({ rowId: `gap${i}`, gap: true, eventLabel: GAP_LABEL, validFrom: row.gapFrom, validTo: row.gapTo });
      }
      out.push({
        ...row,
        rowId: `r${i}`,
        gap: false,
        eventLabel: EVENT_LABELS[row.event] ?? row.event,
        rowStateLabel: ROW_STATE_LABELS[row.rowState] ?? row.rowState,
        validTo: row.open ? "열림" : row.validTo,
      });
    });
    return out;
  }, [result]);

  const columns = useMemo<GridColumn[]>(() => {
    const cols: GridColumn[] = [
      {
        key: "eventLabel",
        header: "사건",
        width: 110,
        align: "center",
        render: (value, row) => (row.gap ? badge(String(value), "warning") : badge(String(value), "info")),
      },
      { key: "validFrom", header: "시작 일시", width: 150, align: "center" },
      { key: "validTo", header: "끝 일시", width: 150, align: "center" },
      {
        key: "rowStateLabel",
        header: "상태",
        width: 100,
        align: "center",
        render: (value, row) =>
          row.gap ? "" : badge(String(value), ROW_TONE[(row.rowState as HistoryRowState) ?? "PAST"] ?? "neutral"),
      },
    ];
    if (target === "ITEM") {
      cols.push(
        { key: "name", header: "이름", width: 150, align: "left" },
        { key: "alterName", header: "약칭", width: 100, align: "left" },
        { key: "seq", header: "순서", width: 70, align: "right" },
      );
      const lvlCnt = Math.max(0, Math.min(5, header?.lvlCnt ?? 0));
      for (let i = 1; i <= lvlCnt; i++) {
        cols.push({ key: `lvl${i}`, header: `${i}차`, width: 90, align: "left" });
      }
      for (const label of header?.attrLabels ?? []) {
        cols.push({ key: label.field, header: label.label, width: 110, align: "left" });
      }
      cols.push({ key: "rowVersion", header: "행 버전", width: 80, align: "right" });
    } else if (target === "CATE") {
      cols.push(
        { key: "cateName", header: "카테고리 이름", width: 150, align: "left" },
        { key: "defKind", header: "종류", width: 80, align: "center" },
        { key: "defTarget", header: "대상", width: 90, align: "center" },
        { key: "defExpr", header: "정규식", width: 150, align: "left" },
      );
    }
    return cols;
  }, [target, header]);

  const rows = result?.rows ?? [];
  const state = result?.state ?? "NONE";

  return (
    <div data-testid="history-timeline" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: "var(--spacing-sm)", alignItems: "center", padding: "var(--spacing-xs) 0" }}>
        <span data-testid="history-state">
          {result ? `${result.key ?? ""} · ${STATE_LABELS[state] ?? state} · ${rows.length}행` : "조회 전"}
        </span>
      </div>
      {result && rows.length === 0 ? (
        <p data-testid="history-empty" style={{ color: "var(--color-text-muted)" }}>
          행이 없습니다
        </p>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <AgDataGrid
            columns={columns}
            data={gridRows}
            rowKey="rowId"
            sortable={false}
            columnSizing="fit"
            emptyMessage="행이 없습니다"
          />
        </div>
      )}
    </div>
  );
}
