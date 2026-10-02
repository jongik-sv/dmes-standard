/** 화면 사용 통계 시험 공용 조건·빈 데이터. types.ts 는 shared 를 런타임 import 하므로 타입만 가져온다. */
import type { StatData, StatFilters } from "@/page-components/csa/screenUsageStat/types";

export function query(overrides: Partial<StatFilters> = {}): StatFilters {
  return {
    fromDt: "2026-09-01",
    toDt: "2026-09-30",
    deptCd: "",
    userId: "",
    pageId: "",
    unusedDays: "",
    ...overrides,
  };
}

export function emptyData(overrides: Partial<StatData> = {}): StatData {
  return {
    overview: null,
    overviewRange: null,
    screens: [],
    depts: [],
    users: [],
    unused: [],
    history: [],
    ...overrides,
  };
}
