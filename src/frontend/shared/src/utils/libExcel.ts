/**
 * Excel export utility
 *
 * xlsx 만 사용한다(호스트 m-mcm 설치본). `XLSX.writeFile` 이 브라우저에서 직접 다운로드를
 * 트리거하므로 file-saver 는 불필요하다.
 *
 * 과거 `await import("file-saver")` 를 썼으나 file-saver 는 워크스페이스에 설치된 적이 없어
 * 이 유틸을 참조하는 화면이 포털에 배선되는 순간 번들이 깨졌다
 * ("Module not found: Can't resolve 'file-saver'"). 동적 import 라 정적 검색에도 잘 잡히지 않아
 * m-mls(common/excel.ts) · m-mcm(cia/interfaceList, cmb/masterRuleList) 은 각각 XLSX.writeFile
 * 직접 호출로 우회해 왔다. 본 유틸을 같은 방식으로 정리해 우회 사유 자체를 제거한다.
 */

export interface ExcelColumn {
  key: string;
  header: string;
  width?: number;
}

export async function exportToExcel(
  data: Record<string, unknown>[],
  fileName: string = "export.xlsx",
  sheetName: string = "Sheet1",
  columns?: ExcelColumn[],
): Promise<void> {
  if (!data || data.length === 0) {
    console.warn("엑셀로 내보낼 데이터가 없습니다.");
    return;
  }

  const XLSX = await import("xlsx");

  let sheetData: Record<string, unknown>[];

  if (columns) {
    // 컬럼 정의가 있으면 헤더명 매핑
    sheetData = data.map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const col of columns) {
        mapped[col.header] = row[col.key];
      }
      return mapped;
    });
  } else {
    sheetData = data;
  }

  // 컬럼 정의가 있으면 열 순서를 header 로 못박는다. 행을 제목을 키로 한 객체로 만들기 때문에, 「2026」「1」처럼 정수 모양인 제목은
  // 객체 키 순서 규칙상 맨 앞으로 와서 엑셀 열 순서가 컬럼 정의(그리드)와 달라진다.
  const worksheet = XLSX.utils.json_to_sheet(sheetData, columns ? { header: columns.map((c) => c.header) } : undefined);

  if (columns) {
    worksheet["!cols"] = columns.map((col) => ({ wch: col.width || 15 }));
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, fileName);
}


/** 제목이 없을 때 쓰는 파일 이름. 화면은 자기 이름(예: 「작업지시」)을 `excelFileName` 의 fallback 으로 넘긴다. */
export const EXCEL_DEFAULT_NAME = "목록";

/**
 * 「{제목}_{yyyyMMdd}.xlsx」 — 파일 이름에 못 쓰는 글자는 _ 로 바꾸고 제목은 80자로 자른다.
 * 제목이 없거나 공백뿐이면 fallback(기본 「목록」)을 쓴다.
 */
export function excelFileName(title: string | undefined, ymd: string, fallback: string = EXCEL_DEFAULT_NAME): string {
  // eslint-disable-next-line no-control-regex
  const base = (title ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 80);
  return `${base || fallback}_${ymd}.xlsx`;
}

/** 한글 등 넓은 글자는 2칸으로 센다. */
function textWidth(v: unknown): number {
  if (v === null || v === undefined) return 0;
  let n = 0;
  for (const ch of String(v)) n += ch.charCodeAt(0) > 0xff ? 2 : 1;
  return n;
}

/**
 * 엑셀 컬럼 — 그리드 컬럼 순서·제목 그대로, 폭은 제목과 앞 100행 값의 길이로 어림(8~50).
 * `excludeKeys` 에 든 key 의 컬럼은 뺀다(화면이 그리드용으로만 쓰는 행 키 같은 칸).
 * `exportToExcel` 은 제목을 행 객체의 키로 쓰므로, 겹치는 제목은 뒤 컬럼에 「(2)」처럼 번호를 붙여 값이 덮이지 않게 한다.
 */
export function toExcelColumns(
  columns: readonly { key: string; header?: string }[],
  rows: readonly Record<string, unknown>[],
  excludeKeys: readonly string[] = [],
): ExcelColumn[] {
  const sample = rows.slice(0, 100);
  const used = new Set<string>();
  return columns
    .filter((c) => !excludeKeys.includes(c.key))
    .map((c) => {
      const base = c.header || c.key;
      let header = base;
      for (let n = 2; used.has(header); n += 1) header = `${base}(${n})`;
      used.add(header);
      const widest = Math.max(textWidth(header), ...sample.map((r) => textWidth(r[c.key])));
      return { key: c.key, header, width: Math.min(50, Math.max(8, widest + 2)) };
    });
}

/** @deprecated 같은 모듈의 `exportToExcel` 을 쓴다. */
export const gfn_exportToExcel = exportToExcel;
