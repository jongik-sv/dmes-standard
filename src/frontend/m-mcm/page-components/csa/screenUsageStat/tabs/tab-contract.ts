/**
 * 화면 사용 통계 탭 계약 — 탭 하나 = 탭 모듈(`*-tab.ts`, 조회·검사·엑셀 대상) + 탭 화면(`*Tab.tsx`, 그리기).
 * page.tsx 는 TAB_MODULES 로 모듈을 부르고 탭 화면에 StatTabViewProps 를 넘긴다. 슬라이스는 이 파일을 고치지 않는다.
 * shared 는 타입만 가져온다(vitest 가 shared dist 없이 시험한다).
 */
import type { GridColumn } from "@dk-oasis/shared/grid";

import { checkFilters } from "../format";
import type { StatData, StatFilters, StatTab } from "../types";

/** exportToExcel 의 columns 인자(shared ExcelColumn)와 같은 모양. */
export interface ExportColumn {
  key: string;
  header: string;
}

/** [엑셀] 대상 — 현재 탭 그리드의 원본 행과 열. 표시용 글자 변환(toExportRows)은 page 가 한다. */
export interface StatExportTarget {
  rows: Record<string, unknown>[];
  columns: ExportColumn[];
}

export interface StatTabModule {
  /** 고정된 조건으로 이 탭을 조회해 StatData 에 합칠 조각을 돌려준다. */
  load(q: StatFilters): Promise<Partial<StatData>>;
  /** 조회 전 검사. 문구를 돌려주면 page 가 warning 으로 알리고 부르지 않는다. */
  check?(q: StatFilters): string | null;
  /** [엑셀] 대상. 조회 전이면 rows 는 빈 배열. */
  toExport(data: StatData): StatExportTarget;
}

/** 탭 화면 props. query 는 [조회] 로 고정한 조건(조회 전 null), busy 는 탭 조회 중 여부. */
export interface StatTabViewProps {
  data: StatData;
  query: StatFilters | null;
  busy: boolean;
}

export const toExportColumns = (cols: readonly GridColumn[]): ExportColumn[] =>
  cols.map(({ key, header }) => ({ key, header: header ?? key }));

export const exportFileName = (tabLabel: string, ymd: string): string =>
  `화면사용통계_${tabLabel}_${ymd}.xlsx`;

/**
 * [조회] 전 검사. 미사용 기준 일수 칸은 개요·미사용 화면 탭에서만 보이므로
 * 그 밖의 탭에서는 (숨겨진) 값을 검사하지 않는다.
 */
export const checkSearch = (tab: StatTab, f: StatFilters): string | null =>
  checkFilters(tab === "overview" || tab === "unused" ? f : { ...f, unusedDays: "" });
