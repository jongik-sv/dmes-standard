/** 사용자별 탭 모듈 — byUser 조회(서버가 사용자당 1행)와 엑셀 대상. shared 를 런타임 import 하지 않는다. */
import type { GridColumn } from "@dk-oasis/shared/grid";

import { fetchByUser } from "../api";
import { countCol, durationCol, ymdCol } from "./columns";
import { toExportColumns, type StatTabModule } from "./tab-contract";

export const USER_COLUMNS: GridColumn[] = [
  { key: "userId", header: "사용자 ID", width: 120, align: "left" },
  { key: "userNm", header: "사용자명", width: 180, align: "left" },
  { key: "deptNm", header: "부서", width: 100, minWidth: 180, align: "left" },
  countCol("openCnt", "열람 횟수"),
  durationCol("durationMs", "이용 시간"),
  ymdCol("lastUsedDt", "마지막 이용일"),
];

const EXPORT_COLUMNS = toExportColumns(USER_COLUMNS);

export const userTab: StatTabModule = {
  load: async (q) => ({ users: await fetchByUser(q) }),
  toExport: (data) => ({ rows: data.users, columns: EXPORT_COLUMNS }),
};
