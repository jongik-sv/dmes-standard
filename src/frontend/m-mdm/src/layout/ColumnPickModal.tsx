"use client";

/**
 * 컬럼 사전 검색 팝업(TSK-05-02 design.md §2 — 두 화면 공용). 항목은 사전 검색 결과에서 고른 행으로만 만든다 —
 * 자유 입력 경로가 없다(수용 기준 1 화면 쪽, 불변 I5). 검색은 각 서비스 `search` 의 `target=COLUMN`(D8).
 */
import { useState } from "react";
import { Button, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";
import { ColumnPhysName } from "@/column-info";
import type { ColumnInfo } from "./types";
import { empty, hint, row } from "./styles";

const COLUMNS: GridColumn[] = [
  { key: "PHYS_NAME", header: "표준 물리명", width: 160, render: (v) => <ColumnPhysName physName={v as string | null} /> },
  { key: "DISPLAY_NAME", header: "표시명", width: 160 },
  { key: "DOMAIN_NAME", header: "도메인", width: 140 },
  {
    key: "LENGTH", header: "타입·길이", meta: false, width: 120,
    render: (_v, r) => `${r.DATA_TYPE ?? "-"} ${r.LENGTH ?? "-"}${r.SCALE ? `,${r.SCALE}` : ""}`,
  },
  { key: "UNIT_CODE", header: "단위", width: 70 },
];

export interface ColumnPickModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (column: ColumnInfo) => void;
  search: (keyword: string) => Promise<ColumnInfo[]>;
  /** 이미 쓴 물리명 — 고를 수 없다(같은 레이아웃 컬럼 중복 L06). */
  used?: string[];
}

export function ColumnPickModal({ open, onClose, onPick, search, used = [] }: ColumnPickModalProps) {
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<ColumnInfo[] | null>(null);
  const [selected, setSelected] = useState<ColumnInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      setRows(await search(keyword.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setSelected(null);
    onClose();
  };

  const usedNow = selected != null && used.includes(selected.PHYS_NAME);

  return (
    <Modal
      open={open}
      title="컬럼 사전 검색"
      size="lg"
      onClose={close}
      footer={
        <div style={row}>
          {usedNow && <span style={hint}>이미 이 레이아웃에 있는 컬럼입니다</span>}
          <Button data-testid="column-pick-select" variant="primary" disabled={!selected || usedNow}
            onClick={() => {
              if (!selected) return;
              onPick(selected);
              close();
            }}>
            선택
          </Button>
          <Button onClick={close}>닫기</Button>
        </div>
      }
    >
      <div data-testid="column-pick-modal">
        <div style={{ ...row, marginBottom: "var(--spacing-sm)" }}>
          <Input data-testid="column-pick-keyword" aria-label="컬럼 검색어" placeholder="물리명·논리명·표시명"
            value={keyword} onChange={setKeyword}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }} />
          <Button data-testid="column-pick-search" onClick={() => void run()} disabled={busy}>조회</Button>
        </div>
        {error && <p className="form-error-message" style={{ whiteSpace: "pre-line" }}>{error}</p>}
        {rows === null && <p style={empty}>검색어를 넣고 조회하세요. 컬럼 사전에 있는 컬럼만 항목이 됩니다.</p>}
        {/* 조회 전·오류로 0건이면 숨기되(display:none) 그리드는 늘 마운트해 0↔N건 전환 때 다시 만들지 않는다 */}
        <div data-testid="column-pick-grid" style={rows === null || (rows.length === 0 && error) ? { display: "none" } : undefined}>
          <AgDataGrid
            columnSizing="fit"
            columns={COLUMNS}
            data={(rows ?? []) as unknown as Record<string, unknown>[]}
            emptyMessage="컬럼 사전에 없습니다. 먼저 컬럼 사전에 등재하세요"
            emptyTestId="column-pick-empty"
            rowKey="PHYS_NAME"
            height={280}
            highlightedRowKey={selected?.PHYS_NAME ?? null}
            onRowClick={(r) => setSelected(r as unknown as ColumnInfo)}
            onRowDoubleClick={(r) => {
              const c = r as unknown as ColumnInfo;
              if (used.includes(c.PHYS_NAME)) return;
              onPick(c);
              close();
            }}
          />
        </div>
      </div>
    </Modal>
  );
}
