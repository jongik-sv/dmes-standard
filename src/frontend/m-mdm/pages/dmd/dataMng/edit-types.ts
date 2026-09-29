/**
 * dataMng 상세(옛 dataEdit, D-104) 타입 — 서버 DTO camelCase 그대로(TSK-07-02 design.md §2).
 * 저장은 헤더+키 패턴+라벨+lvl_cnt 를 한 액션(save)으로 묶는다(D3).
 */

export interface CategorySummaryRow {
  cateId: string;
  cateName: string;
  defKind: string;
  open: boolean;
  matchCount: number;
}

export interface DataEditView {
  maruDataId: string;
  maruDataName: string;
  description: string | null;
  codePattern: string;
  status: string;
  sourceKind: string;
  lvlCnt: number;
  attr01Name: string | null;
  attr02Name: string | null;
  attr03Name: string | null;
  attr04Name: string | null;
  attr05Name: string | null;
  attr06Name: string | null;
  attr07Name: string | null;
  attr08Name: string | null;
  attr09Name: string | null;
  attr10Name: string | null;
  auditVer: number;
  editable: boolean;
  categories: CategorySummaryRow[];
  /** 지금 열려 있는 항목 건수(닫힌 키 제외). */
  itemCount: number;
}

export const ATTR_KEYS = [
  "attr01Name", "attr02Name", "attr03Name", "attr04Name", "attr05Name",
  "attr06Name", "attr07Name", "attr08Name", "attr09Name", "attr10Name",
] as const;

export type AttrKey = (typeof ATTR_KEYS)[number];

export type HeaderForm = {
  maruDataName: string;
  description: string;
  codePattern: string;
  lvlCnt: string;
} & Record<AttrKey, string>;

export const LVL_CNT_OPTIONS = ["0", "1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

export function headerFormOf(view: DataEditView): HeaderForm {
  const form = {
    maruDataName: view.maruDataName ?? "",
    description: view.description ?? "",
    codePattern: view.codePattern ?? "",
    lvlCnt: String(view.lvlCnt),
  } as HeaderForm;
  for (const key of ATTR_KEYS) form[key] = view[key] ?? "";
  return form;
}

/** 잡힌 오류에서 보일 문구를 뽑는다. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
