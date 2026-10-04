/** equipMng 타입·상수. */
import { addDays, formatDateStr, today } from "@dk-oasis/shared/utils";

export interface EquipRow extends Record<string, unknown> {
  equipCd: string;
  equipNm: string;
  lineCd: string;
  installDt: string; // yyyy-MM-dd
  useYn: string;
  remark: string;
}

export type EquipForm = Pick<EquipRow, "equipCd" | "equipNm" | "lineCd" | "installDt" | "useYn" | "remark">;

/**
 * 조건 없는 첫 조회의 행 수 상한(화면 성능 가이드 R1, 예산 ≤ 1,000건). 서버가 `limit` 을 받아 앞쪽만 읽고
 * `totalCount` 를 함께 준다. m-mdm 화면은 `@/oasis-screen` 의 같은 이름 상수를 쓰고, 다른 모듈은 화면 쪽에 둔다.
 */
export const FIRST_SEARCH_LIMIT = 1000;

/** 조회 결과: 화면에 실을 행과 조건에 맞는 전체 건수(상한으로 잘렸는지 알리는 데 쓴다). */
export interface EquipSearchResult {
  rows: EquipRow[];
  totalCount: number;
}

export interface EquipFilters {
  lineCd: string;
  keyword: string;
  fromDt: string;
  toDt: string;
}

/**
 * 기간 기본값: 오늘-7일 ~ 오늘. libDate 의 today()·addDays() 는 yyyyMMdd 를 돌려주므로
 * DatePicker 형식(yyyy-MM-dd)으로 formatDateStr 을 거친다. formatDate 는 UTC 기준이라 쓰지 않는다.
 */
export const emptyFilters = (): EquipFilters => ({
  lineCd: "",
  keyword: "",
  fromDt: formatDateStr(addDays(today(), -7)),
  toDt: formatDateStr(today()),
});

export const emptyForm = (): EquipForm => ({
  equipCd: "",
  equipNm: "",
  lineCd: "",
  installDt: formatDateStr(today()),
  useYn: "Y",
  remark: "",
});

export const LINE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "L1", label: "1라인" },
  { value: "L2", label: "2라인" },
];

export const USE_YN_OPTIONS = [
  { value: "Y", label: "사용" },
  { value: "N", label: "미사용" },
];
