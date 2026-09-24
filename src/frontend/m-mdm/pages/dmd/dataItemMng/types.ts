/**
 * dataItemMng(항목 관리) 화면 타입 — 서버 DTO camelCase 그대로(TSK-07-03 design.md §2).
 * 일시는 서버가 `yyyy-MM-dd HH:mm:ss` 문자열로 준다(화면은 그대로 보인다).
 */

export interface MaruDataOption {
  maruDataId: string;
  maruDataName: string;
  status: string;
  sourceKind: string;
}

export interface AttrLabel {
  /** `attr01` 같은 번호. */
  field: string;
  label: string;
}

export interface CategoryOption {
  cateId: string;
  cateName: string | null;
  defKind: string;
}

export interface DataItemHeader {
  maruDataId: string;
  maruDataName: string;
  status: string;
  sourceKind: string;
  sourceSystem: string | null;
  /** 계층 칸 수 0~5 — 계층 열은 1차~lvlCnt차(Q5). */
  lvlCnt: number;
  /** 라벨이 있는 추가 컬럼만 번호 순(Q5). */
  attrLabels: AttrLabel[];
  /** MDM 원천·INUSE 일 때만 true(Q6). */
  editable: boolean;
  categories: CategoryOption[];
}

export interface DataItemViewResult {
  maruDataOptions?: MaruDataOption[];
  header?: DataItemHeader | null;
}

export const LVL_FIELDS = ["lvl1", "lvl2", "lvl3", "lvl4", "lvl5"] as const;
export const ATTR_FIELDS = [
  "attr01",
  "attr02",
  "attr03",
  "attr04",
  "attr05",
  "attr06",
  "attr07",
  "attr08",
  "attr09",
  "attr10",
] as const;

export type LvlField = (typeof LVL_FIELDS)[number];
export type AttrField = (typeof ATTR_FIELDS)[number];

export type DataItemValues = {
  name: string | null;
  alterName: string | null;
  seq: number | null;
  description: string | null;
} & Record<LvlField, string | null> &
  Record<AttrField, string | null>;

export type DataItemRow = DataItemValues & {
  code: string;
  validFrom: string;
  validTo: string;
  open: boolean;
  rowVersion: number;
};

export interface DataItemSearchResult {
  list?: DataItemRow[];
  totalCount?: number;
  page?: number;
  size?: number;
}

export interface DataItemSaveResult {
  action?: string;
  row?: DataItemRow;
  at?: string;
}

export interface DataItemFilters {
  maruDataId: string;
  code: string;
  name: string;
  cateId: string;
  showClosed: boolean;
}

export function emptyFilters(): DataItemFilters {
  return { maruDataId: "", code: "", name: "", cateId: "", showClosed: false };
}

/** 등록 패널 입력값 — 모두 문자열로 들고 있다가 저장 때 toSaveParams 로 바꾼다. */
export type DataItemForm = { code: string; name: string; alterName: string; seq: string; description: string } & Record<
  LvlField,
  string
> &
  Record<AttrField, string>;

export function emptyItemForm(): DataItemForm {
  const form: Record<string, string> = { code: "", name: "", alterName: "", seq: "", description: "" };
  for (const f of LVL_FIELDS) form[f] = "";
  for (const f of ATTR_FIELDS) form[f] = "";
  return form as DataItemForm;
}

/** 한 페이지 크기 — 서버 기본값과 같다(상한 200). */
export const PAGE_SIZE = 50;
