/* 생성 파일 — 직접 고치지 않는다.
 * 정본: src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json
 * 재생성: pnpm --filter @dk-oasis/m-mdm gen:contract (어긋나면 tests/engine-contract.generated.test.ts 가 실패한다) */

/**
 * EvalEx AST 노드(evalex-guide §8.3). 자식이 없으면 params 키를 뺀다. 설정이 허용하는 여섯 종류만 나온다(design D1).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "AstNode".
 */
export type AstNode = AstNumberLiteral | AstStringLiteral | AstVariable | AstPrefix | AstInfix | AstFunction;
/**
 * 전위 연산자(Java AstNode.PREFIX_OPERATORS).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "PrefixOperator".
 */
export type PrefixOperator = "-" | "+" | "!";
/**
 * EvalEx 3.7.0 표준 중위 연산자(evalex-guide §2, Java AstNode.INFIX_OPERATORS).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "InfixOperator".
 */
export type InfixOperator =
  "+" | "-" | "*" | "/" | "%" | "^" | "=" | "==" | "!=" | "<>" | "<" | "<=" | ">" | ">=" | "&&" | "||";
/**
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "DataType".
 */
export type DataType = "NUMBER" | "STRING" | "BOOLEAN" | "DATE";
/**
 * 타입을 붙인 값. NUMBER 는 십진 문자열이고 값으로 견준다(1.10 == 1.1). NULL 은 value 가 없다. LIST 는 COLLECT LIST 결과.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "TypedValue".
 */
export type TypedValue =
  | {
      type: "NUMBER";
      value: string;
    }
  | {
      type: "STRING";
      value: string;
    }
  | {
      type: "BOOLEAN";
      value: "true" | "false";
    }
  | {
      type: "NULL";
    }
  | {
      type: "LIST";
      items: TypedValue[];
    };
/**
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "CellOp".
 */
export type CellOp =
  | "NA"
  | "EQ"
  | "NE"
  | "LT"
  | "LE"
  | "GT"
  | "GE"
  | "IN"
  | "NOT_IN"
  | "CODE_IN"
  | "CONTAINS"
  | "INSTR"
  | "IS_NULL"
  | "NOT_NULL"
  | "<= 변수 <="
  | "<= 변수 <"
  | "< 변수 <="
  | "< 변수 <";
/**
 * 값 없는 op(CellOp 의 한 묶음).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "NoValueOp".
 */
export type NoValueOp = "NA" | "IS_NULL" | "NOT_NULL";
/**
 * left 하나를 쓰는 op(CellOp 의 한 묶음).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "SingleValueOp".
 */
export type SingleValueOp = "EQ" | "NE" | "LT" | "LE" | "GT" | "GE" | "CODE_IN" | "CONTAINS" | "INSTR";
/**
 * list 를 쓰는 op(CellOp 의 한 묶음).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "ListOp".
 */
export type ListOp = "IN" | "NOT_IN";
/**
 * left·right 를 쓰는 범위 op(CellOp 의 한 묶음).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "RangeOp".
 */
export type RangeOp = "<= 변수 <=" | "<= 변수 <" | "< 변수 <=" | "< 변수 <";
/**
 * 룰 셀(06:1036-1054). 키는 일곱뿐이고 값은 전부 문자열. op 에 따라 쓰는 키가 정해진다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "CellJson".
 */
export type CellJson =
  | {
      op: NoValueOp;
    }
  | {
      op: SingleValueOp;
      left: string;
    }
  | {
      op: ListOp;
      /**
       * @minItems 1
       */
      list: [string, ...string[]];
    }
  | {
      op: RangeOp;
      left: string;
      right: string;
    }
  | {
      expr: string;
      ast: AstNode;
    }
  | {
      val: string;
    };
/**
 * 판정 오류 코드(Java EngineEvaluationException.Code 와 같은 이름).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "ErrorCode".
 */
export type ErrorCode =
  | "RULE_NOT_FOUND"
  | "SET_NOT_FOUND"
  | "SET_DEPRECATED"
  | "MISSING_KEY"
  | "REQUIRED_NULL"
  | "TYPE_CONVERSION"
  | "CONSTANT_KEY"
  | "RESERVED_KEY"
  | "EVAL_TS_KEY"
  | "UNIQUE_MULTIPLE_HITS"
  | "ANY_CONFLICT"
  | "EVALUATION_ERROR"
  | "BRANCH_EVAL_ERROR"
  | "FLOW_INVALID"
  | "EDIT_POINT_MISMATCH";
/**
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "CorpusCase".
 */
export type CorpusCase = ExprCase | CellCase;
/**
 * 식 칸(Java FunctionSets.Slot). 칸이 허용 함수 집합과 변수 제한을 정한다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "ExprSlot".
 */
export type ExprSlot =
  "DOMAIN_STD" | "DOMAIN_BIZ" | "RULE_COND_EXPR" | "RULE_RESULT_EXPR" | "RULE_EXPR_VAR" | "RULE_GRP_COND";
/**
 * KST 벽시계 초 단위(naming-dialect-rules §3 #16).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "LocalDateTime".
 */
export type LocalDateTime = string;
/**
 * 기대 결과. value 또는 error 중 하나. screenFallback=true 면 화면은 isSupported=false 로 폴백해야 하고 서버 결과만 견준다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "Expect".
 */
export type Expect =
  | {
      value: TypedValue;
      screenFallback?: boolean;
    }
  | {
      error: ErrorCode;
      screenFallback?: boolean;
    };
/**
 * 경고 코드(Java EngineWarning.Code).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "EngineWarningCode".
 */
export type EngineWarningCode = "EXPR_CELL_NULL" | "GRP_COND_NULL" | "BRANCH_COND_NULL";
/**
 * 흐름 노드 종류(Java DefinitionLookup.NodeKind). TASK = 빈 단계(4단계 spec §1.1), CATCH = 받는 노드(받는 노드 spec §2).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "FlowNodeKind".
 */
export type FlowNodeKind = "START" | "END" | "RULE" | "TASK" | "IF" | "PARALLEL" | "MERGE" | "CATCH";
/**
 * 받는 노드가 받는 exception 종류(Java flow.CatchKind, 받는 노드 spec §1). NO_RESULT = 결과 없음, INPUT_ERROR = MISSING_KEY·REQUIRED_NULL·TYPE_CONVERSION, EVAL_ERROR = EVALUATION_ERROR, HIT_CONFLICT = UNIQUE_MULTIPLE_HITS·ANY_CONFLICT.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "CatchKind".
 */
export type CatchKind = "NO_RESULT" | "INPUT_ERROR" | "EVAL_ERROR" | "HIT_CONFLICT";
/**
 * 노드 실행 상태(Java RunTrace.NodeStatus). CAUGHT = 받는 노드로 넘긴 RULE(받는 노드 spec §6).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "NodeStatus".
 */
export type NodeStatus = "OK" | "ERROR" | "CAUGHT";
/**
 * IF 갈래 평가 결과(Java RunTrace.BranchOutcome). NOT_EVALUATED = 앞 갈래가 참이었거나 앞 갈래 평가가 오류로 멈춰 평가하지 않음. IF 의 branches 는 늘 나가는 선마다 하나씩, 실행 순서대로 있다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "BranchOutcome".
 */
export type BranchOutcome = "TRUE" | "FALSE" | "NULL" | "ERROR" | "NOT_EVALUATED";
/**
 * 판정 단계(Java EngineEvaluationException.Stage, 06:212-217 + 세트 사전 검사 + IF 갈래 고르기).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "ViolationStage".
 */
export type ViolationStage =
  "SET_CHECK" | "INPUT_CHECK" | "ROW_SELECT" | "RESULT_CHECK" | "RESULT_EVAL" | "BRANCH_SELECT";

/**
 * 정본 위치 = 이 파일(TSK-03-01). 원본 초안은 docs/mdm/engine-contract/schema/. 서버 엔진(Java)과 화면 JS 평가기(TS)가 주고받는 JSON 모양의 정본. Java record·TS 타입은 이 스키마에서 나온다(엔진 EngineContractSchemaTest 가 Java 를, m-mdm 생성 스크립트가 TS 를 맞춘다). 숫자는 전부 문자열이다(06:1038).
 */
export interface EngineContract {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "AstNumberLiteral".
 */
export interface AstNumberLiteral {
  type: "NUMBER_LITERAL";
  value: string;
}
/**
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "AstStringLiteral".
 */
export interface AstStringLiteral {
  type: "STRING_LITERAL";
  value: string;
}
/**
 * 변수 또는 상수(TRUE/FALSE/NULL/PI/E …). 상수가 변수보다 먼저다(evalex-guide §8.3).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "AstVariable".
 */
export interface AstVariable {
  type: "VARIABLE_OR_CONSTANT";
  value: string;
}
/**
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "AstPrefix".
 */
export interface AstPrefix {
  type: "PREFIX_OPERATOR";
  value: PrefixOperator;
  /**
   * @minItems 1
   * @maxItems 1
   */
  params: [AstNode];
}
/**
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "AstInfix".
 */
export interface AstInfix {
  type: "INFIX_OPERATOR";
  value: InfixOperator;
  /**
   * @minItems 2
   * @maxItems 2
   */
  params: [AstNode, AstNode];
}
/**
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "AstFunction".
 */
export interface AstFunction {
  type: "FUNCTION";
  value: string;
  /**
   * @minItems 1
   */
  params?: [AstNode, ...AstNode[]];
}
/**
 * 서버·화면 정합성 코퍼스(06:284-296, evalex-guide §8.5 2항). 양쪽 러너(JUnit·Vitest)가 같은 파일을 읽는다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "CorpusFile".
 */
export interface CorpusFile {
  version: 1;
  /**
   * @minItems 1
   */
  cases: [CorpusCase, ...CorpusCase[]];
}
/**
 * 자유 식 — 서버는 expr 을 EvalEx 로, 화면은 ast 를 인터프리터로 평가한다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "ExprCase".
 */
export interface ExprCase {
  id: string;
  kind: "expr";
  slot?: ExprSlot;
  expr: string;
  ast: AstNode;
  vars: {
    [k: string]: TypedValue;
  };
  evalTs?: LocalDateTime;
  codeSets?: CodeSets;
  expect: Expect;
}
/**
 * 화면이 받아 둔 카테고리 코드 집합. 키는 '마루코드ID|카테고리ID'. 서버 러너는 키마다 가짜 사본을 합성한다 — CodeLookup(헤더 INUSE, RELEASED 버전 1.000 하나를 전 기간 열어 두고 집합의 코드를 ITEM 행으로)과 CodeEffLookup(id, 1.000, cate → 집합). 없는 id 는 마루 데이터 대상(MasterLookup.NONE)이다(design §6.10).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "CodeSets".
 */
export interface CodeSets {
  [k: string]: string[];
}
/**
 * op-code 셀 — 서버는 생성 텍스트를 EvalEx 로, 화면은 셀 구조를 직접 견준다(06:271·284).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "CellCase".
 */
export interface CellCase {
  id: string;
  kind: "cell";
  variable: {
    name: string;
    dataType: "NUMBER" | "STRING" | "BOOLEAN";
    /**
     * 일자 String(YYYYMMDD·YYYYMM·YYYY) 도메인
     */
    dateString?: boolean;
    /**
     * 코드 도메인 변수의 마루 코드(CODE_IN 용)
     */
    maruCodeId?: string;
  };
  cell: CellJson;
  /**
   * = 패턴이 정규식형일 때 서버가 저장 응답으로 준 정규식(06:267)
   */
  patternRegex?: string;
  value: TypedValue;
  evalTs?: LocalDateTime;
  codeSets?: CodeSets;
  expect: Expect;
}
/**
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "VarType".
 */
export interface VarType {
  name: string;
  dataType: DataType;
  scale?: number | null;
  domainId?: string | null;
}
/**
 * 입력 계약(06:202-230). 스냅샷에 실리고 정의 조회 CONTRACT 로도 나간다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "InputContract".
 */
export interface InputContract {
  always: VarType[];
  rows: RowContract[];
}
/**
 * 행마다 필요한 입력(06:202-230).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "RowContract".
 */
export interface RowContract {
  rowId: number;
  cond: string;
  required: VarType[];
  optional: VarType[];
}
/**
 * 룰 판정 결과(Java RuleResult 의 JSON 모양). 값 테스트 API·판정 서비스 응답.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "RuleResult".
 */
export interface RuleResult {
  ruleId: string;
  ver: number;
  evalTs: LocalDateTime;
  hits: RuleHit[];
  defaultApplied: boolean;
  results: {
    [k: string]: TypedValue;
  };
  trace: RowTrace[];
  warnings: EngineWarning[];
}
/**
 * 적중 행(Java RuleResult.Hit). groupChoices 는 res_grp → 고른 열의 var_id, 고른 열이 없으면 null(06:69).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "RuleHit".
 */
export interface RuleHit {
  rowId: number;
  seq: number;
  groupChoices: {
    [k: string]: number | null;
  };
}
/**
 * 평가한 행마다 적중 여부와 첫 거짓 셀(Java RuleResult.RowTrace, 06:319).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "RowTrace".
 */
export interface RowTrace {
  rowId: number;
  seq: number;
  evaluated: boolean;
  hit: boolean;
  firstFalseVarId: number | null;
}
/**
 * 판정을 멈추지 않는 경고(Java EngineWarning, 06:200·425·427).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "EngineWarning".
 */
export interface EngineWarning {
  code: EngineWarningCode;
  ruleId?: string | null;
  rowId?: number | null;
  varId?: number | null;
  message: string;
}
/**
 * 룰 세트 판정 결과(Java RuleSetResult, 06:429 + 룰 세트 흐름도 spec §4.1 + 받는 노드 spec §6). steps 는 결과를 쓴 룰마다 결과, finalValues 는 마지막 룰 뒤 결과 변수 전체, path 는 방문한 노드, warnings 는 세트 경고(BRANCH_COND_NULL), caught 는 받는 노드가 받아 처리한 exception(실행 순서), endedBy 는 처리 갈래가 END 로 끝냈을 때 그 CATCH 노드 ID.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "RuleSetResult".
 */
export interface RuleSetResult {
  setId: string;
  evalTs: LocalDateTime;
  steps: RuleResult[];
  finalValues: {
    [k: string]: TypedValue;
  };
  path: PathStep[];
  warnings: EngineWarning[];
  caught: CaughtException[];
  endedBy: string | null;
}
/**
 * 세트에서 방문한 노드 하나(Java RuleSetResult.PathStep). chosenEdgeId 는 IF 에서 고른 선, stepIndex 는 RULE 결과의 steps 자리.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "PathStep".
 */
export interface PathStep {
  nodeId: string;
  kind: FlowNodeKind;
  chosenEdgeId: string | null;
  stepIndex: number | null;
}
/**
 * 받는 노드가 받아 처리한 exception 하나(Java RuleSetResult.CaughtException). code 는 첫 위반 코드, 결과 없음이면 NO_RESULT.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "CaughtException".
 */
export interface CaughtException {
  ruleNodeId: string;
  ruleId: string;
  catchNodeId: string;
  kind: CatchKind;
  code: string;
  message: string;
}
/**
 * 룰 세트 실행 기록(Java RunTrace, 룰 세트 흐름도 spec §4.2). 판정 오류는 던지지 않고 violations 에 담는다. 실행 전 오류면 nodes 가 비었다. edits 는 디버거에서 고친 값을 끼워 다시 실행했을 때만 있고(4단계 spec §2.3), 없으면 키를 뺀다. endedBy 는 받는 노드 처리 갈래가 END 로 끝냈을 때만 있고, 없으면 키를 뺀다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "RunTrace".
 */
export interface RunTrace {
  setId: string;
  evalTs: LocalDateTime;
  input: {
    [k: string]: TypedValue;
  };
  nodes: NodeTrace[];
  finalValues: {
    [k: string]: TypedValue;
  };
  violations: Violation[] | null;
  edits?: TraceEdit[];
  endedBy?: string;
}
/**
 * 노드 하나의 기록(Java RunTrace.NodeTrace). RULE: ruleId·ver·reads·result, IF: branches·chosenEdgeId, PARALLEL: order, MERGE: splitId·merged, TASK: 칸 없이 status 만, ERROR: violations. CAUGHT RULE(받는 노드로 넘긴 룰): violations(결과 없음이면 빈 목록). CATCH: ruleId(실패한 룰)·catchKind·code·message 이고 셋은 CATCH 노드에만 있으며 없으면 키를 뺀다. result 는 OK 인 RULE 노드에만 있고, 값이 없으면 키를 뺀다(null 을 쓰지 않는다).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "NodeTrace".
 */
export interface NodeTrace {
  seq: number;
  nodeId: string;
  kind: FlowNodeKind;
  status: NodeStatus;
  ruleId: string | null;
  ver: number | null;
  reads: {
    [k: string]: TypedValue;
  } | null;
  result?: RuleResult;
  branches: BranchTrace[] | null;
  chosenEdgeId: string | null;
  order: string[] | null;
  splitId: string | null;
  merged: string[] | null;
  violations: Violation[] | null;
  catchKind?: CatchKind;
  code?: string;
  message?: string;
}
/**
 * IF 갈래 선 하나의 평가(Java RunTrace.BranchTrace). message 는 ERROR 원인.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "BranchTrace".
 */
export interface BranchTrace {
  edgeId: string;
  outcome: BranchOutcome;
  message: string | null;
}
/**
 * 판정 오류 하나(Java EngineEvaluationException.Violation). name 은 변수 이름 또는 함수 이름.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "Violation".
 */
export interface Violation {
  stage: ViolationStage;
  code: ErrorCode;
  ruleId?: string | null;
  rowId?: number | null;
  name?: string | null;
  message: string;
}
/**
 * 디버거에서 고친 값 하나(Java RunTrace.TraceEdit, 4단계 spec §2.2). beforeSeq 번째 노드(1부터, NodeTrace.seq 와 같은 수)를 시작하기 직전에 그 노드 범위의 ctx 에 values 를 넣는다. NULL 은 비우기, ctx 에 없던 이름은 추가다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "TraceEdit".
 */
export interface TraceEdit {
  beforeSeq: number;
  nodeId: string;
  values: {
    [k: string]: TypedValue;
  };
}
/**
 * 룰 세트 흐름 정의(Java DefinitionLookup.FlowDefinition, spec §3.3). TB_MDM_RULE_SET.FLOW_JSON 의 nodes·edges 이고 화면 전용 view 는 여기 없다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "RuleSetFlow".
 */
export interface RuleSetFlow {
  version: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}
/**
 * 흐름 노드(Java DefinitionLookup.FlowNode). ruleId 는 RULE 만, splitId 는 MERGE 만 쓴다(받는 룰로 돌아오는 MERGE 는 그 룰 노드 ID). TASK(빈 단계)는 label 만 쓰고 실행 때 그냥 지나간다. CATCH(받는 노드)는 attachTo(붙은 룰 노드 ID)·catches(받을 종류 키)를 쓰고, 두 칸은 CATCH 노드에만 있다.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "FlowNode".
 */
export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  ruleId: string | null;
  splitId: string | null;
  label: string | null;
  attachTo?: string | null;
  catches?: string[] | null;
}
/**
 * 흐름 선(Java DefinitionLookup.FlowEdge). order·cond·otherwise 는 IF·PARALLEL 에서 나가는 선만 쓴다. otherwise=true 는 IF 의 "그 외" 선.
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "FlowEdge".
 */
export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  order: number | null;
  cond: string | null;
  otherwise: boolean;
  label: string | null;
}
/**
 * 판정 오류 응답(Java EngineEvaluationException.violations 의 JSON 모양).
 *
 * This interface was referenced by `EngineContract`'s JSON-Schema
 * via the `definition` "EngineError".
 */
export interface EngineError {
  /**
   * @minItems 1
   */
  violations: [Violation, ...Violation[]];
}
