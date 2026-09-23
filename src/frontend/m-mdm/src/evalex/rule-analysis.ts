import type { CellJson } from "../contract/engine-contract.generated";
import { D, PLAIN_DECIMAL, type Dec } from "./decimal";
import { cellSummary } from "./input-contract";
import { PatternRejected, classify, succ } from "./pattern";
import { condVars, effectivePolicy, isExpressionColumn, normalRows, type RuleDef, type RuleRowDef, type RuleVarDef } from "./rule-model";
import {
  complementNonNull,
  exact,
  full,
  intersect,
  isBounded,
  isEmpty,
  isSubset,
  point,
  subtract,
  union,
  type Coord,
  type Domain,
  type ExactSet,
  type Interval,
  type ValueSet,
} from "./value-set";

/**
 * 겹침·빈틈·도달 불가 분석(TSK-03-04 design §6.8, 06 「저장 시 검사」). 조건 열마다 셀을 값 집합으로 바꿔 행끼리 견준다.
 * UNIQUE 표의 겹침은 오류, 나머지는 경고다(06:364).
 */
export type RuleIssueCode = "ALL_NA_ROW" | "UNRESOLVED_CELL" | "OVERLAP" | "OVERLAP_UNRESOLVED" | "UNREACHABLE" | "VALUE_GAP" | "NULL_GAP";

export interface RuleIssue {
  code: RuleIssueCode;
  severity: "ERROR" | "WARNING";
  rowIds: number[];
  varId?: number;
  lower?: string;
  upper?: string;
  message: string;
}

const RANGE_OPS: Record<string, [boolean, boolean]> = {
  "<= 변수 <=": [false, false],
  "<= 변수 <": [false, true],
  "< 변수 <=": [true, false],
  "< 변수 <": [true, true],
};

const BOOL_DOMAIN: Domain = { kind: "integer", min: new D(0), max: new D(1) };

/** 조건 열의 값 영역. Expression 열의 셀은 NA 가 아니면 못 푸는 셀이라 영역은 자리만 채운다. */
function domainOf(v: RuleVarDef): Domain {
  if (isExpressionColumn(v)) return { kind: "string" };
  if (v.dataType === "NUMBER") return { kind: "decimal" };
  if (v.dataType === "BOOLEAN") return BOOL_DOMAIN;
  if (v.dateString || v.dataType === "DATE") return { kind: "integer" };
  return { kind: "string" };
}

function coord(raw: string, v: RuleVarDef, domain: Domain): Coord | undefined {
  switch (domain.kind) {
    case "decimal":
      return PLAIN_DECIMAL.test(raw) ? new D(raw) : undefined;
    case "integer":
      if (v.dataType === "BOOLEAN") {
        const u = raw.toUpperCase();
        return u === "TRUE" ? new D(1) : u === "FALSE" ? new D(0) : undefined;
      }
      return /^\d+$/.test(raw) ? new D(raw) : undefined;
    case "string":
      return raw;
  }
}

const UNKNOWN_NO_NULL: ValueSet = { kind: "unknown", hasNull: false };
const UNKNOWN_NULL: ValueSet = { kind: "unknown", hasNull: true };

/** 셀 → 값 집합(design §6.8 표). 가드된 셀은 NULL 을 덮지 않는다. */
function cellSet(v: RuleVarDef, domain: Domain, cell: CellJson | undefined): ValueSet {
  if (!cell) return UNKNOWN_NULL;
  if (!("op" in cell)) return UNKNOWN_NULL;
  const op = cell.op;
  if (op === "NA") return full(domain, true);
  if (op === "IS_NULL") return exact([], domain, true);
  if (op === "NOT_NULL") return full(domain, false);
  if (op === "CONTAINS" || op === "INSTR" || op === "CODE_IN") return UNKNOWN_NO_NULL;
  const c = (raw: string) => coord(raw, v, domain);
  const ray = (raw: string, below: boolean, open: boolean): ValueSet => {
    const x = c(raw);
    if (x === undefined) return UNKNOWN_NO_NULL;
    return exact([below ? { lo: null, hi: { v: x, open } } : { lo: { v: x, open }, hi: null }], domain, false);
  };
  switch (op) {
    case "EQ": {
      if (domain.kind === "decimal" || v.dataType === "BOOLEAN") {
        const x = c(cell.left);
        return x === undefined ? UNKNOWN_NO_NULL : point(x, domain);
      }
      let shape;
      try {
        shape = classify(cell.left);
      } catch (e) {
        if (e instanceof PatternRejected) return UNKNOWN_NO_NULL;
        throw e;
      }
      if (shape.kind === "exact") {
        const x = c(shape.lit);
        return x === undefined ? UNKNOWN_NO_NULL : point(x, domain);
      }
      if (shape.kind === "prefix" && domain.kind === "string") {
        const hi = succ(shape.lit);
        return hi === undefined ? UNKNOWN_NO_NULL : exact([{ lo: { v: shape.lit, open: false }, hi: { v: hi, open: true } }], domain, false);
      }
      return UNKNOWN_NO_NULL;
    }
    case "NE": {
      const x = c(cell.left);
      return x === undefined ? UNKNOWN_NO_NULL : subtract(full(domain, false), point(x, domain), domain);
    }
    case "LT":
      return ray(cell.left, true, true);
    case "LE":
      return ray(cell.left, true, false);
    case "GT":
      return ray(cell.left, false, true);
    case "GE":
      return ray(cell.left, false, false);
    case "IN":
    case "NOT_IN": {
      const pts: ExactSet[] = [];
      for (const raw of cell.list) {
        const x = c(raw);
        if (x === undefined) return UNKNOWN_NO_NULL;
        pts.push(point(x, domain));
      }
      const u = union(pts, domain);
      return op === "IN" ? u : complementNonNull(u, domain);
    }
  }
  const range = RANGE_OPS[op];
  if (range && "right" in cell) {
    const lo = c(cell.left);
    const hi = c(cell.right);
    if (lo === undefined || hi === undefined) return UNKNOWN_NO_NULL;
    return exact([{ lo: { v: lo, open: range[0] }, hi: { v: hi, open: range[1] } }], domain, false);
  }
  return UNKNOWN_NO_NULL;
}

/** 두 셀 집합이 교차하는가 — 확실히(yes), 못 정함(maybe), 아니다(no). */
function crosses(a: ValueSet, b: ValueSet, domain: Domain): "yes" | "maybe" | "no" {
  if (a.kind === "exact" && b.kind === "exact") {
    return intersect(a, b, domain).intervals.length > 0 || (a.hasNull && b.hasNull) ? "yes" : "no";
  }
  if (a.hasNull && b.hasNull) return "maybe";
  const nonNullPossible = (s: ValueSet) => s.kind === "unknown" || s.intervals.length > 0;
  return nonNullPossible(a) && nonNullPossible(b) ? "maybe" : "no";
}

/** 정규 키(다축 빈틈 묶음) — EQ L 은 IN [L], 목록은 좌표 정렬·중복 제거, NUMBER 는 끝 0 제거. */
function canonicalKey(v: RuleVarDef, cell: CellJson | undefined): string {
  if (!cell) return "∅";
  if ("expr" in cell) return JSON.stringify(["EXPR", cell.expr]);
  if (!("op" in cell)) return JSON.stringify(cell);
  const norm = (raw: string) => (v.dataType === "NUMBER" && PLAIN_DECIMAL.test(raw) ? new D(raw).toString() : raw);
  const sortList = (xs: string[]) => {
    const vals = [...new Set(xs.map(norm))];
    return v.dataType === "NUMBER" ? vals.sort((a, b) => new D(a).cmp(b)) : vals.sort();
  };
  const op = cell.op === "EQ" ? "IN" : cell.op;
  const payload: unknown[] = [op];
  if (cell.op === "EQ") payload.push(sortList([cell.left]));
  else if ("list" in cell) payload.push(sortList(cell.list));
  else {
    if ("left" in cell) payload.push(norm(cell.left));
    if ("right" in cell) payload.push(norm(cell.right));
  }
  return JSON.stringify(payload);
}

function scaleOf(v: RuleVarDef, rows: RuleRowDef[]): number {
  if (v.scale !== null && v.scale !== undefined) return v.scale;
  let s = 0;
  const see = (raw: string) => {
    const dot = raw.indexOf(".");
    if (PLAIN_DECIMAL.test(raw) && dot >= 0) s = Math.max(s, raw.length - dot - 1);
  };
  for (const r of rows) {
    const cell = r.cells[v.varId];
    if (!cell || !("op" in cell)) continue;
    if ("left" in cell) see(cell.left);
    if ("right" in cell) see(cell.right);
    if ("list" in cell) cell.list.forEach(see);
  }
  return s;
}

function labelOf(v: RuleVarDef): string {
  return v.varName ?? v.label ?? `_V${v.varId}`;
}

interface Column {
  v: RuleVarDef;
  domain: Domain;
}

/** 규칙 분석. 이슈 순서: ALL_NA_ROW → UNRESOLVED_CELL → 겹침 → UNREACHABLE → VALUE_GAP → NULL_GAP. */
export function analyzeRule(rule: RuleDef): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const cols: Column[] = condVars(rule).map((v) => ({ v, domain: domainOf(v) }));
  if (cols.length === 0) return issues;
  const unique = effectivePolicy(rule) === "UNIQUE";
  const first = rule.ruleKind === "DECISION" && effectivePolicy(rule) === "FIRST";

  // 1. 전부 NA 인 행
  const rows: RuleRowDef[] = [];
  for (const r of normalRows(rule)) {
    const allNa = cols.every(({ v }) => {
      const cell = r.cells[v.varId];
      return cell !== undefined && "op" in cell && cell.op === "NA";
    });
    if (allNa) {
      issues.push({ code: "ALL_NA_ROW", severity: "ERROR", rowIds: [r.rowId], message: `${r.rowId}행의 조건 셀이 모두 - 다` });
    } else {
      rows.push(r);
    }
  }

  const sets = rows.map((r) => cols.map(({ v, domain }) => cellSet(v, domain, r.cells[v.varId])));

  // 2. 못 푸는 셀
  rows.forEach((r, i) =>
    cols.forEach(({ v }, k) => {
      if (sets[i][k].kind === "unknown" && r.cells[v.varId] !== undefined) {
        issues.push({
          code: "UNRESOLVED_CELL",
          severity: "WARNING",
          rowIds: [r.rowId],
          varId: v.varId,
          message: `${r.rowId}행 ${labelOf(v)} 셀은 화면에서 겹침을 풀 수 없다(${cellSummary(v, r.cells[v.varId])})`,
        });
      }
    }),
  );

  // 3. 겹침
  const overlaps = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      let state: "yes" | "maybe" = "yes";
      let disjoint = false;
      for (let k = 0; k < cols.length; k++) {
        const x = crosses(sets[i][k], sets[j][k], cols[k].domain);
        if (x === "no") {
          disjoint = true;
          break;
        }
        if (x === "maybe") state = "maybe";
      }
      if (disjoint) continue;
      const rowIds = [rows[i].rowId, rows[j].rowId];
      if (state === "yes") {
        overlaps.add(`${i}:${j}`);
        issues.push({
          code: "OVERLAP",
          severity: unique ? "ERROR" : "WARNING",
          rowIds,
          message: `${rowIds[0]}행·${rowIds[1]}행이 겹친다(${describe(cols, rows[i], rows[j])})`,
        });
      } else {
        issues.push({ code: "OVERLAP_UNRESOLVED", severity: "WARNING", rowIds, message: `${rowIds[0]}행·${rowIds[1]}행이 겹칠 수 있다` });
      }
    }
  }

  // 4. 도달 불가(FIRST)
  if (first) {
    const allExact = sets.map((row) => row.every((s) => s.kind === "exact"));
    for (let r = 0; r < rows.length; r++) {
      if (!allExact[r]) continue;
      const prev: number[] = [];
      for (let p = 0; p < r; p++) if (allExact[p] && overlaps.has(`${p}:${r}`)) prev.push(p);
      if (prev.length === 0) continue;
      const used = covered(sets as ExactSet[][], cols, r, prev, 0);
      if (used) {
        const rowIds = [rows[r].rowId, ...[...used].sort((a, b) => a - b).map((p) => rows[p].rowId)];
        issues.push({ code: "UNREACHABLE", severity: "WARNING", rowIds, message: `${rows[r].rowId}행은 앞 행에 모두 덮여 적중하지 않는다` });
      }
    }
  }

  // 5. 값 빈틈(Number 열, 소수 자리수 격자, 내부 빈틈만)
  cols.forEach(({ v, domain }, k) => {
    if (domain.kind !== "decimal" || isExpressionColumn(v)) return;
    const groups = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const key = cols
        .map((c, m) => (m === k ? "" : canonicalKey(c.v, r.cells[c.v.varId])))
        .join("\u0001");
      const g = groups.get(key);
      if (g) g.push(i);
      else groups.set(key, [i]);
    });
    const s = scaleOf(v, rows);
    const step = new D(10).pow(-s);
    for (const members of groups.values()) {
      const parts = members.map((i) => sets[i][k]);
      if (parts.some((p) => p.kind !== "exact")) continue;
      const gaps = complementNonNull(union(parts as ExactSet[], domain), domain);
      for (const iv of gaps.intervals) {
        if (!isBounded(iv)) continue;
        const lo = iv.lo.v as Dec;
        const hi = iv.hi.v as Dec;
        let g1 = lo.div(step).ceil().times(step);
        if (iv.lo.open && g1.eq(lo)) g1 = g1.plus(step);
        let g2 = hi.div(step).floor().times(step);
        if (iv.hi.open && g2.eq(hi)) g2 = g2.minus(step);
        if (g1.lte(g2)) {
          const rowIds = members.map((i) => rows[i].rowId);
          issues.push({
            code: "VALUE_GAP",
            severity: "WARNING",
            rowIds,
            varId: v.varId,
            lower: g1.toFixed(s),
            upper: g2.toFixed(s),
            message: `${labelOf(v)}: ${g1.toFixed(s)} ~ ${g2.toFixed(s)} 에 맞는 행이 없다`,
          });
        }
      }
    }
  });

  // 6. NULL 빈틈(열 단위)
  for (const { v } of cols) {
    if (isExpressionColumn(v)) continue;
    const coversNull = rows.some((r) => {
      const cell = r.cells[v.varId];
      return cell !== undefined && "op" in cell && (cell.op === "NA" || cell.op === "IS_NULL");
    });
    if (!coversNull) {
      issues.push({ code: "NULL_GAP", severity: "WARNING", rowIds: [], varId: v.varId, message: `${labelOf(v)} 이(가) NULL 이면 맞는 행이 없다` });
    }
  }
  return issues;
}

function describe(cols: Column[], a: RuleRowDef, b: RuleRowDef): string {
  return cols
    .map(({ v }) => {
      const x = a.cells[v.varId];
      const y = b.cells[v.varId];
      return `${labelOf(v)}: ${x ? cellSummary(v, x) : ""} / ${y ? cellSummary(v, y) : ""}`;
    })
    .join(", ");
}

/**
 * 행 r 의 열 k 이후가 앞 행 p 들의 합집합으로 모두 덮이는가. 덮이면 실제로 쓰인 앞 행 색인 집합, 아니면 undefined.
 * 열 k 의 집합을 앞 행들의 k 열 집합으로 조각내고(NULL 은 따로 한 조각), 조각마다 그 조각을 품는 앞 행만으로 다음 열을 본다.
 */
function covered(sets: ExactSet[][], cols: Column[], r: number, prev: number[], k: number): Set<number> | undefined {
  if (k === cols.length) return prev.length > 0 ? new Set(prev) : undefined;
  const domain = cols[k].domain;
  const target = sets[r][k];
  const nonNull: ExactSet = { kind: "exact", intervals: target.intervals, hasNull: false };
  const onlyNull: ExactSet = { kind: "exact", intervals: [] as Interval[], hasNull: target.hasNull };
  let pieces = [nonNull, onlyNull].filter((x) => !isEmpty(x));
  for (const p of prev) {
    const cover = sets[p][k];
    pieces = pieces.flatMap((x) => [intersect(x, cover, domain), subtract(x, cover, domain)]).filter((x) => !isEmpty(x));
  }
  const used = new Set<number>();
  for (const piece of pieces) {
    const holders = prev.filter((p) => isSubset(piece, sets[p][k], domain));
    if (holders.length === 0) return undefined;
    const sub = covered(sets, cols, r, holders, k + 1);
    if (!sub) return undefined;
    sub.forEach((x) => used.add(x));
  }
  return used;
}
