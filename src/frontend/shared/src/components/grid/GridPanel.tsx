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

import React, { memo, useState, useEffect, useCallback, useRef, type ReactNode, type CSSProperties } from "react";
import type { GridColumn } from "./AgDataGrid";
import { GridHelpButton, type GridHelpConfig } from "./GridHelpButton";

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
  /** 그리드 컴포넌트 (AgDataGrid, CustomDataGrid 등) */
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
  const hasHeaderActions = allButtons.length > 0 || headerExtra != null;

  return (
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
            {allButtons.length > 0 ? (
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
              </div>
            ) : null}
            {headerExtra ? <div className="grid-panel-header-extra">{headerExtra}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="grid-panel-content">{children}</div>
    </div>
  );
}

export const GridPanel = memo(GridPanelComponent);
