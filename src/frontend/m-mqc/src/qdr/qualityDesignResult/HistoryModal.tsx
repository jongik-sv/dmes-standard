"use client";

/**
 * 변경이력 창 — 설계계산·확정·보류·보류해제 기록(최근 순).
 */
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { STATUS_LABEL, type DesignHistoryEvent, type DesignStatus } from "./types";

const statusText = (v: unknown) => (v ? (STATUS_LABEL[v as DesignStatus] ?? String(v)) : "—");

const COLUMNS: GridColumn[] = [
  { key: "at", header: "처리 시각", width: 140, minWidth: 130, align: "center", meta: false },
  { key: "actionNm", header: "작업", width: 80, minWidth: 70, align: "center", meta: false },
  { key: "before", header: "이전 상태", width: 80, minWidth: 70, align: "center", meta: false, render: statusText },
  { key: "after", header: "이후 상태", width: 80, minWidth: 70, align: "center", meta: false, render: statusText },
  { key: "by", header: "처리자", width: 90, minWidth: 80, align: "left", meta: false },
  { key: "note", header: "비고", width: 200, minWidth: 160, align: "left", meta: false },
];

export function HistoryModal({
  open,
  orderKey,
  events,
  loading,
  onClose,
}: {
  open: boolean;
  orderKey: string | null;
  events: DesignHistoryEvent[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={`변경이력${orderKey ? " — " + orderKey : ""}`} onClose={onClose} size="lg" footer={<Button onClick={onClose}>닫기</Button>}>
      <AgDataGrid
        gridId="modal-history"
        title="변경이력"
        rowKey="histId"
        columns={COLUMNS}
        data={events as unknown as Record<string, unknown>[]}
        height="auto"
        columnSizing="fit"
        loading={loading}
        personalize={false}
      />
    </Modal>
  );
}
