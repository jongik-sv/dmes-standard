"use client";

/**
 * 사양 목록 탭 — 조건(IF)·설계결과(THEN) 칩, 상태, 최종수정. 여러 행을 골라 일괄 확정·OMS 전송·삭제한다(상태에 맞는 행만 처리).
 * 행을 누르면 상세 창을 연다. 행 안 [수정]·[삭제] 단추를 누른 클릭은 상세를 열지 않는다.
 */
import { memo, useCallback, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel } from "@dk-oasis/shared/layout";
import { AgDataGrid, GridPanel, type GridButton, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button } from "@dk-oasis/shared/form";

import { StatusCellBadge, TermCellChips, type ChipLabels } from "./badges";
import { STATUS_LABEL, type SpecStatus, type SpecView } from "./types";

export interface ActiveFilterChip {
  key: string;
  label: string;
}

export interface SpecListPanelProps {
  specs: SpecView[];
  loading: boolean;
  busy: boolean;
  labels: ChipLabels;
  /** 걸린 조건(고객사·품명·항목·상태·검색) — 머리줄에 보인다. 누르면 그 조건을 지운다. */
  activeFilters: ActiveFilterChip[];
  onClearFilter: (key: string) => void;
  onOpen: (specNo: string) => void;
  onEdit: (spec: SpecView) => void;
  onDelete: (specNos: string[]) => void;
  onConfirm: (specNos: string[]) => void;
  onSend: (specNos: string[]) => void;
  canSave: boolean;
  canDelete: boolean;
  canConfirm: boolean;
  canSend: boolean;
}

/** 행 안의 단추·체크 상자를 누른 클릭인가 — 그 클릭은 상세를 열지 않는다. */
function isControlClick(event: Event): boolean {
  const target = event.target as Element | null;
  return !!target?.closest?.("button, input, .ag-selection-checkbox, .ag-checkbox-input-wrapper");
}

export const SpecListPanel = memo(function SpecListPanel(props: SpecListPanelProps) {
  const { specs, loading, busy, labels, activeFilters, onClearFilter, onOpen, onEdit, onDelete, onConfirm, onSend, canSave, canDelete, canConfirm, canSend } = props;
  const [selected, setSelected] = useState<string[]>([]);

  // 열 render 가 최신 콜백을 부르도록 ref 로 잇는다 — 열 정의는 라벨 함수가 바뀔 때만 새로 만든다(R12).
  const actionsRef = useRef({ onEdit, onDelete });
  actionsRef.current = { onEdit, onDelete };

  const columns = useMemo<GridColumn[]>(
    () => [
      { key: "specNo", header: "품질사양번호", width: 120, minWidth: 120, align: "left", sortable: true },
      {
        key: "conds",
        header: "조건 (IF)",
        width: 260,
        minWidth: 220,
        align: "left",
        filter: false,
        render: (_v, row) => <TermCellChips terms={(row as unknown as SpecView).conds} side="IF" max={4} labels={labels} />,
      },
      {
        key: "results",
        header: "설계결과 (THEN)",
        width: 220,
        minWidth: 180,
        align: "left",
        filter: false,
        render: (_v, row) => <TermCellChips terms={(row as unknown as SpecView).results} side="THEN" max={3} labels={labels} />,
      },
      {
        key: "status",
        header: "상태",
        width: 80,
        minWidth: 80,
        align: "center",
        render: (v, row) => <StatusCellBadge status={v as SpecStatus} title={(row as unknown as SpecView).failMsg} />,
      },
      {
        key: "updatedAt",
        header: "최종수정",
        width: 150,
        minWidth: 150,
        align: "left",
        sortable: true,
        render: (v, row) => `${(row as unknown as SpecView).updatedBy} · ${String(v ?? "")}`,
      },
      {
        key: "_actions",
        header: "작업",
        width: 110,
        minWidth: 110,
        align: "center",
        filter: false,
        sortable: false,
        render: (_v, row) => {
          const spec = row as unknown as SpecView;
          return (
            <>
              <Button aria-label={`${spec.specNo} 수정`} title="수정" onClick={() => actionsRef.current.onEdit(spec)} disabled={busy || !canSave}>
                ✎
              </Button>{" "}
              <Button aria-label={`${spec.specNo} 삭제`} title="삭제" variant="danger" onClick={() => actionsRef.current.onDelete([spec.specNo])} disabled={busy || !canDelete}>
                ✕
              </Button>
            </>
          );
        },
      },
    ],
    [labels, busy, canSave, canDelete],
  );

  const bySpecNo = useMemo(() => new Map(specs.map((s) => [s.specNo, s])), [specs]);
  // 조회가 바뀌면 목록에 없는 선택은 버린다.
  const picked = useMemo(() => selected.map((no) => bySpecNo.get(no)).filter((s): s is SpecView => !!s), [selected, bySpecNo]);
  const confirmable = picked.filter((s) => s.status === "DRAFT" && s.mapped && s.results.length > 0).map((s) => s.specNo);
  const sendable = picked.filter((s) => (s.status === "CONF" || s.status === "FAIL") && s.mapped).map((s) => s.specNo);
  const pickedNos = picked.map((s) => s.specNo);

  const buttons: GridButton[] = [
    { id: "btn_batch_confirm", label: `일괄 확정 (${confirmable.length})`, onClick: () => onConfirm(confirmable), disabled: busy || !canConfirm || confirmable.length === 0 },
    { id: "btn_batch_send", label: `OMS 전송 (${sendable.length})`, onClick: () => onSend(sendable), disabled: busy || !canSend || sendable.length === 0 },
    { id: "btn_batch_delete", label: `삭제 (${pickedNos.length})`, onClick: () => onDelete(pickedNos), disabled: busy || !canDelete || pickedNos.length === 0 },
  ];

  const handleSelect = useCallback((ids: (string | number)[]) => setSelected(ids.map(String)), []);
  const handleRowClick = useCallback(
    (row: Record<string, unknown>, event: Event) => {
      if (isControlClick(event)) return;
      onOpen(String(row.specNo));
    },
    [onOpen],
  );

  const titleExtra = (
    <>
      {picked.length > 0 ? <Badge label={`${picked.length}건 선택 · 상태에 맞는 항목만 처리됩니다`} tone="primary" /> : null}
      {activeFilters.map((f) => (
        <Button key={f.key} title="이 조건 지우기" onClick={() => onClearFilter(f.key)}>
          {f.label} ✕
        </Button>
      ))}
    </>
  );

  return (
    <ContentBody root>
      <ContentPanel>
        <GridPanel title="품질사양 목록" count={specs.length} buttons={buttons} titleExtra={titleExtra} loading={loading}>
          <AgDataGrid
            gridId="specs"
            rowKey="specNo"
            columns={columns}
            data={specs as unknown as Record<string, unknown>[]}
            columnSizing="fit"
            selectable
            multiSelect
            selectedRows={selected}
            onRowSelect={handleSelect}
            onRowClick={handleRowClick}
            loading={loading}
            getRowClassExtra={rowClass}
          />
        </GridPanel>
      </ContentPanel>
    </ContentBody>
  );
});

const rowClass = (row: Record<string, unknown>) => (row.status === "FAIL" ? "ag-row-error" : undefined);

/** 상태별 건수 글 — 탭 머리·안내용. */
export function statusCountText(counts: Record<SpecStatus, number>): string {
  return (Object.keys(STATUS_LABEL) as SpecStatus[]).map((s) => `${STATUS_LABEL[s]} ${counts[s] ?? 0}`).join(" · ");
}
