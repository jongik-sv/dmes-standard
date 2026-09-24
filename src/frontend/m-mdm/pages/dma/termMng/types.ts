/**
 * termMng(용어 관리) 화면 타입 — 정본: docs/mdm/screens/termMng/termMng_기능설계서.md §3~§4.
 * 서버 DTO 필드는 camelCase(unitMng 와 동일 관례).
 */

export interface TermRow {
  termId: number;
  termName: string;
  senseNo: number;
  definition: string;
  context: string | null;
  engName: string | null;
  engAbbr: string | null;
  synonyms: string[];
  aliases: string[];
  systems: string[];
  stdBasis: string | null;
}

export interface TermMngFilters {
  keyword: string;
  systems: string;
  context: string;
}

export function emptyFilters(): TermMngFilters {
  return { keyword: "", systems: "", context: "" };
}

/** 상세 폼(A-DETAIL). synonyms/aliases/systems 는 콤마 구분 원본 텍스트다(D-006·D-009·D-010,
 * OASIS 가 params 에 배열을 못 실으므로 서버가 콤마로 split 한다 — TSK-04-02 design.md Build 이탈 참고). */
export interface TermForm {
  termId: number | null;
  termName: string;
  senseNo: string;
  definition: string;
  context: string;
  engName: string;
  engAbbr: string;
  synonyms: string;
  aliases: string;
  systems: string;
  stdBasis: string;
}

export function emptyTermForm(): TermForm {
  return {
    termId: null,
    termName: "",
    senseNo: "",
    definition: "",
    context: "",
    engName: "",
    engAbbr: "",
    synonyms: "",
    aliases: "",
    systems: "",
    stdBasis: "",
  };
}

export function termFormFromRow(row: TermRow): TermForm {
  return {
    termId: row.termId,
    termName: row.termName,
    senseNo: String(row.senseNo),
    definition: row.definition,
    context: row.context ?? "",
    engName: row.engName ?? "",
    engAbbr: row.engAbbr ?? "",
    synonyms: (row.synonyms ?? []).join(","),
    aliases: (row.aliases ?? []).join(","),
    systems: (row.systems ?? []).join(","),
    stdBasis: row.stdBasis ?? "",
  };
}

/** 유사어 추천 후보(A-RECO) — 불변 규칙 I18. stage="1"(문자열)|"2"(임베딩). */
export interface RecommendCandidate {
  termId: number;
  termName: string;
  senseNo: number;
  engName: string | null;
  systems: string[];
  matchedText: string | null;
  score: number;
  stage: "1" | "2";
}
