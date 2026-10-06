"use client";

/**
 * 「그리드 설정」 메뉴(GridSettingsMenu)에 넘길 값을 그리드가 올려 둔 명령(GridPanelGridControls)에서 만든다.
 * GridPanel 머리줄의 메뉴와 GridPanel 밖 그리드의 머리글 줄 아이콘(GridSettingsOverlay)이 같이 쓴다 — 항목·순서·동작이 한 곳에서 정해진다.
 */
import { useCallback, useReducer, useSyncExternalStore } from "react";

import type { GridPanelGridControls } from "./grid-panel-context";
import type { GridSettingsMenuProps } from "./GridSettingsMenu";

/**
 * 메뉴 props. 명령이 없으면(null) 메뉴를 그리지 않는다는 뜻으로 null 을 돌려준다.
 * - 자동 설정 저장 스위치는 대상 그리드의 값을 읽는다. 대상(controls)이 바뀌면 구독과 읽기 함수가 새 대상으로 바뀐다.
 * - 엑셀 항목의 비활성(행 0)은 그릴 때와 메뉴를 열 때마다 다시 읽는다(onOpen 이 다시 그리게 한다).
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
  if (controls === null) return null;
  return {
    hasPersonalize: controls.openSettings !== undefined,
    hasExcel: controls.exportExcel !== undefined,
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
