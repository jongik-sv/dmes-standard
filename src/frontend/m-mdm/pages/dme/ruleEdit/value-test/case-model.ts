/**
 * 테스트 케이스 모델(TSK-08-04 design §6.5·§6.7 ⑥·D12). 결과 → 기대 JSON(`expectedFromResult`)과 케이스 결과 배지 문구.
 * 비교(통과·실패)는 서버가 결과 변수 타입으로 한다(I24). 화면은 기대값을 만들고 서버 비교 결과를 보일 뿐이다.
 *
 * hit 표현: 적중 행 하나 → row_id 숫자, 여럿 → 엔진 hits 순서의 배열, 기본 행 적용 → 기본 행 row_id, 적중도 기본 행도 없음 → null.
 * 숫자 결과(서버 BigDecimal `toPlainString`)는 06 샘플(06:1322 `"PRC_FCT":1.05`)처럼 JSON 숫자로, 글자를 바꾸지 않고 싣는다.
 */
import { badgeStyle } from "@/shell";

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

/** 케이스 결과 배지 — 기대값 없음 "실행만", "통과", "실패 · 불일치 키"(판정 오류면 "실패 · 판정 오류"). */
export function caseBadge(c: Pick<ValueTestCaseResult, "outcome" | "pass" | "mismatches">): CaseBadge {
  if (c.pass === null) return { text: "실행만", tone: "muted" };
  if (c.pass) return { text: "통과", tone: "success" };
  const keys = (c.mismatches ?? []).map((m) => m.key);
  if (keys.length > 0) return { text: `실패 · ${keys.join(", ")}`, tone: "danger" };
  return { text: c.outcome === "ERROR" ? "실패 · 판정 오류" : "실패", tone: "danger" };
}

/** 배지 모양 — 실패는 위험 색, 통과는 성공 색, 실행만은 옅게. */
export function caseBadgeCss(b: CaseBadge) {
  if (b.tone === "danger") return { ...badgeStyle("neutral"), color: "var(--color-danger)", background: "var(--color-danger-soft)" };
  return badgeStyle(b.tone === "success" ? "success" : "muted");
}

function shown(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v ?? null);
}

/** 결과 칸 뒤에 붙는 불일치 글자 — "키 기대 ≠ 실제". */
export function mismatchText(r: Pick<ValueTestCaseResult, "mismatches">): string {
  return r.mismatches.map((m) => `${m.key} ${shown(m.expected)} ≠ ${shown(m.actual)}`).join(" · ");
}

/** 케이스 수정 칸(팝업) — 입력·기대는 JSON 글자 그대로 저장한다(06 키 순서·숫자 표기를 화면이 바꾸지 않는다). */
export interface CaseEditFields {
  caseName: string;
  description: string;
  inputJson: string;
  expectedJson: string;
}

function objectError(text: string, what: string, topic: string): string | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return `${what} JSON 을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`;
  }
  return v !== null && typeof v === "object" && !Array.isArray(v) ? null : `${topic} JSON 객체({ … })여야 합니다.`;
}

/** 저장 전 화면 검사 — 이름 필수, 입력은 JSON 객체, 기대는 비우거나(기대값 없음) JSON 객체. 문제가 없으면 null. */
export function caseEditError(f: CaseEditFields): string | null {
  if (f.caseName.trim() === "") return "이름을 넣으세요.";
  return caseJsonError(f);
}

/** 입력·기대 JSON 검사만(수정 팝업의 "테스트 실행" — 이름 없이도 돌린다). 문제가 없으면 null. */
export function caseJsonError(f: Pick<CaseEditFields, "inputJson" | "expectedJson">): string | null {
  const input = objectError(f.inputJson.trim(), "입력", "입력은");
  if (input) return input;
  return f.expectedJson.trim() === "" ? null : objectError(f.expectedJson.trim(), "기대", "기대는");
}
