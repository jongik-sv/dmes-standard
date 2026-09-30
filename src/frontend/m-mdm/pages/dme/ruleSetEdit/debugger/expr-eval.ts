/**
 * 식 즉석 평가(3단계 계획 P11, 스펙 §4.5) — 서버가 파싱한 AST(validate exprText, P-D1)를 커서 시점 ctx 로 화면 evalex 로 평가한다.
 * 식 텍스트를 읽지 않는다(불변 9). 결과는 참고용이고 실행 판정은 서버가 한다. 평가 시각을 받지 않는다(P-D15).
 */
import type { AstNode, DataType, RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";
import { NUMBER_TEXT, convertForType, evaluate, fromTypedValue, type EvalValue } from "@/evalex";

import { flowRuleIds } from "../flow-model";
import type { ExprParse, RuleIoMap } from "../types";

export type ExprResult =
  | { kind: "true" } | { kind: "false" } | { kind: "null" }
  | { kind: "value"; text: string }
  | { kind: "error"; text: string }
  | { kind: "fallback" };
export const FALLBACK_TEXT = "화면에서 계산할 수 없는 식이다";
export const SERVER_JUDGES_TEXT = "참고용이다. 실행 판정은 서버가 한다";

/** `InputRow`·`ResultRow.dataType` 은 `string | null` 이라 `DataType` 목록으로 걸러 넣는다(engine-contract.generated.ts 의 DataType 과 같다). */
function isDataType(v: string | null): v is DataType {
  return v === "STRING" || v === "NUMBER" || v === "BOOLEAN" || v === "DATE";
}

/** 서버 `FlowKeys.declare` 와 같다 — 룰을 흐름 순서로 훑어(룰 안은 입력·결과) 이름마다 처음 나온 non-null 타입을 쓴다. */
export function declaredTypes(flow: RuleSetFlow, rules: RuleIoMap): Record<string, DataType> {
  const out: Record<string, DataType> = {};
  for (const ruleId of flowRuleIds(flow)) {
    const io = rules[ruleId];
    if (!io) continue;
    for (const r of [...(io.conds ?? []), ...(io.results ?? [])]) {
      const key = r.name.toUpperCase();
      if (isDataType(r.dataType) && !(key in out)) out[key] = r.dataType;
    }
  }
  return out;
}

export function evalExpr(parsed: ExprParse, ctx: Readonly<Record<string, TypedValue>>, types: Readonly<Record<string, DataType>>): ExprResult {
  if (parsed.problems.length > 0) return { kind: "error", text: parsed.problems.map((p) => p.detail).join(" / ") };
  if (!parsed.supported) return { kind: "fallback" };
  const refs = new Set(parsed.refVars.map((n) => n.toUpperCase()));
  const scope: Record<string, EvalValue> = {};
  for (const [name, tv] of Object.entries(ctx)) {
    const upper = name.toUpperCase();
    if (tv.type === "LIST") {
      if (refs.has(upper)) return { kind: "fallback" };
      continue;
    }
    let v = fromTypedValue(tv);
    const t = types[upper];
    // 서버 BranchCondition 처럼 식이 쓰는 변수만 선언 타입으로 바꾼다.
    if (t && v !== null && refs.has(upper)) {
      try {
        v = convertForType(v, t);
      } catch {
        return { kind: "error", text: `${name} 값을 ${t} 로 바꾸지 못했다` };
      }
    }
    scope[name] = v;
  }
  const out = evaluate(parsed.ast as AstNode, scope);
  if (out.kind === "fallback") return { kind: "fallback" };
  if (out.kind === "error") return { kind: "error", text: out.message };
  const v = out.value;
  if (v === null) return { kind: "null" };
  if (typeof v === "boolean") return { kind: v ? "true" : "false" };
  if (typeof v === "string") return { kind: "value", text: v };
  return { kind: "value", text: NUMBER_TEXT.get(v) ?? v.toFixed() };
}
