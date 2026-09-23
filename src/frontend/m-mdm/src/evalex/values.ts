import type { DataType, ErrorCode, TypedValue } from "../contract/engine-contract.generated";
import { BIGDECIMAL_TEXT, D, NUMBER_TEXT, PLAIN_DECIMAL, decimalWithText, isDec, type Dec } from "./decimal";
import { EvalexError } from "./errors";

/** 인터프리터 값 — EvalEx 의 NUMBER·STRING·BOOLEAN·NULL. */
export type EvalValue = Dec | string | boolean | null;

export type EvalOutcome =
  | { kind: "value"; value: EvalValue }
  | { kind: "error"; code: ErrorCode; message: string }
  | { kind: "fallback"; reason: string };

/** TypedValue → EvalValue. NUMBER 는 원문 스케일을 싣는다. LIST 는 화면 평가 대상이 아니다. */
export function fromTypedValue(tv: TypedValue): EvalValue {
  switch (tv.type) {
    case "NUMBER":
      return decimalWithText(tv.value);
    case "STRING":
      return tv.value;
    case "BOOLEAN":
      return tv.value === "true";
    case "NULL":
      return null;
    default:
      throw new EvalexError("EVALUATION_ERROR", "LIST 값은 화면에서 평가하지 않는다");
  }
}

/** EvalValue → TypedValue. NUMBER 는 평문 십진(값 비교용이라 스케일은 보지 않는다). */
export function toTypedValue(v: EvalValue): TypedValue {
  if (v === null) return { type: "NULL" };
  if (typeof v === "boolean") return { type: "BOOLEAN", value: v ? "true" : "false" };
  if (typeof v === "string") return { type: "STRING", value: v };
  return { type: "NUMBER", value: v.isZero() ? "0" : v.toFixed() };
}

/** 숫자 → `toPlainString` 과 같은 문자열. 원문이 있으면 그것, 없으면 `toFixed()`(값 변환 전용 — 폴백하지 않는다). */
export function plainOf(d: Dec): string {
  return NUMBER_TEXT.get(d) ?? (d.isZero() ? "0" : d.toFixed());
}

/**
 * 선언 타입 변환(엔진 계약 2, 06:199, TSK-03-03 `ValueConverter.toDeclared` 와 같은 표, design §6.2).
 * 실패하면 `EvalexError("TYPE_CONVERSION")`.
 */
export function convertForType(v: EvalValue | number, dataType: DataType): EvalValue {
  if (v === null || v === undefined) return null;
  switch (dataType) {
    case "NUMBER":
      if (isDec(v)) return v;
      if (typeof v === "number") {
        if (!Number.isFinite(v)) throw conversion(v, dataType);
        return fromNumber(v);
      }
      if (typeof v === "string") {
        if (PLAIN_DECIMAL.test(v)) return decimalWithText(v);
        if (BIGDECIMAL_TEXT.test(v)) return new D(v);
      }
      throw conversion(v, dataType);
    case "STRING":
    case "DATE":
      if (typeof v === "string") return v;
      if (isDec(v)) return plainOf(v);
      if (typeof v === "number" && Number.isFinite(v)) return plainOf(fromNumber(v));
      throw conversion(v, dataType);
    case "BOOLEAN":
      if (typeof v === "boolean") return v;
      if (typeof v === "string") {
        const u = v.toUpperCase();
        if (u === "TRUE") return true;
        if (u === "FALSE") return false;
      }
      throw conversion(v, dataType);
    default:
      throw conversion(v, dataType);
  }
}

/** JS number(화면 그리드 입력 편의) → Decimal. 평문으로 적히는 수만 원문을 싣는다. */
export function fromNumber(n: number): Dec {
  const text = String(n);
  return PLAIN_DECIMAL.test(text) ? decimalWithText(text) : new D(n);
}

function conversion(v: unknown, dataType: DataType): EvalexError {
  return new EvalexError("TYPE_CONVERSION", `${String(v)} 을(를) ${dataType} 로 바꿀 수 없다`);
}
