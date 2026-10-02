"use client";

/**
 * MDM 화면 값 검증(spec docs/superpowers/specs/2026-10-03-mdm-screen-meta-validation-design.md §5, C1·C5).
 *
 * 판정과 문구는 서버(cactus-core `MdmValueChecks` + 엔진 `DefaultDomainValidator`)와 같은 꼴이다 — 화면은 즉시 피드백이고 서버가 기준이다.
 * 순서: 빈 값 정규화(공백만 = 빈 값) → 필수 → 타입 → 길이·소수 자리 → 허용 코드 → 도메인 표준식. 첫 실패에서 멈춘다.
 *
 * - 길이는 문자열 code point 수(C5). 숫자 자리는 NUMBER(p,s): 정수부 ≤ p−s, 소수부 ≤ s(끝자리 0 은 세지 않는다, scale 이 없으면 0).
 * - 표준식은 `@dk-oasis/shared/evalex` 로 평가한다. 변수는 엔진 DOMAIN_STD 와 같이 `value` 하나다(engine-contract §표준식). 화면이 평가할 수
 *   없거나(`isSupported` 거짓·fallback) 판정 오류·불린이 아닌 결과면 통과로 보고 서버에 맡긴다. NULL 결과는 엔진처럼 거짓이다.
 * - 비즈니스식은 화면에서 하지 않는다(서버 `MdmValidator` 몫).
 */
import { useMemo } from "react";
import { D, convertForType, evaluate, isSupported, type Dec } from "../evalex";
import type { AstNode } from "../evalex";
import { mdmCaption } from "./caption";
import { resolveMdmPhysName, useMdmMetaScope } from "./context";
import { peekColumn } from "./store";
import type { MdmScreenColumn } from "./types";

export type MdmValueIssueCode = "REQUIRED" | "TYPE" | "LENGTH" | "SCALE" | "CODE" | "STD_EXPR";

export interface MdmValueIssue {
  code: MdmValueIssueCode;
  message: string;
}

export interface MdmRowIssue {
  rowIndex: number;
  field: string;
  issue: MdmValueIssue;
}

/** 문자열 길이를 code point 로 센다(이모지 한 글자 = 1). */
export function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

type DataType = "NUMBER" | "STRING" | "BOOLEAN" | "DATE";

/** 서버 `MdmValueChecks.dataType` 과 같다 — 비거나 모르는 값은 STRING. */
function dataTypeOf(column: MdmScreenColumn): DataType {
  const t = column.dataType?.trim().toUpperCase();
  return t === "NUMBER" || t === "BOOLEAN" || t === "DATE" ? t : "STRING";
}

/** 엔진 `ValueConverter` 의 숫자 문자열 — 부호·정수부·소수부만(지수·천 단위 구분·앞뒤 공백 거부). */
const ENGINE_NUMBER_TEXT = /^[+-]?[0-9]+(\.[0-9]+)?$/;

// 서버 MdmValueChecks.DATE_ONLY·DATE_TIME 과 같은 형식(달력 엄격).
const DATE_ONLY: RegExp[] = [/^(\d{4})-(\d{2})-(\d{2})$/, /^(\d{4})(\d{2})(\d{2})$/, /^(\d{4})\/(\d{2})\/(\d{2})$/];
const DATE_TIME: RegExp[] = [
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/,
  /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
];
/** ISO-8601 + 오프셋(Java OffsetDateTime.parse) — 초·소수 초 선택. */
const ISO_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

function validDateParts(y: string, mo: string, d: string, h = "0", mi = "0", s = "0"): boolean {
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return false;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return false;
  return Number(h) <= 23 && Number(mi) <= 59 && Number(s) <= 59;
}

function isDateValue(v: unknown): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v !== "string") return false;
  const s = v.trim();
  for (const re of [...DATE_ONLY, ...DATE_TIME]) {
    const m = re.exec(s);
    if (m) return validDateParts(m[1], m[2], m[3], m[4], m[5], m[6]);
  }
  const iso = ISO_OFFSET.exec(s);
  return !!iso && validDateParts(iso[1], iso[2], iso[3], iso[4], iso[5], iso[6]);
}

function toDecimal(v: unknown): Dec | null {
  if (typeof v === "number") return Number.isFinite(v) ? new D(v) : null;
  if (typeof v === "string" && ENGINE_NUMBER_TEXT.test(v)) return new D(v);
  return null;
}

/** 표준식에 넘길 값 — 엔진처럼 선언 타입으로 바꾼다. 바꿀 수 없으면 undefined(표준식을 건너뛴다). */
function stdValue(v: unknown, type: DataType): unknown {
  try {
    if (type === "DATE") return v instanceof Date ? v.toISOString() : String(v);
    if (type === "STRING" && typeof v === "number") return convertForType(v, "STRING");
    return convertForType(v as never, type);
  } catch {
    return undefined;
  }
}

function plainCode(v: unknown): string {
  if (typeof v === "number") return Number.isFinite(v) ? new D(v).toFixed() : String(v);
  return String(v);
}

function issue(code: MdmValueIssueCode, message: string): MdmValueIssue {
  return { code, message };
}

/**
 * MDM 컬럼 정의 하나로 값 하나를 검사한다. 통과면 null.
 *
 * @param row 행 전체(엔진 계약과 같게 표준식 변수는 `value` 하나라 지금은 쓰지 않는다 — 비즈니스식은 서버 몫)
 * @param caption 문구에 쓸 이름. 비우면 폼 캡션(labelMid → labelLong → labelShort → columnName) → 물리명.
 */
export function validateMdmValue(
  column: MdmScreenColumn,
  value: unknown,
  row?: Record<string, unknown>,
  caption?: string
): MdmValueIssue | null {
  void row;
  const name = (caption && caption.trim()) || mdmCaption(column, "form") || column.physName;
  // 1 빈 값 정규화 → 2 필수
  const blank = value == null || (typeof value === "string" && value.trim() === "");
  if (blank) return column.required ? issue("REQUIRED", `${name}은(는) 필수입니다`) : null;

  // 3 타입 → 4 길이·소수 자리
  const type = dataTypeOf(column);
  if (type === "NUMBER") {
    const n = toDecimal(value);
    if (!n) return issue("TYPE", `${name}은(는) 숫자여야 합니다`);
    const scaleIssue = numberScaleIssue(n, column, name);
    if (scaleIssue) return scaleIssue;
  } else if (type === "DATE") {
    if (!isDateValue(value)) return issue("TYPE", `${name}은(는) 날짜 형식이 아닙니다`);
  } else if (type === "BOOLEAN") {
    const ok = typeof value === "boolean" || (typeof value === "string" && /^(true|false)$/i.test(value));
    if (!ok) return issue("TYPE", `${name}: 값 형식이 올바르지 않습니다`);
  } else {
    if (typeof value !== "string" && typeof value !== "number") {
      return issue("TYPE", `${name}: 값 형식이 올바르지 않습니다`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) return issue("TYPE", `${name}: 값 형식이 올바르지 않습니다`);
    const text = typeof value === "string" ? value : plainCode(value);
    if (column.length != null && codePointLength(text) > column.length) {
      return issue("LENGTH", `${name}은(는) 최대 ${column.length}자입니다`);
    }
  }

  // 5 허용 코드 — 받았을 때만(null 은 "풀 수 없음", 빈 목록은 "허용 코드 없음")
  if (Array.isArray(column.allowedCodes)) {
    const v = plainCode(value);
    if (!column.allowedCodes.some((c) => c.code === v)) return issue("CODE", `${name}: 허용되지 않은 코드입니다`);
  }

  // 6 도메인 표준식
  const ast = column.stdExpr?.ast as AstNode | null | undefined;
  if (ast && stdExprFails(ast, stdValue(value, type))) {
    return issue("STD_EXPR", `${name}: 표준 규칙을 만족하지 않습니다(${column.stdExpr?.text ?? ""})`);
  }
  return null;
}

/** NUMBER(p,s) — 서버 MdmValueChecks.number 와 같은 갈래. */
function numberScaleIssue(n: Dec, column: MdmScreenColumn, name: string): MdmValueIssue | null {
  const precision = column.length;
  const scaleDef = column.scale;
  if (precision == null && scaleDef == null) return null;
  const s = scaleDef ?? 0;
  const a = n.abs();
  const frac = a.decimalPlaces();
  const intDigits = a.isZero() ? 0 : Math.max(a.e + 1, 0);
  if (precision != null) {
    if (intDigits > precision - s || frac > s) {
      return issue("SCALE", `${name}은(는) 정수 ${precision - s}자리, 소수 ${s}자리까지입니다`);
    }
  } else if (frac > s) {
    return issue("SCALE", `${name}은(는) 소수 ${s}자리까지입니다`);
  }
  return null;
}

/** 표준식이 거짓(또는 NULL)이면 true. 평가할 수 없으면(지원 안 함·오류·불린 아님·값 변환 실패) false — 서버 확인. */
function stdExprFails(ast: AstNode, value: unknown): boolean {
  if (value === undefined) return false;
  try {
    if (!isSupported(ast)) return false;
    const out = evaluate(ast, { value: value as never });
    if (out.kind !== "value") return false;
    return out.value === false || out.value === null;
  } catch {
    return false;
  }
}

/** 지운 행 — 서버 MdmValidator 처럼 건너뛴다(`rowStatus` D·deleted, 행 상태 관리자의 deleted 표시). */
function isDeletedRow(row: Record<string, unknown>): boolean {
  const status = row.rowStatus;
  return (
    status === "D" ||
    status === "deleted" ||
    row._rowState === "deleted" ||
    row.nativeeditor_status === "deleted"
  );
}

/**
 * 폼·저장 전 검사 훅(spec §4·§5). 포털 탭 공급자(`MdmMetaProvider`) 안에서만 검사한다 — 밖이거나 `disabled` 면 늘 통과다.
 *
 * - 이름은 화면 키(`codeNm` → `CODE_NM`), `meta` 문자열이 이기고 `false` 면 끈다(spec B6).
 * - 메타는 store 에 이미 받아 둔 것만 쓴다(동기, 요청하지 않는다). 칸은 그리드 열·`FormGroup name`·`useMdmColumn(s)` 로 등록해 화면이
 *   열릴 때 받아 둔다 — 등록하지 않은 이름, 아직 못 받은 이름(unavailable·오류)은 건너뛰고 서버 검증에 맡긴다.
 *   렌더 중에 부르는 함수라(입력 칸 즉시 검사) 여기서 요청을 걸면 렌더 중 부수 효과이고, store 가 보관하지 않는 unavailable·500 동안에는
 *   글자마다 POST 가 나간다(장애 중 요청 폭주).
 * - MDM 에 없는 이름은 검사하지 않는다.
 */
export function useMdmValidation(): {
  validateValue(name: string, value: unknown, row?: Record<string, unknown>, meta?: string | false): MdmValueIssue | null;
  validateRow(row: Record<string, unknown>, names: string[]): Record<string, MdmValueIssue>;
  validateRows(rows: Array<Record<string, unknown>>, names: string[]): MdmRowIssue[];
} {
  const scope = useMdmMetaScope();
  const module = scope && scope.module && !scope.disabled ? scope.module : null;
  return useMemo(() => {
    const lookup = (names: Array<{ name: string; meta?: string | false }>) => {
      const out = new Map<string, MdmScreenColumn | null>();
      if (!module) return out;
      for (const { name, meta } of names) {
        const phys = resolveMdmPhysName(name, meta);
        if (!phys) continue;
        const col = peekColumn(module, phys);
        if (col !== undefined) out.set(name, col);
      }
      return out;
    };
    const validateValue = (name: string, value: unknown, row?: Record<string, unknown>, meta?: string | false) => {
      const col = lookup([{ name, meta }]).get(name);
      return col ? validateMdmValue(col, value, row) : null;
    };
    const validateRow = (row: Record<string, unknown>, names: string[]) => {
      const cols = lookup(names.map((name) => ({ name })));
      const out: Record<string, MdmValueIssue> = {};
      for (const name of names) {
        const col = cols.get(name);
        if (!col) continue;
        const found = validateMdmValue(col, row[name], row);
        if (found) out[name] = found;
      }
      return out;
    };
    const validateRows = (rows: Array<Record<string, unknown>>, names: string[]) => {
      const cols = lookup(names.map((name) => ({ name })));
      const out: MdmRowIssue[] = [];
      rows.forEach((row, rowIndex) => {
        if (!row || isDeletedRow(row)) return;
        for (const name of names) {
          const col = cols.get(name);
          if (!col) continue;
          const found = validateMdmValue(col, row[name], row);
          if (found) out.push({ rowIndex, field: name, issue: found });
        }
      });
      return out;
    };
    return { validateValue, validateRow, validateRows };
  }, [module]);
}
