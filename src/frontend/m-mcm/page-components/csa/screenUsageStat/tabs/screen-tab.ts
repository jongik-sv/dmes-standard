/** 화면별 탭 모듈 — byScreen 조회와 엑셀 대상. shared 를 런타임 import 하지 않는다. */
import { fetchByScreen } from "../api";
import { SCREEN_COLUMNS } from "./columns";
import { toExportColumns, type StatTabModule } from "./tab-contract";

const EXPORT_COLUMNS = toExportColumns(SCREEN_COLUMNS);

export const screenTab: StatTabModule = {
  load: async (q) => ({ screens: await fetchByScreen(q) }),
  toExport: (data) => ({ rows: data.screens, columns: EXPORT_COLUMNS }),
};
