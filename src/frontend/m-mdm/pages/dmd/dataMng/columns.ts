/** dataMng 목록 열 — ID·이름·원천·상태 네 열(D2). 행 클릭이 선택이라 ID 는 링크가 아니다(D-104). */
import type { GridColumn } from "@dk-oasis/shared/grid";

export function buildDataMngColumns(): GridColumn[] {
  return [
    { key: "maruDataId", header: "마루 데이터 ID", width: 150, align: "left" },
    { key: "maruDataName", header: "이름", width: 150, align: "left" },
    { key: "sourceKind", header: "원천", width: 70, align: "center" },
    { key: "status", header: "상태", width: 90, align: "center" },
  ];
}
