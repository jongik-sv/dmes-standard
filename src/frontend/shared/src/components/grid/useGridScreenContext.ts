"use client";

import { useCallback, useMemo, useRef, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { GridApi, IRowNode } from "ag-grid-community";
import { toScreenContextValue, useScreenContextPublisher, type ScreenContextValue } from "../../screen-context";

export interface UseGridScreenContextOptions {
  gridRef: RefObject<AgGridReact | null>;
  containerRef: RefObject<HTMLElement | null>;
  /** false 면 아무것도 게시하지 않는다(prop `publishScreenContext={false}`). */
  enabled: boolean;
}

/** 문맥으로 낼 행: 선택 행(여럿이면 마지막으로 고른 행), 없으면 포커스 행. 없으면 null. */
function pickRowNode(api: GridApi): IRowNode | null {
  const selected = api.getSelectedNodes();
  for (let i = selected.length - 1; i >= 0; i--) if (selected[i].data) return selected[i];
  const cell = api.getFocusedCell();
  if (cell && cell.rowIndex != null && !cell.rowPinned) {
    const node = api.getDisplayedRowAtIndex(cell.rowIndex);
    if (node?.data) return node;
  }
  return null;
}

/** 행의 colDef field 별 값. 필드가 없는 열(체크박스·행번호)과 문맥 값으로 못 바꾸는 값은 뺀다. */
function rowValues(api: GridApi, node: IRowNode): Record<string, ScreenContextValue> {
  const out: Record<string, ScreenContextValue> = {};
  for (const col of api.getColumns() ?? []) {
    const field = col.getColDef().field;
    if (!field || Object.prototype.hasOwnProperty.call(out, field)) continue;
    let raw: unknown;
    try {
      raw = api.getCellValue({ rowNode: node, colKey: col });
    } catch {
      continue;
    }
    const v = toScreenContextValue(raw);
    if (v !== undefined) out[field] = v;
  }
  return out;
}

/**
 * AgDataGrid 선택 행 → 화면 문맥 자동 게시. 선택·포커스 변경은 사용자 조작이라 늘 게시하고(여러 그리드면 마지막으로 고른 그리드가 이긴다),
 * 데이터 갱신·칸 값 변경은 이 그리드가 마지막 게시자일 때만 다시 계산해 남의 문맥을 빼앗지 않는다.
 * 대화 상자 안 그리드는 게시하지 않는다. 포털 탭 밖이면 게시자가 하는 일이 없다.
 */
export function useGridScreenContext({ gridRef, containerRef, enabled }: UseGridScreenContextOptions) {
  const publisher = useScreenContextPublisher();
  const publisherRef = useRef(publisher);
  publisherRef.current = publisher;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const sync = useCallback(
    (userAction: boolean) => {
      if (!enabledRef.current) return;
      const api = gridRef.current?.api;
      if (!api) return;
      const el = containerRef.current;
      if (el && el.closest('[role="dialog"]')) return;
      const pub = publisherRef.current;
      if (!userAction && !pub.owned()) return;
      const node = pickRowNode(api);
      if (node) pub.publish(rowValues(api, node), "grid");
      else pub.clear();
    },
    [gridRef, containerRef]
  );

  return useMemo(
    () => ({
      /** 선택·포커스가 바뀌었다(사용자 조작). */
      onUserPick: () => sync(true),
      /** 데이터·칸 값이 바뀌었다(이 그리드가 마지막 게시자일 때만 다시 게시). */
      onDataChange: () => sync(false),
    }),
    [sync]
  );
}
