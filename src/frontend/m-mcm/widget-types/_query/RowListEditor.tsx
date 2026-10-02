"use client";

import { useMemo, useState } from "react";
import { AgDataGrid, GridPanel, type GridButton, type GridColumn } from "@dk-oasis/shared/grid";

import { moveItem, removeAt, TABLE_ROW_KEY, updateAt } from "./format";

export interface RowListEditorProps<T extends object> {
  title: string;
  items: readonly T[];
  /** 칸 편집 열(editable). 키는 항목 필드 이름. */
  columns: GridColumn[];
  onChange: (items: T[]) => void;
  newItem: () => T;
  addLabel: string;
  emptyMessage: string;
  /** 칸 편집 값 정리(빈 글자 → undefined, 폭 → 양의 정수 등). */
  normalize: (field: string, value: unknown) => unknown;
  /** 기본 버튼(추가·위로·아래로·삭제) 뒤에 붙는 버튼. */
  extraButtons?: GridButton[];
  testId?: string;
}

/**
 * 편집기 안 설정 목록(표 컬럼·차트 계열) — AgDataGrid 칸 편집 + 추가·위로·아래로·삭제.
 * 저장 전 정의 설정이라 삭제 확인창은 두지 않는다(관리 화면이 「저장하지 않은 변경」 을 지킨다).
 */
export function RowListEditor<T extends object>({
  title,
  items,
  columns,
  onChange,
  newItem,
  addLabel,
  emptyMessage,
  normalize,
  extraButtons = [],
  testId,
}: RowListEditorProps<T>) {
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected !== null && selected < items.length ? selected : null;
  const data = useMemo(() => items.map((it, i) => ({ ...it, [TABLE_ROW_KEY]: String(i) })), [items]);

  const move = (delta: -1 | 1) => {
    if (sel === null) return;
    onChange(moveItem(items, sel, delta));
    setSelected(sel + delta);
  };

  const buttons: GridButton[] = [
    {
      id: "wq-row-add",
      label: addLabel,
      onClick: () => {
        onChange([...items, newItem()]);
        setSelected(items.length);
      },
    },
    { id: "wq-row-up", label: "위로", disabled: sel === null || sel === 0, onClick: () => move(-1) },
    { id: "wq-row-down", label: "아래로", disabled: sel === null || sel >= items.length - 1, onClick: () => move(1) },
    {
      id: "wq-row-remove",
      label: "삭제",
      disabled: sel === null,
      onClick: () => {
        if (sel === null) return;
        onChange(removeAt(items, sel));
        setSelected(null);
      },
    },
    ...extraButtons,
  ];

  return (
    <div className="wq-rows" data-testid={testId}>
      <GridPanel title={title} count={items.length} buttons={buttons}>
        <AgDataGrid
          rowKey={TABLE_ROW_KEY}
          columns={columns}
          data={data}
          columnSizing="fit"
          emptyMessage={emptyMessage}
          singleClickEdit
          highlightedRowKey={sel === null ? null : String(sel)}
          onRowClick={(row) => setSelected(Number(row[TABLE_ROW_KEY]))}
          onCellValueChanged={({ rowKey, field, newValue }) => {
            const idx = Number(rowKey);
            if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return;
            onChange(updateAt(items, idx, { [field]: normalize(field, newValue) } as Partial<T>));
          }}
        />
      </GridPanel>
    </div>
  );
}
