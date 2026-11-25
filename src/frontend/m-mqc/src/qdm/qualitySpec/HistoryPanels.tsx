"use client";

/**
 * 변경 이력 탭(일시·사양번호·작업·변경 내용·작업자, 행을 누르면 변경 상세 창)과 전송 이력 탭(I/F 문서번호·방향·대상·결과·메시지·처리 ms, 실패 행 재전송).
 */
import { memo, useCallback, useMemo } from "react";

import { ContentBody, ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { ChangeView, IfLogView } from "./types";

// ── 변경 이력 ─────────────────────────────────────────────

const CHANGE_COLUMNS: GridColumn[] = [
  { key: "chgAt", header: "일시", width: 130, minWidth: 130, align: "center" },
  { key: "specNo", header: "품질사양번호", width: 120, minWidth: 110, align: "left" },
  {
    key: "actionNm",
    header: "작업",
    width: 110,
    minWidth: 100,
    align: "center",
    render: (v, row) => {
      const a = (row as unknown as ChangeView).action;
      if (a === "SEND") return <GridBadge label={String(v)} bg="var(--color-success-soft)" color="var(--color-success)" />;
      if (a === "SEND_FAIL" || a === "DEL") return <GridBadge label={String(v)} bg="var(--color-danger-soft)" color="var(--color-danger)" />;
      if (a === "CONF") return <GridBadge label={String(v)} bg="var(--color-primary-soft)" color="var(--color-primary)" />;
      if (a === "REV" || a === "MOD") return <GridBadge label={String(v)} bg="var(--color-warning-soft)" color="var(--color-warning)" />;
      return <GridBadge label={String(v)} muted />;
    },
  },
  { key: "summary", header: "변경 내용", width: 300, minWidth: 200, align: "left" },
  { key: "worker", header: "작업자", width: 90, minWidth: 80, align: "center" },
];

export interface ChangeHistoryPanelProps {
  rows: ChangeView[];
  loading: boolean;
  selectedId: number | null;
  onOpen: (row: ChangeView) => void;
}

export const ChangeHistoryPanel = memo(function ChangeHistoryPanel({ rows, loading, selectedId, onOpen }: ChangeHistoryPanelProps) {
  const handleClick = useCallback((row: Record<string, unknown>) => onOpen(row as unknown as ChangeView), [onOpen]);
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="변경 이력" count={rows.length} loading={loading}>
          <AgDataGrid
            gridId="changes"
            rowKey="chgId"
            columns={CHANGE_COLUMNS}
            data={rows as unknown as Record<string, unknown>[]}
            columnSizing="fit"
            highlightedRowKey={selectedId}
            onRowClick={handleClick}
            loading={loading}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
});

const ITEM_COLUMNS: GridColumn[] = [
  { key: "item", header: "항목", width: 140, minWidth: 120, align: "left" },
  { key: "before", header: "변경 전", width: 160, minWidth: 120, align: "left" },
  { key: "after", header: "변경 후", width: 160, minWidth: 120, align: "left" },
];

export function ChangeDetailModal({ row, onClose }: { row: ChangeView | null; onClose: () => void }) {
  const items = useMemo(() => (row?.changes ?? []).map((c, i) => ({ ...c, _key: i })), [row]);
  return (
    <Modal open={row !== null} onClose={onClose} size="md" title={row ? `변경 상세 — ${row.specNo}` : "변경 상세"} footer={<Button onClick={onClose}>닫기</Button>}>
      {row ? (
        <>
          <table style={DETAIL_TABLE_STYLE}>
            <tbody>
              <tr>
                <th style={DETAIL_LABEL_CELL}>일시</th>
                <td style={DETAIL_VALUE_CELL}>{row.chgAt}</td>
                <th style={DETAIL_LABEL_CELL}>작업자</th>
                <td style={DETAIL_VALUE_CELL}>{row.worker}</td>
              </tr>
              <tr>
                <th style={DETAIL_LABEL_CELL}>작업</th>
                <td style={DETAIL_VALUE_CELL}>{row.actionNm}</td>
                <th style={DETAIL_LABEL_CELL}>품질사양번호</th>
                <td style={DETAIL_VALUE_CELL}>
                  {row.specNo} {row.specStatusNm ? `(현재 ${row.specStatusNm})` : "(삭제된 사양)"}
                </td>
              </tr>
            </tbody>
          </table>
          <AgDataGrid gridId="change-items" title="변경 항목" rowKey="_key" columns={ITEM_COLUMNS} data={items} columnSizing="fit" height="auto" filter={false} />
        </>
      ) : null}
    </Modal>
  );
}

// ── 전송 이력 ─────────────────────────────────────────────

export interface IfLogPanelProps {
  rows: IfLogView[];
  loading: boolean;
  busy: boolean;
  canSend: boolean;
  onResend: (specNo: string) => void;
}

export const IfLogPanel = memo(function IfLogPanel({ rows, loading, busy, canSend, onResend }: IfLogPanelProps) {
  const columns = useMemo<GridColumn[]>(
    () => [
      { key: "ifNo", header: "I/F 문서번호", width: 130, minWidth: 130, align: "left" },
      { key: "ifAt", header: "일시", width: 130, minWidth: 130, align: "center" },
      {
        key: "directionNm",
        header: "방향",
        width: 90,
        minWidth: 84,
        align: "center",
        render: (v, row) =>
          (row as unknown as IfLogView).direction === "MES_OMS" ? (
            <GridBadge label={String(v)} bg="var(--color-primary-soft)" color="var(--color-primary)" />
          ) : (
            <GridBadge label={String(v)} muted />
          ),
      },
      { key: "target", header: "대상", width: 140, minWidth: 130, align: "left" },
      {
        key: "resultNm",
        header: "결과",
        width: 70,
        minWidth: 60,
        align: "center",
        render: (v, row) =>
          (row as unknown as IfLogView).result === "OK" ? (
            <GridBadge label={String(v)} bg="var(--color-success-soft)" color="var(--color-success)" />
          ) : (
            <GridBadge label={String(v)} bg="var(--color-danger-soft)" color="var(--color-danger)" />
          ),
      },
      { key: "msg", header: "메시지", width: 220, minWidth: 180, align: "left" },
      { key: "elapsedMs", header: "처리(ms)", width: 80, minWidth: 70, align: "right", type: "number" },
      {
        key: "_resend",
        header: "작업",
        width: 80,
        minWidth: 74,
        align: "center",
        filter: false,
        sortable: false,
        render: (_v, row) => {
          const r = row as unknown as IfLogView;
          return r.resendable && r.specNo ? (
            <Button onClick={() => onResend(r.specNo!)} disabled={busy || !canSend}>
              재전송
            </Button>
          ) : null;
        },
      },
    ],
    [onResend, busy, canSend],
  );
  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="전송 이력" count={rows.length} loading={loading}>
          <AgDataGrid
            gridId="iflog"
            rowKey="ifNo"
            columns={columns}
            data={rows as unknown as Record<string, unknown>[]}
            columnSizing="fit"
            loading={loading}
            getRowClassExtra={failRow}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
});

const failRow = (row: Record<string, unknown>) => (row.result === "FAIL" ? "ag-row-error" : undefined);
