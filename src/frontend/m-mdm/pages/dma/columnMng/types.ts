/**
 * columnMng 응답·폼 타입(TSK-04-04 design.md §6.1·§6.5). 서버 응답 `data.result.{…}` 의 모양과 같다.
 */
export type TokenStatus =
  "MATCHED" | "SYNONYM" | "AMBIGUOUS" | "NO_ABBR" | "UNKNOWN";
export type Direction = "FORWARD" | "REVERSE";

export interface TermCandidate {
  termId: number;
  termName: string;
  senseNo: number;
  definition?: string | null;
  context?: string | null;
  engAbbr?: string | null;
  via: "NAME" | "SYNONYM" | "ALIAS";
}

export interface NameToken {
  seq: number;
  surface: string;
  status: TokenStatus;
  termId: number | null;
  termName: string | null;
  senseNo: number | null;
  engAbbr: string | null;
  abbr: string;
  candidates: TermCandidate[];
}

/** 팝업·후보 선택이 돌려주는 용어 한 건. */
export interface PickedTerm {
  termId: number;
  termName: string;
  senseNo: number;
  engAbbr: string | null;
}

export interface LabelSet {
  labelLong: string;
  labelMid: string;
  labelShort: string;
}

export interface DomainMatchRow {
  domainId: number;
  domainName: string;
  stdName: string;
  matchLength: number;
}

export interface DuplicateRow {
  columnId: number;
  columnName: string;
  physName: string;
  usageNote: string | null;
  domainId: number | null;
  domainName: string | null;
  matchedBy: "COLUMN_NAME" | "PHYS_NAME" | "SYSTEM_FIELD";
  systemCode: string | null;
}

export interface CompareResult {
  direction: Direction;
  input: string;
  tokens: NameToken[];
  logicalName: string;
  physName: string;
  placeholder: boolean;
  labels?: LabelSet;
  domains: DomainMatchRow[];
  recommendedDomainId: number | null;
  duplicates: DuplicateRow[];
}

export interface ColumnListRow {
  columnId: number;
  columnName: string;
  physName: string;
  labelLong: string | null;
  labelMid: string | null;
  labelShort: string | null;
  domainId: number | null;
  domainName: string | null;
  domainStdName: string | null;
  required: "Y" | "N";
  termNames: string;
  systemFields: string;
  usageNote: string | null;
}

export interface DomainOption {
  domainId: number;
  domainName: string;
  stdName: string;
  label: string;
}

export interface SystemOption {
  systemCode: string;
  systemName: string;
}

export interface SearchResult {
  list: ColumnListRow[];
  domains: DomainOption[];
  systems: SystemOption[];
}

export interface ColumnDetail {
  columnId: number;
  columnName: string;
  physName: string;
  labelLong: string | null;
  labelMid: string | null;
  labelShort: string | null;
  description: string | null;
  domainId: number | null;
  required: boolean;
  defaultValue: string | null;
  refKind: string | null;
  refTarget: string | null;
  refCateId: string | null;
  usageNote: string | null;
}

export interface SystemMappingRow {
  systemCode: string;
  physName: string;
  transform: string | null;
  note: string | null;
}

export interface ViewResult {
  column: ColumnDetail;
  systems: SystemMappingRow[];
  terms: Array<{
    termId: number;
    termName: string | null;
    senseNo: number | null;
    engAbbr: string | null;
    missing: boolean;
  }>;
}

/** 상세 폼 상태. 입력칸은 모두 문자열로 다룬다. */
export interface ColumnForm {
  columnId: number | null;
  columnName: string;
  physName: string;
  labelLong: string;
  labelMid: string;
  labelShort: string;
  description: string;
  domainId: string;
  required: "Y" | "N";
  defaultValue: string;
  refKind: string;
  refTarget: string;
  refCateId: string;
  usageNote: string;
}

export function emptyForm(): ColumnForm {
  return {
    columnId: null,
    columnName: "",
    physName: "",
    labelLong: "",
    labelMid: "",
    labelShort: "",
    description: "",
    domainId: "",
    required: "N",
    defaultValue: "",
    refKind: "",
    refTarget: "",
    refCateId: "",
    usageNote: "",
  };
}
