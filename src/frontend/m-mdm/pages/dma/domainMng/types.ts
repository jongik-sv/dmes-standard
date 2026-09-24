/**
 * domainMng 응답·요청 타입 — 서버 `DomainMngService`(design.md §3.1) 키 그대로(UPPER_SNAKE 행, camelCase 결과 키).
 */

/** 목록 행(search) — 자기 값 + 저장하지 않는 조립값(EFF_*). */
export interface DomainRow {
  DOMAIN_ID: number;
  PARENT_DOMAIN_ID: number | null;
  DEPTH: number;
  DOMAIN_NAME: string;
  STD_NAME: string;
  DOMAIN_KIND: string;
  DATA_TYPE: string;
  LENGTH: number | null;
  SCALE: number | null;
  UNIT_CODE: string | null;
  MARU_CODE_ID: string | null;
  CATE_ID: string | null;
  STD_RULE: string | null;
  BIZ_RULE: string | null;
  VER: number | null;
  EFF_LENGTH: number | null;
  EFF_SCALE: number | null;
  EFF_UNIT_CODE: string | null;
  EFF_MARU_CODE_ID: string | null;
  EFF_CATE_ID: string | null;
  EFF_STD_EXPR: string | null;
  /** 유효 표준 AST JSON 문자열(서버 AstExporter). 화면 JS 미리보기가 평가한다. */
  EFF_STD_AST: string | null;
  EFF_BIZ_EXPR: string | null;
  BIZ_REQUIRED_VARS: string[];
  HAS_BIZ: boolean;
  CHILD_COUNT: number;
  MATCHED: boolean;
}

/** 테스트 케이스 grid 행(D4). VARS 는 JSON 문자열. */
export interface TestCaseRow {
  VALUE: string;
  EXPECT: boolean;
  VARS: string;
  MEMO: string;
}

export interface DomainDetail extends DomainRow {
  DESCRIPTION: string | null;
  EXAMPLES: string[];
  TEST_CASES: Array<{ VALUE: string; EXPECT: boolean | null; VARS: string | null; MEMO: string | null }>;
}

export interface RequiredVarRow {
  PHYS_NAME: string;
  COLUMN_NAME: string | null;
  REGISTERED: boolean;
}

export interface ImpactTable {
  descendants: Array<{ DOMAIN_ID: number; DOMAIN_NAME: string; STD_NAME: string; DEPTH: number }>;
  columns: Array<{ COLUMN_ID: number; COLUMN_NAME: string; PHYS_NAME: string; DOMAIN_ID: number }>;
  ruleVars: Array<{ REF_KEY: string }>;
  layoutItems: Array<{ REF_KEY: string }>;
  otherRefs: Array<{ REF_KIND: string; REF_KEY: string }>;
  systems: string[];
  deployHeld: boolean;
  cycle?: boolean;
}

export interface IssueRow {
  CODE: string;
  LEVEL: "ERROR" | "WARN";
  FIELD: string | null;
  ITEM_KEY: string | null;
  MESSAGE: string;
}

export interface DiffRow {
  FIELD: string;
  LABEL: string;
  BEFORE: unknown;
  AFTER: unknown;
  DIRECTION: string;
}

export interface TestResultRow {
  DOMAIN_ID: number | null;
  DOMAIN_NAME: string | null;
  OWN: boolean;
  IDX: number;
  VALUE: string;
  EXPECT: boolean | null;
  ACTUAL: boolean | null;
  RESULT: "MATCH" | "MISMATCH" | "UNDECIDED" | "ERROR";
  MESSAGE: string | null;
}

export interface ViewResult {
  domain?: DomainDetail;
  requiredVars?: RequiredVarRow[];
  impact?: ImpactTable;
}

export interface ValidateResult {
  ok?: boolean;
  issues?: IssueRow[];
  classification?: string;
  diff?: DiffRow[];
  testResults?: TestResultRow[];
  effective?: Record<string, unknown>;
  requiredVars?: RequiredVarRow[];
  impact?: ImpactTable;
}

export interface JudgeRow {
  RESULT: "true" | "false" | "UNDECIDED" | "ERROR";
  MESSAGE: string | null;
}

export interface ExecuteResult {
  effStdExpr?: string | null;
  effStdAst?: string | null;
  effBizExpr?: string | null;
  bizRequiredVars?: string[];
  compileIssues?: IssueRow[];
  std?: JudgeRow | null;
  biz?: JudgeRow | null;
  valid?: boolean | null;
  step?: string | null;
}

export interface SaveResult {
  domainId?: number;
  ver?: number;
  classification?: string;
  warnings?: IssueRow[];
  rerunDomainIds?: number[];
}

export interface SearchResult {
  domains?: DomainRow[];
}

/** 화면 초안(기능설계서 §4 D-001~D-014). 빈 값은 null 또는 빈 문자열. */
export interface DomainDraft {
  domainId: number | null;
  ver: number | null;
  domainName: string | null;
  stdName: string | null;
  parentDomainId: number | null;
  domainKind: string | null;
  dataType: string | null;
  length: number | null;
  scale: number | null;
  unitCode: string | null;
  maruCodeId: string | null;
  cateId: string | null;
  stdRule: string | null;
  bizRule: string | null;
  description: string | null;
}

export interface PreviewRequest {
  domainId?: number | null;
  parentDomainId?: number | null;
  domainKind?: string | null;
  dataType?: string | null;
  scale?: number | null;
  stdName?: string | null;
  maruCodeId?: string | null;
  cateId?: string | null;
  stdRule?: string | null;
  bizRule?: string | null;
  value?: string | null;
}

export interface SearchFilters {
  keyword: string;
  domainKind: string;
}
