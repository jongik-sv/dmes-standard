"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
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

/**
 * 들어올 값을 칸의 데이터 형에 맞춘다. 칸 형식 검사에 걸리면 ag-grid 가 값을 버리므로(setDataValue 가 false) 넣기 전에 바꿀 수 있는 것은 바꾼다.
 * 열의 `cellDataType`(추론 결과 포함)이 number·text·boolean 이면 그 형으로, 그 밖이면 칸의 현재 값이 숫자일 때만 숫자 문자열을 숫자로 바꾼다.
 * 바꿀 수 없으면 undefined(= 넣지 않음).
 */
function coerceForCell(col: Column, current: unknown, next: ScreenContextValue): unknown | undefined {
  const dt = col.getColDef().cellDataType;
  const numeric = typeof next === "string" && next.trim() !== "" && Number.isFinite(Number(next));
  if (dt === "number") {
    if (next === null || next === "") return null;
    if (typeof next === "number") return next;
    return numeric ? Number(next) : undefined;
  }
  if (dt === "text") return next === null ? null : String(next);
  if (dt === "boolean") {
    if (next === null) return null;
    if (next === "true") return true;
    if (next === "false") return false;
    return undefined;
  }
  if (typeof current === "number" && typeof next === "string") return numeric ? Number(next) : undefined;
  return next;
}

/**
 * 받은 값을 선택 행(없으면 포커스 행)의 칸에 넣는다. field 가 맞고(정확히 같은 표기를 먼저, 없으면 정규화 비교) 보이는 편집 가능한 칸만 넣고,
 * 나머지(없는 키·편집 불가·숨긴 열·형 불일치·같은 칸을 가리키는 두 번째 키·행 없음)는 skipped 다. 숨긴 열은 사용자가 볼 수 없는 칸이라 넣지 않는다.
 * `setDataValue` 는 사용자가 칸을 고친 것과 같은 `cellValueChanged` 를 일으키므로 행 수정 표시·onCellValueChanged 가 기존 경로 그대로 돈다.
 * ag-grid 가 값을 받지 않으면(false) 넣었다고 알리지 않는다.
 */
function applyToRow(api: GridApi, values: Record<string, ScreenContextValue>): ScreenApplyResult {
  const result: ScreenApplyResult = { applied: [], skipped: [] };
  const node = pickRowNode(api);
  if (!node) return { applied: [], skipped: Object.keys(values) };
  const exact = new Map<string, Column>();
  const byKey = new Map<string, Column>();
  for (const col of api.getColumns() ?? []) {
    const field = col.getColDef().field;
    if (!field || !col.isVisible()) continue;
    if (!exact.has(field)) exact.set(field, col);
    const n = normalizeScreenKey(field);
    if (!byKey.has(n)) byKey.set(n, col);
  }
  const used = new Set<Column>();
  for (const key of Object.keys(values)) {
    const col = exact.get(key) ?? byKey.get(normalizeScreenKey(key));
    if (!col || used.has(col) || !col.isCellEditable(node)) {
      result.skipped.push(key);
      continue;
    }
    try {
      const next = coerceForCell(col, api.getCellValue({ rowNode: node, colKey: col }), values[key]);
      if (next === undefined || node.setDataValue(col, next) === false) {
        result.skipped.push(key);
        continue;
      }
      used.add(col);
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
 * 같은 틱 안의 여러 이벤트(전체 선택·일괄 수정은 행마다 이벤트가 온다)는 microtask 로 모아 한 번만 계산한다.
 * 대화 상자 안 그리드는 게시하지도 받지도 않는다. 포털 탭 밖이면 게시자가 하는 일이 없다.
 */
export function useGridScreenContext({ gridRef, containerRef, enabled, acceptApply = false }: UseGridScreenContextOptions) {
  const publisher = useScreenContextPublisher();
  const publisherRef = useRef(publisher);
  publisherRef.current = publisher;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const runSync = useCallback(
    (userAction: boolean) => {
      if (!aliveRef.current || !enabledRef.current) return;
      const api = gridRef.current?.api;
      if (!api || api.isDestroyed()) return;
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
  // 한 틱에 쌓인 요청을 한 번으로 모은다. 사용자 조작이 하나라도 섞이면 사용자 조작으로 처리한다.
  const pendingRef = useRef<{ scheduled: boolean; user: boolean }>({ scheduled: false, user: false });
  const sync = useCallback(
    (userAction: boolean) => {
      const p = pendingRef.current;
      p.user = p.user || userAction;
      if (p.scheduled) return;
      p.scheduled = true;
      queueMicrotask(() => {
        const user = p.user;
        p.scheduled = false;
        p.user = false;
        runSync(user);
      });
    },
    [runSync]
  );

  // 게시를 도중에 끄면 이미 낸 문맥을 거둔다.
  useEffect(() => {
    if (!enabled) publisher.clear();
  }, [enabled, publisher]);

  // 받기(역방향): 기본 끔. 켜면 문맥을 게시하는 그리드와 같은 소유자로 등록해, 사용자가 마지막으로 고른 그리드가 우선한다.
  // 대화 상자 안 그리드는 등록하지 않는다(DOM 을 봐야 알 수 있어 페인트 전에 한 번 정한다).
  const [inDialog, setInDialog] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    setInDialog(el ? el.closest('[role="dialog"]') != null : false);
  }, [containerRef]);
  const applyValues = useCallback(
    (values: Record<string, ScreenContextValue>): ScreenApplyResult => {
      const api = gridRef.current?.api;
      if (!api || api.isDestroyed()) return { applied: [], skipped: Object.keys(values) };
      return applyToRow(api, values);
    },
    [gridRef]
  );
  useScreenApplyHandler(applyValues, { enabled: acceptApply && inDialog === false, owner: publisher.owner });

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
