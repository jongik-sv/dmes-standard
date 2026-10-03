"use client";

/**
 * AgDataGrid 의 `excelExport` 속성이 쓰는 부품 — 표 바로 아래에 「N행」과 [엑셀] 단추를 붙이고, 누르면 그리드에 지금 보이는
 * 컬럼·행을 엑셀로 내려받는다. AgDataGrid.tsx 는 이 파일의 틀(AgDataGridExcelFrame)로 그리드를 감쌀 뿐이다.
 * - 컬럼: ag-grid 가 지금 보여 주는 데이터 열의 순서·제목. 숨긴 열과 `field` 가 없는 내부 열(행 번호·선택 체크박스 등)은 뺀다.
 * - 행: 정렬·필터가 반영된 순서. 값은 `render` 결과가 아니라 행의 원래 값(숫자는 숫자)이다.
 * - 스타일은 컴포넌트가 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3).
 */
import type { GridApi } from "ag-grid-community";
import { useCallback, type ReactNode } from "react";

import { today } from "../../utils/libDate";
import { excelFileName, exportToExcel, toExcelColumns } from "../../utils/libExcel";
import type { GridColumn } from "./AgDataGrid";
import { GridExcelFoot } from "./GridExcelFoot";

export interface AgDataGridExcelExport {
  /** 파일 이름 앞부분 — 「{title}_{yyyyMMdd}.xlsx」. 못 쓰는 글자는 `_` 로 바뀌고 80자까지만 쓴다. */
  title?: string;
  /** `title` 이 비었을 때 쓸 이름. 기본 「목록」. */
  fallbackName?: string;
  /** 아래 줄 왼쪽 글. 주지 않으면 「{n}행」(천 단위 쉼표). */
  note?: string;
  /** 엑셀 시트 이름. 기본 `Sheet1`. */
  sheetName?: string;
  /** [엑셀] 단추의 `data-testid`. 기본 `grid-excel`. */
  testId?: string;
}

interface ExcelColumnSource {
  key: string;
  header: string;
}

type ExcelGridApi = Pick<GridApi, "getAllDisplayedColumns" | "forEachNodeAfterFilterAndSort" | "isDestroyed">;

/**
 * 그리드에 지금 보이는 데이터 열 — 사용자가 끌어 바꾼 순서까지 따른다.
 * `field` 가 없는 열(행 번호·선택 체크박스처럼 그리드가 스스로 만든 열)은 데이터가 아니므로 뺀다.
 */
export function displayedExcelColumns(api: Pick<GridApi, "getAllDisplayedColumns">): ExcelColumnSource[] {
  const out: ExcelColumnSource[] = [];
  for (const col of api.getAllDisplayedColumns()) {
    const def = col.getColDef();
    if (typeof def.field !== "string" || def.field === "") continue;
    out.push({ key: def.field, header: typeof def.headerName === "string" ? def.headerName : def.field });
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

interface AgDataGridExcelFrameProps {
  options: AgDataGridExcelExport;
  /** 그리드에 넘긴 columns(그리드 API 가 없을 때만 쓴다). */
  columns: readonly GridColumn[];
  /** 그리드에 넘긴 data — 행 수·API 가 없을 때의 내보낼 행. */
  data: readonly Record<string, unknown>[];
  /** 바깥 상자 높이(AgDataGrid `height`). 그리드는 이 상자의 남은 높이를 채운다. `"auto"` 는 행 수만큼 늘어난다. */
  height?: string | number;
  /** 지금의 ag-grid API(없으면 null). */
  getApi: () => ExcelGridApi | null | undefined;
  children: ReactNode;
}

/** 바깥을 세로 flex 로 감싸 그리드가 남은 높이를 채우고, 아래 줄(GridExcelFoot)이 바닥에 붙게 한다. */
export function AgDataGridExcelFrame({ options, columns, data, height, getApi, children }: AgDataGridExcelFrameProps) {
  const { title, fallbackName, note, sheetName, testId } = options;
  const isAuto = height === "auto";

  const handleExcel = useCallback(() => {
    const api = getApi();
    const rows = displayedExcelRows(api, data);
    if (rows.length === 0) return;
    const cols = api && !api.isDestroyed() ? displayedExcelColumns(api) : propsExcelColumns(columns);
    void exportToExcel(rows, excelFileName(title, today(), fallbackName), sheetName, toExcelColumns(cols, rows));
  }, [getApi, data, columns, title, fallbackName, sheetName]);

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
          onExcel={handleExcel}
          disabled={data.length === 0}
          testId={testId}
        />
      </div>
    </>
  );
}
