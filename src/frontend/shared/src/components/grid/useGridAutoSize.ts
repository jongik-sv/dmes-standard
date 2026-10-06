"use client";

import { useRef, useEffect, useCallback, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { ColumnResizedEvent } from "ag-grid-community";
import { GRID_SIZE_CHANGE_SETTLE_MS, resolveGridSizeChangeAction } from "./grid-size-change";
import type { GridColumn } from "./grid-types";
import type { useGridMdm } from "./grid-mdm";

/** 저장 너비 컬럼이 없을 때의 집합(공유 상수 — 렌더마다 새로 만들지 않는다). */
const EMPTY_SIZED_COLUMNS: ReadonlySet<string> = new Set();

/** `useGridAutoSize` 매개변수 — AgDataGrid 의 prop·ref 를 그대로 받는다. */
export interface UseGridAutoSizeOptions {
  gridRef: RefObject<AgGridReact | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  gridReady: boolean;
  data: Record<string, unknown>[];
  columns: GridColumn[];
  /** useGridMdm 결과 — 메타를 받아 오면 폭을 다시 맞춘다. */
  mdm: ReturnType<typeof useGridMdm>;
  resolvedColumnSizing: "auto" | "fixed" | "fit";
  shouldAutoSizeColumns: boolean;
  autoSizeOnDataUpdate: boolean;
}

/**
 * AgDataGrid 자동 너비·여백 분배 — 마운트·데이터·폭 변경 때의 자동 너비 맞춤, 타이머 정리, 사용자 열 크기 바꾸기 감지,
 * 개인화 훅(useGridPersonalize)에 넘길 sizedColumnsRef·복원/기본값 복원 뒤 다시 맞춤 콜백.
 * 개인화 훅보다 먼저 불러야 한다(rerunAutoSizeAfterRestore·rerunAutoSizeAfterReset 을 넘긴다).
 */
export function useGridAutoSize(opts: UseGridAutoSizeOptions) {
  const {
    gridRef,
    containerRef,
    gridReady,
    data,
    columns,
    mdm,
    resolvedColumnSizing,
    shouldAutoSizeColumns,
    autoSizeOnDataUpdate,
  } = opts;
  const userResizedRef = useRef(false);
  /**
   * 컬럼 개인화로 너비가 저장된 colId(사용자가 직접 끌어 맞춘 컬럼). 자동 너비는 나머지 컬럼에만, 여백 분배는 이 컬럼 너비를 고정한 채로 한다.
   * 비어 있으면(저장값 없음·저장 너비 없음) 자동 너비 흐름은 개인화 전과 같은 호출(autoSizeAllColumns·기존 sizeColumnsToFit)이다.
   */
  const sizedColumnsRef = useRef<ReadonlySet<string>>(EMPTY_SIZED_COLUMNS);
  const autoSizeTimerRef = useRef<number | null>(null);
  const sizeChangeTimerRef = useRef<number | null>(null);
  /** 직전 grid size-change 시점의 컨테이너 폭. 0 이하면 숨김/미레이아웃. */
  const lastGridWidthRef = useRef(0);

  const columnSizingRef = useRef(resolvedColumnSizing);
  columnSizingRef.current = resolvedColumnSizing;

  /** 현재 컬럼 폭을 min 으로 잠그고, 그리드가 더 넓을 때만 여백을 분배한다. */
  const fillRemainingColumnSpace = useCallback(() => {
    if (!gridRef.current?.api) return;
    // fit 은 flex 가 이미 그리드 폭을 채운다. 컨테이너와 ag 루트의 1px 테두리 차이로 여기에 들어오면
    // sizeColumnsToFit 이 flex 가중치(col.width 비율)를 버리고 모든 열을 같은 폭으로 만든다.
    if (columnSizingRef.current === "fit") return;
    try {
      const api = gridRef.current.api;
      const cols = api.getColumns?.() ?? [];
      const totalWidth = cols.reduce((sum, c) => sum + (c.getActualWidth?.() ?? 0), 0);
      const gridWidth = containerRef.current?.clientWidth ?? 0;
      if (gridWidth > 0 && totalWidth > 0 && totalWidth < gridWidth) {
        const sized = sizedColumnsRef.current;
        api.sizeColumnsToFit({
          defaultMinWidth: 1,
          columnLimits: cols.map((c) =>
            // 저장 너비 컬럼은 늘리지도 줄이지도 않는다(개인화). 없으면 예전과 같은 한계값이다.
            sized.has(c.getColId())
              ? { key: c.getColId(), minWidth: c.getActualWidth(), maxWidth: c.getActualWidth() }
              : { key: c.getColId(), minWidth: c.getActualWidth() }
          ),
        });
      }
    } catch {
      // 그리드 DOM이 아직 준비되지 않은 경우 무시
    }
  }, []);

  const autoSizeAllColumnsHandler = useCallback(() => {
    if (!gridRef.current?.api) return;
    // 컨텐츠 기반 자동 폭은 columnSizing="auto" 또는 autoSizeColumns={true}일 때만 사용한다.
    if (!shouldAutoSizeColumns) return;
    try {
      const sized = sizedColumnsRef.current;
      if (sized.size === 0) gridRef.current.api.autoSizeAllColumns(false);
      else {
        // 저장 너비 컬럼(사용자가 직접 맞춘 컬럼)은 빼고 나머지만 내용에 맞춘다 — autoSizeAllColumns 와 같은 대상(보이는 컬럼)에서 뺀다.
        const keys = gridRef.current.api
          .getAllDisplayedColumns()
          .map((c) => c.getColId())
          .filter((id) => !sized.has(id));
        if (keys.length > 0) gridRef.current.api.autoSizeColumns(keys, false);
      }
      // 컨텐츠 기준 자동 폭 합계가 그리드보다 좁으면 남는 공간을 분배하여 채움.
      fillRemainingColumnSpace();
      lastGridWidthRef.current = containerRef.current?.clientWidth ?? 0;
    } catch {
      // 그리드 DOM이 아직 준비되지 않은 경우 다음 렌더에서 다시 시도됨
    }
  }, [shouldAutoSizeColumns, fillRemainingColumnSpace]);

  const scheduleAutoSizeAllColumns = useCallback(() => {
    if (autoSizeTimerRef.current != null) {
      window.clearTimeout(autoSizeTimerRef.current);
    }
    autoSizeTimerRef.current = window.setTimeout(() => {
      autoSizeTimerRef.current = null;
      autoSizeAllColumnsHandler();
    }, 50);
  }, [autoSizeAllColumnsHandler]);

  const scheduleFillRemainingColumnSpace = useCallback(() => {
    if (sizeChangeTimerRef.current != null) {
      window.clearTimeout(sizeChangeTimerRef.current);
    }
    sizeChangeTimerRef.current = window.setTimeout(() => {
      sizeChangeTimerRef.current = null;
      fillRemainingColumnSpace();
      lastGridWidthRef.current = containerRef.current?.clientWidth ?? 0;
    }, GRID_SIZE_CHANGE_SETTLE_MS);
  }, [fillRemainingColumnSpace]);

  // 기본값 복원 뒤에는 아래 마운트 직후 효과와 같은 갈래로 자동 너비 맞춤을 다시 돌린다.
  const rerunAutoSize = useCallback(() => {
    if (resolvedColumnSizing === "auto" && shouldAutoSizeColumns) scheduleAutoSizeAllColumns();
    else scheduleFillRemainingColumnSpace();
  }, [resolvedColumnSizing, shouldAutoSizeColumns, scheduleAutoSizeAllColumns, scheduleFillRemainingColumnSpace]);
  const rerunAutoSizeAfterRestore = useCallback(() => {
    if (!userResizedRef.current) rerunAutoSize();
  }, [rerunAutoSize]);
  const rerunAutoSizeAfterReset = useCallback(() => {
    userResizedRef.current = false;
    rerunAutoSize();
  }, [rerunAutoSize]);

  // ★그리드 준비 직후 1회 폭 정리 — 데이터가 0건이면 ag-grid 가 firstDataRendered / rowDataUpdated 를
  //   내보내지 않아 아래 핸들러들이 한 번도 호출되지 않는다. 그 결과 "조회 결과가 없습니다" 상태에서
  //   컬럼 폭 합이 그리드보다 좁아도 우측이 빈 채로 남았다(2026-08-07 CR 이력 화면에서 실측: 그리드 976px
  //   vs 컬럼합 694px). 데이터 유무와 무관하게 마운트 후 한 번은 반드시 맞춘다.
  //   deps 는 길이만 본다 — 배열을 인라인으로 만드는 페이지에서 매 렌더 재실행되는 것을 피한다.
  //   mdm(포털 탭 MDM 메타)은 받아 온 뒤 한 번 바뀐다 — 열 정의를 다시 넣으면 ag-grid 가 colDef.width 를 다시 적용해
  //   채워 둔 여백이 사라지고(fixed·auto), 캡션이 길어지면 내용 폭도 달라지므로 다시 맞춘다. 공급자 밖이면 늘 undefined 라 영향이 없다.
  useEffect(() => {
    if (!gridReady || userResizedRef.current) return;
    if (resolvedColumnSizing === "auto" && shouldAutoSizeColumns) {
      scheduleAutoSizeAllColumns();
      return;
    }
    scheduleFillRemainingColumnSpace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gridReady,
    data.length,
    columns.length,
    mdm,
    resolvedColumnSizing,
    shouldAutoSizeColumns,
    scheduleAutoSizeAllColumns,
    scheduleFillRemainingColumnSpace,
  ]);

  const onFirstDataRendered = useCallback(() => {
    // 컨텐츠 기반 폭 재측정(autoSize)은 "auto" 모드 전용이지만,
    // ★여백 분배(fill)는 모드와 무관하게 적용한다 — 컬럼 폭 합이 그리드보다 좁으면 우측에
    //  빈 공간이 남아 보기 흉했다(2026-08-07 사용자 요구). fill 은 현재 폭을 min 으로 잠그고
    //  남는 공간만 나누므로 fixed 의 픽셀 폭이 줄지 않고, fit 은 이미 꽉 차 있어 no-op 이다.
    if (resolvedColumnSizing === "auto") {
      scheduleAutoSizeAllColumns(); // 내부에서 fill 까지 수행
      return;
    }
    scheduleFillRemainingColumnSpace();
  }, [resolvedColumnSizing, scheduleAutoSizeAllColumns, scheduleFillRemainingColumnSpace]);

  const onRowDataUpdated = useCallback(() => {
    if (userResizedRef.current) return; // 사용자가 직접 조정한 폭은 건드리지 않는다
    if (resolvedColumnSizing === "auto") {
      if (autoSizeOnDataUpdate && shouldAutoSizeColumns) scheduleAutoSizeAllColumns();
      return;
    }
    // fixed/fit — 행 수가 바뀌며 세로 스크롤바가 생겼다 사라지면 가용 폭도 변한다. 여백만 재분배.
    scheduleFillRemainingColumnSpace();
  }, [
    autoSizeOnDataUpdate,
    shouldAutoSizeColumns,
    resolvedColumnSizing,
    scheduleAutoSizeAllColumns,
    scheduleFillRemainingColumnSpace,
  ]);

  // 컨테이너 폭 변경 시:
  //  - 숨김→표시(0→양수): 컨텐츠 측정(autoSize)
  //  - 일반 창 리사이즈: 드래그 중엔 스킵, settle 후 여백만 분배 (autoSize 금지 → 번쩍임 방지)
  const onGridSizeChanged = useCallback(() => {
    if (userResizedRef.current) return;

    const nextWidth = containerRef.current?.clientWidth ?? 0;
    const action = resolveGridSizeChangeAction(lastGridWidthRef.current, nextWidth);
    if (action === "none") return;

    // fixed/fit 은 컨텐츠 재측정 없이 여백 분배만 (autoSize 는 "auto" 모드 전용).
    if (resolvedColumnSizing !== "auto" || !shouldAutoSizeColumns) {
      lastGridWidthRef.current = nextWidth;
      scheduleFillRemainingColumnSpace();
      return;
    }

    if (action === "autosize") {
      lastGridWidthRef.current = nextWidth;
      scheduleAutoSizeAllColumns();
      return;
    }

    // fill: trailing settle — 연속 리사이즈 중 중간 프레임에서는 컬럼을 건드리지 않음
    scheduleFillRemainingColumnSpace();
  }, [
    shouldAutoSizeColumns,
    resolvedColumnSizing,
    scheduleAutoSizeAllColumns,
    scheduleFillRemainingColumnSpace,
  ]);

  useEffect(() => {
    return () => {
      if (autoSizeTimerRef.current != null) {
        window.clearTimeout(autoSizeTimerRef.current);
      }
      if (sizeChangeTimerRef.current != null) {
        window.clearTimeout(sizeChangeTimerRef.current);
      }
    };
  }, []);

  const handleColumnResized = useCallback((event: ColumnResizedEvent) => {
    if (event.source === "uiColumnResized") {
      userResizedRef.current = true;
    }
  }, []);

  return {
    sizedColumnsRef,
    rerunAutoSizeAfterRestore,
    rerunAutoSizeAfterReset,
    onFirstDataRendered,
    onRowDataUpdated,
    onGridSizeChanged,
    handleColumnResized,
  };
}
