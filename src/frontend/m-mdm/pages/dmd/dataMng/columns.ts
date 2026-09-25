/** dataMng 목록 열 — ID(클릭 시 dataEdit 로 이동)·이름·원천·상태 네 열만(D2). */
import { createElement } from "react";

import type { GridColumn } from "@dk-oasis/shared/grid";

export function buildDataMngColumns(onOpenEdit: (maruDataId: string) => void): GridColumn[] {
  return [
    {
      key: "maruDataId",
      header: "마루 데이터 ID",
      width: 180,
      align: "left",
      render: (value) => {
        const id = String(value);
        return createElement(
          "button",
          {
            type: "button",
            className: "mdm-link-button",
            "data-testid": `data-mng-open-${id}`,
            style: { background: "none", border: 0, padding: 0, color: "var(--color-primary)", cursor: "pointer" },
            onClick: () => onOpenEdit(id),
          },
          id,
        );
      },
    },
    { key: "maruDataName", header: "이름", width: 220, align: "left" },
    { key: "sourceKind", header: "원천", width: 90, align: "center" },
    { key: "status", header: "상태", width: 110, align: "center" },
  ];
}
