import type { AstNode, CodeSets, ErrorCode } from "../contract/engine-contract.generated";
import { DT_FORMATS, E_TEXT, EVAL_TS, INFIX_OPERATORS, PI_TEXT, PREFIX_OPERATORS, RESERVED_CONSTANTS, RESERVED_PREFIX } from "./contract-constants";
import { D, DHigh, NUMBER_TEXT, PLAIN_DECIMAL, decimalWithText, isDec, type Dec } from "./decimal";
import { EvalexError, FallbackSignal } from "./errors";
import {
  BASE_SET,
  FUNCTION_TABLE,
  compileJavaRegex,
  err,
  indexCodeSets,
  str,
  toBool,
  type CodeSetIndex,
  type FunctionEnv,
} from "./functions";
import { fromNumber, type EvalOutcome, type EvalValue } from "./values";

/**
 * EvalEx AST 인터프리터(TSK-03-04 design §6.3·§6.4, evalex-guide §8).
 *
 * 구조는 원천 샘플(AST → 클로저 컴파일, 같은 AST 객체 캐시, 지연 함수 thunk, prepare 로 변수 사전 정규화)을 따르고,
 * 의미는 EvalEx 3.7.0 실측(design §0.2)에 맞춘다. 재현할 수 없는 자리는 틀린 값을 내지 않고 폴백한다(D4).
 */
export type { CodeSetIndex } from "./functions";

export interface EvaluateOptions {
  codeSets?: CodeSets;
}

/** 평가 범위 — 키는 대문자. */
export type Scope = Record<string, EvalValue>;
type Compiled = (scope: Scope) => EvalValue;

const PREPARED = Symbol("evalex.prepared");
type PreparedScope = Scope & { [PREPARED]?: true };

const CONSTANT_SET: ReadonlySet<string> = new Set<string>(RESERVED_CONSTANTS);
const INFIX_SET: ReadonlySet<string> = new Set<string>(INFIX_OPERATORS);
const PREFIX_SET: ReadonlySet<string> = new Set<string>(PREFIX_OPERATORS);
const PI = decimalWithText(PI_TEXT);
const E = decimalWithText(E_TEXT);

// ------------------------------------------------------------------ 예약 키

/** 예약 키 검사(06:199·422·424, TSK-03-03 RecordKeys). 키 순서대로 처음 어긋난 키. 이어서 대소문자만 다른 키 묶음. */
export function checkRecordKeys(keys: readonly string[]): { code: ErrorCode; key: string } | null {
  for (const key of keys) {
    const u = key.toUpperCase();
    if (CONSTANT_SET.has(u)) return { code: "CONSTANT_KEY", key };
    if (u === EVAL_TS) return { code: "EVAL_TS_KEY", key };
    if (key.startsWith(RESERVED_PREFIX)) return { code: "RESERVED_KEY", key };
  }
  if (keys.length > 1) {
    const seen = new Set<string>();
    for (const key of keys) {
      const u = key.toUpperCase();
      if (seen.has(u)) return { code: "RESERVED_KEY", key };
      seen.add(u);
    }
  }
  return null;
}

function keyError(bad: { code: ErrorCode; key: string }): EvalexError {
  return new EvalexError(bad.code, `예약된 레코드 키: ${bad.key}`);
}

// ------------------------------------------------------------------ prepare

/**
 * 예약 키 검사와 정규화를 한 번에 한다(성능, design §6.13). 결과는 {@link checkRecordKeys} 와 같다 — 예약 이름이 먼저고,
 * 대소문자만 다른 키는 예약 이름이 하나도 없을 때 처음 겹친 키로 보고한다.
 */
function normalize(vars: Readonly<Record<string, EvalValue | number>>): PreparedScope {
  const scope: PreparedScope = {};
  let duplicate: string | undefined;
  for (const key in vars) {
    const u = key.toUpperCase();
    if (CONSTANT_SET.has(u)) throw keyError({ code: "CONSTANT_KEY", key });
    if (u === EVAL_TS) throw keyError({ code: "EVAL_TS_KEY", key });
    if (key.startsWith(RESERVED_PREFIX)) throw keyError({ code: "RESERVED_KEY", key });
    if (duplicate === undefined && u in scope) duplicate = key;
    const v = vars[key];
    scope[u] = typeof v === "number" ? fromNumber(v) : v === undefined ? null : v;
  }
  if (duplicate !== undefined) throw keyError({ code: "RESERVED_KEY", key: duplicate });
  scope[PREPARED] = true;
  return scope;
}

/** 레코드 → 평가 범위. 예약 키면 `EvalexError` 를 던진다. 그리드에서 행마다 한 번 만들어 여러 식에 넘긴다(EG 8.7). */
export function prepare(vars: Readonly<Record<string, EvalValue | number>>): Scope {
  return normalize(vars);
}

function isPrepared(vars: object): vars is PreparedScope {
  return (vars as PreparedScope)[PREPARED] === true;
}

// ------------------------------------------------------------------ 정적 분석

const supportedCache = new WeakMap<AstNode, boolean>();
const usedCache = new WeakMap<AstNode, string[]>();

/** 화면이 평가할 수 있는 AST 인가(design §6.4). 거짓이면 서버 미리보기로 폴백한다. */
export function isSupported(ast: AstNode, opts: EvaluateOptions = {}): boolean {
  if (!opts.codeSets) {
    let s = supportedCache.get(ast);
    if (s === undefined) {
      s = supported(ast, undefined);
      supportedCache.set(ast, s);
    }
    return s;
  }
  return supported(ast, indexCodeSets(opts.codeSets));
}

function supported(n: AstNode, codeSets: CodeSetIndex | undefined): boolean {
  switch (n.type) {
    case "NUMBER_LITERAL":
    case "STRING_LITERAL":
    case "VARIABLE_OR_CONSTANT":
      return true;
    case "PREFIX_OPERATOR":
      return PREFIX_SET.has(n.value) && n.params.length === 1 && supported(n.params[0], codeSets);
    case "INFIX_OPERATOR":
      return INFIX_SET.has(n.value) && n.params.length === 2 && n.params.every((p) => supported(p, codeSets));
    case "FUNCTION": {
      const name = n.value.toUpperCase();
      const params = n.params ?? [];
      if (!params.every((p) => supported(p, codeSets))) return false;
      if (BASE_SET.has(name)) return true;
      if (name === "INSTR") return params.length === 2;
      if (name === "MASTER") {
        const [id, cate] = params;
        return (
          params.length === 3 &&
          id?.type === "STRING_LITERAL" &&
          cate?.type === "STRING_LITERAL" &&
          codeSets?.has(`${id.value}|${cate.value}`) === true
        );
      }
      return false;
    }
    default:
      return false;
  }
}

/** 식이 쓰는 변수 — 전위 순회, 대문자, 상수 제외, 첫 등장 순. */
export function usedVariables(ast: AstNode): string[] {
  let used = usedCache.get(ast);
  if (!used) {
    const seen = new Set<string>();
    const walk = (n: AstNode) => {
      if (n.type === "VARIABLE_OR_CONSTANT") {
        const u = n.value.toUpperCase();
        if (!CONSTANT_SET.has(u)) seen.add(u);
      } else if ("params" in n && n.params) {
        for (const p of n.params) walk(p);
      }
    };
    walk(ast);
    used = [...seen];
    usedCache.set(ast, used);
  }
  return used;
}

// ------------------------------------------------------------------ 컴파일

const compileCache = new WeakMap<AstNode, Compiled>();
const compileCacheByCodeSets = new WeakMap<AstNode, WeakMap<CodeSets, Compiled>>();

/** AST → 평가 함수. 같은 AST 객체(와 같은 codeSets 객체)는 같은 결과를 돌려준다. 던지는 것: EvalexError·FallbackSignal. */
export function compile(ast: AstNode, opts: EvaluateOptions = {}): Compiled {
  const cs = opts.codeSets;
  if (!cs) {
    let c = compileCache.get(ast);
    if (!c) {
      c = build(ast, {});
      compileCache.set(ast, c);
    }
    return c;
  }
  let byCs = compileCacheByCodeSets.get(ast);
  if (!byCs) {
    byCs = new WeakMap();
    compileCacheByCodeSets.set(ast, byCs);
  }
  let c = byCs.get(cs);
  if (!c) {
    c = build(ast, { codeSets: indexCodeSets(cs) });
    byCs.set(cs, c);
  }
  return c;
}

function numberLiteral(value: string): Dec {
  if (PLAIN_DECIMAL.test(value)) return decimalWithText(value);
  if (/^0[xX]/.test(value)) return new D(BigInt(value).toString());
  return new D(value);
}

/** 연산자 피연산자 — 숫자만 받는다(EvalEx 는 문자열·NULL 을 숫자로 바꾸지 않고 오류를 낸다). */
function num(v: EvalValue, op: string): Dec {
  if (isDec(v)) return v;
  throw err(`${op}: 숫자가 아닌 피연산자`);
}

function boolOperand(v: EvalValue, op: string): boolean {
  const b = toBool(v);
  if (b === null) throw err(`${op}: NULL 피연산자`);
  return b;
}

/** EvalEx `==` — 타입이 다르면 거짓, 둘 다 NULL 이면 참, 숫자는 값으로 견준다. */
function eq(a: EvalValue, b: EvalValue): boolean {
  if (a === null || b === null) return a === b;
  if (isDec(a)) return isDec(b) && a.eq(b);
  if (isDec(b)) return false;
  return typeof a === typeof b && a === b;
}

/** EvalEx 대소 비교. NULL 은 NPE, 타입이 다르면 서버 규칙을 재현하지 않고 폴백한다(D4). */
function compare(a: EvalValue, b: EvalValue, op: string): number {
  if (a === null || b === null) throw err(`${op}: NULL 피연산자`);
  if (isDec(a) && isDec(b)) return a.cmp(b);
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  throw new FallbackSignal(`${op}: 타입이 다른 대소 비교`);
}

/** EvalEx `^` — 정수부 `pow(mc)` × 소수부 `Math.pow`(double), 음수 지수는 소수 68자리 HALF_UP 역수. */
function power(x: Dec, y: Dec): Dec {
  const ay = y.abs();
  const n = ay.trunc();
  const f = ay.minus(n);
  if (n.gt(2147483647)) throw err("^: 지수가 int 범위를 넘는다");
  const ip = x.pow(n);
  const dp = Math.pow(x.toNumber(), f.toNumber());
  if (!Number.isFinite(dp)) throw err("^: double 거듭제곱이 유한하지 않다");
  let r = ip.times(new D(String(dp)));
  if (y.isNeg()) {
    if (r.isZero()) throw err("^: 0 의 음수 거듭제곱");
    r = new D(new DHigh(1).div(r).toDecimalPlaces(68, D.ROUND_HALF_UP));
  }
  return r;
}

function negate(x: Dec): Dec {
  const r = x.neg();
  const text = NUMBER_TEXT.get(x);
  if (text !== undefined) {
    NUMBER_TEXT.set(r, x.isZero() ? text : text.startsWith("-") ? text.slice(1) : `-${text}`);
  }
  return r;
}

function build(n: AstNode, env: FunctionEnv): Compiled {
  switch (n.type) {
    case "NUMBER_LITERAL": {
      const d = numberLiteral(n.value);
      return () => d;
    }
    case "STRING_LITERAL": {
      const s = n.value;
      return () => s;
    }
    case "VARIABLE_OR_CONSTANT": {
      const name = n.value.toUpperCase();
      switch (name) {
        case "TRUE":
          return () => true;
        case "FALSE":
          return () => false;
        case "NULL":
          return () => null;
        case "PI":
          return () => PI;
        case "E":
          return () => E;
        case "DT_FORMAT_ISO_DATE_TIME":
        case "DT_FORMAT_LOCAL_DATE_TIME":
        case "DT_FORMAT_LOCAL_DATE": {
          const f = DT_FORMATS[name];
          return () => f;
        }
      }
      return (s) => {
        const v = s[name];
        if (v === undefined) throw new EvalexError("MISSING_KEY", `레코드에 ${name} 키가 없다`);
        return v;
      };
    }
    case "PREFIX_OPERATOR": {
      const a = build(n.params[0], env);
      switch (n.value) {
        case "-":
          return (s) => negate(num(a(s), "-"));
        case "+":
          return (s) => num(a(s), "+");
        case "!":
          return (s) => !boolOperand(a(s), "!");
      }
      return unsupported("전위 연산자");
    }
    case "INFIX_OPERATOR": {
      const l = build(n.params[0], env);
      const r = build(n.params[1], env);
      switch (n.value) {
        case "+":
          return (s) => {
            const a = l(s);
            const b = r(s);
            return isDec(a) && isDec(b) ? a.plus(b) : str(a) + str(b);
          };
        case "-":
          return (s) => num(l(s), "-").minus(num(r(s), "-"));
        case "*":
          return (s) => num(l(s), "*").times(num(r(s), "*"));
        case "/":
          return (s) => {
            const a = num(l(s), "/");
            const b = num(r(s), "/");
            if (b.isZero()) throw err("/: 0 으로 나눔");
            return a.div(b);
          };
        case "%":
          return (s) => {
            const a = num(l(s), "%");
            const b = num(r(s), "%");
            if (b.isZero()) throw err("%: 0 으로 나눔");
            return a.mod(b);
          };
        case "^":
          return (s) => power(num(l(s), "^"), num(r(s), "^"));
        case "==":
        case "=":
          return (s) => eq(l(s), r(s));
        case "!=":
        case "<>":
          return (s) => !eq(l(s), r(s));
        case "<":
          return (s) => compare(l(s), r(s), "<") < 0;
        case "<=":
          return (s) => compare(l(s), r(s), "<=") <= 0;
        case ">":
          return (s) => compare(l(s), r(s), ">") > 0;
        case ">=":
          return (s) => compare(l(s), r(s), ">=") >= 0;
        case "&&":
          return (s) => boolOperand(l(s), "&&") && boolOperand(r(s), "&&");
        case "||":
          return (s) => boolOperand(l(s), "||") || boolOperand(r(s), "||");
      }
      return unsupported("중위 연산자");
    }
    case "FUNCTION": {
      const name = n.value.toUpperCase();
      const def = FUNCTION_TABLE.get(name);
      const params = n.params ?? [];
      if (!def || (def.arity && (params.length < def.arity[0] || params.length > def.arity[1]))) {
        return unsupported(`함수 ${name}`);
      }
      const args = params.map((p) => build(p, env));
      if (name === "STR_MATCHES" && params[1]?.type === "STRING_LITERAL") {
        return literalMatches(args[0], params[1].value);
      }
      if (def.lazy) {
        const impl = def.impl;
        return (s) => impl(args.map((a) => () => a(s)), env);
      }
      const impl = def.impl;
      if (args.length === 1) {
        const a0 = args[0];
        return (s) => impl([a0(s)], env);
      }
      if (args.length === 2) {
        const [a0, a1] = args;
        return (s) => impl([a0(s), a1(s)], env);
      }
      return (s) => impl(args.map((a) => a(s)), env);
    }
    default:
      return unsupported(`노드 ${(n as { type: string }).type}`);
  }
}

/** 리터럴 정규식의 STR_MATCHES — 정규식을 컴파일 때 한 번 만든다. */
function literalMatches(subject: Compiled, re: string): Compiled {
  let regex: RegExp | FallbackSignal;
  try {
    regex = compileJavaRegex(re);
  } catch (e) {
    regex = e as FallbackSignal;
  }
  return (s) => {
    const v = subject(s);
    if (v === null) throw err("STR_MATCHES: NULL 인자");
    if (regex instanceof FallbackSignal) throw regex;
    return regex.test(str(v));
  };
}

function unsupported(what: string): Compiled {
  return () => {
    throw new FallbackSignal(`화면이 지원하지 않는 ${what}`);
  };
}

// ------------------------------------------------------------------ 평가

function outcomeOf(e: unknown): EvalOutcome {
  if (e instanceof EvalexError) return { kind: "error", code: e.code, message: e.message };
  if (e instanceof FallbackSignal) return { kind: "fallback", reason: e.reason };
  return { kind: "error", code: "EVALUATION_ERROR", message: String(e) };
}

/**
 * 식 평가(design §6.3 「evaluate 순서」): 예약 키 → isSupported → 키 누락(대소문자 무시) → 평가.
 * `prepare` 한 scope 를 넘기면 예약 키 검사와 정규화를 건너뛴다.
 */
export function evaluate(
  ast: AstNode,
  vars: Readonly<Record<string, EvalValue | number>>,
  opts: EvaluateOptions = {},
): EvalOutcome {
  try {
    const scope: Scope = isPrepared(vars) ? vars : normalize(vars);
    if (!isSupported(ast, opts)) return { kind: "fallback", reason: "화면이 지원하지 않는 노드·함수" };
    for (const name of usedVariables(ast)) {
      if (scope[name] === undefined) return { kind: "error", code: "MISSING_KEY", message: `레코드에 ${name} 키가 없다` };
    }
    return { kind: "value", value: compile(ast, opts)(scope) };
  } catch (e) {
    return outcomeOf(e);
  }
}

/** 조건식 평가 — 결과가 boolean 이 아니면 EVALUATION_ERROR(도메인 표준식·룰 조건 셀, EG 8.6). */
export function validate(
  ast: AstNode,
  vars: Readonly<Record<string, EvalValue | number>>,
  opts: EvaluateOptions = {},
): EvalOutcome {
  const out = evaluate(ast, vars, opts);
  if (out.kind === "value" && typeof out.value !== "boolean") {
    return { kind: "error", code: "EVALUATION_ERROR", message: "조건식 결과가 불린이 아니다" };
  }
  return out;
}
