/**
 * 경계값 테스트 케이스 후보 생성(카드 ⑥ [경계값 생성]) — 순수 함수, 서버를 부르지 않는다.
 *
 * 행 기준: NORMAL 행마다 조건 열을 그 행을 만족하는 대표값으로 채운 입력을 만들고, 구간·비교 셀의 유한한 끝마다
 * "끝 자체 · 안쪽 한 칸 · 바깥 한 칸" 으로 그 열만 바꾼 입력을 후보로 낸다. 기대값은 여기서 만들지 않는다(팝업이 서버 실행 결과로 채운다).
 */
import { D, PLAIN_DECIMAL, type Dec } from "@/evalex/decimal";
import { PatternRejected, classify } from "@/evalex/pattern";

import { parseCells, type CellObj } from "../decision-table/grid-model";
import type { ResolvedVar, StoredRow } from "../types";

/** 후보 상한 — 넘는 후보는 잘라 내고 건수만 알린다(서버 실행 요청 수를 묶는다). */
export const BOUNDARY_CASE_LIMIT = 100;

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
  const inputOf = (rep: Record<number, string | null>, change?: Point): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const v of conds) out[v.varName!] = change && change.varId === v.varId ? change.value : rep[v.varId];
    return Object.assign(out, base);
  };

  const numeric = new Set(conds.filter((v) => kindOf(v) === "number").map((v) => v.varName!.toUpperCase()));
  const seen = existingKeys(input.existingInputs ?? [], numeric);
  const candidates: BoundaryCandidate[] = [];
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
      const json = JSON.stringify(p.varId === null ? inputOf(plan.rep) : inputOf(plan.rep, p));
      // 저장될 모양(직렬화 → 파싱)으로 견준다 — baseInput 의 undefined 는 빠지고 NaN 은 null 이 된다.
      const k = dedupKey(JSON.parse(json) as Record<string, unknown>, numeric);
      if (seen.has(k)) continue;
      seen.add(k);
      const name = p.varId === null ? `${row.seq}행 대표` : `${row.seq}행 ${nameOf.get(p.varId)} ${p.point}`;
      candidates.push({
        key: `${row.rowId}:${p.varId ?? "-"}:${p.point}`,
        caseName: name.length > NAME_MAX ? name.slice(0, NAME_MAX) : name,
        description: BOUNDARY_CASE_DESCRIPTION,
        inputJson: json,
        rowId: row.rowId,
        seq: row.seq,
        varId: p.varId,
        point: p.point,
      });
    }
  }
  const limit = input.limit ?? BOUNDARY_CASE_LIMIT;
  return { candidates: candidates.slice(0, limit), skipped, truncated: Math.max(0, candidates.length - limit), blocked: null };
}
