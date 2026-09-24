/**
 * 항목 그리드 표시 행(TSK-05-02 — 두 화면 공용). 계산 칸(항목명·도메인(파생)·설정·위치)을 행 데이터에 넣는다 — ag-grid 는 필드
 * 값이 바뀐 셀만 다시 그리므로 render 로만 그린 칸은 편집 뒤 갱신되지 않는다.
 */
import { derivedLabel } from "./LayoutItemDetail";
import { positionLabel } from "./layout-calc";
import type { LayoutItemRow } from "./types";

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
    POSITION: positionLabel(r.OFFSET ?? 0, r.LENGTH ?? 0),
  }));
}
