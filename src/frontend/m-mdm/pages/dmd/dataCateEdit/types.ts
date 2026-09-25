/**
 * dataCateEdit(카테고리 편집) 화면 타입 — 서버 DTO camelCase 그대로(TSK-07-02 design.md §2).
 * Java boolean getter `isOpen()` 은 Jackson 이 `open` 필드로 직렬화한다.
 */

export interface CateRow {
  cateId: string;
  cateName: string | null;
  defKind: "REGEX" | "TABLE";
  defExpr: string | null;
  defTarget: string | null;
  description: string | null;
  open: boolean;
  matchCount: number;
}

export interface CateSearchResult {
  maruDataId?: string;
  maruDataName?: string;
  lvlCnt?: number;
  /** attr01~10 라벨, 순서대로(라벨 없는 번호는 null). */
  attrLabels?: (string | null)[];
  list?: CateRow[];
}

export interface CateItem {
  code: string;
  name: string | null;
  lvl1: string | null;
}

export interface CateViewResult {
  cate?: CateRow;
  /** TABLE 이고 열려 있을 때만(열린 항목만, R5). */
  items?: CateItem[];
  memberCodes?: string[];
}

export interface ComparePreview {
  invalid?: boolean;
  codes?: string[];
  count?: number;
}

/** 예약 카테고리 ID — 편집·닫기 대상이 아니다(R6, 서버 CategoryConventions.BASE_CATE_ID 와 짝). */
export const BASE_CATE_ID = "BASE";

/** 잡힌 오류에서 보일 문구를 뽑는다. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
