"use client";

/**
 * AgDataGrid 의 `excelExport` 속성이 쓰는 부품 — 표 바로 아래에 「N행」과 [엑셀] 단추를 붙이고, 누르면 그리드의
 * 컬럼·행을 엑셀로 내려받는다. AgDataGrid.tsx 는 이 파일의 틀(AgDataGridExcelFrame)로 그리드를 감싸고 내려받기(useGridExcelExport)를 부른다.
 * - 컬럼: 모든 데이터 열을 사용자가 바꾼 순서(왼쪽 고정 → 가운데 → 오른쪽 고정)·제목으로. 사용자가 숨긴 열(컬럼 개인화)은
 *   엑셀에도 숨긴 열로 넣는다(열은 있고 접혀 있다). 화면 정의에서 `hide: true` 인 내부 열과 `field` 가 없는 내부 열
 *   (행 번호·선택 체크박스 등)은 뺀다.
 * - 행: 정렬·필터가 반영된 순서. 값은 `render` 결과가 아니라 행의 원래 값(숫자는 숫자)이다.
 * - 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3).
 */
import type { GridApi } from "ag-grid-community";
import { useCallback, type ReactNode } from "react";

import { today } from "../../utils/libDate";
import { excelFileName, exportToExcel, toExcelColumns } from "../../utils/libExcel";
import type { GridColumn } from "./grid-types";
import { GridExcelFoot } from "./GridExcelFoot";

export interface AgDataGridExcelExport {
  /** 파일 이름 앞부분 — 「{title}_{yyyyMMdd}.xlsx」. 못 쓰는 글자는 `_` 로 바뀌고 80자까지만 쓴다. 비우면 GridPanel 제목(GridPanel 안일 때), 그것도 없으면 `fallbackName`. */
  title?: string;
  /** `title` 이 비었을 때 쓸 이름. 기본 「목록」. */
  fallbackName?: string;
  /** 아래 줄 왼쪽 글. 주지 않으면 「{n}행」(천 단위 쉼표). */
  note?: string;
  /** 엑셀 시트 이름. 기본 `Sheet1`. */
  sheetName?: string;
  /** [엑셀] 단추의 `data-testid`. 기본 `grid-excel`. */
  testId?: string;
  /** 내보내기에서 뺄 열 key. 단추·링크처럼 `render` 로만 그리는 열에 쓴다. 보이는 열이어도 엑셀에는 나가지 않는다. */
  excludeKeys?: readonly string[];
}

interface ExcelColumnSource {
  key: string;
  header: string;
  /** 사용자가 숨긴 열 — 엑셀에 넣되 숨긴 열로 둔다. */
  hidden?: boolean;
}

type ExcelGridApi = Pick<GridApi, "getAllGridColumns" | "forEachNodeAfterFilterAndSort" | "isDestroyed">;

const PIN_RANK = { left: 0, center: 1, right: 2 } as const;

/**
 * 그리드의 모든 데이터 열 — 사용자가 끌어 바꾼 순서를 따르고, 화면처럼 왼쪽 고정 → 가운데 → 오른쪽 고정으로 놓는다.
 * 지금 숨겨진 열은 `hidden: true` 로 담는다(사용자가 컬럼 설정에서 숨긴 열).
 * `field` 가 없는 열(행 번호·선택 체크박스처럼 그리드가 스스로 만든 열)과 `internalKeys`(화면 정의에서 `hide: true` 인 내부 열)는 뺀다.
 */
export function gridExcelColumns(
  api: Pick<GridApi, "getAllGridColumns">,
  internalKeys: ReadonlySet<string> = new Set(),
): ExcelColumnSource[] {
  const out: Array<ExcelColumnSource & { rank: number }> = [];
  for (const col of api.getAllGridColumns()) {
    const def = col.getColDef();
    if (typeof def.field !== "string" || def.field === "" || internalKeys.has(def.field)) continue;
    const pinned = col.getPinned();
    const source: ExcelColumnSource & { rank: number } = {
      key: def.field,
      header: typeof def.headerName === "string" ? def.headerName : def.field,
      rank: PIN_RANK[pinned === "left" || pinned === "right" ? pinned : "center"],
    };
    if (!col.isVisible()) source.hidden = true;
    out.push(source);
  }
  // Array.prototype.sort 는 안정 정렬이라 같은 고정 구역 안의 순서는 그리드 순서 그대로다.
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...c }) => c);
}

/** 화면 정의에서 `hide: true` 인 잎 열 key(열 그룹 안까지) — 엑셀에서 뺄 내부 열. */
export function definitionHiddenKeys(columns: readonly GridColumn[], out: Set<string> = new Set()): Set<string> {
  for (const c of columns) {
    if (c.children && c.children.length > 0) definitionHiddenKeys(c.children, out);
    else if (c.hide) out.add(c.key);
  }
  return out;
}

/** 그리드가 아직 없을 때 쓰는 열 — props 의 잎 열(열 그룹 안까지)에서 숨긴 열을 뺀다. */
function propsExcelColumns(columns: readonly GridColumn[]): ExcelColumnSource[] {
  const out: ExcelColumnSource[] = [];
  for (const c of columns) {
    if (c.children && c.children.length > 0) out.push(...propsExcelColumns(c.children));
    else if (!c.hide) out.push({ key: c.key, header: c.header ?? c.key });
  }
  return out;
}

/** 정렬·필터가 반영된 행(그리드가 보여 주는 순서). 그리드가 아직 없거나 닫혔으면 `fallback`(data) 순서를 쓴다. */
export function displayedExcelRows(
  api: Pick<GridApi, "forEachNodeAfterFilterAndSort" | "isDestroyed"> | null | undefined,
  fallback: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  if (!api || api.isDestroyed()) return [...fallback];
  const rows: Record<string, unknown>[] = [];
  api.forEachNodeAfterFilterAndSort((node) => {
    if (node.data) rows.push(node.data as Record<string, unknown>);
  });
  return rows;
}

export const GRID_EXCEL_FRAME_STYLE_HREF = "cm-grid-excel-frame";

const GRID_EXCEL_FRAME_CSS = `
.cm-grid-excel { display: flex; flex-direction: column; width: 100%; min-height: 0; }
.cm-grid-excel__grow { flex: 1 1 0; min-height: 0; }
.cm-grid-excel--auto { display: block; }
.cm-grid-excel--auto .cm-grid-excel__grow { flex: none; }
`;

/**
 * 엑셀 내려받기 — 아래 줄 [엑셀] 단추와 GridPanel 「그리드 설정」 메뉴의 [엑셀 출력] 이 같이 쓴다(컬럼 순서·숨긴 열·정렬·필터 동일).
 * 파일 이름은 `options.title` → `getDefaultTitle()`(GridPanel 제목) → `options.fallbackName`/「목록」 순이다. 옵션 없이 메뉴만 쓰는 그리드(GridPanel 안 기본 켬)도 부른다.
 * 행이 없으면 아무 일도 하지 않는다.
 */
export function useGridExcelExport(
  options: AgDataGridExcelExport | undefined,
  columns: readonly GridColumn[],
  fallbackRows: readonly Record<string, unknown>[],
  getApi: () => ExcelGridApi | null | undefined,
  getDefaultTitle?: () => string | undefined,
): () => void {
  const title = options?.title;
  const fallbackName = options?.fallbackName;
  const sheetName = options?.sheetName;
  const excludeKeys = options?.excludeKeys;
  return useCallback(() => {
    const api = getApi();
    const rows = displayedExcelRows(api, fallbackRows);
    if (rows.length === 0) return;
    const cols =
      api && !api.isDestroyed() ? gridExcelColumns(api, definitionHiddenKeys(columns)) : propsExcelColumns(columns);
    void exportToExcel(
      rows,
      excelFileName(title?.trim() || getDefaultTitle?.(), today(), fallbackName),
      sheetName,
      toExcelColumns(cols, rows, excludeKeys),
    );
  }, [getApi, getDefaultTitle, fallbackRows, columns, title, fallbackName, sheetName, excludeKeys]);
}

interface AgDataGridExcelFrameProps {
  options: AgDataGridExcelExport;
  /** 그리드에 넘긴 data — 「{n}행」과 단추 비활성 판정에 쓴다. */
  data: readonly Record<string, unknown>[];
  /** 엑셀 내려받기(useGridExcelExport 가 돌려준 것). */
  onExcel: () => void;
  /** 바깥 상자 높이(AgDataGrid `height`). 그리드는 이 상자의 남은 높이를 채운다. `"auto"` 는 행 수만큼 늘어난다. */
  height?: string | number;
  /** 아래 줄 [엑셀] 단추를 뺀다 — GridPanel 설정 메뉴가 대신할 때. */
  hideButton?: boolean;
  children: ReactNode;
}

/** 바깥을 세로 flex 로 감싸 그리드가 남은 높이를 채우고, 아래 줄(GridExcelFoot)이 바닥에 붙게 한다. */
export function AgDataGridExcelFrame({ options, data, onExcel, height, hideButton, children }: AgDataGridExcelFrameProps) {
  const { note, testId } = options;
  const isAuto = height === "auto";

  return (
    <>
      <style href={GRID_EXCEL_FRAME_STYLE_HREF} precedence="default">
        {GRID_EXCEL_FRAME_CSS}
      </style>
      <div
        className={`cm-grid-excel${isAuto ? " cm-grid-excel--auto" : ""}`}
        data-testid="grid-excel-frame"
        style={{ height: isAuto ? "auto" : height || "100%" }}
      >
        <div className="cm-grid-excel__grow">{children}</div>
        <GridExcelFoot
          note={note ?? `${data.length.toLocaleString()}행`}
          onExcel={onExcel}
          disabled={data.length === 0}
          testId={testId}
          hideButton={hideButton}
        />
      </div>
    </>
  );
}
