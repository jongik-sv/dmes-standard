"use client";

/**
 * @file GridPanel.tsx
 * @description 그리드 패널 컴포넌트
 *
 * 패널 헤더(타이틀, 건수, 버튼)와 그리드 영역을 제공하는 컨테이너입니다.
 * children으로 원하는 그리드 컴포넌트를 전달하여 사용합니다.
 * usePermission 옵션으로 버튼 권한 체크를 선택적으로 적용할 수 있습니다.
 *
 * showAddButton / showDeleteButton을 사용하면 행추가/행삭제를 공통으로 처리합니다.
 * - 행추가: columns 기준 빈 행을 data 끝에 추가하고 onDataChange로 전달
 * - 행삭제: selectedRowKey에 해당하는 행을 제거하고 onDataChange로 전달
 */

import React, { memo, useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore, type ReactNode, type CSSProperties } from "react";
import { Switch } from "@mantine/core";
import type { GridColumn } from "./grid-types";
import { GridHelpButton, type GridHelpConfig } from "./GridHelpButton";
import { GridPanelContext, type GridPanelGridControls, type GridPanelRegistry } from "./grid-panel-context";

export interface GridButton {
  id?: string;
  label: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export interface GridPanelProps {
  /** 패널 타이틀 */
  title?: string;
  /** 건수 (직접 전달, 없으면 표시 안함) */
  count?: number;
  /** 버튼 배열 [{id, label, onClick, className, disabled}] */
  buttons?: GridButton[];
  /** 추가 CSS 클래스 */
  className?: string;
  /** 권한 체크 사용 여부 (기본값: false) */
  usePermission?: boolean;
  /** 권한 체크 함수 (usePermission=true일 때 필요) */
  fetchPermissions?: () => Promise<string[]>;
  /** 로딩 상태 */
  loading?: boolean;
  /** 그리드 컴포넌트 (AgDataGrid) */
  children?: ReactNode;
  /** 스타일 */
  style?: CSSProperties;

  /* ── 행추가/행삭제 공통 기능 ── */

  /** 행추가 버튼 표시 여부 */
  showAddButton?: boolean;
  /** 행삭제 버튼 표시 여부 */
  showDeleteButton?: boolean;
  /** 행복사 버튼 표시 여부 */
  showCopyButton?: boolean;
  /** 행추가 버튼 라벨 (기본값: "행추가") */
  addButtonLabel?: string;
  /** 행삭제 버튼 라벨 (기본값: "행삭제") */
  deleteButtonLabel?: string;
  /** 행복사 버튼 라벨 (기본값: "행복사") */
  copyButtonLabel?: string;
  /** 그리드 데이터 (행추가/삭제 시 필요) */
  data?: Record<string, unknown>[];
  /** 행 식별 키 (기본값: "id") */
  rowKey?: string;
  /** 컬럼 정의 (빈 행 생성 시 필요) */
  columns?: GridColumn[];
  /** 현재 선택된 행 키 (행삭제 시 필요) */
  selectedRowKey?: string | number | null;
  /** 행추가 시 기본값 (폼 기본값과 동기화용) */
  defaultRowValues?: Record<string, unknown>;
  /** 데이터 변경 콜백 (행추가/삭제 결과 전달) */
  onDataChange?: (data: Record<string, unknown>[], addedRowKey?: string) => void;

  /**
   * 타이틀/건수 오른쪽에 렌더될 추가 노드.
   * 액션 버튼들과는 다른 영역이라 겹침 없이 배치된다.
   */
  titleExtra?: ReactNode;
  /** 기본 버튼 묶음 오른쪽 끝에 렌더될 헤더 액션 노드 (예: 최대화 토글 버튼). */
  headerExtra?: ReactNode;
  /** 그리드 제목 옆에 표시할 표준 도움말 팝업 설정. */
  help?: GridHelpConfig;
}

const TEMP_ROW_PREFIX = "__new_";
export const GRID_TEMP_ID_FIELD = "__gridTempId";

function createEmptyRow(columns: GridColumn[], rowKey: string, tempId: string, defaultValues?: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = { [GRID_TEMP_ID_FIELD]: tempId, [rowKey]: "" };
  for (const col of columns) {
    if (!(col.key in row)) {
      row[col.key] = defaultValues?.[col.key] ?? "";
    }
  }
  return row;
}

export function isTempRow(row: Record<string, unknown> | string | number | null | undefined): boolean {
  if (row == null) return false;
  if (typeof row === "object") {
    return typeof row[GRID_TEMP_ID_FIELD] === "string" && (row[GRID_TEMP_ID_FIELD] as string).startsWith(TEMP_ROW_PREFIX);
  }
  return typeof row === "string" && row.startsWith(TEMP_ROW_PREFIX);
}

export function getRowIdentifier(row: Record<string, unknown>, rowKey: string): string | number {
  const tempId = row[GRID_TEMP_ID_FIELD];
  if (typeof tempId === "string" && tempId.startsWith(TEMP_ROW_PREFIX)) {
    return tempId;
  }
  return (row[rowKey] as string | number) ?? "";
}

function GridPanelComponent({
  title,
  count,
  buttons = [],
  className = "",
  usePermission = false,
  fetchPermissions,
  loading = false,
  children,
  style,
  showAddButton = false,
  showDeleteButton = false,
  showCopyButton = false,
  addButtonLabel = "행추가",
  deleteButtonLabel = "행삭제",
  copyButtonLabel = "행복사",
  data,
  rowKey = "id",
  columns,
  selectedRowKey,
  defaultRowValues,
  onDataChange,
  titleExtra,
  headerExtra,
  help,
}: GridPanelProps) {
  const [allowedButtons, setAllowedButtons] = useState<string[]>([]);
  const tempIdCounter = useRef(0);

  // 안쪽 AgDataGrid(컬럼 개인화가 켜진 것)가 올려 둔 명령 — 등록 순서대로 쌓고, 대상은 맨 앞(먼저 등록한 그리드)이다.
  // 등록·해제는 ref 만 바꾸고 「대상이 있는가」·「대상이 바뀌었는가」가 바뀔 때만 한 번 다시 그린다(그리드가 늘 같은 명령 객체를 내주므로
  // 렌더마다 갱신하지 않는다). 대상이 바뀌면 번호(gridTargetNo)를 올려 스위치 구독을 새 대상으로 갈아 끼운다.
  const gridControlsRef = useRef<GridPanelGridControls[]>([]);
  const gridTargetRef = useRef<GridPanelGridControls | null>(null);
  const [hasGridControls, setHasGridControls] = useState(false);
  const [gridTargetNo, setGridTargetNo] = useState(0);
  const gridRegistry = useMemo<GridPanelRegistry>(() => {
    const syncTarget = () => {
      const list = gridControlsRef.current;
      setHasGridControls(list.length > 0);
      const first = list[0] ?? null;
      if (first !== gridTargetRef.current) {
        gridTargetRef.current = first;
        setGridTargetNo((n) => n + 1);
      }
    };
    return {
      register(controls) {
        gridControlsRef.current.push(controls);
        syncTarget();
        return () => {
          const list = gridControlsRef.current;
          const i = list.indexOf(controls);
          if (i >= 0) list.splice(i, 1);
          syncTarget();
        };
      },
    };
  }, []);
  const openGridSettings = useCallback(() => gridControlsRef.current[0]?.openSettings(), []);
  const requestGridReset = useCallback(() => gridControlsRef.current[0]?.requestReset(), []);
  // 자동 저장 스위치 — 대상 그리드의 값을 읽는다. 대상이 바뀌면(gridTargetNo) 구독과 읽기 함수가 새 대상으로 바뀐다.
  const subscribeGridAutoSave = useCallback(
    (onChange: () => void) => gridControlsRef.current[0]?.subscribeAutoSave(onChange) ?? (() => {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gridTargetNo],
  );
  const getGridAutoSave = useCallback(
    () => gridControlsRef.current[0]?.getAutoSave() ?? true,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gridTargetNo],
  );
  const gridAutoSave = useSyncExternalStore(subscribeGridAutoSave, getGridAutoSave, () => true);
  const toggleGridAutoSave = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    gridControlsRef.current[0]?.setAutoSave(e.currentTarget.checked);
  }, []);

  useEffect(() => {
    if (!usePermission || !fetchPermissions) return;

    const loadPermissions = async () => {
      const res = await fetchPermissions();
      setAllowedButtons(res || []);
    };
    loadPermissions();
  }, [usePermission, fetchPermissions]);

  const isButtonAllowed = (btnId?: string): boolean => {
    if (!usePermission) return true;
    if (!btnId) return true;
    return allowedButtons.includes(btnId);
  };

  const handleAddRow = useCallback(() => {
    if (!data || !columns || !onDataChange) return;
    tempIdCounter.current += 1;
    const tempId = `${TEMP_ROW_PREFIX}${tempIdCounter.current}`;
    const newRow = createEmptyRow(columns, rowKey, tempId, defaultRowValues);
    onDataChange([...data, newRow], tempId);
  }, [data, columns, rowKey, defaultRowValues, onDataChange]);

  const handleDeleteRow = useCallback(() => {
    if (!data || !onDataChange || selectedRowKey == null) return;
    const nextData = data.filter((row) => getRowIdentifier(row, rowKey) !== selectedRowKey);
    onDataChange(nextData);
  }, [data, rowKey, selectedRowKey, onDataChange]);

  const handleCopyRow = useCallback(() => {
    if (!data || !onDataChange || selectedRowKey == null) return;
    const targetRow = data.find((row) => getRowIdentifier(row, rowKey) === selectedRowKey);
    if (!targetRow) return;
    tempIdCounter.current += 1;
    const tempId = `${TEMP_ROW_PREFIX}${tempIdCounter.current}`;
    const copied: Record<string, unknown> = {
      ...targetRow,
      [rowKey]: tempId,
      [GRID_TEMP_ID_FIELD]: tempId,
    };
    onDataChange([...data, copied], tempId);
  }, [data, rowKey, selectedRowKey, onDataChange]);

  // 내장 버튼 + 커스텀 버튼 합치기
  const allButtons: GridButton[] = [];

  if (showAddButton) {
    allButtons.push({
      id: "btn_grid_add",
      label: addButtonLabel,
      onClick: handleAddRow,
      disabled: loading,
    });
  }

  if (showDeleteButton) {
    allButtons.push({
      id: "btn_grid_delete",
      label: deleteButtonLabel,
      onClick: handleDeleteRow,
      disabled: loading || selectedRowKey == null,
    });
  }

  if (showCopyButton) {
    allButtons.push({
      id: "btn_grid_copy",
      label: copyButtonLabel,
      onClick: handleCopyRow,
      disabled: loading || selectedRowKey == null,
    });
  }

  allButtons.push(...buttons);
  const hasHeaderActions = allButtons.length > 0 || headerExtra != null || hasGridControls;

  return (
    <GridPanelContext.Provider value={gridRegistry}>
      <div className={`grid-panel ${className}`.trim()} style={style}>
        <div className="grid-panel-header">
          <div className="grid-panel-title">
            {title ? <span>{title}</span> : null}
            {help ? <GridHelpButton {...help} /> : null}
            {count !== undefined ? <span className="grid-panel-count">{count}건</span> : null}
            {titleExtra}
          </div>
          {hasHeaderActions ? (
            <div className="grid-panel-header-actions">
              {allButtons.length > 0 || hasGridControls ? (
                <div className="grid-panel-buttons">
                  {allButtons.map((btn, index) => (
                    <button
                      key={btn.id || index}
                      id={btn.id}
                      className={`grid-btn ${btn.className || ""}`.trim()}
                      onClick={btn.onClick}
                      disabled={btn.disabled || loading || !isButtonAllowed(btn.id)}
                    >
                      {btn.label}
                    </button>
                  ))}
                  {/* 컬럼 설정 — 개인화가 켜진 그리드가 있을 때만. 권한 검사·loading 과 무관하게 늘 활성(그리드 모양 설정이라 데이터를 건드리지 않는다). */}
                  {hasGridControls ? (
                    <button
                      key="btn_grid_columns"
                      id="btn_grid_columns"
                      type="button"
                      className="grid-btn"
                      data-testid="grid-columns-button"
                      onClick={openGridSettings}
                    >
                      컬럼 설정
                    </button>
                  ) : null}
                  {/* 자동 저장 스위치·초기화 — [컬럼 설정] 과 같은 조건·같은 이유로 권한 검사·loading 과 무관하게 늘 활성. */}
                  {hasGridControls ? (
                    <Switch
                      key="grid_autosave"
                      size="xs"
                      label="자동 저장"
                      data-testid="grid-autosave-switch"
                      checked={gridAutoSave}
                      onChange={toggleGridAutoSave}
                      styles={{ root: { alignSelf: "center", margin: "0 4px" }, label: { paddingInlineStart: 4, whiteSpace: "nowrap" } }}
                    />
                  ) : null}
                  {hasGridControls ? (
                    <button
                      key="btn_grid_reset"
                      id="btn_grid_reset"
                      type="button"
                      className="grid-btn"
                      data-testid="grid-reset-button"
                      onClick={requestGridReset}
                    >
                      초기화
                    </button>
                  ) : null}
                </div>
              ) : null}
              {headerExtra ? <div className="grid-panel-header-extra">{headerExtra}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="grid-panel-content">{children}</div>
      </div>
    </GridPanelContext.Provider>
  );
}

export const GridPanel = memo(GridPanelComponent);
