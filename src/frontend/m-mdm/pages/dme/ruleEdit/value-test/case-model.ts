/**
 * 테스트 케이스 모델(TSK-08-04 design §6.5·§6.7 ⑥·D12). 결과 → 기대 JSON(`expectedFromResult`)과 케이스 결과 배지 문구.
 * 비교(통과·실패)는 서버가 결과 변수 타입으로 한다(I24). 화면은 기대값을 만들고 서버 비교 결과를 보일 뿐이다.
 *
 * hit 표현: 적중 행 하나 → row_id 숫자, 여럿 → 엔진 hits 순서의 배열, 기본 행 적용 → 기본 행 row_id, 적중도 기본 행도 없음 → null.
 * 숫자 결과(서버 BigDecimal `toPlainString`)는 06 샘플(06:1322 `"PRC_FCT":1.05`)처럼 JSON 숫자로, 글자를 바꾸지 않고 싣는다.
 */
import type { ResolvedVar, ValueTestCaseResult, ValueTestResult, ValueTestValue } from "../types";

/** 06 숫자 리터럴(엔진 `NUMBER_LITERAL`) — 이 모양만 JSON 숫자로 싣는다. */
const NUMBER_TEXT = /^[+-]?\d+(\.\d+)?$/;

export function hitValue(result: ValueTestResult, defaultRowId: number | null): number | number[] | null {
  const hits = result.hits ?? [];
  if (hits.length === 1) return hits[0].rowId;
  if (hits.length > 1) return hits.map((h) => h.rowId);
  return result.defaultApplied && defaultRowId != null ? defaultRowId : null;
}

function literal(v: ValueTestValue | undefined, numeric: boolean): string {
  if (Array.isArray(v)) return `[${v.map((x) => literal(x, numeric)).join(",")}]`;
  if (numeric && typeof v === "string" && NUMBER_TEXT.test(v)) return v.startsWith("+") ? v.slice(1) : v;
  return JSON.stringify(v ?? null);
}

/** 결과 → 기대 JSON(결과 변수 뒤에 hit). 판정 오류 결과면 null(기대값 없이 저장). */
export function expectedFromResult(result: ValueTestResult, vars: readonly ResolvedVar[], defaultRowId: number | null): string | null {
  if (result.outcome !== "OK" || !result.results) return null;
  const numeric = new Set(vars.filter((v) => v.varKind === "RESULT" && v.dataType === "NUMBER" && v.varName).map((v) => v.varName!.toUpperCase()));
  const parts = Object.entries(result.results).map(([k, v]) => `${JSON.stringify(k)}:${literal(v, numeric.has(k.toUpperCase()))}`);
  parts.push(`"hit":${JSON.stringify(hitValue(result, defaultRowId))}`);
  return `{${parts.join(",")}}`;
}

export interface CaseBadge {
  text: string;
  tone: "muted" | "success" | "danger";
}

/** 케이스 결과 배지 — 기대값 없음 "돌려 보기만", "통과", "실패 · 불일치 키"(판정 오류면 "실패 · 판정 오류"). */
export function caseBadge(c: Pick<ValueTestCaseResult, "outcome" | "pass" | "mismatches">): CaseBadge {
  if (c.pass === null) return { text: "돌려 보기만", tone: "muted" };
  if (c.pass) return { text: "통과", tone: "success" };
  const keys = (c.mismatches ?? []).map((m) => m.key);
  if (keys.length > 0) return { text: `실패 · ${keys.join(", ")}`, tone: "danger" };
  return { text: c.outcome === "ERROR" ? "실패 · 판정 오류" : "실패", tone: "danger" };
}
