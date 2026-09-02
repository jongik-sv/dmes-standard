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

  const worksheet = XLSX.utils.json_to_sheet(sheetData);

  if (columns) {
    worksheet["!cols"] = columns.map((col) => ({ wch: col.width || 15 }));
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, fileName);
}

export const gfn_exportToExcel = exportToExcel;
