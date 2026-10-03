/**
 * 단위 계산기 숫자 입력·표시 서식 — React 와 떨어진 순수 모듈.
 * - 입력: 공백은 무시하고, 쉼표는 천 단위 모양(`1,234,567.8`)일 때만 받는다(`1,5`·`1,2,3` 은 숫자가 아니다 — 소수점 쉼표로 잘못 읽히는 것을 막는다).
 *   평문 십진(지수 e±n 허용, 지수 절댓값 1000 이하)만 숫자로 읽는다. decimal.js 는 `Infinity`·`NaN`·`0x1f` 도 받으므로
 *   `new D()` 를 부르기 전에 정규식으로 먼저 거른다. 전각 숫자·쉼표·마침표·부호(FF10~FF19·FF0C·FF0E·FF0B·FF0D)만 반각으로 바꿔 읽는다(NFKC 는 쓰지 않는다).
 * - 표시: 유효숫자 10자리로 반올림(HALF_UP — 호출마다 지정, `D` 설정은 바꾸지 않는다)하고 끝의 0 을 지운다. 정수부에 천 단위 쉼표.
 *   반올림한 값이 1e15 이상이거나 0 이 아니면서 1e-6 미만이면 지수 표기(`1.234568e-7`, `1.5e+15`)를 쓴다.
 *   경계 판정은 반올림 뒤 값으로 한다(999999999999999.95 는 지수 표기, 9.9999999996e-7 은 0.000001).
 * - [⇄] 가 입력 칸에 되먹이는 값은 화면 결과(10자리)가 아니라 유효숫자 17자리의 정밀 값이다(formatExact) — 왕복이 깨지지 않게.
 */
import { D, type Dec } from "@dk-oasis/shared/evalex";

export const SIGNIFICANT_DIGITS = 10;
/** 입력 칸 글자 수 상한(붙여넣기로 긴 글이 들어와도 식 평가가 무거워지지 않게). */
export const MAX_INPUT_LENGTH = 50;
export const INVALID_NUMBER_TEXT = "숫자를 입력하세요";
export const TOO_LARGE_TEXT = "값이 너무 큽니다";
export const TOO_SMALL_TEXT = "값이 너무 작습니다";
/** 목록 줄에서 값이 없을 때(입력이 숫자가 아님) 보이는 글자. */
export const NO_VALUE_TEXT = "–";
/** 입력 지수(e±n)의 절댓값 상한 — 이보다 크면 환산 결과가 decimal.js 의 지수 한계(±9e15)를 넘어 무한대가 될 수 있다. */
export const MAX_INPUT_EXPONENT = 1000;
/** [⇄] 가 입력으로 되먹이는 정밀 값의 유효숫자. 계산(68자리)보다 적지만 10자리 표시·왕복에는 넉넉하다. */
export const EXACT_DIGITS = 17;

const EXP_UPPER = new D("1e15");
const EXP_LOWER = new D("1e-6");

/** 부호·숫자·소수점·지수. 그룹 1 = 가수, 그룹 2 = 지수. */
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(?:[eE]([+-]?\d+))?$/;
/** 천 단위 쉼표 모양 — 첫 묶음은 1~3자리(앞 0 없음), 이어서 3자리 묶음이 하나 이상, 소수부는 선택. 부호는 앞에 하나. */
const THOUSANDS_PATTERN = /^[+-]?[1-9]\d{0,2}(?:,\d{3})+(?:\.\d*)?$/;

export type ParsedNumber =
  | { ok: true; value: Dec }
  | { ok: false; reason: "empty" | "invalid" | "tooLarge" | "tooSmall" };

/** 전각 숫자(FF10~FF19)·쉼표(FF0C)·마침표(FF0E)·부호(FF0B·FF0D)와 유니코드 마이너스(U+2212)만 반각으로 바꾼다. */
function normalizeChars(text: string): string {
  return text.replace(/[\uFF10-\uFF19\uFF0C\uFF0E\uFF0B\uFF0D\u2212]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xff10 + 0x30);
    switch (c) {
      case "\uFF0C":
        return ",";
      case "\uFF0E":
        return ".";
      case "\uFF0B":
        return "+";
      default:
        return "-"; // FF0D·U+2212
    }
  });
}

/**
 * 입력 글 → 숫자. 공백(전각 공백 포함)은 지우고 전각 숫자·부호·쉼표·마침표는 반각으로 본다.
 * 쉼표는 천 단위 모양일 때만 지우고 그 밖의 쉼표는 숫자가 아니다. 지수 절댓값이 1000 을 넘으면 tooLarge·tooSmall.
 */
export function parseNumberInput(text: string): ParsedNumber {
  const compact = normalizeChars(text).replace(/\s/g, "");
  if (compact === "") return { ok: false, reason: "empty" };
  let cleaned = compact;
  if (compact.includes(",")) {
    if (!THOUSANDS_PATTERN.test(compact)) return { ok: false, reason: "invalid" };
    cleaned = compact.replace(/,/g, "");
  }
  const match = NUMBER_PATTERN.exec(cleaned);
  if (!match) return { ok: false, reason: "invalid" };
  const exponent = match[2] === undefined ? 0 : Number(match[2]);
  if (Math.abs(exponent) > MAX_INPUT_EXPONENT) {
    if (!/[1-9]/.test(match[1])) return { ok: true, value: new D(0) }; // 0e5000 — 값은 0
    return { ok: false, reason: exponent > 0 ? "tooLarge" : "tooSmall" };
  }
  const value = new D(cleaned);
  if (!value.isFinite()) return { ok: false, reason: "invalid" }; // 방어 — 위 상한으로 여기까지 오지 않는다
  return { ok: true, value };
}

/** 천 단위 쉼표 — 정수부 숫자 글자에만 넣는다(부호·소수부는 건드리지 않는다). */
function group(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 결과 서식(10자리). `grouping=false` 면 쉼표를 넣지 않는다(복사용 — [⇄] 가 입력으로 잇는 값은 formatExact).
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

/**
 * [⇄] 가 입력 칸에 되먹이는 정밀 값 — 유효숫자 17자리(HALF_UP), 끝의 0 없음, 쉼표 없음.
 * 표시용 formatNumber 와 같은 지수 표기 경계(1e15 이상·1e-6 미만)를 쓴다. decimal.js 의 `toString()` 은 자기 임계값(±7 승)으로
 * 표기를 정하므로 쓰지 않는다(`1e16` 이 `10000000000000000` 으로 나온다). 읽을 수 없는 값(지수 절댓값 > 1000)은 빈 글.
 */
export function formatExact(value: Dec): string {
  if (!value.isFinite()) return "";
  if (value.isZero()) return "0";
  const rounded = value.toSignificantDigits(EXACT_DIGITS, D.ROUND_HALF_UP);
  const abs = rounded.abs();
  const text = abs.gte(EXP_UPPER) || abs.lt(EXP_LOWER) ? rounded.toExponential() : rounded.toFixed();
  return parseNumberInput(text).ok ? text : "";
}
