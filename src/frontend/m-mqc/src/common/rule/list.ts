/**
 * 룰 목록 탭의 순수 로직 — 여러 룰의 행을 한 표로 펴고(ListRow), 보이는 룰에 맞춰 열을 만들고(columnSpecs), 묶음·검색어로 거른다.
 * 서버를 다시 부르지 않는다. React 에 기대지 않는다.
 */
import {
  CATALOG,
  orderedVarNames,
  ruleTitle,
  varLabel,
  varUnit,
  type Catalog,
  type RuleGroup,
} from "./meta";
import { cellOf, rowConditionText, rowResultText } from "./text";
import type { RuleCell, RuleView } from "./types";

export interface ListRow {
  /** `${ruleId}-${rowId}` */
  key: string;
  groupKey: string;
  groupLabel: string;
  ruleId: string;
  ver: string | null;
  applyFrom: string | null;
  rowId: number;
  seq: number;
  rowKind: "NORMAL" | "DEFAULT";
  /** 조건 변수명 → 셀(셀이 없는 변수는 키가 없다). */
  cells: Record<string, RuleCell>;
  /** 결과 변수명 → 값. */
  results: Record<string, string | null>;
  /** 조건 문장(라벨 포함) — 상세·검색용. */
  conditionText: string;
  /** 결과 문장(라벨·단위 포함). */
  resultText: string;
  /** FIRST 정책에서 앞 행에 덮여 적중하지 않는 행. */
  unreachable: boolean;
}

/** 그리드 열 하나 — 조건 또는 결과 변수. */
export interface ColumnSpec {
  name: string;
  kind: "COND" | "RESULT";
  /** 머리글. 보이는 룰들의 라벨이 다르면 첫 라벨이고, 다른 라벨은 tooltip 에 모은다. */
  label: string;
  unit?: string;
  tooltip: string;
}

/**
 * rules → ListRow[] (묶음 순서 → 묶음 안 룰 순서 → 행 seq 순서). 묶음에 없는 룰은 뒤에 룰 하나 묶음으로 둔다.
 * unreachable 은 ruleId → 가려진 rowId 집합. 행이 없는 룰(적용 버전 없음)은 행을 내지 않는다.
 */
export function flattenRules(
  rules: readonly RuleView[],
  groups: readonly RuleGroup[],
  unreachable: ReadonlyMap<string, Set<number>>,
  catalog: Catalog = CATALOG,
): ListRow[] {
  const byId = new Map(rules.map((r) => [r.ruleId, r]));
  const order: { group: RuleGroup; ruleId: string }[] = [];
  const seen = new Set<string>();
  const add = (group: RuleGroup, ruleId: string) => {
    if (seen.has(ruleId)) return;
    seen.add(ruleId);
    order.push({ group, ruleId });
  };
  for (const g of groups) for (const id of g.ruleIds) add(g, id);
  for (const r of rules)
    add(
      {
        key: r.ruleId,
        label: ruleTitle(r.ruleId, catalog),
        ruleIds: [r.ruleId],
      },
      r.ruleId,
    );

  const out: ListRow[] = [];
  for (const { group, ruleId } of order) {
    const rule = byId.get(ruleId);
    if (!rule) continue;
    const condNames = orderedVarNames(rule, ruleId, "COND", catalog);
    const shadowed = unreachable.get(ruleId);
    const rows = [...rule.rows].sort(
      (a, b) =>
        (a.rowKind === b.rowKind ? 0 : a.rowKind === "DEFAULT" ? 1 : -1) ||
        a.seq - b.seq ||
        a.rowId - b.rowId,
    );
    for (const row of rows) {
      const cells: Record<string, RuleCell> = {};
      for (const name of condNames) {
        const cell = cellOf(rule.vars, row, name);
        if (cell) cells[name] = cell;
      }
      out.push({
        key: `${ruleId}-${row.rowId}`,
        groupKey: group.key,
        groupLabel: group.label,
        ruleId,
        ver: rule.ver,
        applyFrom: rule.applyFrom,
        rowId: row.rowId,
        seq: row.seq,
        rowKind: row.rowKind,
        cells,
        results: { ...row.results },
        conditionText: rowConditionText(rule, row, catalog),
        resultText: rowResultText(rule, row, catalog),
        unreachable: shadowed?.has(row.rowId) ?? false,
      });
    }
  }
  return out;
}

/**
 * 보이는 룰들의 열 — 조건 변수 합집합(룰 순서 → 변수 순서), 결과 변수 합집합. 같은 변수명은 한 열이다.
 */
export function columnSpecs(
  rules: readonly RuleView[],
  ruleIds: readonly string[],
  catalog: Catalog = CATALOG,
): { conds: ColumnSpec[]; results: ColumnSpec[] } {
  const byId = new Map(rules.map((r) => [r.ruleId, r]));
  const build = (kind: "COND" | "RESULT") => {
    const specs = new Map<
      string,
      { labels: string[]; unit?: string; ruleIds: string[] }
    >();
    for (const ruleId of ruleIds) {
      for (const name of orderedVarNames(
        byId.get(ruleId),
        ruleId,
        kind,
        catalog,
      )) {
        const label = varLabel(ruleId, name, catalog);
        const s = specs.get(name) ?? { labels: [], ruleIds: [] };
        if (!s.labels.includes(label)) s.labels.push(label);
        s.unit ??= varUnit(ruleId, name, catalog);
        s.ruleIds.push(ruleId);
        specs.set(name, s);
      }
    }
    return [...specs.entries()].map<ColumnSpec>(([name, s]) => ({
      name,
      kind,
      label: s.labels[0],
      unit: s.unit,
      tooltip:
        s.labels.length > 1
          ? `${s.labels.join(" / ")} — Maru 변수 ${name}`
          : `Maru 변수 ${name}`,
    }));
  };
  return { conds: build("COND"), results: build("RESULT") };
}

/** 묶음별 행 수(거르기 전). 키 "" 는 전체. */
export function groupCounts(rows: readonly ListRow[]): Record<string, number> {
  const out: Record<string, number> = { "": rows.length };
  for (const r of rows) out[r.groupKey] = (out[r.groupKey] ?? 0) + 1;
  return out;
}

export interface ListFilter {
  /** 묶음 키. "" 은 전체. */
  group: string;
  /** 검색어 — 행 ID·순번·룰 ID·조건 문장·결과 문장에 들어 있으면 맞는다. 앞뒤 공백은 뗀다. "" 은 전체. */
  keyword?: string;
}

export function filterRows(rows: readonly ListRow[], f: ListFilter): ListRow[] {
  const kw = (f.keyword ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (f.group !== "" && r.groupKey !== f.group) return false;
    if (kw === "") return true;
    return [
      String(r.rowId),
      String(r.seq),
      r.ruleId,
      r.conditionText,
      r.resultText,
    ].some((t) => t.toLowerCase().includes(kw));
  });
}
