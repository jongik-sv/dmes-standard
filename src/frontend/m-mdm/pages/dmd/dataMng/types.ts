/**
 * dataMng(마루 데이터 조회·등록) 화면 타입 — 서버 DTO camelCase 그대로(TSK-07-02 design.md §2).
 * 등록 입력은 ID·이름·설명·키 패턴·계층 칸 수뿐이다(원천은 항상 MDM 고정, D1·D2·R10).
 */

export interface DataMngRow {
  maruDataId: string;
  maruDataName: string;
  sourceKind: string;
  status: string;
}

export interface DataMngSearchResult {
  list?: DataMngRow[];
}

export interface DataMngRegForm {
  maruDataId: string;
  maruDataName: string;
  description: string;
  codePattern: string;
  lvlCnt: string;
}

export interface DataMngRegResult {
  maruDataId?: string;
}

export const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "INUSE", label: "INUSE" },
  { value: "DEPRECATED", label: "DEPRECATED" },
];

export const LVL_CNT_OPTIONS = ["0", "1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

export function emptyRegForm(): DataMngRegForm {
  return { maruDataId: "", maruDataName: "", description: "", codePattern: "", lvlCnt: "0" };
}

/** 잡힌 오류에서 보일 문구를 뽑는다. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
