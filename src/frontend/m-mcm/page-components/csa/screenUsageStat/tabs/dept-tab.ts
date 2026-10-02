/** 부서별 탭 모듈 — byDept 조회, 선택 부서의 화면별(byScreen + deptCd), 엑셀 대상. shared 를 런타임 import 하지 않는다. */
import type { GridColumn } from "@dk-oasis/shared/grid";

import { fetchByDept, fetchByScreen } from "../api";
import type { ScreenUsageScreenRow, StatFilters } from "../types";
import { countCol, durationCol } from "./columns";
import { toExportColumns, type StatTabModule } from "./tab-contract";

export const DEPT_COLUMNS: GridColumn[] = [
  { key: "deptCd", header: "부서코드", width: 120, align: "left" },
  { key: "deptNm", header: "부서명", width: 180, align: "left" },
  countCol("userCnt", "이용자 수"),
  countCol("openCnt", "열람 횟수"),
  durationCol("durationMs", "이용 시간"),
  { key: "topMenuNm", header: "최다 이용 화면", width: 100, minWidth: 180, align: "left" },
];

const EXPORT_COLUMNS = toExportColumns(DEPT_COLUMNS);

export const deptTab: StatTabModule = {
  load: async (q) => ({ depts: await fetchByDept(q) }),
  toExport: (data) => ({ rows: data.depts, columns: EXPORT_COLUMNS }),
};

/**
 * 부서 행을 눌렀을 때(↑↓ 이동 포함) 새로 부를 부서코드. 같은 부서이거나 코드가 비면 null(부르지 않음).
 * 부서 없음 '-' 도 하나의 부서로 고른다(서버가 '-' 를 부서 없는 구간으로 거른다).
 */
export function nextDeptSelection(
  row: Record<string, unknown>,
  selected: string | null
): string | null {
  const deptCd = String(row.deptCd ?? "");
  return deptCd && deptCd !== selected ? deptCd : null;
}

/** 선택 부서의 화면별 — [조회] 로 고정한 조건에 부서만 바꿔 byScreen 을 부른다. */
export function loadDeptScreens(q: StatFilters, deptCd: string): Promise<ScreenUsageScreenRow[]> {
  return fetchByScreen(q, deptCd);
}

/** 선택 부서 상세의 최소 모양(탭 화면의 DeptDetail 이 이를 만족한다). */
export interface DeptDetailLike {
  deptCd: string;
}

/**
 * 선택 부서의 화면별 조회가 실패한 뒤의 상세 상태. 그 부서 선택을 풀어(null)
 * 같은 행을 다시 눌렀을 때 nextDeptSelection 이 다시 부르게 한다.
 */
export function detailAfterFailure<T extends DeptDetailLike>(
  detail: T | null,
  failedDeptCd: string
): T | null {
  return detail && detail.deptCd === failedDeptCd ? null : detail;
}
