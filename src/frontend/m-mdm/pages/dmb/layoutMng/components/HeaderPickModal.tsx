"use client";

/** 헤더 추가 팝업(TSK-05-02 design.md §2) — layoutMng search target=HEADER(D8). 이미 쌓인 헤더는 고를 수 없다(L09). */
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";
import type { HeaderOption } from "../types";

const COLUMNS: GridColumn[] = [
  { key: "LAYOUT_ID", header: "헤더 ID", width: 80, align: "center" },
  { key: "LAYOUT_NAME", header: "헤더", width: 220 },
  { key: "EAI_CODE", header: "EAI", width: 90 },
  { key: "TOTAL_LENGTH", header: "길이", width: 70, align: "right" },
];

export interface HeaderPickModalProps {
  open: boolean;
  options: HeaderOption[];
  used: number[];
  onPick: (h: HeaderOption) => void;
  onClose: () => void;
}

export function HeaderPickModal({ open, options, used, onPick, onClose }: HeaderPickModalProps) {
  const rows = options.filter((o) => !used.includes(o.LAYOUT_ID));
  return (
    <Modal open={open} title="헤더 추가" size="md" onClose={onClose} footer={<Button onClick={onClose}>닫기</Button>}>
      <div data-testid="header-pick-modal">
        <AgDataGrid
          columnSizing="fit"
          columns={COLUMNS}
          data={rows as unknown as Record<string, unknown>[]}
          rowKey="LAYOUT_ID"
          height={240}
          emptyMessage="더 쌓을 헤더가 없습니다"
          onRowClick={(r) => onPick(r as unknown as HeaderOption)}
        />
      </div>
    </Modal>
  );
}
