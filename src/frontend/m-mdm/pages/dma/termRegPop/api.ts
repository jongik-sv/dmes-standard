/**
 * termRegPop(용어 인라인 등록 팝업)의 OASIS 호출 래퍼(TSK-04-04 design.md §6.2).
 * `POST /api/mdm/oasis/termRegPop/{search|reg}` — 봉투 해제 규칙은 columnMng 과 같다.
 */
import { callOasis } from "../columnMng/api";
import type { PickedTerm } from "../columnMng/types";

export interface SimilarTermRow {
  termId: number;
  termName: string;
  senseNo: number;
  definition: string | null;
  context: string | null;
  engName: string | null;
  engAbbr: string | null;
  reason:
    "EXACT" | "ENG_NAME" | "SYNONYM_ALIAS" | "NAME_PARTIAL" | "NAME_SIMILAR";
  score: number;
}

export interface AbbrSuggestion {
  base: string | null;
  baseTaken: boolean;
  suggested: string | null;
  alternatives: string[];
}

export interface TermSearchResult {
  similar: SimilarTermRow[];
  nextSenseNo: number;
  abbr: AbbrSuggestion | null;
}

export interface TermRegParams {
  termName: string;
  senseNo: number;
  definition: string;
  context: string;
  engName: string;
  engAbbr: string;
}

export function searchTerms(
  termName: string,
  engName?: string,
): Promise<TermSearchResult> {
  return callOasis<TermSearchResult>("termRegPop", "search", {
    termName,
    engName: engName ?? "",
  });
}

export async function regTerm(params: TermRegParams): Promise<PickedTerm> {
  const result = await callOasis<{ term: PickedTerm }>("termRegPop", "reg", {
    ...params,
  });
  return result.term;
}
