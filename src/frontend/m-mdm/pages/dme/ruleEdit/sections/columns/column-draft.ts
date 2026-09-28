/**
 * 열 설정 초안(TSK-08-03 design §2.1) — 순수 함수. 초안 모델·줄별 검사·원자 적용 계산·seq 이동·dirty 판정.
 *
 * 검사 규칙은 서버 `RuleColumnsService.check()` 와 같은 목록이다(`COLUMN_RULES` 의 `serverMessage` 가 Java 소스에 있는지
 * `column-draft.test.ts` 가 대조한다, 수용 1). 식 파싱은 서버 EvalEx 가 단일 진원이라(불변 9) 이 파일에는 파서가 없다:
 * 식이 참조하는 변수는 서버 `parseExpr` 응답(`ColumnDraftContext.parsed`)만 읽고, 응답이 아직 없으면 판정을 미룬다(저장 때 서버 기준).
 */
import { EVAL_TS, RESERVED_CONSTANTS, RESERVED_PREFIX } from "@/evalex/contract-constants";

import type { ExprSlot } from "../../api";
import type { HitPolicyCode, ResolvedVar, RuleEditView, StoredDispType, StoredRow, VarCandidate } from "../../types";

type DataTypeCode = "BOOLEAN" | "NUMBER" | "STRING" | "DATE";

export interface ColumnDraftRow {
  /** 화면 안에서만 쓰는 고유 키 — 기존 열은 `v{varId}`, 새 열은 `n{번호}`. */
  key: string;
  /** 기존 열의 var_id, 새 열은 null. */
  varId: number | null;
  varKind: "COND" | "RESULT";
  dispType: StoredDispType;
  /** 조건 열은 변수 이름, 결과 열은 결과 변수명 — 이름만 적는다(2026-09-28). Expression 조건 열은 식을 행 칸마다 적으므로 비운다. */
  varName: string;
  label: string;
  /** 도메인으로 선언한 값 타입(저장 원값). */
  domainId: number | null;
  /** 기본 타입으로 선언한 값 타입(저장 원값). */
  dataType: DataTypeCode | null;
  /** 도메인이 정한 타입 — 그룹 안 타입 일치 검사용(화면 전용, 저장하지 않는다). */
  domainType: DataTypeCode | null;
  /** 도메인 이름 — 도메인 칸 표시용(화면 전용, 저장하지 않는다). */
  domainName: string | null;
  axis: "NONE" | "ROW" | "COL" | null;
  resGrp: string;
  grpCond: string;
  collectAgg: string;
  prioList: string[];
  description: string;
  /** 산출 룰 결과 식(그 열의 결과 셀에 반영한다). */
  expr: string;
  deleted: boolean;
}

/** 서버 파싱 결과 캐시 — 참조 변수 또는 서버 오류 문구. */
export type ParsedRef = { refVars: string[]; error?: undefined } | { error: string; refVars?: undefined };

export interface ColumnDraftContext {
  ruleKind: "DECISION" | "DERIVE";
  hitPolicy: HitPolicyCode | null;
  candidates: VarCandidate[];
  /** 서버에서 불러온 그대로의 초안(셀 비움 판정의 기준). */
  baseline: ColumnDraftRow[];
  storedRows: StoredRow[];
  /** `parsedKey(slot,text)` → 서버 parseExpr 결과. */
  parsed: Record<string, ParsedRef>;
}

export type CheckSeverity = "REJECT" | "WARN";

export interface ColumnCheck {
  code: string;
  severity: CheckSeverity;
  message: string;
  key: string;
}

export interface ColumnRule {
  code: string;
  /** 서버 RuleColumnsService 의 reject 문구 조각 — Java 소스에 그대로 있어야 한다. */
  serverMessage: string;
}

/** 화면 검사표 — 서버 `check()` 순서. 서버만 지키는 검사는 테스트의 SERVER_ONLY_MESSAGES 에 있다. */
export const COLUMN_RULES: readonly ColumnRule[] = [
  { code: "KIND", serverMessage: "구분은 COND·RESULT 중 하나여야 합니다" },
  { code: "NAME_REQUIRED", serverMessage: "은(는) 필수입니다" },
  { code: "DISP_TYPE", serverMessage: "표시 타입은 " },
  { code: "DERIVE_NO_COND", serverMessage: "산출 룰에는 조건 열을 둘 수 없습니다" },
  { code: "DERIVE_EXPR_ONLY", serverMessage: "산출 룰의 결과 열은 식(Expression)이어야 합니다" },
  { code: "AXIS_COND_ONLY", serverMessage: "축(axis)은 조건 열에만 둡니다" },
  { code: "AXIS_VALUE", serverMessage: "축은 ROW·COL·NONE 중 하나여야 합니다" },
  { code: "GRP_RESULT_ONLY", serverMessage: "그룹과 열 조건은 결과 열에만 둡니다" },
  { code: "EXPR_DERIVE_ONLY", serverMessage: "결과 식은 산출 룰의 결과 열에만 둡니다" },
  { code: "RESULT_TYPE_REQUIRED", serverMessage: "결과 열은 값 타입(도메인 또는 기본 타입)을 선언해야 합니다" },
  { code: "EXPR_LABEL", serverMessage: "Expression 조건 열은 표시명이 필수입니다" },
  { code: "EXPR_NAME_EMPTY", serverMessage: "Expression 조건 열은 변수 칸을 비웁니다" },
  { code: "NAME_FORMAT", serverMessage: "변수 칸에는 이름만 적습니다" },
  { code: "AGG_COLLECT", serverMessage: "집계는 COLLECT 적중 정책의 결과 열에만 둡니다" },
  { code: "PRIO_PRIORITY", serverMessage: "순위는 PRIORITY 적중 정책의 결과 열에만 둡니다" },
  { code: "RESERVED_NAME", serverMessage: "쓸 수 없는 변수명입니다" },
  { code: "PROG_TYPE", serverMessage: "프로그램 변수는 값 타입을 선언해야 합니다" },
  { code: "RESULT_NAME_DUP", serverMessage: "결과 변수명이 버전 안에서 중복됩니다" },
  { code: "GRP_POLICY", serverMessage: "결과 열 그룹은 FIRST·UNIQUE 적중 정책에서만 둘 수 있습니다" },
  { code: "GRP_COND_NO_GROUP", serverMessage: "그룹에 든 결과 열에만 열 조건을 둘 수 있습니다" },
  { code: "GRP_MIN2", serverMessage: "은(는) 열이 2개 이상이어야 합니다" },
  { code: "GRP_TYPE", serverMessage: "의 데이터 타입이 서로 다릅니다" },
  { code: "GRP_DEFAULT_ONE", serverMessage: "의 기본 열(열 조건 없음)은 하나여야 합니다" },
  { code: "GRP_DEFAULT_LAST", serverMessage: "의 기본 열은 그룹의 마지막 순서여야 합니다" },
  { code: "GRP_NAME_CLASH", serverMessage: "과(와) 같은 그룹 밖 결과 변수명이 있습니다" },
  { code: "GRP_COND_REF", serverMessage: "열 조건의 참조 변수가 컬럼 사전·앞 룰 결과에 없습니다" },
  { code: "DERIVE_NO_ROWS", serverMessage: "산출 룰에는 결과 식을 둘 NORMAL 행이 없습니다" },
  { code: "DERIVE_SELF_REF", serverMessage: "결과 식은 자기 자신·뒤 순서의 결과 변수를 참조할 수 없습니다" },
  { code: "EXPR_PARSE", serverMessage: "식을 파싱할 수 없습니다" },
];

const MESSAGE = Object.fromEntries(COLUMN_RULES.map((r) => [r.code, r.serverMessage])) as Record<string, string>;

const COND_DISPS: readonly string[] = ["Equal", "1", "2", "Expression"];
const RESULT_DISPS: readonly string[] = ["Value", "Expression"];
const AXES: readonly string[] = ["ROW", "COL", "NONE"];
/** 변수 칸에 쓸 수 있는 이름 — 서버 `RuleColumnsService.VAR_NAME` 과 같다. */
const VAR_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED_UPPER = new Set<string>(RESERVED_CONSTANTS);

export function parsedKey(slot: ExprSlot, text: string): string {
  return `${slot}:${text}`;
}

export function columnDraftStorageKey(ruleId: string, ver: number): string {
  return `mdm-ruleEdit-colDraft:${ruleId}:${ver}`;
}

// ── 초안 모델 ──

function cellsOf(row: StoredRow): Record<string, Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(row.cells);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Record<string, unknown>>) : {};
  } catch {
    return {};
  }
}

/** view → 초안. 조건 열이 먼저, 각 묶음은 seq 순. 저장 원값은 `varMeta` 에서 읽는다(해석값을 되돌려 보내면 사전 타입이 선언 타입으로 바뀐다). */
export function draftFromView(view: RuleEditView): ColumnDraftRow[] {
  const metaOf = new Map((view.varMeta ?? []).map((m) => [m.varId, m]));
  const byOrder = (a: ResolvedVar, b: ResolvedVar) => a.seq - b.seq || a.varId - b.varId;
  const ordered = [
    ...view.vars.filter((v) => v.varKind === "COND").sort(byOrder),
    ...view.vars.filter((v) => v.varKind === "RESULT").sort(byOrder),
  ];
  const firstNormal = view.rows.find((r) => r.rowKind === "NORMAL");
  const firstCells = firstNormal ? cellsOf(firstNormal) : {};
  return ordered.map((v) => {
    const m = metaOf.get(v.varId);
    const derive = view.rule.ruleKind === "DERIVE" && v.varKind === "RESULT";
    const domainId = m?.domainId ?? null;
    return {
      key: `v${v.varId}`,
      varId: v.varId,
      varKind: v.varKind,
      dispType: v.dispType ?? (v.varKind === "COND" ? "Equal" : "Value"),
      varName: v.varName ?? "",
      label: v.label ?? "",
      domainId,
      // varMeta 가 없는 응답(옛 서버)이면 선언 타입만 해석값에서 복원한다 — 사전·도메인 해석값은 되돌려 보내지 않는다.
      dataType: m ? (m.dataType ?? null) : v.typeSource === "DECLARED" ? v.dataType : null,
      domainType: domainId != null ? v.dataType : null,
      domainName: domainId != null ? (v.domainName ?? null) : null,
      axis: v.varKind === "COND" ? (m?.axis ?? "NONE") : null,
      resGrp: m?.resGrp ?? "",
      grpCond: m?.grpCond ?? "",
      collectAgg: m?.collectAgg ?? "",
      prioList: m?.prioList ?? [],
      description: v.description ?? "",
      expr: derive ? String(firstCells[String(v.varId)]?.expr ?? "") : "",
      deleted: false,
    };
  });
}

export function newColumn(kind: "COND" | "RESULT", key: string): ColumnDraftRow {
  return {
    key,
    varId: null,
    varKind: kind,
    dispType: kind === "COND" ? "Equal" : "Value",
    varName: "",
    label: "",
    domainId: null,
    dataType: null,
    domainType: null,
    domainName: null,
    axis: kind === "COND" ? "NONE" : null,
    resGrp: "",
    grpCond: "",
    collectAgg: "",
    prioList: [],
    description: "",
    expr: "",
    deleted: false,
  };
}

/** 칸 편집을 반영한 줄 — Expression 조건 열이 되면 변수 칸을 비운다(식은 행 칸마다 적는다, 2026-09-28). */
export function patchColumn(row: ColumnDraftRow, change: Partial<ColumnDraftRow>): ColumnDraftRow {
  const next = { ...row, ...change };
  return isExprCondColumn(next) && next.varName !== "" ? { ...next, varName: "" } : next;
}

/** 새 열을 자기 묶음의 끝에 넣는다(조건 열은 마지막 조건 열 뒤, 결과 열은 맨 끝). */
export function addColumn(rows: ColumnDraftRow[], kind: "COND" | "RESULT", key: string): ColumnDraftRow[] {
  const fresh = newColumn(kind, key);
  if (kind === "RESULT") return [...rows, fresh];
  const lastCond = rows.map((r) => r.varKind).lastIndexOf("COND");
  const at = lastCond + 1;
  return [...rows.slice(0, at), fresh, ...rows.slice(at)];
}

/** 같은 묶음(조건/결과) 안의 이웃과 자리를 바꾼다 — 묶음 경계는 넘지 못한다. seq 는 배열 순서다. */
export function moveColumn(rows: ColumnDraftRow[], key: string, dir: -1 | 1): { rows: ColumnDraftRow[]; moved: boolean } {
  const at = rows.findIndex((r) => r.key === key);
  if (at < 0) return { rows, moved: false };
  const to = at + dir;
  if (to < 0 || to >= rows.length || rows[to].varKind !== rows[at].varKind) return { rows, moved: false };
  const next = [...rows];
  [next[at], next[to]] = [next[to], next[at]];
  return { rows: next, moved: true };
}

/** 저장 안 한 변경 여부 — baseline 과 다르면 dirty. */
export function isColumnDraftDirty(rows: ColumnDraftRow[], baseline: ColumnDraftRow[]): boolean {
  return JSON.stringify(rows) !== JSON.stringify(baseline);
}

/** 열 설정 초안이 있으면 표 저장을 막는다(불변 13 — 초안 버리기·적용으로만 풀린다). */
export function tableSaveBlocked(colDirty: boolean): boolean {
  return colDirty;
}

/** 열 설정 초안이 있으면 열 머리 드래그도 막는다(불변 13). */
export function columnDragBlocked(colDirty: boolean): boolean {
  return colDirty;
}

// ── 검사 ──

function isReservedName(name: string): boolean {
  const upper = name.toUpperCase();
  return RESERVED_UPPER.has(upper) || upper === EVAL_TS || name.startsWith(RESERVED_PREFIX);
}

/** 도메인 또는 기본 타입으로 선언한 값 타입. */
function declaredType(row: ColumnDraftRow): DataTypeCode | null {
  return row.domainId != null ? row.domainType : row.dataType;
}

function known(ctx: ColumnDraftContext, name: string): boolean {
  return ctx.candidates.some((c) => c.name === name);
}

function nonEmpty(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/** 행 칸마다 식을 적는 조건 열 — 변수 칸이 비고 표시명으로 가리킨다(06:1011). */
export function isExprCondColumn(row: Pick<ColumnDraftRow, "varKind" | "dispType">): boolean {
  return row.varKind === "COND" && row.dispType === "Expression";
}

/** 검사 문구·알림에 쓰는 열 이름 — 서버 `nameOf` 와 같다(변수 칸 → 표시명 → "Expression 열"). */
export function columnTitle(row: ColumnDraftRow): string {
  return nonEmpty(row.varName) ?? nonEmpty(row.label) ?? "Expression 열";
}

export interface ColumnCheckResult {
  byKey: Record<string, ColumnCheck[]>;
  /** 화면 표시 순서대로 모은 거부. */
  rejects: ColumnCheck[];
}

/** 줄별 검사 — 서버 check() 첫 루프(모든 줄, 삭제 줄 포함)와 같은 순서. */
function checkRow(row: ColumnDraftRow, ctx: ColumnDraftContext, out: (code: string, detail?: string) => void): void {
  const cond = row.varKind === "COND";
  const derive = ctx.ruleKind === "DERIVE";
  const exprColumn = isExprCondColumn(row);
  const varName = nonEmpty(row.varName);
  if (row.varKind !== "COND" && row.varKind !== "RESULT") {
    out("KIND", `: ${row.varKind}`);
    return;
  }
  if (varName == null && !exprColumn) {
    out("NAME_REQUIRED", `${cond ? "조건 변수" : "결과 변수명"}은(는) 필수입니다.`);
    return;
  }
  const name = columnTitle(row);
  const disps = cond ? COND_DISPS : RESULT_DISPS;
  if (!disps.includes(row.dispType)) out("DISP_TYPE", `표시 타입은 ${disps.join("·")} 중 하나여야 합니다: ${row.dispType}`);
  if (derive && cond) out("DERIVE_NO_COND", `산출 룰에는 조건 열을 둘 수 없습니다: ${name}`);
  if (derive && row.dispType !== "Expression") out("DERIVE_EXPR_ONLY", `산출 룰의 결과 열은 식(Expression)이어야 합니다: ${name}`);
  if (row.axis != null) {
    if (!cond) out("AXIS_COND_ONLY", `축(axis)은 조건 열에만 둡니다: ${name}`);
    else if (!AXES.includes(row.axis)) out("AXIS_VALUE", `축은 ROW·COL·NONE 중 하나여야 합니다: ${row.axis}`);
  }
  if (cond && (nonEmpty(row.resGrp) != null || nonEmpty(row.grpCond) != null)) {
    out("GRP_RESULT_ONLY", `그룹과 열 조건은 결과 열에만 둡니다: ${name}`);
  }
  if (nonEmpty(row.expr) != null && !derive) out("EXPR_DERIVE_ONLY", `결과 식은 산출 룰의 결과 열에만 둡니다: ${name}`);
  if (!cond && row.domainId == null && row.dataType == null) {
    out("RESULT_TYPE_REQUIRED", `결과 열은 값 타입(도메인 또는 기본 타입)을 선언해야 합니다: ${name}`);
  }
  if (exprColumn && nonEmpty(row.label) == null) out("EXPR_LABEL", `Expression 조건 열은 표시명이 필수입니다: ${name}`);
  if (exprColumn && varName != null) out("EXPR_NAME_EMPTY", `Expression 조건 열은 변수 칸을 비웁니다(식은 행 칸마다 적습니다): ${name}`);
  if (!exprColumn && varName != null && !VAR_NAME.test(varName)) {
    out("NAME_FORMAT", `변수 칸에는 이름만 적습니다(영문자로 시작하는 영문·숫자·_): ${name}`);
  }
  if (nonEmpty(row.collectAgg) != null && ctx.hitPolicy !== "COLLECT") {
    out("AGG_COLLECT", `집계는 COLLECT 적중 정책의 결과 열에만 둡니다: ${name}`);
  }
  if (row.prioList.length > 0 && ctx.hitPolicy !== "PRIORITY") out("PRIO_PRIORITY", `순위는 PRIORITY 적중 정책의 결과 열에만 둡니다: ${name}`);
  if (cond && !exprColumn && varName != null && isReservedName(varName)) out("RESERVED_NAME", `쓸 수 없는 변수명입니다(EvalEx 상수·예약어): ${name}`);
}

/** 초안 전체 검사 — 줄별 검사 뒤 남은 열(삭제 제외)에 대한 타입·이름·그룹·산출 식 검사. */
export function checkColumnDraft(rows: ColumnDraftRow[], ctx: ColumnDraftContext): ColumnCheckResult {
  const byKey: Record<string, ColumnCheck[]> = {};
  const rejects: ColumnCheck[] = [];
  const push = (key: string, code: string, message: string, severity: CheckSeverity = "REJECT") => {
    const check: ColumnCheck = { code, severity, message, key };
    (byKey[key] ??= []).push(check);
    if (severity === "REJECT") rejects.push(check);
  };
  const derive = ctx.ruleKind === "DERIVE";

  for (const row of rows) {
    checkRow(row, ctx, (code, detail) => push(row.key, code, detail ?? MESSAGE[code]));
  }
  const kept = rows.filter((r) => !r.deleted);

  // 타입 해석 — 프로그램 변수(사전·앞 룰 결과 아님)는 값 타입 선언이 필수(서버 resolveTypes 와 같은 판정).
  for (const row of kept) {
    const name = nonEmpty(row.varName);
    if (row.varKind === "COND" && row.dispType !== "Expression" && name != null && !known(ctx, name) && row.domainId == null && row.dataType == null) {
      push(row.key, "PROG_TYPE", `프로그램 변수는 값 타입을 선언해야 합니다(사전 물리명이 아니면 도메인·기본 타입 필수): ${name}`);
    }
    // 식 파싱 오류는 서버 응답 문구 그대로 거부 사유가 된다(화면은 식을 파싱하지 않는다).
    for (const [slot, text] of exprsOf(row)) {
      const parsed = ctx.parsed[parsedKey(slot, text)];
      if (parsed?.error) push(row.key, "EXPR_PARSE", parsed.error);
    }
  }

  // 결과 변수명 유일.
  const names = new Set<string>();
  for (const row of kept) {
    const name = nonEmpty(row.varName);
    if (row.varKind !== "RESULT" || name == null) continue;
    if (names.has(name)) push(row.key, "RESULT_NAME_DUP", `결과 변수명이 버전 안에서 중복됩니다: ${name}`);
    names.add(name);
  }

  checkGroups(kept, ctx, push);
  if (derive) checkDerive(kept, ctx, push);
  return { byKey, rejects };
}

/** 행이 가진 식 칸(slot, 텍스트) — 서버 파싱 호출 대상. 조건 열에는 식 칸이 없다(변수 칸은 이름만, 2026-09-28). */
export function exprsOf(row: ColumnDraftRow): Array<[ExprSlot, string]> {
  const out: Array<[ExprSlot, string]> = [];
  if (row.varKind === "RESULT" && nonEmpty(row.grpCond)) out.push(["RULE_GRP_COND", row.grpCond.trim()]);
  if (row.varKind === "RESULT" && nonEmpty(row.expr)) out.push(["RULE_RESULT_EXPR", row.expr.trim()]);
  return out;
}

type Push = (key: string, code: string, message: string, severity?: CheckSeverity) => void;

function checkGroups(kept: ColumnDraftRow[], ctx: ColumnDraftContext, push: Push): void {
  const results = kept.filter((r) => r.varKind === "RESULT");
  const grouped = results.some((r) => nonEmpty(r.resGrp) != null);
  if (grouped && ctx.hitPolicy !== "FIRST" && ctx.hitPolicy !== "UNIQUE") {
    const first = results.find((r) => nonEmpty(r.resGrp) != null)!;
    push(first.key, "GRP_POLICY", `결과 열 그룹은 FIRST·UNIQUE 적중 정책에서만 둘 수 있습니다: ${ctx.hitPolicy ?? "없음"}`);
  }
  const groups = new Map<string, ColumnDraftRow[]>();
  for (const r of results) {
    const g = nonEmpty(r.resGrp);
    if (g == null) {
      if (nonEmpty(r.grpCond) != null) push(r.key, "GRP_COND_NO_GROUP", `그룹에 든 결과 열에만 열 조건을 둘 수 있습니다: ${r.varName}`);
      continue;
    }
    const list = groups.get(g) ?? [];
    list.push(r);
    groups.set(g, list);
  }
  for (const [name, cols] of groups) {
    if (cols.length < 2) push(cols[0].key, "GRP_MIN2", `결과 열 그룹 '${name}' 은(는) 열이 2개 이상이어야 합니다.`);
    let type: DataTypeCode | null = null;
    let defaults = 0;
    let defaultLast = false;
    cols.forEach((c, i) => {
      const t = declaredType(c);
      if (type == null) type = t;
      else if (t != null && t !== type) push(c.key, "GRP_TYPE", `결과 열 그룹 '${name}' 의 데이터 타입이 서로 다릅니다: ${type} vs ${t}`);
      if (nonEmpty(c.grpCond) == null) {
        defaults++;
        defaultLast = i === cols.length - 1;
      }
    });
    if (defaults > 1) push(cols[0].key, "GRP_DEFAULT_ONE", `결과 열 그룹 '${name}' 의 기본 열(열 조건 없음)은 하나여야 합니다.`);
    if (defaults === 1 && !defaultLast) push(cols[0].key, "GRP_DEFAULT_LAST", `결과 열 그룹 '${name}' 의 기본 열은 그룹의 마지막 순서여야 합니다.`);
    const clash = results.find((r) => nonEmpty(r.resGrp) == null && nonEmpty(r.varName) === name);
    if (clash) push(clash.key, "GRP_NAME_CLASH", `그룹 이름 '${name}' 과(와) 같은 그룹 밖 결과 변수명이 있습니다.`);
  }
  for (const r of results) {
    const cond = nonEmpty(r.grpCond);
    if (cond == null || nonEmpty(r.resGrp) == null) continue;
    const parsed = ctx.parsed[parsedKey("RULE_GRP_COND", cond)];
    if (!parsed?.refVars) continue; // 아직 서버 파싱 전이면 판정을 미룬다 — 저장 때 서버가 기준.
    for (const ref of parsed.refVars) {
      if (!known(ctx, ref)) push(r.key, "GRP_COND_REF", `열 조건의 참조 변수가 컬럼 사전·앞 룰 결과에 없습니다: ${ref}`);
    }
  }
}

function checkDerive(kept: ColumnDraftRow[], ctx: ColumnDraftContext, push: Push): void {
  const results = kept.filter((r) => r.varKind === "RESULT");
  if (!results.some((r) => nonEmpty(r.expr) != null)) return;
  if (!ctx.storedRows.some((r) => r.rowKind === "NORMAL")) {
    push(results.find((r) => nonEmpty(r.expr) != null)!.key, "DERIVE_NO_ROWS", "산출 룰에는 결과 식을 둘 NORMAL 행이 없습니다.");
    return;
  }
  results.forEach((r, i) => {
    const text = nonEmpty(r.expr);
    if (text == null) return;
    const parsed = ctx.parsed[parsedKey("RULE_RESULT_EXPR", text)];
    if (!parsed?.refVars) return;
    for (const ref of parsed.refVars) {
      if (results.slice(i).some((later) => later.varName === ref)) {
        push(r.key, "DERIVE_SELF_REF", `결과 식은 자기 자신·뒤 순서의 결과 변수를 참조할 수 없습니다: ${ref} in ${r.varName}`);
      }
    }
  });
}

// ── 적용 ──

export type ColumnNotice =
  // naFill — Expression 조건 열은 서버가 NORMAL 행을 무관({op:"NA"})으로 채운다(식을 적은 행만 조건이 걸린다, 2026-09-28).
  | { kind: "NEW_COL"; varName: string; count: number; naFill?: true }
  | { kind: "CELLS_CLEARED"; varName: string; count: number; naFill?: true }
  | { kind: "COL_DELETED"; varName: string; count: number };

export type ApplyResult =
  | { ok: true; request: Array<Record<string, unknown>>; notices: ColumnNotice[] }
  | { ok: false; rejects: ColumnCheck[] };

function cellCount(rows: StoredRow[], varId: number): number {
  return rows.filter((r) => r.rowKind === "NORMAL" && cellsOf(r)[String(varId)] !== undefined).length;
}

function lineOf(row: ColumnDraftRow, tempId: number): Record<string, unknown> {
  const cond = row.varKind === "COND";
  const line: Record<string, unknown> = {
    varId: row.varId ?? tempId,
    varKind: row.varKind,
    dispType: row.dispType,
    varName: isExprCondColumn(row) ? null : row.varName.trim(),
    label: nonEmpty(row.label),
    domainId: row.domainId,
    dataType: row.dataType,
    axis: cond ? (row.axis ?? "NONE") : null,
    resGrp: cond ? null : nonEmpty(row.resGrp),
    grpCond: cond ? null : nonEmpty(row.grpCond),
    collectAgg: nonEmpty(row.collectAgg),
    prioList: row.prioList.length > 0 ? row.prioList : null,
    description: nonEmpty(row.description),
    expr: nonEmpty(row.expr),
    deleted: row.deleted ? true : null,
  };
  return Object.fromEntries(Object.entries(line).filter(([, v]) => v !== null && v !== undefined));
}

/**
 * 원자 적용 계산(불변 2) — 거부가 하나라도 있으면 요청 본문 자체를 만들지 않는다. 검사를 통과하면 표시 순서대로 줄을 만들고
 * (seq 는 서버가 조건/결과 묶음별 1..n 으로 다시 매긴다), 표 셀에 미치는 영향을 알림 3종(새 열·셀 비움·삭제)으로 돌려준다(불변 8).
 */
export function applyColumnDraft(rows: ColumnDraftRow[], ctx: ColumnDraftContext): ApplyResult {
  const checked = checkColumnDraft(rows, ctx);
  if (checked.rejects.length > 0) return { ok: false, rejects: checked.rejects };
  const baseline = new Map(ctx.baseline.map((b) => [b.varId, b]));
  const notices: ColumnNotice[] = [];
  const request: Array<Record<string, unknown>> = [];
  let temp = 0;
  for (const row of rows) {
    if (row.varId == null) {
      if (row.deleted) continue; // 만들자마자 지운 열은 서버에 없다.
      temp--;
      request.push(lineOf(row, temp));
      notices.push({ kind: "NEW_COL", varName: columnTitle(row), count: 0, ...(isExprCondColumn(row) ? { naFill: true as const } : {}) });
      continue;
    }
    request.push(lineOf(row, row.varId));
    const old = baseline.get(row.varId);
    if (row.deleted) {
      notices.push({ kind: "COL_DELETED", varName: columnTitle(row), count: cellCount(ctx.storedRows, row.varId) });
    } else if (old && (old.dispType !== row.dispType || (row.varKind === "COND" && old.varName !== row.varName))) {
      const count = cellCount(ctx.storedRows, row.varId);
      if (count > 0) notices.push({ kind: "CELLS_CLEARED", varName: columnTitle(row), count, ...(isExprCondColumn(row) ? { naFill: true as const } : {}) });
    }
  }
  return { ok: true, request, notices };
}
