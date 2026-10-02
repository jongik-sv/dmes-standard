/**
 * 경계값 테스트 케이스 후보 생성(카드 ⑥ [경계값 생성]) — 순수 함수, 서버를 부르지 않는다.
 *
 * 행 기준: NORMAL 행마다 조건 열을 그 행을 만족하는 대표값으로 채운 입력을 만들고, 구간·비교 셀의 유한한 끝마다
 * "끝 자체 · 안쪽 한 칸 · 바깥 한 칸" 으로 그 열만 바꾼 입력을 후보로 낸다. 기대값은 여기서 만들지 않는다(팝업이 서버 실행 결과로 채운다).
 *
 * 열 조건 기준(`groupConds`): 결과 열 그룹의 열 조건(서버가 파싱한 AST)에서 입력별 값 후보를 모아 그 곱을 엔진 `chooseGroups` 와 같은
 * 규칙으로 평가하고, 그룹마다 각 열을 고르는 첫 조합을 찾는다. 행마다 대표 입력에 그 조합을 덮어쓴 후보를 내고, 모든 후보의 비어 있는
 * 열 조건 입력은 기본 열 조합(없으면 첫 조합) 값으로 채운다. 식 텍스트는 읽지 않는다(불변 9 — AST 만 평가한다).
 */
import type { AstNode } from "@/contract/engine-contract.generated";
import { convertForType, evaluate, isSupported, prepare, usedVariables, type EvalValue } from "@/evalex";
import { D, PLAIN_DECIMAL, type Dec } from "@/evalex/decimal";
import { PatternRejected, classify } from "@/evalex/pattern";

import { parseCells, type CellObj } from "../decision-table/grid-model";
import type { ResolvedVar, StoredRow } from "../types";

/** 후보 상한 — 넘는 후보는 잘라 내고 건수만 알린다(서버 실행 요청 수를 묶는다). */
export const BOUNDARY_CASE_LIMIT = 200;

/** 열 조건 그룹 하나에서 평가할 값 조합 상한 — 넘으면 그 그룹은 반영하지 않고 사유를 알린다. */
export const GROUP_COMBO_LIMIT = 2000;

/** 자동 생성 케이스의 설명 칸. */
export const BOUNDARY_CASE_DESCRIPTION = "경계값 자동 생성";

export interface BoundaryCandidate {
  /** 후보 안에서 고유한 키(팝업 표의 행 키). */
  key: string;
  /** 출처 이름 — "3행 COIL_THK 아래끝−1". 100자 이하. */
  caseName: string;
  description: string;
  /** JSON 객체 문자열. 값은 문자열 또는 null(`inputJsonOf` 와 같은 모양, 타입 변환은 서버 엔진). */
  inputJson: string;
  /** 출처 행. */
  rowId: number;
  seq: number;
  /** 바꾼 조건 열. 대표 입력 그대로인 후보면 null. */
  varId: number | null;
  /** 점 이름 — "대표", "아래끝", "아래끝−1", "아래끝+1", "위끝", "위끝−1", "위끝+1", "NULL", "TRUE", "FALSE". */
  point: string;
}

export interface BoundarySkip {
  rowId: number;
  seq: number;
  /** 사용자에게 보이는 사유 — "COIL_THK 칸이 CONTAINS 라 대표값을 정하지 못합니다". */
  reason: string;
}

export interface BoundaryPlan {
  candidates: BoundaryCandidate[];
  skipped: BoundarySkip[];
  /** 상한으로 잘린 후보 수. */
  truncated: number;
  /** 열 조건 반영 중 알릴 사유(고르는 입력을 찾지 못한 열·화면에서 평가할 수 없는 열 조건·조합 상한). 없으면 필드가 없다. */
  groupNotes?: string[];
  /** 생성 자체를 막는 사유(조건 열 없음, 저장 전 행 있음). 있으면 candidates 는 빈 배열이다. */
  blocked: string | null;
}

export interface BoundaryPlanInput {
  /** 대상 버전의 해석된 변수(view.vars 또는 대상 버전 view 의 vars). */
  vars: readonly ResolvedVar[];
  /** 대상 표의 행(편집본이면 표 카드가 올린 행, 버전이면 그 버전의 저장된 행). */
  rows: readonly StoredRow[];
  /** 기본 입력 — 카드 ④ 의 현재 입력 객체. 조건 열이 아닌 키(결과 식이 읽는 입력 등)는 여기 값을 그대로 쓴다. */
  baseInput?: Readonly<Record<string, unknown>>;
  /** 이미 저장된 케이스의 inputJson — 같은 입력(파싱한 객체 비교)은 후보에서 뺀다. */
  existingInputs?: readonly string[];
  limit?: number;
  /** 결과 열 그룹의 열 조건 — 서버가 파싱한 AST(빈 열 조건은 ast null = 기본 열). 없으면 열 조건을 반영하지 않는다. */
  groupConds?: ReadonlyArray<{ group: string; columns: ReadonlyArray<GroupCondColumn> }>;
}

/** 결과 열 그룹의 열 하나 — 이름은 결과 변수 이름, seq 는 그 결과 변수의 seq(엔진이 열을 보는 순서). */
export interface GroupCondColumn {
  varId: number;
  name: string;
  seq: number;
  /** 서버가 파싱한 열 조건 AST. 빈 열 조건(기본 열)이거나 파싱하지 못했으면 null. */
  ast: AstNode | null;
  /** 거짓이면 화면에서 평가하지 못하는 열 조건(서버 supported=false·파싱 실패). ast 가 null 이어도 기본 열이 아니다. */
  supported: boolean;
}

const MINUS = "−";
const NAME_MAX = 100;
const NO_COND = "조건 열이 없어 경계값을 만들 수 없습니다.";
const UNSAVED = "저장하지 않은 행이 있습니다. 표를 먼저 저장한 뒤 경계값을 만드세요.";
/** NOT_NULL 일자의 대표값 — 오늘이 아니라 고정값(같은 표면 늘 같은 후보). */
const ANY_DATE = "20000101";
const RANGE: Record<string, { loOpen: boolean; hiOpen: boolean }> = {
  "<= 변수 <=": { loOpen: false, hiOpen: false },
  "<= 변수 <": { loOpen: false, hiOpen: true },
  "< 변수 <=": { loOpen: true, hiOpen: false },
  "< 변수 <": { loOpen: true, hiOpen: true },
};

/** 셀을 대표값으로 풀지 못한 사유 — 행 하나를 통째로 건너뛴다. */
class Unresolvable extends Error {}

type Kind = "number" | "date" | "string" | "boolean";

/** 열 하나의 값 산술(한 칸 이동·검사). 숫자·일자만 끝 계열 점을 만든다. */
interface Axis {
  kind: Kind;
  /** 원문을 이 열 값으로 읽을 수 있는지(못 읽으면 Unresolvable). 정규화한 원문을 돌려준다. */
  read(raw: string): string;
  /** raw 에서 n 칸(±1) 옮긴 값. string·boolean 은 쓰지 않는다. */
  shift(raw: string, n: 1 | -1): string;
  /** 두 값의 순서(음수·0·양수). 숫자는 Decimal, 일자는 파싱한 시각, 그 밖은 글자 순서. */
  cmp(a: string, b: string): number;
  /** 이 열에 없는 아무 값(NOT_NULL). */
  any: string;
}

interface Point {
  varId: number | null;
  point: string;
  value: string | null;
}

interface Plan {
  rep: Record<number, string | null>;
  points: Point[];
}

function kindOf(v: ResolvedVar): Kind {
  if (v.dataType === "BOOLEAN") return "boolean";
  if (v.dataType === "NUMBER") return "number";
  if (v.dateString || v.dataType === "DATE") return "date";
  return "string";
}

function fracDigits(raw: string): number {
  const dot = raw.indexOf(".");
  return PLAIN_DECIMAL.test(raw) && dot >= 0 ? raw.length - dot - 1 : 0;
}

/** scale 이 null 이면 그 열 셀들(left·right·list)의 최대 소수 자릿수 — 분석기 `scaleOf` 와 같다. */
function columnScale(v: ResolvedVar, cellsByRow: readonly Record<number, CellObj>[]): number {
  if (v.scale !== null && v.scale !== undefined) return v.scale;
  let s = 0;
  for (const cells of cellsByRow) {
    const c = cells[v.varId];
    if (!c || c.op === undefined) continue;
    for (const raw of [c.left, c.right, ...(c.list ?? [])]) if (typeof raw === "string") s = Math.max(s, fracDigits(raw));
  }
  return s;
}

function plainDecimal(d: Dec, digits: number): string {
  const s = d.toFixed(digits);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}

function numberAxis(name: string, scale: number): Axis {
  const step = new D(10).pow(-scale);
  const read = (raw: string) => {
    if (!PLAIN_DECIMAL.test(raw)) throw new Unresolvable(`${name} 칸 값 "${raw}" 을 숫자로 읽지 못해 대표값을 정하지 못합니다`);
    return raw;
  };
  return {
    kind: "number",
    read,
    // 셀 자릿수가 scale 보다 길면 그 자릿수로 적는다(±1 칸 값이 반올림으로 끝 자체와 같아지지 않게).
    shift: (raw, n) => plainDecimal(new D(read(raw)).plus(step.times(n)), Math.max(scale, fracDigits(raw))),
    cmp: (a, b) => new D(read(a)).cmp(new D(read(b))),
    any: "0",
  };
}

const textCmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const pad = (n: number, w: number) => String(n).padStart(w, "0");

function dateAxis(name: string): Axis {
  const parse = (raw: string): Date => {
    const m = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?$/.exec(raw);
    const bad = () => new Unresolvable(`${name} 칸 값 "${raw}" 이 일자(yyyyMMdd·yyyyMMddHHmmss)가 아니라 대표값을 정하지 못합니다`);
    if (!m) throw bad();
    const [y, mo, d, h, mi, s] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
    const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    t.setUTCFullYear(y); // 0~99 년을 1900 년대로 바꾸는 Date.UTC 보정
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || t.getUTCHours() !== h || t.getUTCMinutes() !== mi || t.getUTCSeconds() !== s) {
      throw bad();
    }
    return t;
  };
  const fmt = (t: Date, long: boolean) =>
    `${pad(t.getUTCFullYear(), 4)}${pad(t.getUTCMonth() + 1, 2)}${pad(t.getUTCDate(), 2)}` +
    (long ? `${pad(t.getUTCHours(), 2)}${pad(t.getUTCMinutes(), 2)}${pad(t.getUTCSeconds(), 2)}` : "");
  return {
    kind: "date",
    read: (raw) => (parse(raw), raw),
    shift: (raw, n) => {
      const t = parse(raw);
      const long = raw.length === 14;
      if (long) t.setUTCSeconds(t.getUTCSeconds() + n);
      else t.setUTCDate(t.getUTCDate() + n);
      return fmt(t, long);
    },
    cmp: (a, b) => Math.sign(parse(a).getTime() - parse(b).getTime()),
    any: ANY_DATE,
  };
}

function boolAxis(name: string): Axis {
  return {
    kind: "boolean",
    read: (raw) => {
      const u = raw.toUpperCase();
      if (u !== "TRUE" && u !== "FALSE") throw new Unresolvable(`${name} 칸 값 "${raw}" 을 참·거짓으로 읽지 못해 대표값을 정하지 못합니다`);
      return u === "TRUE" ? "true" : "false";
    },
    shift: () => {
      throw new Error("boolean 은 한 칸이 없다");
    },
    cmp: textCmp,
    any: "true",
  };
}

function stringAxis(): Axis {
  return {
    kind: "string",
    read: (raw) => raw,
    shift: () => {
      throw new Error("string 은 한 칸이 없다");
    },
    cmp: textCmp,
    any: "A",
  };
}

function axisOf(v: ResolvedVar, cellsByRow: readonly Record<number, CellObj>[]): Axis {
  const name = v.varName ?? "";
  switch (kindOf(v)) {
    case "number":
      return numberAxis(name, columnScale(v, cellsByRow));
    case "date":
      return dateAxis(name);
    case "boolean":
      return boolAxis(name);
    default:
      return stringAxis();
  }
}

function labelOf(v: ResolvedVar): string {
  return v.varName || v.label || `조건 열 ${v.seq}`;
}

/** 입력 키가 없는 조건 열(Expression 열·식 변수·이름 없는 열)의 이름 — varName 은 식 텍스트일 수 있어 쓰지 않는다. */
function keylessLabel(v: ResolvedVar): string {
  return v.label || `조건 열 ${v.seq}`;
}

function keylessWhy(v: ResolvedVar): string {
  if (v.dispType === "Expression") return "Expression 이라";
  if (v.exprVar) return "식 변수 조건이라";
  return "이름 없는 조건 열이라";
}

function cannot(v: ResolvedVar, op: string): Unresolvable {
  return new Unresolvable(`${labelOf(v)} 칸이 ${op} 라 대표값을 정하지 못합니다`);
}

function need(v: ResolvedVar, op: string, raw: string | undefined): string {
  if (typeof raw !== "string") throw cannot(v, op);
  return raw;
}

/** 대표값 하나 + 그 셀의 끝 계열 점. */
function planCell(v: ResolvedVar, axis: Axis, cell: CellObj | undefined): { rep: string | null; points: Point[] } {
  if (!cell || cell.op === undefined) {
    if (cell && Object.keys(cell).length > 0) throw cannot(v, "식");
    return { rep: null, points: [] };
  }
  const op = cell.op;
  const ordered = axis.kind === "number" || axis.kind === "date";
  const points: Point[] = [];
  const ends = (raw: string, prefix: string) => {
    points.push({ varId: v.varId, point: prefix, value: raw });
    points.push({ varId: v.varId, point: `${prefix}${MINUS}1`, value: axis.shift(raw, -1) });
    points.push({ varId: v.varId, point: `${prefix}+1`, value: axis.shift(raw, 1) });
  };
  const nullPoint = () => points.push({ varId: v.varId, point: "NULL", value: null });
  const notIn = (list: readonly string[]): string => {
    const seen = new Set(list);
    if (axis.kind === "boolean") {
      const v2 = ["true", "false"].find((x) => !seen.has(x));
      if (!v2) throw cannot(v, op);
      return v2;
    }
    if (ordered) {
      if (list.length === 0) return axis.any;
      const max = axis.kind === "number" ? list.reduce((a, b) => (new D(b).gt(a) ? b : a)) : [...list].sort().at(-1)!;
      let x = axis.shift(max, 1);
      while (seen.has(x)) x = axis.shift(x, 1);
      return x;
    }
    let x = (list[0] ?? "") + "X";
    while (seen.has(x)) x += "X";
    return x;
  };
  let rep: string;
  switch (op) {
    case "NA":
      return { rep: null, points: [] };
    case "IS_NULL":
      return { rep: null, points: [] };
    case "NOT_NULL":
      nullPoint();
      return { rep: axis.any, points };
    case "EQ":
    case "NE": {
      let raw = need(v, op, cell.left);
      if (axis.kind === "string" && op === "EQ") {
        let shape;
        try {
          shape = classify(raw);
        } catch (e) {
          if (e instanceof PatternRejected) throw cannot(v, "거부된 패턴");
          throw e;
        }
        if (shape.kind !== "exact") throw new Unresolvable(`${labelOf(v)} 칸이 패턴(${raw}) 이라 대표값을 정하지 못합니다`);
        raw = shape.lit;
      }
      raw = axis.read(raw);
      if (op === "EQ") rep = raw;
      else if (axis.kind === "boolean") rep = raw === "true" ? "false" : "true";
      else if (axis.kind === "string") rep = raw + "X";
      else rep = axis.shift(raw, 1);
      if (ordered) ends(raw, "값");
      break;
    }
    case "IN":
    case "NOT_IN": {
      const list = (cell.list ?? []).map((raw) => axis.read(raw));
      if (op === "IN") {
        if (list.length === 0) throw cannot(v, "빈 IN");
        rep = list[0];
      } else rep = notIn(list);
      break;
    }
    case "LT":
    case "LE":
    case "GT":
    case "GE": {
      const raw = axis.read(need(v, op, cell.left));
      const open = op === "LT" || op === "GT";
      const below = op === "LT" || op === "LE";
      if (open && !ordered) throw cannot(v, op);
      rep = open ? axis.shift(raw, below ? -1 : 1) : raw;
      if (ordered) ends(raw, below ? "위끝" : "아래끝");
      break;
    }
    default: {
      const range = RANGE[op];
      if (!range) throw cannot(v, op);
      const lo = axis.read(need(v, op, cell.left));
      const hi = axis.read(need(v, op, cell.right));
      if (range.loOpen && range.hiOpen && !ordered) throw cannot(v, op);
      rep = !range.loOpen ? lo : !range.hiOpen ? hi : axis.shift(lo, 1);
      // 열린 끝 안쪽 한 칸이 반대 끝을 넘거나(1 < x < 1.01, scale 2) lo > hi 면 대표값이 그 셀을 만족하지 않는다.
      const okLo = range.loOpen ? axis.cmp(rep, lo) > 0 : axis.cmp(rep, lo) >= 0;
      const okHi = range.hiOpen ? axis.cmp(rep, hi) < 0 : axis.cmp(rep, hi) <= 0;
      if (!okLo || !okHi) throw new Unresolvable(`${labelOf(v)} 칸의 구간이 비어 있어 대표값을 정하지 못합니다`);
      if (ordered) {
        ends(lo, "아래끝");
        ends(hi, "위끝");
      }
    }
  }
  nullPoint();
  return { rep, points };
}

/** 행 하나 → 대표 입력(조건 열 varId → 값) + 점들. 처리 불가 셀이 있으면 Unresolvable. */
function planRow(conds: readonly ResolvedVar[], keyless: readonly ResolvedVar[], axes: ReadonlyMap<number, Axis>, cells: Record<number, CellObj>): Plan {
  for (const v of keyless) {
    const c = cells[v.varId];
    if (c && c.op !== "NA" && Object.keys(c).length > 0) throw new Unresolvable(`${keylessLabel(v)} 칸이 ${keylessWhy(v)} 대표값을 정하지 못합니다`);
  }
  const rep: Record<number, string | null> = {};
  const points: Point[] = [];
  for (const v of conds) {
    const r = planCell(v, axes.get(v.varId)!, cells[v.varId]);
    rep[v.varId] = r.rep;
    if (axes.get(v.varId)!.kind === "boolean") {
      points.push({ varId: v.varId, point: "TRUE", value: "true" }, { varId: v.varId, point: "FALSE", value: "false" });
    }
    points.push(...r.points);
  }
  return { rep, points };
}

/**
 * 중복 비교 키 — 키는 대문자 정렬, 값은 null 이면 null. NUMBER 조건 열(`numeric`, 대문자 이름)의 숫자 값은 Decimal 정규형
 * ("1.0"·"1"·1·"+1" 이 같다), 나머지 문자열은 그대로, 문자열이 아닌 값은 JSON(객체가 "[object Object]" 로 뭉개지지 않게).
 */
function dedupKey(obj: Readonly<Record<string, unknown>>, numeric: ReadonlySet<string>): string {
  const norm = (k: string, v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (numeric.has(k)) {
      if (typeof v === "number" && Number.isFinite(v)) return new D(v).toString();
      if (typeof v === "string" && PLAIN_DECIMAL.test(v)) return new D(v).toString();
    }
    return typeof v === "string" ? v : JSON.stringify(v);
  };
  return JSON.stringify(
    Object.entries(obj)
      .map(([k, v]) => [k.toUpperCase(), norm(k.toUpperCase(), v)] as const)
      .sort((a, b) => textCmp(a[0], b[0])),
  );
}

function existingKeys(inputs: readonly string[], numeric: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const s of inputs) {
    try {
      const v = JSON.parse(s) as unknown;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) out.add(dedupKey(v as Record<string, unknown>, numeric));
    } catch {
      // 읽지 못하는 기존 입력은 비교에서 뺀다.
    }
  }
  return out;
}

// ------------------------------------------------------------------ 결과 열 그룹의 열 조건

type GKind = "number" | "boolean" | "string";

/** 열 조건 입력 하나의 값 후보(입력 JSON 에 싣는 문자열)와 평가용 값. */
interface GVar {
  name: string;
  texts: string[];
  typed: EvalValue[];
}

type ColRole = "default" | "cond" | "unsupported";

interface GCol {
  col: GroupCondColumn;
  role: ColRole;
}

interface GGroup {
  group: string;
  cols: GCol[];
  vars: GVar[];
  /** 조합 수가 상한을 넘으면 그 수. */
  overflow: number | null;
}

/** 열 조건 입력 이름(대문자) → 값. null 은 NULL. */
type Combo = Record<string, string | null>;

interface GroupSearch {
  /** 열 varId → 그 열을 고르는 첫 조합. */
  byCol: Map<number, Combo>;
  /** 아무 열도 고르지 않는 첫 조합(오류 없이 끝까지 본 경우). */
  none: Combo | null;
  /** 채우기 값 — 기본 열 조합, 기본 열이 없으면 첫 조합. */
  fill: Combo | null;
}

const COMPARE_OPS: ReadonlySet<string> = new Set(["=", "==", "!=", "<>", "<", "<=", ">", ">="]);
const STRING_FNS: Record<string, "prefix" | "suffix" | "contains"> = { STR_STARTS_WITH: "prefix", STR_ENDS_WITH: "suffix", STR_CONTAINS: "contains" };
const NONE_TRIES = ["X", "Y", "Z", "Q", "J", "K", "_", "~"];

/** 입력 하나에 대해 열 조건 AST 에서 모은 것. */
interface Collected {
  /** 숫자 상수(식 순서). */
  nums: string[];
  /** 문자열 상수(같음·IN 류·패턴 리터럴, 식 순서). */
  strs: string[];
  /** 같음 비교·IN 류 상수(안 걸리는 값 검사용). */
  eqs: string[];
  prefix: string[];
  suffix: string[];
  contains: string[];
  bool: boolean;
}

function collectConsts(ast: AstNode, names: ReadonlySet<string>, acc: Map<string, Collected>): void {
  const entry = (name: string): Collected => {
    let e = acc.get(name);
    if (!e) acc.set(name, (e = { nums: [], strs: [], eqs: [], prefix: [], suffix: [], contains: [], bool: false }));
    return e;
  };
  const varOf = (n: AstNode): string | null => (n.type === "VARIABLE_OR_CONSTANT" && names.has(n.value.toUpperCase()) ? n.value.toUpperCase() : null);
  const litOf = (n: AstNode): { kind: "num" | "str" | "bool"; text: string } | null => {
    if (n.type === "NUMBER_LITERAL") return { kind: "num", text: n.value };
    if (n.type === "STRING_LITERAL") return { kind: "str", text: n.value };
    if (n.type === "PREFIX_OPERATOR" && n.value === "-" && n.params[0].type === "NUMBER_LITERAL") return { kind: "num", text: `-${n.params[0].value}` };
    if (n.type === "VARIABLE_OR_CONSTANT" && !names.has(n.value.toUpperCase()) && /^(TRUE|FALSE)$/i.test(n.value)) return { kind: "bool", text: n.value.toLowerCase() };
    return null;
  };
  const addEq = (name: string, lit: { kind: "num" | "str" | "bool"; text: string }) => {
    const e = entry(name);
    if (lit.kind === "num") e.nums.push(lit.text);
    else if (lit.kind === "bool") e.bool = true;
    else e.strs.push(lit.text);
    if (lit.kind !== "bool") e.eqs.push(lit.text);
  };
  const markBool = (n: AstNode) => {
    const v = varOf(n);
    if (v) entry(v).bool = true;
  };
  const walk = (n: AstNode): void => {
    switch (n.type) {
      case "INFIX_OPERATOR": {
        const [a, b] = n.params;
        if (COMPARE_OPS.has(n.value)) {
          const va = varOf(a);
          const vb = varOf(b);
          const la = litOf(a);
          const lb = litOf(b);
          if (va && lb) addEq(va, lb);
          else if (vb && la) addEq(vb, la);
        } else if (n.value === "&&" || n.value === "||") {
          markBool(a);
          markBool(b);
        }
        walk(a);
        walk(b);
        return;
      }
      case "PREFIX_OPERATOR":
        if (n.value === "!") markBool(n.params[0]);
        walk(n.params[0]);
        return;
      case "FUNCTION": {
        const fname = n.value.toUpperCase();
        const params: readonly AstNode[] = n.params ?? [];
        const v = params.length > 0 ? varOf(params[0]) : null;
        const pattern = STRING_FNS[fname];
        if (v && pattern && params.length === 2 && params[1].type === "STRING_LITERAL") {
          const e = entry(v);
          e[pattern].push(params[1].value);
          e.strs.push(params[1].value);
        } else if (v && fname === "NOT") {
          entry(v).bool = true;
        } else if (v && params.length > 1) {
          // IN 류 — 첫 인자가 입력이고 나머지가 모두 상수면 그 상수들과 같은 값을 후보로 둔다.
          const lits = params.slice(1).map(litOf);
          if (lits.every((l) => l !== null)) for (const l of lits) addEq(v, l!);
        }
        for (const p of params) walk(p);
        return;
      }
      default:
        return;
    }
  };
  walk(ast);
}

/** 어느 같음 상수와도 다르고 어느 접두·접미·포함 상수에도 걸리지 않는 글자. 못 찾으면 null(예: 빈 접두). */
function noneValue(c: Collected): string | null {
  const hit = (x: string) =>
    c.eqs.includes(x) || c.prefix.some((p) => x.startsWith(p)) || c.suffix.some((p) => x.endsWith(p)) || c.contains.some((p) => x.includes(p));
  for (const base of NONE_TRIES) {
    for (let x = base; x.length <= 4; x += base) if (!hit(x)) return x;
  }
  return null;
}

function shiftNumber(raw: string, n: 1 | -1): string {
  const digits = fracDigits(raw);
  return plainDecimal(new D(raw).plus(new D(10).pow(-digits).times(n)), digits);
}

function uniq(list: readonly string[]): string[] {
  return [...new Set(list)];
}

/** 입력 하나의 값 후보. 조건 열과 이름이 겹치면 그 열 타입을 따른다. */
function gvarOf(name: string, c: Collected, condKind: Kind | undefined): GVar {
  const kind: GKind =
    condKind === "number" || condKind === "boolean"
      ? condKind
      : condKind
        ? "string"
        : c.nums.length > 0 && c.strs.length === 0
          ? "number"
          : c.bool && c.nums.length === 0 && c.strs.length === 0
            ? "boolean"
            : "string";
  let texts: string[];
  if (kind === "number") {
    const nums = c.nums.filter((x) => PLAIN_DECIMAL.test(x));
    texts = nums.length === 0 ? ["0"] : uniq(nums.flatMap((x) => [x, shiftNumber(x, -1), shiftNumber(x, 1)]));
  } else if (kind === "boolean") {
    texts = ["false", "true"];
  } else {
    const none = noneValue(c);
    texts = uniq([...(none === null ? [] : [none]), ...c.strs, ...c.nums]);
    if (texts.length === 0) texts = ["X"];
  }
  return { name, texts, typed: texts.map((t) => typedOf(kind, t)) };
}

function typedOf(kind: GKind | Kind, text: string | null): EvalValue {
  if (text === null) return null;
  if (kind === "number") return convertForType(text, "NUMBER");
  if (kind === "boolean") return text === "true";
  return text;
}

/** 그룹 하나 → 열 역할·입력별 값 후보·조합 수. */
function prepareGroup(
  g: { group: string; columns: ReadonlyArray<GroupCondColumn> },
  condKinds: ReadonlyMap<string, Kind>,
): GGroup {
  const cols: GCol[] = [...g.columns]
    .sort((a, b) => a.seq - b.seq || a.varId - b.varId)
    .map((col) => {
      if (!col.supported) return { col, role: "unsupported" };
      if (col.ast === null) return { col, role: "default" };
      return { col, role: isSupported(col.ast) ? "cond" : "unsupported" };
    });
  const names: string[] = [];
  for (const c of cols) if (c.role === "cond") for (const n of usedVariables(c.col.ast!)) if (!names.includes(n)) names.push(n);
  const nameSet = new Set(names);
  const acc = new Map<string, Collected>();
  for (const c of cols) if (c.role === "cond") collectConsts(c.col.ast!, nameSet, acc);
  const empty: Collected = { nums: [], strs: [], eqs: [], prefix: [], suffix: [], contains: [], bool: false };
  const vars = names.map((n) => gvarOf(n, acc.get(n) ?? empty, condKinds.get(n)));
  const size = vars.reduce((p, v) => p * v.texts.length, 1);
  return { group: g.group, cols, vars, overflow: size > GROUP_COMBO_LIMIT ? size : null };
}

/**
 * 값 조합을 엔진 `chooseGroups` 규칙으로 평가해 열마다 첫 조합을 찾는다. `fixed` 는 값을 고정한 입력(조건 열과 겹치는 이름).
 * 열을 seq 순으로 보며 기본 열이면 고르고 멈추고, 참이면 고르고 멈추고, 거짓·NULL 이면 다음 열로 간다. 오류·참거짓이 아닌 값이면
 * 엔진이 멈추므로 그 조합은 버린다. 화면에서 평가할 수 없는 열 조건은 거짓으로 본다(그 열은 사유로 알린다).
 */
function searchGroup(g: GGroup, fixed: Readonly<Record<string, EvalValue>>): GroupSearch {
  const free = g.vars.filter((v) => !(v.name in fixed));
  const byCol = new Map<number, Combo>();
  let none: Combo | null = null;
  let first: Combo | null = null;
  const idx = free.map(() => 0);
  const hasDefault = g.cols.some((c) => c.role === "default");
  for (;;) {
    const combo: Combo = {};
    const record: Record<string, EvalValue> = { ...fixed };
    free.forEach((v, i) => {
      combo[v.name] = v.texts[idx[i]];
      record[v.name] = v.typed[idx[i]];
    });
    first ??= combo;
    const pick = chooseColumn(g.cols, record);
    if (pick !== undefined) {
      if (pick === null) none ??= combo;
      else if (!byCol.has(pick)) byCol.set(pick, combo);
    }
    // 다음 조합(마지막 입력이 가장 빨리 바뀐다).
    let k = free.length - 1;
    while (k >= 0 && ++idx[k] >= free[k].texts.length) idx[k--] = 0;
    if (k < 0) break;
  }
  const def = g.cols.find((c) => c.role === "default");
  return { byCol, none, fill: hasDefault ? (byCol.get(def!.col.varId) ?? first) : first };
}

/** 고른 열 varId, 아무 열도 안 고르면 null, 엔진이 멈추는 조합이면 undefined. */
function chooseColumn(cols: readonly GCol[], record: Readonly<Record<string, EvalValue>>): number | null | undefined {
  let scope;
  try {
    scope = prepare(record);
  } catch {
    return undefined;
  }
  for (const c of cols) {
    if (c.role === "default") return c.col.varId;
    if (c.role === "unsupported") continue;
    const out = evaluate(c.col.ast!, scope);
    if (out.kind !== "value") return undefined;
    if (out.value === true) return c.col.varId;
    if (out.value !== false && out.value !== null) return undefined;
  }
  return null;
}

/** 전체 탐색 결과 → 사유. 조합 상한을 넘은 그룹은 그 사유 하나. */
function groupNotesOf(g: GGroup, all: GroupSearch | null): string[] {
  if (g.overflow !== null) return [`${g.group} 의 열 조건 입력 조합이 ${g.overflow}개로 상한 ${GROUP_COMBO_LIMIT}개를 넘어 열 조건을 반영하지 않았습니다`];
  const out: string[] = [];
  for (const c of g.cols) {
    if (c.role === "unsupported") out.push(`${g.group} 의 ${c.col.name} 열 조건은 화면에서 평가할 수 없어 고르는 입력을 찾지 못했습니다`);
    else if (!all?.byCol.has(c.col.varId)) out.push(`${g.group} 의 ${c.col.name} 열을 고르는 입력을 찾지 못했습니다`);
  }
  return out;
}

/** out 에서 대소문자만 다른 같은 키를 찾아 그 키에 쓴다(없으면 name 으로 더한다) — 대소문자만 다른 키 둘은 RESERVED_KEY 다. */
function setKey(out: Record<string, unknown>, name: string, value: unknown): void {
  const k = Object.keys(out).find((x) => x.toUpperCase() === name) ?? name;
  out[k] = value;
}

function getKey(out: Readonly<Record<string, unknown>>, name: string): unknown {
  const k = Object.keys(out).find((x) => x.toUpperCase() === name);
  return k === undefined ? undefined : out[k];
}

const blocked = (reason: string): BoundaryPlan => ({ candidates: [], skipped: [], truncated: 0, blocked: reason });

export function planBoundaryCases(input: BoundaryPlanInput): BoundaryPlan {
  const bySeq = (a: { seq: number }, b: { seq: number }) => a.seq - b.seq;
  const condAll = input.vars.filter((v) => v.varKind === "COND");
  const conds = condAll.filter((v) => v.dispType !== "Expression" && !!v.varName && !v.exprVar).sort((a, b) => bySeq(a, b) || a.varId - b.varId);
  if (conds.length === 0) return blocked(NO_COND);
  if (input.rows.some((r) => r.rowId < 0)) return blocked(UNSAVED);
  // 입력 키로 채울 수 없는 조건 열 — NA 아닌 셀이 든 행은 대표값을 정하지 못한다.
  const keyless = condAll.filter((v) => !conds.includes(v));

  const rows = input.rows
    .filter((r) => r.rowKind === "NORMAL")
    .map((r) => ({ row: r, cells: parseCells(r.cells) }))
    .sort((a, b) => a.row.seq - b.row.seq || a.row.rowId - b.row.rowId);
  const allCells = input.rows.map((r) => parseCells(r.cells));
  const axes = new Map(conds.map((v) => [v.varId, axisOf(v, allCells)] as const));

  const condNames = new Set(conds.map((v) => v.varName!.toUpperCase()));
  const base: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.baseInput ?? {})) if (!condNames.has(k.toUpperCase())) base[k] = v;

  // 열 조건 — 그룹마다 열 역할·값 후보를 정하고 전체 조합으로 한 번 찾는다(사유·채우기 값). 조건 열과 겹치는 입력은 조건 열 값이 우선이다.
  const condKinds = new Map(conds.map((v) => [v.varName!.toUpperCase(), kindOf(v)] as const));
  const condByName = new Map(conds.map((v) => [v.varName!.toUpperCase(), v] as const));
  const groups = (input.groupConds ?? []).map((g) => prepareGroup(g, condKinds));
  const groupNotes: string[] = [];
  const fills: Array<[string, string | null]> = [];
  const searches = new Map<string, GroupSearch>();
  const searchOf = (g: GGroup, fixedText: Record<string, string | null>): GroupSearch => {
    const key = `${g.group}\u0000${JSON.stringify(fixedText)}`;
    let r = searches.get(key);
    if (!r) {
      const fixed: Record<string, EvalValue> = {};
      for (const [k, t] of Object.entries(fixedText)) fixed[k] = typedOf(condKinds.get(k)!, t);
      searches.set(key, (r = searchGroup(g, fixed)));
    }
    return r;
  };
  for (const g of groups) {
    const all = g.overflow === null ? searchOf(g, {}) : null;
    groupNotes.push(...groupNotesOf(g, all));
    for (const [k, t] of Object.entries(all?.fill ?? {})) if (!condNames.has(k) && !fills.some(([f]) => f === k)) fills.push([k, t]);
  }

  const inputOf = (rep: Record<number, string | null>, change?: Point, overlay?: Combo): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const v of conds) out[v.varName!] = change && change.varId === v.varId ? change.value : rep[v.varId];
    Object.assign(out, base);
    for (const [k, t] of fills) {
      const cur = getKey(out, k);
      if (cur === undefined || cur === null || cur === "") setKey(out, k, t);
    }
    for (const [k, t] of Object.entries(overlay ?? {})) if (!condNames.has(k)) setKey(out, k, t);
    return out;
  };
  /** 행의 대표 입력에 그룹별·열별 조합을 덮어쓴 점들. 조건 열과 겹치는 입력은 그 행 대표값으로 고정해 찾는다. */
  const columnPoints = (plan: Plan): Array<{ key: string; name: string; varId: number | null; point: string; overlay: Combo }> => {
    const out: Array<{ key: string; name: string; varId: number | null; point: string; overlay: Combo }> = [];
    for (const g of groups) {
      if (g.overflow !== null) continue;
      const fixed: Record<string, string | null> = {};
      for (const v of g.vars) {
        const c = condByName.get(v.name);
        if (c) fixed[v.name] = plan.rep[c.varId];
      }
      const r = searchOf(g, fixed);
      for (const c of g.cols) {
        const combo = r.byCol.get(c.col.varId);
        if (combo) out.push({ key: `${g.group}:${c.col.varId}`, name: `${g.group}→${c.col.name}`, varId: c.col.varId, point: `열:${c.col.name}`, overlay: combo });
      }
      if (r.none) out.push({ key: `${g.group}:-`, name: `${g.group}→열 없음`, varId: null, point: "열:없음", overlay: r.none });
    }
    return out;
  };

  const numeric = new Set(conds.filter((v) => kindOf(v) === "number").map((v) => v.varName!.toUpperCase()));
  const seen = existingKeys(input.existingInputs ?? [], numeric);
  const candidates: BoundaryCandidate[] = [];
  const push = (json: string, c: Omit<BoundaryCandidate, "inputJson" | "description" | "caseName"> & { caseName: string }) => {
    // 저장될 모양(직렬화 → 파싱)으로 견준다 — baseInput 의 undefined 는 빠지고 NaN 은 null 이 된다.
    const k = dedupKey(JSON.parse(json) as Record<string, unknown>, numeric);
    if (seen.has(k)) return;
    seen.add(k);
    const name = c.caseName;
    candidates.push({ ...c, caseName: name.length > NAME_MAX ? name.slice(0, NAME_MAX) : name, description: BOUNDARY_CASE_DESCRIPTION, inputJson: json });
  };
  const skipped: BoundarySkip[] = [];
  const nameOf = new Map(conds.map((v) => [v.varId, v.varName!] as const));
  for (const { row, cells } of rows) {
    let plan: Plan;
    try {
      plan = planRow(conds, keyless, axes, cells);
    } catch (e) {
      if (!(e instanceof Unresolvable)) throw e;
      skipped.push({ rowId: row.rowId, seq: row.seq, reason: e.message });
      continue;
    }
    const all: Point[] = [{ varId: null, point: "대표", value: null }, ...plan.points];
    for (const p of all) {
      push(JSON.stringify(p.varId === null ? inputOf(plan.rep) : inputOf(plan.rep, p)), {
        key: `${row.rowId}:${p.varId ?? "-"}:${p.point}`,
        caseName: p.varId === null ? `${row.seq}행 대표` : `${row.seq}행 ${nameOf.get(p.varId)} ${p.point}`,
        rowId: row.rowId,
        seq: row.seq,
        varId: p.varId,
        point: p.point,
      });
    }
    for (const c of columnPoints(plan)) {
      push(JSON.stringify(inputOf(plan.rep, undefined, c.overlay)), {
        key: `${row.rowId}:열:${c.key}`,
        caseName: `${row.seq}행 ${c.name}`,
        rowId: row.rowId,
        seq: row.seq,
        varId: c.varId,
        point: c.point,
      });
    }
  }
  const limit = input.limit ?? BOUNDARY_CASE_LIMIT;
  return {
    candidates: candidates.slice(0, limit),
    skipped,
    truncated: Math.max(0, candidates.length - limit),
    blocked: null,
    ...(groupNotes.length > 0 ? { groupNotes } : {}),
  };
}
