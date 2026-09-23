import type { CodeSets } from "../contract/engine-contract.generated";
import { BASE_FUNCTIONS, MDM_ARITY } from "./contract-constants";
import { D, DHigh, NUMBER_TEXT, integerDecimal, isDec, type Dec } from "./decimal";
import { EvalexError, FallbackSignal } from "./errors";
import type { EvalValue } from "./values";

/**
 * 화면 함수 표(TSK-03-04 design §6.3). 의미는 원천 JS 샘플이 아니라 EvalEx 3.7.0 실측(design §0.2)을 따른다.
 * `nullPolicy` 는 입력 계약의 필수·선택 판정(06:208 "함수마다 인자가 NULL 을 받는지는 함수 화이트리스트에 함께 적는다")이 쓴다.
 */

/** 인자 자리의 NULL 문맥 — fail: NULL 이면 평가가 실패, safe: NULL 을 받는다, inherit: 바깥 문맥을 따른다. */
export type ArgContext = "fail" | "safe" | "inherit";
export type NullPolicy =
  | ArgContext
  | { args: ArgContext[]; guardIf?: boolean }
  | { first: ArgContext; matchValues: ArgContext; results: ArgContext }
  | { notLast: ArgContext; last: ArgContext };

export interface FunctionEnv {
  /** `마루코드ID|카테고리ID` → 코드 집합. */
  codeSets?: CodeSetIndex;
}
export type CodeSetIndex = ReadonlyMap<string, ReadonlySet<string>>;

type Thunk = () => EvalValue;
interface FunctionBase {
  name: string;
  set: "BASE" | "MDM";
  arity?: readonly [number, number];
  nullPolicy: NullPolicy;
}
export interface EagerFunction extends FunctionBase {
  lazy: false;
  impl: (args: EvalValue[], env: FunctionEnv) => EvalValue;
}
export interface LazyFunction extends FunctionBase {
  lazy: true;
  impl: (args: Thunk[], env: FunctionEnv) => EvalValue;
}
export type FunctionDef = EagerFunction | LazyFunction;

// ------------------------------------------------------------------ 보조 변환(EvalEx EvaluationValue 규칙)

export function err(message: string): EvalexError {
  return new EvalexError("EVALUATION_ERROR", message);
}

/** EvalEx `getBooleanValue` — boolean 그대로, 숫자는 0 이 아니면 참, 문자열은 "true"(대소문자 무시), NULL 은 null. */
export function toBool(v: EvalValue): boolean | null {
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return !v.isZero();
}

/** EvalEx `getStringValue` — NULL 은 "null", 숫자는 원문 스케일. 원문이 없는(계산한) 숫자는 폴백한다(D4). */
export function str(v: EvalValue): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  const text = NUMBER_TEXT.get(v);
  if (text === undefined) throw new FallbackSignal("계산한 숫자를 문자열로 바꾸는 자리(BigDecimal 스케일)");
  return text;
}

/** 문자열 인자 — NULL 이면 서버는 NPE 다. */
function strArg(v: EvalValue, fn: string): string {
  if (v === null) throw err(`${fn}: NULL 인자`);
  return str(v);
}

/**
 * 함수의 숫자 인자(EvalEx `getNumberValue`). NULL 은 서버에서 NPE 라 오류, 문자열·불린은 서버가 0·1 로 바꾸는
 * 이상한 값이라 재현하지 않고 폴백한다(design §8 B3).
 */
export function numArg(v: EvalValue, fn: string): Dec {
  if (isDec(v)) return v;
  if (v === null) throw err(`${fn}: NULL 인자`);
  throw new FallbackSignal(`${fn}: 숫자가 아닌 인자`);
}

/** Java `BigDecimal.intValue()` — 소수 버림(범위 안). */
function intOf(d: Dec): number {
  return d.trunc().toNumber();
}

/** Java `String.trim` — 앞뒤의 U+0020 이하 코드유닛만 뗀다. */
function javaTrim(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) <= 0x20) a++;
  while (b > a && s.charCodeAt(b - 1) <= 0x20) b--;
  return s.slice(a, b);
}

/** EvalEx `SWITCH` 비교 — 둘 다 NULL 이거나, 타입이 같고 값이 같다. */
function switchEq(a: EvalValue, b: EvalValue): boolean {
  if (a === null || b === null) return a === b;
  if (isDec(a) && isDec(b)) return a.eq(b);
  if (typeof a !== typeof b || isDec(a) || isDec(b)) return false;
  return a === b;
}

/** EvalEx `SQRT` — BigInteger Newton, 결과는 `new BigDecimal(ix, 68)`(소수 68자리 버림). */
function sqrt(x: Dec): Dec {
  if (x.isZero()) return new D(0);
  if (x.isNeg()) throw err("SQRT: 음수");
  const n = BigInt(new DHigh(x).times("1e136").trunc().toFixed());
  const bits = (n.toString(2).length + 1) >> 1;
  let ix = n >> BigInt(bits);
  for (;;) {
    const prev = ix;
    ix = (ix + n / ix) >> 1n;
    const d = ix > prev ? ix - prev : prev - ix;
    if (d === 0n || d === 1n) break;
  }
  const digits = ix.toString().padStart(69, "0");
  return new D(`${digits.slice(0, -68)}.${digits.slice(-68)}`);
}

/** EvalEx `ROUND(v, n)` — `setScale(n, HALF_EVEN)`. 결과 원문을 싣는다(setScale 스케일). */
function round(v: Dec, n: Dec): Dec {
  const k = intOf(n);
  let r: Dec;
  if (k >= 0) {
    r = new D(v.toDecimalPlaces(k, D.ROUND_HALF_EVEN));
    NUMBER_TEXT.set(r, r.toFixed(k));
  } else {
    const p = new D(10).pow(-k);
    r = new D(new DHigh(v).div(p).toDecimalPlaces(0, D.ROUND_HALF_EVEN).times(p));
    NUMBER_TEXT.set(r, r.toFixed(0));
  }
  return r;
}

/** MIN·MAX 누산기(EvalEx `AbstractMinMaxFunction`): 빈 누산기는 인자 값(NULL 포함)을 그대로 받고, 찬 뒤의 NULL 은 NPE. */
function minMax(args: EvalValue[], fn: string, isMin: boolean): EvalValue {
  let acc: Dec | null = null;
  for (const a of args) {
    if (a !== null && !isDec(a)) throw new FallbackSignal(`${fn}: 숫자가 아닌 인자`);
    if (acc === null) {
      acc = a;
      continue;
    }
    if (a === null) throw err(`${fn}: 누산기가 찬 뒤의 NULL`);
    if (isMin ? a.lt(acc) : a.gt(acc)) acc = a;
  }
  return acc;
}

function sum(args: EvalValue[], fn: string): Dec {
  let s = new D(0);
  for (const a of args) s = s.plus(numArg(a, fn));
  return s;
}

// ------------------------------------------------------------------ 표

const eager = (
  name: string,
  nullPolicy: NullPolicy,
  impl: EagerFunction["impl"],
  set: "BASE" | "MDM" = "BASE",
  arity?: readonly [number, number],
): EagerFunction => ({ name, set, lazy: false, nullPolicy, impl, arity });

export const FUNCTIONS: readonly FunctionDef[] = [
  {
    name: "IF",
    set: "BASE",
    lazy: true,
    nullPolicy: { args: ["safe", "inherit", "inherit"], guardIf: true },
    impl: ([c, a, b]) => (toBool(c()) === true ? a() : b()),
  },
  {
    name: "SWITCH",
    set: "BASE",
    lazy: true,
    nullPolicy: { first: "safe", matchValues: "safe", results: "inherit" },
    impl: (args) => {
      const v = args[0]();
      const pairs = args.length - 1;
      let i = 1;
      for (; i + 1 < args.length; i += 2) {
        if (switchEq(v, args[i]())) return args[i + 1]();
      }
      return pairs % 2 === 1 ? args[args.length - 1]() : null;
    },
  },
  eager("COALESCE", { notLast: "safe", last: "inherit" }, (args) => {
    for (const a of args) if (a !== null) return a;
    return null;
  }),
  eager("NOT", "fail", ([v]) => {
    const b = toBool(v);
    if (b === null) throw err("NOT: NULL");
    return !b;
  }),
  eager("ABS", "fail", ([v]) => numArg(v, "ABS").abs()),
  eager("CEILING", "fail", ([v]) => numArg(v, "CEILING").ceil()),
  eager("FLOOR", "fail", ([v]) => numArg(v, "FLOOR").floor()),
  eager("SQRT", "fail", ([v]) => sqrt(numArg(v, "SQRT"))),
  eager("ROUND", "fail", ([v, n]) => round(numArg(v, "ROUND"), numArg(n, "ROUND"))),
  eager("MIN", "fail", (args) => minMax(args, "MIN", true)),
  eager("MAX", "fail", (args) => minMax(args, "MAX", false)),
  eager("SUM", "fail", (args) => sum(args, "SUM")),
  eager("AVERAGE", "fail", (args) => sum(args, "AVERAGE").div(args.length)),
  eager("STR_LENGTH", "fail", ([s]) => integerDecimal(strArg(s, "STR_LENGTH").length)),
  eager("STR_UPPER", "fail", ([s]) => strArg(s, "STR_UPPER").toUpperCase()),
  eager("STR_LOWER", "fail", ([s]) => strArg(s, "STR_LOWER").toLowerCase()),
  eager("STR_TRIM", "fail", ([s]) => javaTrim(strArg(s, "STR_TRIM"))),
  eager("STR_LEFT", "fail", ([s, n]) => {
    const t = strArg(s, "STR_LEFT");
    const k = intOf(numArg(n, "STR_LEFT"));
    return t.substring(0, Math.max(0, Math.min(k, t.length)));
  }),
  eager("STR_RIGHT", "fail", ([s, n]) => {
    const t = strArg(s, "STR_RIGHT");
    const k = intOf(numArg(n, "STR_RIGHT"));
    return t.substring(t.length - Math.max(0, Math.min(k, t.length)));
  }),
  eager("STR_SUBSTRING", "fail", (args) => {
    const t = strArg(args[0], "STR_SUBSTRING");
    const a = intOf(numArg(args[1], "STR_SUBSTRING"));
    if (args.length > 2) {
      const b = intOf(numArg(args[2], "STR_SUBSTRING"));
      if (b < a) throw err("STR_SUBSTRING: 끝이 시작보다 앞");
      if (a < 0 || a > t.length) throw err("STR_SUBSTRING: 시작 위치 범위 밖");
      return t.substring(a, Math.min(b, t.length));
    }
    if (a < 0 || a > t.length) throw err("STR_SUBSTRING: 시작 위치 범위 밖");
    return t.substring(a);
  }),
  eager("STR_CONTAINS", "safe", ([s, t]) => {
    if (s === null || t === null) return false;
    return str(s).toUpperCase().includes(str(t).toUpperCase());
  }),
  eager("STR_STARTS_WITH", "fail", ([s, t]) => strArg(s, "STR_STARTS_WITH").startsWith(strArg(t, "STR_STARTS_WITH"))),
  eager("STR_ENDS_WITH", "fail", ([s, t]) => strArg(s, "STR_ENDS_WITH").endsWith(strArg(t, "STR_ENDS_WITH"))),
  eager("STR_MATCHES", "fail", ([s, re]) => javaMatches(strArg(s, "STR_MATCHES"), strArg(re, "STR_MATCHES"))),
  eager(
    "INSTR",
    "inherit",
    ([s, t]) => (s === null || t === null ? null : integerDecimal(str(s).indexOf(str(t)) + 1)),
    "MDM",
    MDM_ARITY.INSTR,
  ),
  eager(
    "MASTER",
    { args: ["safe", "safe", "safe", "safe"] },
    ([id, cate, key], env) => {
      if (key === null) return false;
      if (isDec(key)) throw new FallbackSignal("MASTER: 숫자 key");
      const set = env.codeSets?.get(`${str(id)}|${str(cate)}`);
      if (!set) throw new FallbackSignal("MASTER: 받아 둔 코드 집합이 없다");
      return set.has(str(key));
    },
    "MDM",
    MDM_ARITY.MASTER,
  ),
  eager(
    "MASTER_AT",
    { args: ["safe", "safe", "safe", "safe", "safe"] },
    () => {
      throw new FallbackSignal("MASTER_AT 은 서버 미리보기로 폴백한다");
    },
    "MDM",
    MDM_ARITY.MASTER_AT,
  ),
];

export const FUNCTION_TABLE: ReadonlyMap<string, FunctionDef> = new Map(FUNCTIONS.map((f) => [f.name, f]));

/** BASE 함수 이름 집합(계약 상수와 같은지는 parity 테스트가 본다). */
export const BASE_SET: ReadonlySet<string> = new Set<string>(BASE_FUNCTIONS);

/** Java `String.matches` — 앵커 없는 정규식 전체 일치. 문법 차이로 JS 가 못 읽으면 폴백한다. */
const regexCache = new Map<string, RegExp>();
export function compileJavaRegex(re: string): RegExp {
  let r = regexCache.get(re);
  if (r) return r;
  try {
    r = new RegExp(`^(?:${re})$`);
  } catch {
    throw new FallbackSignal(`정규식을 화면에서 해석할 수 없다: ${re}`);
  }
  if (regexCache.size >= 1000) regexCache.clear();
  regexCache.set(re, r);
  return r;
}

function javaMatches(s: string, re: string): boolean {
  return compileJavaRegex(re).test(s);
}

/** 코드 집합 색인(`CodeSets` 객체마다 한 번 만든다). */
const codeSetIndexCache = new WeakMap<CodeSets, CodeSetIndex>();
export function indexCodeSets(codeSets: CodeSets): CodeSetIndex {
  let idx = codeSetIndexCache.get(codeSets);
  if (!idx) {
    idx = new Map(Object.entries(codeSets).map(([k, v]) => [k, new Set(v)]));
    codeSetIndexCache.set(codeSets, idx);
  }
  return idx;
}
