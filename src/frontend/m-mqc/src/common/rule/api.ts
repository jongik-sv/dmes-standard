/**
 * 공용 서비스 qcdRule 호출(search·judge·history·codes)과 응답 정리. 응답 빈 칸은 빈 배열·null 로 채워 화면이 다시 검사하지 않게 한다.
 * 가려짐 분석은 shared evalex `analyzeRule`(FIRST 정책의 UNREACHABLE)을 쓴다.
 */
import {
  analyzeRule,
  type CellJson,
  type HitPolicy,
  type RuleDef,
  type RuleRowDef,
  type RuleVarDef,
} from "@dk-oasis/shared/evalex";

import { callOasis } from "../oasis";
import type {
  CodeSet,
  JudgeResult,
  JudgeStatus,
  RuleCell,
  RuleVersion,
  RuleView,
} from "./types";

/** 공용 서비스 ID — 권한키 mqc/qcdRule/{search|judge|history|codes}. */
export const QCD_RULE_SERVICE = "qcdRule";

/** 서버가 한 번에 받는 ID 수(QcdRuleService.MAX_IDS). 넘으면 나눠 부른다. */
export const MAX_IDS_PER_CALL = 40;

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const uniq = (ids: readonly string[]) => [
  ...new Set(ids.map((s) => s.trim()).filter((s) => s !== "")),
];

function normalizeRule(r: Partial<RuleView> & { ruleId: string }): RuleView {
  return {
    ruleId: r.ruleId,
    ver: r.ver ?? null,
    applyFrom: r.applyFrom ?? null,
    hitPolicy: r.hitPolicy ?? null,
    vars: r.vars ?? [],
    rows: (r.rows ?? []).map((row) => ({
      ...row,
      cells: row.cells ?? {},
      results: row.results ?? {},
      summary: row.summary ?? "",
    })),
  };
}

/** 룰 정의 여러 개(평가 시각 evalTs `yyyy-MM-dd HH:mm:ss`, 없으면 지금). 돌려주는 순서는 ruleIds 순서다. */
export async function searchRules(
  ruleIds: readonly string[],
  evalTs?: string,
): Promise<RuleView[]> {
  const ids = uniq(ruleIds);
  if (ids.length === 0) return [];
  const parts = await Promise.all(
    chunks(ids, MAX_IDS_PER_CALL).map((part) =>
      callOasis<{ rules?: (Partial<RuleView> & { ruleId: string })[] }>(
        QCD_RULE_SERVICE,
        "search",
        { ruleIds: part.join(","), evalTs },
      ),
    ),
  );
  return parts.flatMap((p) => (p.rules ?? []).map(normalizeRule));
}

/**
 * 판정 — input 은 변수명 → 값. 서버가 숫자 변수만 숫자로 바꾸고 나머지는 가공하지 않는다.
 * 업무 결과(적중 없음·입력 오류·적용 버전 없음·MDM 불가)는 오류가 아니라 status 로 온다.
 */
export async function judgeRule(
  ruleId: string,
  input: Record<string, string | number>,
  evalTs?: string,
): Promise<JudgeResult> {
  const out = await callOasis<Partial<JudgeResult>>(QCD_RULE_SERVICE, "judge", {
    ruleId,
    inputJson: JSON.stringify(input),
    evalTs,
  });
  return {
    ruleId: out.ruleId ?? ruleId,
    ver: out.ver ?? null,
    evalTs: out.evalTs ?? "",
    status: (out.status ?? "UNAVAILABLE") as JudgeStatus,
    hits: out.hits ?? [],
    results: out.results ?? {},
    defaultApplied: out.defaultApplied ?? false,
    trace: out.trace ?? [],
    message: out.message ?? null,
  };
}

/** 룰 하나의 RELEASED 버전 이력(ver 오름차순). */
export async function ruleHistory(ruleId: string): Promise<RuleVersion[]> {
  const out = await callOasis<{ versions?: RuleVersion[] }>(
    QCD_RULE_SERVICE,
    "history",
    { ruleId },
  );
  return (out.versions ?? []).map((v) => ({
    ...v,
    applyFrom: v.applyFrom ?? null,
    applyTo: v.applyTo ?? null,
    vars: v.vars ?? [],
    rows: (v.rows ?? []).map((row) => ({
      ...row,
      cells: row.cells ?? {},
      results: row.results ?? {},
      summary: row.summary ?? "",
    })),
  }));
}

/** Maru 코드 여러 개의 현재 RELEASED 항목. 돌려주는 순서는 codeIds 순서다. */
export async function searchCodes(
  codeIds: readonly string[],
): Promise<CodeSet[]> {
  const ids = uniq(codeIds);
  if (ids.length === 0) return [];
  const parts = await Promise.all(
    chunks(ids, MAX_IDS_PER_CALL).map((part) =>
      callOasis<{ codes?: CodeSet[] }>(QCD_RULE_SERVICE, "codes", {
        codeIds: part.join(","),
      }),
    ),
  );
  return parts.flatMap((p) =>
    (p.codes ?? []).map((c) => ({
      codeId: c.codeId,
      ver: c.ver ?? null,
      items: (c.items ?? []).map((i) => ({
        ...i,
        lvl: i.lvl ?? [],
        attrs: i.attrs ?? [],
      })),
    })),
  );
}

const HIT_POLICIES: readonly HitPolicy[] = [
  "FIRST",
  "UNIQUE",
  "PRIORITY",
  "COLLECT",
  "ANY",
];

/**
 * 서버 셀 → evalex CellJson. summary 는 엔진 모델에 없어서 뺀다. 서버는 op 마다 필요한 키만 싣고,
 * op 문자열을 CellJson 유니온으로 좁힐 근거는 그 계약뿐이라 이 변환에서만 단언한다.
 */
function toCell(cell: RuleCell): CellJson {
  const { summary: _summary, ...stored } = cell;
  return stored as CellJson;
}

/** 서버 RuleView → shared evalex RuleDef(가려짐 분석용). 적중 정책이 없거나 모르는 값이면 FIRST. */
export function toRuleDef(rule: RuleView): RuleDef {
  const vars: RuleVarDef[] = rule.vars.map((v) => ({
    varId: v.varId,
    varKind: v.kind,
    dispType: v.dispType ?? (v.kind === "RESULT" ? "VALUE" : "ONE"),
    seq: v.seq,
    varName: v.name,
    dataType: v.dataType ?? "STRING",
  }));
  const rows: RuleRowDef[] = rule.rows.map((r) => ({
    rowId: r.rowId,
    seq: r.seq,
    rowKind: r.rowKind,
    cells: Object.fromEntries(
      Object.entries(r.cells).map(([varId, cell]) => [
        Number(varId),
        toCell(cell),
      ]),
    ),
  }));
  return {
    ruleId: rule.ruleId,
    ruleKind: "DECISION",
    hitPolicy: HIT_POLICIES.find((p) => p === rule.hitPolicy) ?? "FIRST",
    vars,
    rows,
  };
}

/** FIRST 정책에서 앞 행에 모두 덮여 적중하지 않는 행 ID. 분석이 실패하면(모르는 셀 모양) 빈 집합 — 표시만 빠지고 화면은 그대로다. */
export function unreachableRowIds(rule: RuleView): Set<number> {
  const out = new Set<number>();
  if (rule.rows.length === 0) return out;
  try {
    for (const issue of analyzeRule(toRuleDef(rule)))
      if (issue.code === "UNREACHABLE" && issue.rowIds.length > 0)
        out.add(issue.rowIds[0]);
  } catch {
    // 분석은 보조 표시다. 실패해도 목록은 보인다.
  }
  return out;
}
