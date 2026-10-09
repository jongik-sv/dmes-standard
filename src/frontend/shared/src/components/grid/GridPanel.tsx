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

import { memo, useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type CSSProperties } from "react";
import type { GridColumn } from "./grid-types";
import type { GridHelpConfig } from "./GridHelpButton";
import { GridHeaderBar } from "./GridHeaderBar";
import { sameProps } from "./grid-node-equal";
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
  /**
   * 서버 페이징 목록 — Pagination 으로 쪽을 넘기며 한 쪽의 행만 `data` 로 들고 있는 화면이면 준다. 「그리드 설정」 메뉴의 엑셀 항목이
   * 「엑셀 출력 (현재 페이지)」 로 바뀌어 지금 쪽의 행만 나간다는 것을 알린다. 전체를 받는 업무 단추(엑셀다운)가 따로 있으면 그것은 그대로 둔다.
   */
  serverPaged?: boolean;
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
  serverPaged = false,
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

  // 안쪽 AgDataGrid(컬럼 개인화가 켜졌거나 엑셀 내려받기를 켠 것)가 올려 둔 명령 — 등록 순서대로 쌓는다. 설정 메뉴 대상: 개인화가 켜진 그리드 → 엑셀이 켜진 그리드 → 먼저 등록한 그리드.
  // 등록·해제는 ref 만 바꾸고 「대상이 바뀌었는가」가 바뀔 때만 한 번 다시 그린다(그리드가 늘 같은 명령 객체를 내주므로 렌더마다 갱신하지 않는다).
  // 대상이 바뀌면 스위치 구독을 새 대상으로 갈아 끼우고, 등록한 그리드마다 「내가 대상인가」를 알려 준다(메뉴 대상 그리드만 아래 줄 [엑셀] 단추를 숨긴다).
  const gridEntriesRef = useRef<Array<{ controls: GridPanelGridControls; onTargetChange?: (isMenuTarget: boolean, isFilterTarget: boolean) => void }>>([]);
  const [gridTarget, setGridTarget] = useState<GridPanelGridControls | null>(null);
  // 걸러 보기(검색 칸·거른 건수·「칸별 필터 보기」)의 대상 — filter={true} 그리드 중 먼저 등록한 것, 없으면 설정 메뉴 대상(filter 생략 그리드도 검색 칸이 기본으로 보인다. 서버 페이징만 입력 줄을 켠 동안).
  // 세 가지가 늘 같은 그리드를 가리키도록 메뉴의 입력 줄 항목도 이 대상의 명령을 쓴다(아래 menuControls). filter 생략 그리드는 이 대상일 때만 켜진다.
  const [filterTarget, setFilterTarget] = useState<GridPanelGridControls | null>(null);
  const titleRef = useRef(title);
  titleRef.current = title;
  const serverPagedRef = useRef(serverPaged);
  serverPagedRef.current = serverPaged;
  const gridRegistry = useMemo<GridPanelRegistry>(() => {
    const syncTarget = () => {
      const list = gridEntriesRef.current;
      // 메뉴 대상 — 개인화 명령을 가진 그리드를 먼저 찾고(엑셀만 켠 그리드가 앞서 등록돼도 컬럼 설정 항목이 사라지지 않게), 없으면 엑셀 명령을 가진 그리드
      // (엑셀을 끈 그리드가 앞서 등록돼도 엑셀 항목이 사라지지 않게), 그것도 없으면 먼저 등록한 그리드.
      const first = (list.find((e) => e.controls.openSettings) ?? list.find((e) => e.controls.exportExcel) ?? list[0])?.controls ?? null;
      setGridTarget(first);
      const alwaysEntry = list.find((e) => e.controls.setQuickFilter && !e.controls.getQuickFilterVisible);
      const filter = alwaysEntry?.controls ?? (first?.setQuickFilter ? first : null);
      setFilterTarget(filter);
      for (const entry of [...list]) entry.onTargetChange?.(entry.controls === first, entry.controls === filter);
    };
    return {
      getTitle: () => titleRef.current,
      isServerPaged: () => serverPagedRef.current,
      register(controls, onTargetChange) {
        const entry = { controls, onTargetChange };
        gridEntriesRef.current.push(entry);
        syncTarget();
        return () => {
          const list = gridEntriesRef.current;
          const i = list.indexOf(entry);
          if (i >= 0) list.splice(i, 1);
          syncTarget();
        };
      },
    };
  }, []);
  // 메뉴 명령 — 메뉴 대상의 명령에, 걸러 보기 대상이 다른 그리드면 입력 줄 항목 명령만 걸러 보기 대상의 것으로 바꾼다(검색 칸·건수와 같은 그리드를 가리키게).
  const menuControls = useMemo<GridPanelGridControls | null>(() => {
    if (!gridTarget || gridTarget === filterTarget) return gridTarget;
    const merged: GridPanelGridControls = { ...gridTarget };
    delete merged.getFilterRowOpen;
    delete merged.setFilterRowOpen;
    delete merged.subscribeFilter;
    delete merged.isFilterEditable;
    delete merged.getQuickFilterVisible;
    if (filterTarget?.getQuickFilterVisible) merged.getQuickFilterVisible = filterTarget.getQuickFilterVisible;
    if (filterTarget?.setFilterRowOpen) {
      merged.getFilterRowOpen = filterTarget.getFilterRowOpen;
      merged.setFilterRowOpen = filterTarget.setFilterRowOpen;
      merged.subscribeFilter = filterTarget.subscribeFilter;
      merged.isFilterEditable = filterTarget.isFilterEditable;
    }
    return merged;
  }, [gridTarget, filterTarget]);
  // 메뉴 props·거른 건수·검색 칸 보임·걸린 조건 칩은 머리줄 부품(GridHeaderBar)이 menuControls·filterTarget 에서 직접 구독한다
  // (GridPanel 밖 그리드가 스스로 그리는 머리줄과 같은 부품).

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

  // 내장 행추가·행복사는 검색어를 비운다 — 새 행이 검색에 걸리지 않아 보이지 않는 일이 없게. 검색 칸은 자기 입력값을 들고 있어 키를 바꿔 다시 마운트한다(그리드에 걸린 검색어 = 빈 칸으로 시작).
  const [quickResetKey, setQuickResetKey] = useState(0);
  // 검색어가 아직 그리드에 걸리기 전(입력 뒤 디바운스 대기 중)이어도 다시 마운트해야 기다리던 타이머가 끊긴다 — 그래서 검색 칸이 있으면 늘 키를 올린다.
  const resetQuickFilter = useCallback(() => {
    if (!filterTarget) return;
    if (filterTarget.getQuickFilterText?.()) filterTarget.setQuickFilter?.("");
    setQuickResetKey((k) => k + 1);
  }, [filterTarget]);

  const handleAddRow = useCallback(() => {
    if (!data || !columns || !onDataChange) return;
    resetQuickFilter();
    tempIdCounter.current += 1;
    const tempId = `${TEMP_ROW_PREFIX}${tempIdCounter.current}`;
    const newRow = createEmptyRow(columns, rowKey, tempId, defaultRowValues);
    onDataChange([...data, newRow], tempId);
  }, [data, columns, rowKey, defaultRowValues, onDataChange, resetQuickFilter]);

  const handleDeleteRow = useCallback(() => {
    if (!data || !onDataChange || selectedRowKey == null) return;
    const nextData = data.filter((row) => getRowIdentifier(row, rowKey) !== selectedRowKey);
    onDataChange(nextData);
  }, [data, rowKey, selectedRowKey, onDataChange]);

  const handleCopyRow = useCallback(() => {
    if (!data || !onDataChange || selectedRowKey == null) return;
    const targetRow = data.find((row) => getRowIdentifier(row, rowKey) === selectedRowKey);
    if (!targetRow) return;
    resetQuickFilter();
    tempIdCounter.current += 1;
    const tempId = `${TEMP_ROW_PREFIX}${tempIdCounter.current}`;
    const copied: Record<string, unknown> = {
      ...targetRow,
      [rowKey]: tempId,
      [GRID_TEMP_ID_FIELD]: tempId,
    };
    onDataChange([...data, copied], tempId);
  }, [data, rowKey, selectedRowKey, onDataChange, resetQuickFilter]);

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

  // 단추 묶음 노드 — 단추 모양(id·라벨·클래스·비활성)이 같은 동안 같은 요소를 내려 GridHeaderBar 의 memo 가 먹게 한다.
  // 화면이 단추 onClick 을 렌더마다 새 인라인 함수로 넘겨도 클릭 때 ref 의 최신 함수를 부르므로 모양이 같으면 다시 그리지 않는다.
  const buttonClicksRef = useRef<Array<(() => void) | undefined>>([]);
  buttonClicksRef.current = allButtons.map((btn) => btn.onClick);
  const buttonsSignature = JSON.stringify(
    allButtons.map((btn) => [btn.id ?? null, btn.label, btn.className ?? "", !!(btn.disabled || loading || !isButtonAllowed(btn.id))])
  );
  const buttonsNode = useMemo<ReactNode>(() => {
    const shapes = JSON.parse(buttonsSignature) as Array<[string | null, string, string, boolean]>;
    if (shapes.length === 0) return null;
    return (
      <div className="grid-panel-buttons">
        {shapes.map(([id, label, btnClass, disabled], index) => (
          <button
            key={id || index}
            id={id ?? undefined}
            className={`grid-btn ${btnClass}`.trim()}
            onClick={() => buttonClicksRef.current[index]?.()}
            disabled={disabled}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }, [buttonsSignature]);

  return (
    <GridPanelContext.Provider value={gridRegistry}>
      <div className={`grid-panel ${className}`.trim()} style={style}>
        <GridHeaderBar
          title={title}
          help={help}
          count={count}
          serverPaged={serverPaged}
          titleExtra={titleExtra}
          buttons={buttonsNode}
          headerExtra={headerExtra}
          filterControls={filterTarget}
          menuControls={menuControls}
          quickResetKey={quickResetKey}
        />

        <div className="grid-panel-content">{children}</div>
      </div>
    </GridPanelContext.Provider>
  );
}

// children·titleExtra·headerExtra·help·buttons 는 화면이 렌더마다 새로 만드는 JSX·객체라 기본 memo(참조 비교)로는 늘 다르다 —
// 같은 부품에 같은 props 를 넘긴 요소와 같은 내용의 객체는 같다고 본다(grid-node-equal.ts). 인라인 함수가 섞이면 다르다고 보고 다시 그린다.
export const GridPanel = memo(GridPanelComponent, sameProps);
