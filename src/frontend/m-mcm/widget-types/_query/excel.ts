/**
 * 쿼리 표 엑셀 내려받기 — 파일 이름·컬럼 정의(순수 함수). 실제 쓰기는 shared exportToExcel(xlsx)이 한다.
 * 그리드에 보이는 컬럼 순서·제목 그대로, 값은 서버가 준 원래 값(숫자는 숫자)으로 내보낸다.
 */
import type { ExcelColumn } from "@dk-oasis/shared/utils";

import { TABLE_ROW_KEY } from "./format";

/** 제목이 없을 때 파일 이름. */
export const EXCEL_DEFAULT_NAME = "쿼리표";

/** 「{위젯 제목}_{yyyyMMdd}.xlsx」 — 파일 이름에 못 쓰는 글자는 _ 로 바꾸고 80자로 자른다. */
export function excelFileName(title: string | undefined, ymd: string): string {
  // eslint-disable-next-line no-control-regex
  const base = (title ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 80);
  return `${base || EXCEL_DEFAULT_NAME}_${ymd}.xlsx`;
}

/** 한글 등 넓은 글자는 2칸으로 센다. */
function textWidth(v: unknown): number {
  if (v === null || v === undefined) return 0;
  let n = 0;
  for (const ch of String(v)) n += ch.charCodeAt(0) > 0xff ? 2 : 1;
  return n;
}

/**
 * 엑셀 컬럼 — 그리드 컬럼 순서·제목, 폭은 제목과 앞 100행 값의 길이로 어림(8~50). 행 키 컬럼은 뺀다.
 * shared exportToExcel 은 제목을 행 객체의 키로 쓰므로, 겹치는 제목은 뒤 컬럼에 「(2)」처럼 번호를 붙여 값이 덮이지 않게 한다.
 */
export function toExcelColumns(
  columns: readonly { key: string; header: string }[],
  rows: readonly Record<string, unknown>[]
): ExcelColumn[] {
  const sample = rows.slice(0, 100);
  const used = new Set<string>();
  return columns
    .filter((c) => c.key !== TABLE_ROW_KEY)
    .map((c) => {
      const base = c.header || c.key;
      let header = base;
      for (let n = 2; used.has(header); n += 1) header = `${base}(${n})`;
      used.add(header);
      const widest = Math.max(textWidth(header), ...sample.map((r) => textWidth(r[c.key])));
      return { key: c.key, header, width: Math.min(50, Math.max(8, widest + 2)) };
    });
}
