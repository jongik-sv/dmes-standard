/**
 * 항목 그리드 표시 행(TSK-05-02 — 두 화면 공용). 계산 칸(항목명·도메인(파생)·설정·위치)을 행 데이터에 넣는다 — ag-grid 는 필드
 * 값이 바뀐 셀만 다시 그리므로 render 로만 그린 칸은 편집 뒤 갱신되지 않는다.
 */
import { createElement } from "react";
import type { GridColumn } from "@dk-oasis/shared/grid";
import { ColumnPhysName } from "@/column-info";
import { derivedLabel } from "./LayoutItemDetail";
import { lengthText, positionLabel } from "./layout-calc";
import type { ColumnInfo, LayoutItemRow } from "./types";

/** 헤더 항목·본문 항목 그리드가 공통으로 쓰는 앞쪽 7개 칸(순서·항목명·표준 물리명·채움·오프셋·길이·위치). */
export function baseItemColumns(readOnly: boolean): GridColumn[] {
  return [
    { key: "SEQ", meta: false, header: "순서", width: 70, align: "center", rowDrag: !readOnly },
    { key: "ITEM_NAME", header: "항목명", meta: false, width: 150 },
    // 물리명 옆 정보 아이콘 → 컬럼 사전 상세 팝오버(아이콘 클릭은 행 선택으로 번지지 않는다).
    { key: "COLUMN_PHYS", header: "표준 물리명", width: 140, render: (v) => createElement(ColumnPhysName, { physName: v as string | null }) },
    { key: "FILL_KIND", header: "채움", width: 80, align: "center" },
    { key: "OFFSET", header: "오프셋", width: 70, align: "right", render: (v) => lengthText(v as number | null | undefined) },
    { key: "LENGTH", header: "길이", meta: false, width: 60, align: "right" },
    { key: "POSITION", header: "위치", meta: false, width: 90, align: "center" },
  ];
}

/** 컬럼 사전 선택으로 새 항목 행을 만든다(SEQ·OFFSET·LENGTH 는 재계산 전 임시값). */
export function newColumnRow(key: string, c: ColumnInfo): LayoutItemRow {
  return {
    KEY: key, SEQ: 0, FILL_KIND: "DATA", COLUMN_PHYS: c.PHYS_NAME, DISPLAY_NAME: c.DISPLAY_NAME, DOMAIN_NAME: c.DOMAIN_NAME,
    DATA_TYPE: c.DATA_TYPE, DOMAIN_LENGTH: c.LENGTH, SCALE: c.SCALE, UNIT_CODE: c.UNIT_CODE,
  };
}

/** FILLER 행 하나를 만든다(기본 FILLER_LENGTH 1). */
export function newFillerRow(key: string): LayoutItemRow {
  return { KEY: key, SEQ: 0, FILL_KIND: "FILLER", FILLER_LENGTH: 1 };
}

export function itemSetting(r: LayoutItemRow): string {
  const parts: string[] = [];
  if (r.DEFAULT_VALUE) parts.push(r.FILL_KIND === "AUTO" ? `AUTO ${r.DEFAULT_VALUE}` : `기본값 ${r.DEFAULT_VALUE}`);
  if (r.NUM_FORMAT) parts.push(r.NUM_FORMAT);
  if (r.TRANS_UNIT) parts.push(`전송 단위 ${r.TRANS_UNIT}`);
  if (r.UNIT_ITEM) parts.push(`단위 항목 ${r.UNIT_ITEM}`);
  return parts.join(" · ");
}

export function displayRows(rows: LayoutItemRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    ...r, ITEM_NAME: r.FILL_KIND === "FILLER" ? "FILLER" : (r.DISPLAY_NAME ?? ""), DERIVED: derivedLabel(r), SETTING: itemSetting(r),
    POSITION: positionLabel(r.OFFSET === undefined ? 0 : r.OFFSET, r.LENGTH ?? 0),
  }));
}
