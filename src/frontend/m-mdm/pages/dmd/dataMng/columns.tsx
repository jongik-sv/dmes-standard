/** dataMng 목록 열 — ID·이름·원천·상태 네 열(D2). ID 는 편집 링크로 항목 편집 화면으로 이동. */
import { openMdmPage } from "@/shell";
import type { GridColumn } from "@dk-oasis/shared/grid";

export function buildDataMngColumns(): GridColumn[] {
  return [
    {
      key: "maruDataId",
      header: "마루 데이터 ID",
      width: 150,
      align: "left",
      render: (value) => (
        <button
          type="button"
          className="mdm-data-edit-link"
          data-testid={`data-edit-link-${String(value)}`}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--color-primary)",
            textDecoration: "underline",
            font: "inherit",
          }}
          onClick={() => openMdmPage("dmd/dataItemMng", { maruDataId: String(value) })}
        >
          {String(value)}
        </button>
      ),
    },
    { key: "maruDataName", header: "이름", width: 150, align: "left" },
    { key: "sourceKind", header: "원천", width: 70, align: "center" },
    { key: "status", meta: false, header: "상태", width: 90, align: "center" },
  ];
}
