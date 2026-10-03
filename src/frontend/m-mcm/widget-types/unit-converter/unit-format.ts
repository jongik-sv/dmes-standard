/**
 * 단위 계산기 숫자 입력·표시 서식 — React 와 떨어진 순수 모듈.
 * - 입력: 쉼표·공백은 무시하고, 평문 십진(지수 e±n 허용)만 숫자로 읽는다. decimal.js 는 `Infinity`·`NaN`·`0x1f` 도 받으므로
 *   `new D()` 를 부르기 전에 정규식으로 먼저 거른다.
 * - 표시: 유효숫자 10자리로 반올림(HALF_UP — 호출마다 지정, `D` 설정은 바꾸지 않는다)하고 끝의 0 을 지운다. 정수부에 천 단위 쉼표.
 *   반올림한 값이 1e15 이상이거나 0 이 아니면서 1e-6 미만이면 지수 표기(`1.234568e-7`, `1.5e+15`)를 쓴다.
 *   경계 판정은 반올림 뒤 값으로 한다(999999999999999.95 는 지수 표기, 9.9999999996e-7 은 0.000001).
 */
import { D, type Dec } from "@dk-oasis/shared/evalex";

export const SIGNIFICANT_DIGITS = 10;
/** 입력 칸 글자 수 상한(붙여넣기로 긴 글이 들어와도 식 평가가 무거워지지 않게). */
export const MAX_INPUT_LENGTH = 50;
export const INVALID_NUMBER_TEXT = "숫자를 입력하세요";
/** 목록 줄에서 값이 없을 때(입력이 숫자가 아님) 보이는 글자. */
export const NO_VALUE_TEXT = "–";

const EXP_UPPER = new D("1e15");
const EXP_LOWER = new D("1e-6");

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export type ParsedNumber = { ok: true; value: Dec } | { ok: false; reason: "empty" | "invalid" };

/** 입력 글 → 숫자. 쉼표·공백(전각 공백 포함)은 지우고 유니코드 마이너스(−)는 -로 본다. */
export function parseNumberInput(text: string): ParsedNumber {
  const cleaned = text.replace(/[\s,]/g, "").replace(/−/g, "-");
  if (cleaned === "") return { ok: false, reason: "empty" };
  if (!NUMBER_PATTERN.test(cleaned)) return { ok: false, reason: "invalid" };
  const value = new D(cleaned);
  // 지수가 너무 커서 무한대가 되는 경우(1e99999999999999999)
  if (!value.isFinite()) return { ok: false, reason: "invalid" };
  return { ok: true, value };
}

/** 천 단위 쉼표 — 정수부 숫자 글자에만 넣는다(부호·소수부는 건드리지 않는다). */
function group(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 결과 서식. `grouping=false` 면 쉼표를 넣지 않는다(복사·[⇄] 로 입력 칸에 되먹일 때).
 * 지수 표기에는 어느 쪽이든 쉼표를 넣지 않는다.
 */
export function formatNumber(value: Dec, grouping = true): string {
  if (value.isZero()) return "0"; // -0 도 "0"
  const rounded = value.toSignificantDigits(SIGNIFICANT_DIGITS, D.ROUND_HALF_UP);
  const abs = rounded.abs();
  if (abs.gte(EXP_UPPER) || abs.lt(EXP_LOWER)) return rounded.toExponential();
  const plain = rounded.toFixed(); // 정상 표기, 끝 0 없음
  const negative = plain.startsWith("-");
  const body = negative ? plain.slice(1) : plain;
  const dot = body.indexOf(".");
  const intPart = dot < 0 ? body : body.slice(0, dot);
  const fracPart = dot < 0 ? "" : body.slice(dot);
  return (negative ? "-" : "") + (grouping ? group(intPart) : intPart) + fracPart;
}
