import type { Dec } from "./decimal";

/**
 * 값 집합 대수(TSK-03-04 design §6.8). 값 공간은 `도메인 값 ∪ {NULL}` 이다(06:354).
 *
 * 영역: decimal(NUMBER, 연속), integer(일자 String·Boolean, 1 단위 이산), string(그 밖의 STRING, UTF-16 코드유닛 순서).
 * integer 영역은 만들 때 열린 끝을 닫힌 정수 끝으로 바꾸므로 비어 있는지 판정이 `lo <= hi` 한 줄이 된다.
 */
export type Coord = Dec | string;
export type Bound = { v: Coord; open: boolean } | null;
export interface Interval {
  lo: Bound;
  hi: Bound;
}
export type ValueSet =
  | { kind: "exact"; intervals: Interval[]; hasNull: boolean }
  | { kind: "unknown"; hasNull: boolean };
export type ExactSet = Extract<ValueSet, { kind: "exact" }>;

export interface Domain {
  kind: "decimal" | "integer" | "string";
  min?: Dec;
  max?: Dec;
}

function cmp(a: Coord, b: Coord): number {
  if (typeof a === "string" || typeof b === "string") {
    const x = String(a);
    const y = String(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a.cmp(b);
}

function nonEmpty(iv: Interval): boolean {
  if (!iv.lo || !iv.hi) return true;
  const c = cmp(iv.lo.v, iv.hi.v);
  return c < 0 || (c === 0 && !iv.lo.open && !iv.hi.open);
}

/** 두 아래 끝 가운데 큰 쪽(같으면 열림 우선). */
function maxLo(a: Bound, b: Bound): Bound {
  if (!a) return b;
  if (!b) return a;
  const c = cmp(a.v, b.v);
  if (c !== 0) return c > 0 ? a : b;
  return { v: a.v, open: a.open || b.open };
}

/** 두 위 끝 가운데 작은 쪽(같으면 열림 우선). */
function minHi(a: Bound, b: Bound): Bound {
  if (!a) return b;
  if (!b) return a;
  const c = cmp(a.v, b.v);
  if (c !== 0) return c < 0 ? a : b;
  return { v: a.v, open: a.open || b.open };
}

/** 정렬·병합·정수 끝 정규화. */
export function normalize(intervals: Interval[], domain: Domain): Interval[] {
  let list = intervals;
  if (domain.kind === "integer") {
    list = [];
    for (const iv of intervals) {
      let lo: Bound = iv.lo ? { v: (iv.lo.v as Dec)[iv.lo.open ? "floor" : "ceil"]().plus(iv.lo.open ? 1 : 0), open: false } : null;
      let hi: Bound = iv.hi ? { v: (iv.hi.v as Dec)[iv.hi.open ? "ceil" : "floor"]().minus(iv.hi.open ? 1 : 0), open: false } : null;
      if (domain.min && (!lo || (lo.v as Dec).lt(domain.min))) lo = { v: domain.min, open: false };
      if (domain.max && (!hi || (hi.v as Dec).gt(domain.max))) hi = { v: domain.max, open: false };
      list.push({ lo, hi });
    }
  }
  const sorted = list.filter(nonEmpty).sort((a, b) => {
    if (!a.lo) return b.lo ? -1 : 0;
    if (!b.lo) return 1;
    const c = cmp(a.lo.v, b.lo.v);
    if (c !== 0) return c;
    return Number(a.lo.open) - Number(b.lo.open);
  });
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && touches(last, iv, domain)) {
      last.hi = !last.hi || !iv.hi ? null : cmp(iv.hi.v, last.hi.v) > 0 || (cmp(iv.hi.v, last.hi.v) === 0 && !iv.hi.open) ? iv.hi : last.hi;
    } else {
      out.push({ lo: iv.lo, hi: iv.hi });
    }
  }
  return out;
}

/** 앞 구간 a 와 뒤 구간 b(b.lo ≥ a.lo)가 겹치거나 맞닿는가. */
function touches(a: Interval, b: Interval, domain: Domain): boolean {
  if (!a.hi || !b.lo) return true;
  const c = cmp(b.lo.v, a.hi.v);
  if (domain.kind === "integer") return (b.lo.v as Dec).lte((a.hi.v as Dec).plus(1));
  return c < 0 || (c === 0 && !(a.hi.open && b.lo.open));
}

export function full(domain: Domain, hasNull: boolean): ExactSet {
  return exact([{ lo: null, hi: null }], domain, hasNull);
}

export function exact(intervals: Interval[], domain: Domain, hasNull: boolean): ExactSet {
  return { kind: "exact", intervals: normalize(intervals, domain), hasNull };
}

export function point(v: Coord, domain: Domain): ExactSet {
  return exact([{ lo: { v, open: false }, hi: { v, open: false } }], domain, false);
}

export function intersect(a: ExactSet, b: ExactSet, domain: Domain): ExactSet {
  const out: Interval[] = [];
  for (const x of a.intervals) {
    for (const y of b.intervals) {
      const iv = { lo: maxLo(x.lo, y.lo), hi: minHi(x.hi, y.hi) };
      if (nonEmpty(iv)) out.push(iv);
    }
  }
  return exact(out, domain, a.hasNull && b.hasNull);
}

export function union(list: ExactSet[], domain: Domain): ExactSet {
  return exact(
    list.flatMap((s) => s.intervals),
    domain,
    list.some((s) => s.hasNull),
  );
}

/** 비NULL 여집합(NULL 은 싣지 않는다). */
export function complementNonNull(a: ExactSet, domain: Domain): ExactSet {
  const out: Interval[] = [];
  let lo: Bound = null;
  let first = true;
  for (const iv of a.intervals) {
    if (first) {
      first = false;
      if (iv.lo) out.push({ lo: null, hi: { v: iv.lo.v, open: !iv.lo.open } });
    } else if (iv.lo) {
      out.push({ lo, hi: { v: iv.lo.v, open: !iv.lo.open } });
    }
    lo = iv.hi ? { v: iv.hi.v, open: !iv.hi.open } : null;
    if (!iv.hi) return exact(out, domain, false);
  }
  if (first) return full(domain, false);
  out.push({ lo, hi: null });
  return exact(out, domain, false);
}

export function subtract(a: ExactSet, b: ExactSet, domain: Domain): ExactSet {
  const s = intersect(a, complementNonNull(b, domain), domain);
  return { kind: "exact", intervals: s.intervals, hasNull: a.hasNull && !b.hasNull };
}

export function isEmpty(a: ExactSet): boolean {
  return a.intervals.length === 0 && !a.hasNull;
}

/** a ⊆ b. */
export function isSubset(a: ExactSet, b: ExactSet, domain: Domain): boolean {
  return isEmpty(subtract(a, b, domain));
}

/** 격자 계산용 — 유한한 두 끝을 가진 구간인가. */
export function isBounded(iv: Interval): iv is { lo: { v: Coord; open: boolean }; hi: { v: Coord; open: boolean } } {
  return iv.lo !== null && iv.hi !== null;
}

