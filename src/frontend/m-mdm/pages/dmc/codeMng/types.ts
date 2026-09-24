/**
 * codeMng — 마루 코드 조회·등록 화면 타입(TSK-06-02 design.md §6.7·§6.11). 서버 DTO 와 이름이 같다.
 */

/** 목록 한 행 — 현재 버전·미적용·상태는 서버 계산값이다(I17·I18). */
export interface CodeMngRow {
  maruCodeId: string;
  maruCodeName: string;
  sourceKind: string;
  status: string;
  storedStatus: string;
  currentVer: string | null;
  currentVerLabel: string;
  pending: boolean;
  unappliedLabel: string;
  unappliedCount: number;
}

export interface CodeMngSearchResult {
  rows?: CodeMngRow[];
  totalCount?: number;
}

export interface CodeRegForm {
  maruCodeId: string;
  maruCodeName: string;
  description: string;
  lvlCnt: string;
}

export interface CodeRegResult {
  maruCodeId: string;
  ver: string;
  rowVersion: number;
  ownerId: string;
}

export const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "CREATED", label: "CREATED" },
  { value: "INUSE", label: "INUSE" },
  { value: "DEPRECATED", label: "DEPRECATED" },
];

export const LVL_CNT_OPTIONS = ["0", "1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

export function emptyRegForm(): CodeRegForm {
  return { maruCodeId: "", maruCodeName: "", description: "", lvlCnt: "0" };
}
