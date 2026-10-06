"use client";

import { useCallback, useMemo, useRef, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { Column, GridApi, IRowNode } from "ag-grid-community";
import {
  normalizeScreenKey,
  toScreenContextValue,
  useScreenApplyHandler,
  useScreenContextPublisher,
  type ScreenApplyResult,
  type ScreenContextValue,
} from "../../screen-context";

export interface UseGridScreenContextOptions {
  gridRef: RefObject<AgGridReact | null>;
  containerRef: RefObject<HTMLElement | null>;
  /** false 면 아무것도 게시하지 않는다(prop `publishScreenContext={false}`). */
  enabled: boolean;
  /** true 면 도구 창 위젯이 보낸 값을 선택 행(없으면 포커스 행)의 편집 가능한 칸에 넣는다(prop `acceptScreenApply`). */
  acceptApply?: boolean;
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

/** 칸의 현재 값이 숫자인데 들어올 값이 숫자 문자열이면 숫자로 바꾼다(숫자 칸에 문자열이 들어가 합계·검사가 깨지지 않게). */
function matchCellType(current: unknown, next: ScreenContextValue): unknown {
  if (typeof current === "number" && typeof next === "string" && next.trim() !== "" && Number.isFinite(Number(next))) {
    return Number(next);
  }
  return next;
}

/**
 * 받은 값을 선택 행(없으면 포커스 행)의 칸에 넣는다. field 가 정규화 비교로 맞고 편집 가능한 칸만 넣고, 나머지(없는 키·편집 불가·행 없음)는 skipped 다.
 * `setDataValue` 는 사용자가 칸을 고친 것과 같은 `cellValueChanged` 를 일으키므로 행 수정 표시·onCellValueChanged 가 기존 경로 그대로 돈다.
 */
function applyToRow(api: GridApi, values: Record<string, ScreenContextValue>): ScreenApplyResult {
  const result: ScreenApplyResult = { applied: [], skipped: [] };
  const node = pickRowNode(api);
  if (!node) return { applied: [], skipped: Object.keys(values) };
  const byKey = new Map<string, Column>();
  for (const col of api.getColumns() ?? []) {
    const field = col.getColDef().field;
    if (!field) continue;
    const n = normalizeScreenKey(field);
    if (!byKey.has(n)) byKey.set(n, col);
  }
  for (const key of Object.keys(values)) {
    const col = byKey.get(normalizeScreenKey(key));
    if (!col || !col.isCellEditable(node)) {
      result.skipped.push(key);
      continue;
    }
    try {
      const current = api.getCellValue({ rowNode: node, colKey: col });
      node.setDataValue(col, matchCellType(current, values[key]));
      result.applied.push(key);
    } catch {
      result.skipped.push(key);
    }
  }
  return result;
}

/**
 * AgDataGrid 선택 행 → 화면 문맥 자동 게시. 선택·포커스 변경은 사용자 조작이라 늘 게시하고(여러 그리드면 마지막으로 고른 그리드가 이긴다),
 * 데이터 갱신·칸 값 변경은 이 그리드가 마지막 게시자일 때만 다시 계산해 남의 문맥을 빼앗지 않는다.
 * 대화 상자 안 그리드는 게시하지 않는다. 포털 탭 밖이면 게시자가 하는 일이 없다.
 */
export function useGridScreenContext({ gridRef, containerRef, enabled, acceptApply = false }: UseGridScreenContextOptions) {
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

  // 받기(역방향): 기본 끔. 켜면 문맥을 게시하는 그리드와 같은 소유자로 등록해, 사용자가 마지막으로 고른 그리드가 우선한다. 대화 상자 안 그리드는 등록하지 않는다.
  const applyValues = useCallback(
    (values: Record<string, ScreenContextValue>): ScreenApplyResult => {
      const api = gridRef.current?.api;
      const el = containerRef.current;
      if (!api || (el && el.closest('[role="dialog"]'))) return { applied: [], skipped: Object.keys(values) };
      return applyToRow(api, values);
    },
    [gridRef, containerRef]
  );
  useScreenApplyHandler(applyValues, { enabled: acceptApply, owner: publisher.owner });

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
