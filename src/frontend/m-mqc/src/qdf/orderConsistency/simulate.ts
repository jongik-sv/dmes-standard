/**
 * 주문 시뮬레이션 — 주문 값 → 서버 판정 입력(모든 조건 키, 빈칸은 null), 서버 적중(COLLECT) → 결과 카드(접기·정렬·동시발화 묶음).
 * 발화 여부의 정본은 서버(qcdRule judge hits)다. 조건별 ✓/✕ 와 「미입력이라 평가 못 한 룰」 집계는 화면이 셀 조건으로 다시 본다(시제품 evaluate 와 같은 규칙).
 * React 에 기대지 않는다.
 */
import {
  isBlank,
  NUM_RE,
  testCond,
  type Cond,
  type CondState,
} from "../shared/cond";
import {
  categoryRank,
  ruleOrd,
  severityRank,
  type OcField,
  type OcRule,
} from "./model";

export type OrderValues = Record<string, string>;

/** 서버 입력 — 조건 변수 전부. 빈칸은 null(IS_NULL 이 맞게), 나머지는 다듬은 글. */
export function buildOrderInput(
  fields: readonly OcField[],
  values: Readonly<OrderValues>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    const v = (values[f.key] ?? "").trim();
    out[f.key] = v === "" ? null : v;
  }
  return out;
}

/** 숫자 항목에 숫자가 아닌 값 — 있으면 판정하지 않는다. */
export function formatErrors(
  fields: readonly OcField[],
  values: Readonly<OrderValues>,
): { field: string; label: string; value: string }[] {
  return fields
    .filter((f) => f.type === "number")
    .map((f) => ({ f, v: (values[f.key] ?? "").trim() }))
    .filter(({ v }) => v !== "" && !NUM_RE.test(v))
    .map(({ f, v }) => ({ field: f.key, label: f.label, value: v }));
}

export interface CondCheck {
  field: string;
  cond: Cond;
  value: string | null;
  state: CondState;
}

export interface FiredView {
  rule: OcRule;
  checks: CondCheck[];
  /** 같은 (대상·코드·메시지)라 접은 룰 키. */
  folded: string[];
  /** 동시발화 묶음 키(대상 항목). 없으면 null. */
  coGroup: string | null;
}

export interface NullField {
  field: string;
  label: string;
  rules: number;
  keys: string[];
}

export interface SimOutcome {
  evaluated: number;
  fired: FiredView[];
  /** 미입력 항목 때문에 평가하지 못한 룰 수. */
  skippedByNull: number;
  nullFields: NullField[];
  /** 서버 적중과 화면 계산이 어긋난 룰 키(표시 점검용). */
  mismatches: string[];
}

function checksOf(
  rule: OcRule,
  values: Readonly<OrderValues>,
  numeric: (field: string) => boolean,
): CondCheck[] {
  return rule.conds.map((c) => {
    const raw = values[c.field];
    const value = isBlank(raw) ? null : String(raw).trim();
    return {
      field: c.field,
      cond: c.cond,
      value,
      state: testCond(c.cond, value, numeric(c.field)),
    };
  });
}

/**
 * 결과 풀이. hitRowIds 는 서버 적중 행. 접기(같은 대상·코드·메시지) → 정렬(심각도 → 분류 → 룰 키) → 동시발화 묶음
 * (같은 대상 항목에 서로 다른 코드 2건 이상, 분류가 같을 때) 순서로 시제품과 같게 만든다.
 */
export function explain(
  rules: readonly OcRule[],
  hitRowIds: ReadonlySet<number>,
  values: Readonly<OrderValues>,
  fields: readonly OcField[],
): SimOutcome {
  const typeOf = new Map(fields.map((f) => [f.key, f.type]));
  const labelOf = new Map(fields.map((f) => [f.key, f.label]));
  const numeric = (field: string) => typeOf.get(field) === "number";
  const fired: FiredView[] = [];
  const nullMap = new Map<string, NullField>();
  const mismatches: string[] = [];
  let skippedByNull = 0;

  for (const rule of rules) {
    const checks = checksOf(rule, values, numeric);
    const allPass = checks.every((c) => c.state === "P");
    const hit = hitRowIds.has(rule.rowId);
    if (hit !== allPass) mismatches.push(rule.key);
    if (hit) {
      fired.push({ rule, checks, folded: [], coGroup: null });
      continue;
    }
    if (checks.some((c) => c.state === "F")) continue;
    const nulls = checks.filter((c) => c.state === "N");
    if (nulls.length === 0) continue;
    skippedByNull += 1;
    for (const field of new Set(nulls.map((c) => c.field))) {
      const e = nullMap.get(field) ?? {
        field,
        label: labelOf.get(field) ?? field,
        rules: 0,
        keys: [],
      };
      e.rules += 1;
      e.keys.push(rule.key);
      nullMap.set(field, e);
    }
  }

  // 접기 — 같은 (대상, 코드, 메시지).
  const byKey = new Map<string, FiredView>();
  const folded: FiredView[] = [];
  for (const f of fired) {
    const k = `${f.rule.target}\u0001${f.rule.errCode}\u0001${f.rule.message}`;
    const first = byKey.get(k);
    if (first) first.folded.push(f.rule.key);
    else {
      byKey.set(k, f);
      folded.push(f);
    }
  }
  folded.sort(
    (a, b) =>
      severityRank(a.rule.severity) - severityRank(b.rule.severity) ||
      categoryRank(a.rule.category) - categoryRank(b.rule.category) ||
      ruleOrd(a.rule.key) - ruleOrd(b.rule.key) ||
      a.rule.seq - b.rule.seq,
  );

  // 동시발화 — 같은 대상 항목, 서로 다른 코드 2개 이상, 분류 하나.
  const byTarget = new Map<string, FiredView[]>();
  for (const f of folded) {
    const list = byTarget.get(f.rule.target) ?? [];
    list.push(f);
    byTarget.set(f.rule.target, list);
  }
  for (const [target, list] of byTarget) {
    if (list.length < 2) continue;
    if (new Set(list.map((f) => f.rule.errCode)).size < 2) continue;
    if (new Set(list.map((f) => f.rule.category)).size > 1) continue;
    for (const f of list) f.coGroup = target;
  }
  const out: FiredView[] = [];
  const used = new Set<FiredView>();
  for (const f of folded) {
    if (used.has(f)) continue;
    used.add(f);
    out.push(f);
    if (!f.coGroup) continue;
    for (const g of folded)
      if (!used.has(g) && g.coGroup === f.coGroup) {
        used.add(g);
        out.push(g);
      }
  }

  return {
    evaluated: rules.length,
    fired: out,
    skippedByNull,
    nullFields: [...nullMap.values()].sort(
      (a, b) => b.rules - a.rules || a.label.localeCompare(b.label, "ko"),
    ),
    mismatches,
  };
}

/** 결과 카드 묶음 — 이어진 같은 coGroup 은 한 상자. */
export function fireBlocks(
  fired: readonly FiredView[],
): { key: string; co: boolean; items: FiredView[] }[] {
  const out: { key: string; co: boolean; items: FiredView[] }[] = [];
  for (const f of fired) {
    const last = out.at(-1);
    if (f.coGroup && last?.co && last.items[0].coGroup === f.coGroup)
      last.items.push(f);
    else out.push({ key: f.rule.key, co: f.coGroup !== null, items: [f] });
  }
  // 하나뿐인 묶음은 일반 카드로.
  return out.map((b) => (b.items.length > 1 ? b : { ...b, co: false }));
}

/**
 * 룰을 만족하는 주문 — 기본 주문 위에 룰 조건 값을 덮는다(「시뮬레이션에서 확인」).
 * NE·NOT_IN 은 목록 밖 값을 고르되 완전성은 보장하지 않는다(시제품과 같다).
 */
export function orderFromRule(
  rule: OcRule,
  base: Readonly<OrderValues>,
  fields: readonly OcField[],
): OrderValues {
  const typeOf = new Map(fields.map((f) => [f.key, f.type]));
  const out: OrderValues = { ...base };
  for (const { field, cond } of rule.conds) {
    const isNum = typeOf.get(field) === "number";
    const vs = cond.values;
    const cur = out[field] ?? "";
    const keepIfPass = () => (testCond(cond, cur, isNum) === "P" ? cur : null);
    let v: string | null = null;
    switch (cond.op) {
      case "EQ":
      case "IN":
      case "GE":
      case "LE":
        v = vs[0] ?? "";
        break;
      case "GT":
        v = isNum ? String(Number(vs[0]) + 1) : (vs[0] ?? "");
        break;
      case "LT":
        v = isNum ? String(Number(vs[0]) - 1) : (vs[0] ?? "");
        break;
      case "BETWEEN":
        v = cond.lowInclusive
          ? (cond.low ?? "")
          : String((Number(cond.low) + Number(cond.high)) / 2);
        break;
      case "IS_NULL":
        v = "";
        break;
      case "NOT_NULL":
        v = keepIfPass() ?? "1";
        break;
      case "NE":
      case "NOT_IN": {
        v = keepIfPass();
        if (v === null) {
          if (isNum) v = String(Math.max(...vs.map(Number)) + 1);
          else {
            v = "Z";
            while (vs.includes(v)) v += "Z";
          }
        }
        break;
      }
      default:
        break;
    }
    if (v !== null) out[field] = v;
  }
  return out;
}
