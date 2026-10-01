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
