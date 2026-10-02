import Decimal from "decimal.js";

/**
 * EvalEx MathContext(68, HALF_EVEN) — `MdmExpressionConfig.MATH_CONTEXT`. modulo 는 `BigDecimal.remainder` 와 같은 절삭이다.
 * toExpNeg·toExpPos 를 넓혀 `toString()`·`toFixed()` 가 지수 표기를 쓰지 않게 한다.
 */
export const D = Decimal.clone({
  precision: 68,
  rounding: Decimal.ROUND_HALF_EVEN,
  modulo: Decimal.ROUND_DOWN,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});
export type Dec = Decimal;

/** 중간 계산용 고정밀 복제(`^` 음수 지수의 역수, `SQRT` 결과 나눗셈). */
export const DHigh = D.clone({ precision: 1000 });

/**
 * 숫자 → 문자열 변환에 쓰는 원문(BigDecimal.toPlainString 과 같은 스케일). 리터럴·레코드 값·ROUND·정수 결과만 싣는다.
 * decimal.js 인스턴스에는 스케일이 없으므로 이 표에 없는 숫자(연산 결과)는 문자열로 바꾸지 않고 서버로 폴백한다(D4).
 */
export const NUMBER_TEXT = new WeakMap<Dec, string>();

/** 평문 십진(부호 선택). 지수·16진·공백 없음. */
export const PLAIN_DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** Java `new BigDecimal(s)` 가 받는 모양(지수 허용). */
export const BIGDECIMAL_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** 이미 `toPlainString` 모양인 평문(앞 0·`+`·`.5`·`5.`·`-0` 없음). */
const CANONICAL = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** `new BigDecimal(raw).toPlainString()` 과 같은 문자열. raw 는 평문 십진이어야 한다. 소수 끝 0 은 남긴다. */
export function plainText(raw: string): string {
  if (CANONICAL.test(raw) && !/^-0(\.0*)?$/.test(raw)) return raw;
  let s = raw;
  let sign = "";
  if (s[0] === "+" || s[0] === "-") {
    sign = s[0] === "-" ? "-" : "";
    s = s.slice(1);
  }
  if (s.startsWith(".")) s = "0" + s;
  if (s.endsWith(".")) s = s.slice(0, -1);
  const dot = s.indexOf(".");
  let int = dot < 0 ? s : s.slice(0, dot);
  const frac = dot < 0 ? "" : s.slice(dot);
  int = int.replace(/^0+(?=\d)/, "");
  if (/^[0.]*$/.test(int + frac)) sign = "";
  return sign + int + frac;
}

/** 평문 십진 문자열 → Decimal. 원문 스케일을 {@link NUMBER_TEXT} 에 싣는다. */
export function decimalWithText(text: string): Dec {
  const d = new D(text);
  NUMBER_TEXT.set(d, plainText(text));
  return d;
}

/** 원문을 싣는 정수 결과(INSTR·STR_LENGTH). */
export function integerDecimal(n: number): Dec {
  const d = new D(n);
  NUMBER_TEXT.set(d, String(n));
  return d;
}

export function isDec(v: unknown): v is Dec {
  return v instanceof D;
}
