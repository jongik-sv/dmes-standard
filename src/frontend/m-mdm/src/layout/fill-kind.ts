/**
 * fill_kind 별 입력 칸 행렬(TSK-05-02 design.md F10 — 불변 I6). 정본은 Java `LayoutFillKinds` — 같은 표다.
 * 화면은 이 행렬로만 칸을 열고 닫는다(닫힌 칸은 disabled + 값 비움). 저장 전 선검사 문구는 서버 L02·L03 과 같다.
 */
import type { FillKind, ItemField, LayoutItemRow } from "./types";

export type Cell = "required" | "optional" | "closed";

export const FIELDS: ItemField[] = ["COLUMN_PHYS", "DEFAULT_VALUE", "FILLER_LENGTH", "TRANS_UNIT", "UNIT_ITEM", "NUM_FORMAT"];

export const FILL_KINDS: FillKind[] = ["DATA", "CONST", "AUTO", "FILLER"];

/** AUTO 항목의 채움 종류(03:21) — 송신 시점에 채운다. */
export const AUTO_KINDS = ["SEND_TIME", "MSG_LENGTH", "SEQ", "LAYOUT_ID"];

export function cell(kind: FillKind, field: ItemField): Cell {
  switch (field) {
    case "COLUMN_PHYS":
      return kind === "FILLER" ? "closed" : "required";
    case "DEFAULT_VALUE":
      return kind === "CONST" ? "optional" : kind === "AUTO" ? "required" : "closed";
    case "FILLER_LENGTH":
      return kind === "FILLER" ? "required" : "closed";
    case "TRANS_UNIT":
    case "UNIT_ITEM":
      return kind === "DATA" || kind === "CONST" ? "optional" : "closed";
    case "NUM_FORMAT":
      return kind === "FILLER" ? "closed" : "optional";
  }
}

function present(row: LayoutItemRow, field: ItemField): boolean {
  const v = row[field];
  return v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");
}

/** fill_kind 를 바꾼 뒤 닫힌 칸을 비운다. 컬럼이 닫히면 파생 표시 칸도 비운다. */
export function clearClosedFields(row: LayoutItemRow): LayoutItemRow {
  const out: LayoutItemRow = { ...row };
  for (const f of FIELDS) {
    if (cell(row.FILL_KIND, f) === "closed") (out as unknown as Record<string, unknown>)[f] = null;
  }
  if (cell(row.FILL_KIND, "COLUMN_PHYS") === "closed") {
    out.DISPLAY_NAME = null;
    out.DOMAIN_NAME = null;
    out.DATA_TYPE = null;
    out.DOMAIN_LENGTH = null;
    out.SCALE = null;
    out.UNIT_CODE = null;
  }
  return out;
}

/** 화면 선검사 — 서버 L02·L03 과 같은 문구(`Lnn[seq] …`). 빈 목록이면 통과. */
export function precheck(rows: LayoutItemRow[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    for (const f of FIELDS) {
      const c = cell(row.FILL_KIND, f);
      if (c === "closed" && present(row, f)) out.push(`L02[${row.SEQ}] ${row.FILL_KIND} 항목에는 ${f} 를 넣을 수 없다`);
      else if (c === "required" && !present(row, f)) out.push(`L03[${row.SEQ}] ${row.FILL_KIND} 항목에는 ${f} 가 필요하다`);
    }
    if (row.FILL_KIND === "FILLER" && row.FILLER_LENGTH != null && row.FILLER_LENGTH < 1) {
      out.push(`L03[${row.SEQ}] FILLER 길이는 1 이상이다: ${row.FILLER_LENGTH}`);
    }
  }
  return out;
}
