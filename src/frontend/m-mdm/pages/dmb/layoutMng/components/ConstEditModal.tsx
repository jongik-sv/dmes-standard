"use client";

/**
 * 상수 편집 팝업(TSK-05-02 design.md §2 — 3층 기본값 F9·불변 I10·I20). 행은 그 헤더의 CONST 항목만(AUTO·FILLER 는 나오지 않는다),
 * 열은 항목 / 헤더 기본값(텍스트, 입력 아님) / 이 전문의 값(칸을 누르면 편집, 비었으면 헤더 기본값을 흐리게) / 재정의 배지.
 * [적용] 은 화면 상태만 바꾸고 저장은 [저장] 이 한다. 값은 코드값 전제다(design.md 인계).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";
import { badge, hint } from "@/layout/styles";
import type { HeaderStackRow } from "@/layout/types";

export interface ConstEditModalProps {
  header: HeaderStackRow | null;
  readOnly: boolean;
  onApply: (overrides: Record<number, string | null>) => void;
  onClose: () => void;
}

// 재정의 배지는 OVERRIDDEN 칸으로 둔다 — 행 키(SEQ)로 갱신하는 그리드는 값이 바뀐 칸만 다시 그리기 때문이다.
function constColumns(readOnly: boolean): GridColumn[] {
  return [
    { key: "ITEM", meta: false, header: "항목", width: 200 },
    {
      key: "DEFAULT_VALUE", header: "헤더 기본값", width: 110,
      render: (v, r) => <span data-testid={`const-default-${r.PHYS}`}>{String(v ?? "")}</span>,
    },
    {
      key: "VALUE", meta: false, header: "이 전문의 값", width: 140, editable: !readOnly, tooltip: false,
      render: (v, r) => (
        <span data-testid={`const-input-${r.PHYS}`}>
          {String(v ?? "") !== "" ? String(v) : <span style={hint}>{String(r.DEFAULT_VALUE ?? "")}</span>}
        </span>
      ),
    },
    { key: "OVERRIDDEN", meta: false, header: "재정의", width: 70, tooltip: false, render: (v) => (v ? <span style={badge}>재정의</span> : null) },
  ];
}

export function ConstEditModal({ header, readOnly, onApply, onClose }: ConstEditModalProps) {
  const consts = (header?.items ?? []).filter((i) => i.FILL_KIND === "CONST");
  const [values, setValues] = useState<Record<number, string>>({});
  useEffect(() => {
    const init: Record<number, string> = {};
    for (const i of header?.items ?? []) {
      if (i.FILL_KIND === "CONST") init[i.SEQ] = i.OVERRIDE_VALUE ?? "";
    }
    setValues(init);
  }, [header]);
  const columns = useMemo(() => constColumns(readOnly), [readOnly]);
  const rows = consts.map((i) => {
    const phys = i.COLUMN_PHYS ?? String(i.SEQ);
    const v = values[i.SEQ] ?? "";
    return { SEQ: i.SEQ, PHYS: phys, ITEM: `${i.DISPLAY_NAME ?? phys} (${phys})`, DEFAULT_VALUE: i.DEFAULT_VALUE ?? "", VALUE: v,
      OVERRIDDEN: v.trim() !== "" };
  });

  return (
    <Modal
      open={header != null}
      title={`상수 편집 — ${header?.HEADER_NAME ?? ""}`}
      size="lg"
      onClose={onClose}
      footer={
        <span style={{ display: "inline-flex", gap: "var(--spacing-sm)" }}>
          {!readOnly && (
            <Button data-testid="const-edit-apply" variant="primary" onClick={() => {
              const out: Record<number, string | null> = {};
              for (const [seq, v] of Object.entries(values)) out[Number(seq)] = v.trim() === "" ? null : v.trim();
              onApply(out);
            }}>적용</Button>
          )}
          <Button onClick={onClose}>닫기</Button>
        </span>
      }
    >
      <div data-testid="const-edit-modal">
        <p style={hint}>헤더 템플릿이 기본값을 제안하고 이 전문이 상수를 확정합니다. AUTO 는 송신 시점에 채워져 여기 나오지 않습니다.</p>
        <AgDataGrid gridId="modal-constEdit"
          columnSizing="fit"
          columns={columns}
          data={rows}
          rowKey="SEQ"
          height="auto"
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          onCellValueChanged={({ row, newValue }) =>
            setValues((m) => ({ ...m, [Number(row.SEQ)]: String(newValue ?? "") }))}
        />
      </div>
    </Modal>
  );
}
