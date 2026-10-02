"use client";

import { useMemo, useState } from "react";
import { AgDataGrid, type GridColumn } from "./AgDataGrid";
import { GridPanel, type GridButton } from "./GridPanel";
import { moveItem, removeAt, updateAt } from "./row-list-ops";

/** 화면 데이터에 덧붙이는 내부 행 키(항목의 순번). */
const ROW_KEY = "__rowKey";

export interface EditableRowListProps<T extends object> {
  /** 패널 제목. */
  title: string;
  items: readonly T[];
  /** 칸 편집 열(editable). 열 키는 항목 필드 이름. */
  columns: GridColumn[];
  /** 항목이 바뀔 때마다 새 배열로 호출된다. */
  onChange: (items: T[]) => void;
  /** 「추가」 를 누르면 끝에 붙일 새 항목. */
  newItem: () => T;
  /** 추가 버튼 문구. */
  addLabel: string;
  /** 항목이 없을 때 그리드에 보일 문구. */
  emptyMessage: string;
  /** 칸 편집 값 정리(빈 글자 → undefined, 숫자 변환 등). 정리한 값이 항목에 들어간다. */
  normalize: (field: string, value: unknown) => unknown;
  /** 기본 버튼(추가·위로·아래로·삭제) 뒤에 붙는 버튼. */
  extraButtons?: GridButton[];
  /** 목록 영역 높이(px). 기본 200. */
  height?: number;
  /** 버튼 id 앞머리. 기본 「row-list」 → row-list-add·row-list-up·row-list-down·row-list-remove. */
  idPrefix?: string;
  testId?: string;
}

/**
 * 작은 설정 목록(표 컬럼·차트 계열 등)을 칸 편집으로 고치는 목록 — AgDataGrid + 추가·위로·아래로·삭제.
 * 저장 전 설정을 다루는 편집기 안에서 쓰므로 삭제 확인창은 두지 않는다(저장하지 않은 변경은 바깥 화면이 지킨다).
 * 행 하나를 눌러 고르면 위로·아래로·삭제가 그 행에 적용된다.
 */
export function EditableRowList<T extends object>({
  title,
  items,
  columns,
  onChange,
  newItem,
  addLabel,
  emptyMessage,
  normalize,
  extraButtons = [],
  height = 200,
  idPrefix = "row-list",
  testId,
}: EditableRowListProps<T>) {
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected !== null && selected < items.length ? selected : null;
  const data = useMemo(() => items.map((it, i) => ({ ...it, [ROW_KEY]: String(i) })), [items]);

  const move = (delta: -1 | 1) => {
    if (sel === null) return;
    onChange(moveItem(items, sel, delta));
    setSelected(sel + delta);
  };

  const buttons: GridButton[] = [
    {
      id: `${idPrefix}-add`,
      label: addLabel,
      onClick: () => {
        onChange([...items, newItem()]);
        setSelected(items.length);
      },
    },
    { id: `${idPrefix}-up`, label: "위로", disabled: sel === null || sel === 0, onClick: () => move(-1) },
    {
      id: `${idPrefix}-down`,
      label: "아래로",
      disabled: sel === null || sel >= items.length - 1,
      onClick: () => move(1),
    },
    {
      id: `${idPrefix}-remove`,
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
    <div style={{ height }} data-testid={testId}>
      <GridPanel title={title} count={items.length} buttons={buttons}>
        <AgDataGrid
          rowKey={ROW_KEY}
          columns={columns}
          data={data}
          columnSizing="fit"
          emptyMessage={emptyMessage}
          singleClickEdit
          highlightedRowKey={sel === null ? null : String(sel)}
          onRowClick={(row) => setSelected(Number(row[ROW_KEY]))}
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
