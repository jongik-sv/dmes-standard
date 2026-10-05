/** 미사용 화면 탭 모듈 — unused 조회(기준 일수)와 엑셀 대상. shared 를 런타임 import 하지 않는다. */
import type { GridColumn } from "@dk-oasis/shared/grid";

import { fetchUnused } from "../api";
import { checkFilters, formatYmd } from "../format";
import { toExportColumns, type StatTabModule } from "./tab-contract";

/** 마지막 이용일 — 이용 기록이 한 번도 없으면 "기록 없음". */
export const lastUsedText = (v: unknown): string => formatYmd(v) || "기록 없음";

export const UNUSED_COLUMNS: GridColumn[] = [
  { key: "menuNm", header: "화면명", width: 180, align: "left" },
  { key: "pageId", header: "화면 ID", width: 120, align: "left" },
  { key: "menuPath", header: "메뉴 경로", meta: false, width: 100, minWidth: 180, align: "left" },
  {
    key: "lastUsedDt",
    header: "마지막 이용일",
    meta: false,
    width: 100,
    align: "center",
    render: (v) => lastUsedText(v),
  },
];

const EXPORT_COLUMNS = toExportColumns(UNUSED_COLUMNS);

export const unusedTab: StatTabModule = {
  // 다른 탭에서 잘못 입력한 기준 일수가 서버 기본값 90 으로 조용히 조회되지 않게 막는다.
  check: (q) => checkFilters(q),
  load: async (q) => ({ unused: await fetchUnused(q) }),
  toExport: (data) => ({ rows: data.unused, columns: EXPORT_COLUMNS }),
};
