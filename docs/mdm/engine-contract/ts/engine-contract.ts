/**
 * maru-mdm-engine 공유 계약 — TS 타입 초안(TSK-02-02).
 *
 * 정본은 ../schema/engine-contract.schema.json 이다. TSK-03-01 은 이 파일을 손으로 옮기지 않고
 * 스키마에서 생성한다(design §6.3). 이 초안은 생성 결과가 가져야 할 모양을 보이고 tsc --strict 로 검사한다.
 */

// ---------------------------------------------------------------- AST (evalex-guide §8.3)

export type AstNode =
  | AstNumberLiteral
  | AstStringLiteral
  | AstVariable
  | AstPrefix
  | AstInfix
  | AstFunction;

export interface AstNumberLiteral {
  type: 'NUMBER_LITERAL';
  /** 입력 텍스트 그대로("1.60", "1e-3", "0xFF"). 화면은 Decimal 로 바꾼다 — number 금지 */
  value: string;
}

export interface AstStringLiteral {
  type: 'STRING_LITERAL';
  value: string;
}

export interface AstVariable {
  type: 'VARIABLE_OR_CONSTANT';
  value: string;
}

export interface AstPrefix {
  type: 'PREFIX_OPERATOR';
  value: '-' | '+' | '!';
  params: [AstNode];
}

export type InfixOperator =
  | '+' | '-' | '*' | '/' | '%' | '^'
  | '=' | '==' | '!=' | '<>' | '<' | '<=' | '>' | '>='
  | '&&' | '||';

export interface AstInfix {
  type: 'INFIX_OPERATOR';
  value: InfixOperator;
  params: [AstNode, AstNode];
}

export interface AstFunction {
  type: 'FUNCTION';
  value: string;
  /** 인자가 없으면 키가 없다 */
  params?: AstNode[];
}

// ---------------------------------------------------------------- 값

export type DataType = 'NUMBER' | 'STRING' | 'BOOLEAN' | 'DATE';

export type TypedValue =
  | { type: 'NUMBER'; value: string }
  | { type: 'STRING'; value: string }
  | { type: 'BOOLEAN'; value: 'true' | 'false' }
  | { type: 'NULL' }
  | { type: 'LIST'; items: TypedValue[] };

/** KST 벽시계 초 단위 'YYYY-MM-DDTHH:MM:SS' */
export type LocalDateTime = string;

// ---------------------------------------------------------------- 셀 JSON (06:1036-1054)

export type RangeOp = '<= 변수 <=' | '<= 변수 <' | '< 변수 <=' | '< 변수 <';
export type SingleValueOp = 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE' | 'CODE_IN' | 'CONTAINS' | 'INSTR';
export type CellOp = 'NA' | 'IS_NULL' | 'NOT_NULL' | SingleValueOp | 'IN' | 'NOT_IN' | RangeOp;

export type CellJson =
  | { op: 'NA' | 'IS_NULL' | 'NOT_NULL' }
  | { op: SingleValueOp; left: string }
  | { op: 'IN' | 'NOT_IN'; list: string[] }
  | { op: RangeOp; left: string; right: string }
  | { expr: string; ast: AstNode }
  | { val: string };

// ---------------------------------------------------------------- 코퍼스 (06:284-296)

export type Slot =
  | 'DOMAIN_STD' | 'DOMAIN_BIZ'
  | 'RULE_COND_EXPR' | 'RULE_RESULT_EXPR' | 'RULE_EXPR_VAR' | 'RULE_GRP_COND';

export type ErrorCode =
  | 'RULE_NOT_FOUND' | 'SET_NOT_FOUND' | 'SET_DEPRECATED'
  | 'MISSING_KEY' | 'REQUIRED_NULL' | 'TYPE_CONVERSION'
  | 'CONSTANT_KEY' | 'RESERVED_KEY' | 'EVAL_TS_KEY'
  | 'UNIQUE_MULTIPLE_HITS' | 'ANY_CONFLICT' | 'EVALUATION_ERROR';

/** 키는 '마루코드ID|카테고리ID' */
export type CodeSets = Record<string, string[]>;

export type Expect =
  | { value: TypedValue; screenFallback?: boolean }
  | { error: ErrorCode; screenFallback?: boolean };

export interface ExprCase {
  id: string;
  kind: 'expr';
  slot?: Slot;
  expr: string;
  ast: AstNode;
  vars: Record<string, TypedValue>;
  evalTs?: LocalDateTime;
  codeSets?: CodeSets;
  expect: Expect;
}

export interface CellCase {
  id: string;
  kind: 'cell';
  variable: {
    name: string;
    dataType: 'NUMBER' | 'STRING' | 'BOOLEAN';
    dateString?: boolean;
    maruCodeId?: string;
  };
  cell: CellJson;
  patternRegex?: string;
  value: TypedValue;
  evalTs?: LocalDateTime;
  codeSets?: CodeSets;
  expect: Expect;
}

export type CorpusCase = ExprCase | CellCase;

export interface CorpusFile {
  version: 1;
  cases: CorpusCase[];
}

// ---------------------------------------------------------------- 입력 계약·판정 결과

export interface VarType {
  name: string;
  dataType: DataType;
  scale?: number | null;
  domainId?: string | null;
}

export interface InputContract {
  always: VarType[];
  rows: { rowId: number; cond: string; required: VarType[]; optional: VarType[] }[];
}

export interface RuleResult {
  ruleId: string;
  ver: number;
  evalTs: LocalDateTime;
  hits: { rowId: number; seq: number; groupChoices: Record<string, number | null> }[];
  defaultApplied: boolean;
  results: Record<string, TypedValue>;
  trace: { rowId: number; seq: number; evaluated: boolean; hit: boolean; firstFalseVarId: number | null }[];
  warnings: {
    code: 'EXPR_CELL_NULL' | 'GRP_COND_NULL';
    ruleId?: string | null;
    rowId?: number | null;
    varId?: number | null;
    message: string;
  }[];
}

export interface EngineError {
  violations: {
    stage: 'SET_CHECK' | 'INPUT_CHECK' | 'ROW_SELECT' | 'RESULT_CHECK' | 'RESULT_EVAL';
    code: ErrorCode;
    ruleId?: string | null;
    rowId?: number | null;
    name?: string | null;
    message: string;
  }[];
}
