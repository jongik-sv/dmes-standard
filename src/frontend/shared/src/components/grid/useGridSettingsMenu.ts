"use client";

/**
 * 「그리드 설정」 메뉴(GridSettingsMenu)에 넘길 값을 그리드가 올려 둔 명령(GridPanelGridControls)에서 만든다.
 * GridPanel 머리줄의 메뉴와 GridPanel 밖 그리드의 머리글 줄 아이콘(GridSettingsOverlay)이 같이 쓴다 — 항목·순서·동작이 한 곳에서 정해진다.
 */
import { useCallback, useReducer, useSyncExternalStore } from "react";

import type { GridPanelGridControls } from "./grid-panel-context";
import { gridFilterNotice } from "./grid-settings-labels";
import type { GridSettingsMenuProps } from "./GridSettingsMenu";

/**
 * 메뉴 props. 명령이 없으면(null) 메뉴를 그리지 않는다는 뜻으로 null 을 돌려준다.
 * - 자동 설정 저장 스위치는 대상 그리드의 값을 읽는다. 대상(controls)이 바뀌면 구독과 읽기 함수가 새 대상으로 바뀐다.
 * - 엑셀 항목의 비활성(행 0)은 그릴 때와 메뉴를 열 때마다 다시 읽는다(onOpen 이 다시 그리게 한다).
 * - 「필터 창 보기」 는 필터 켜짐 명령(setFilterRowOpen)을 올린 그리드만 — filter={true} 그리드와 filter 를 생략한 GridPanel 안 그리드. 켜짐 값은 그리드의 필터 구독으로 읽는다.
 *   항목 툴팁에는 검색 범위 안내(받아 둔 행 안에서만 / 서버 페이징이면 지금 쪽에서만 / 편집 칸이 있으면 새 행 숨김)를 싣는다.
 * - 보일 항목이 하나도 없으면(빠른 검색 칸만 올린 그리드) null 이다.
 */
export function useGridSettingsMenuProps(
  controls: GridPanelGridControls | null,
  excelPaged = false,
): GridSettingsMenuProps | null {
  const [, bumpMenuOpen] = useReducer((n: number) => n + 1, 0);
  const openSettings = useCallback(() => controls?.openSettings?.(), [controls]);
  const requestReset = useCallback(() => controls?.requestReset?.(), [controls]);
  const exportExcel = useCallback(() => controls?.exportExcel?.(), [controls]);
  const subscribeAutoSave = useCallback(
    (onChange: () => void) => controls?.subscribeAutoSave?.(onChange) ?? (() => {}),
    [controls],
  );
  const getAutoSave = useCallback(() => controls?.getAutoSave?.() ?? true, [controls]);
  const autoSave = useSyncExternalStore(subscribeAutoSave, getAutoSave, () => true);
  const toggleAutoSave = useCallback((next: boolean) => controls?.setAutoSave?.(next), [controls]);
  const subscribeFilter = useCallback(
    (onChange: () => void) => controls?.subscribeFilter?.(onChange) ?? (() => {}),
    [controls],
  );
  const getFilterRowOpen = useCallback(() => controls?.getFilterRowOpen?.() ?? false, [controls]);
  const filterRowOpen = useSyncExternalStore(subscribeFilter, getFilterRowOpen, () => false);
  const toggleFilterRow = useCallback((next: boolean) => controls?.setFilterRowOpen?.(next), [controls]);
  const resetColumns = useCallback(() => controls?.resetColumns?.(), [controls]);
  if (controls === null) return null;
  const hasPersonalize = controls.openSettings !== undefined;
  const hasExcel = controls.exportExcel !== undefined;
  const hasFilterRow = controls.setFilterRowOpen !== undefined;
  const hasColumnReset = controls.resetColumns !== undefined;
  if (!hasPersonalize && !hasExcel && !hasFilterRow && !hasColumnReset) return null;
  return {
    hasPersonalize,
    hasExcel,
    hasFilterRow,
    hasColumnReset,
    onResetColumns: resetColumns,
    filterNotice: hasFilterRow ? gridFilterNotice({ paged: excelPaged, editable: controls.isFilterEditable?.() ?? false }) : undefined,
    filterRowOpen,
    onToggleFilterRow: toggleFilterRow,
    autoSave,
    excelDisabled: !(controls.canExportExcel?.() ?? true),
    excelPaged,
    onOpenSettings: openSettings,
    onToggleAutoSave: toggleAutoSave,
    onExportExcel: exportExcel,
    onRequestReset: requestReset,
    onOpen: bumpMenuOpen,
  };
}
