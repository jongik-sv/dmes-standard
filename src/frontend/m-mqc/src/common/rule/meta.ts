/**
 * 룰·변수·코드 표시 정보 — catalog.ts(Maru 데이터 계약)에서 읽고, 없으면 Maru 이름으로 대신한다.
 * catalog 는 데이터 담당이 채우므로 비어 있어도 화면이 그려져야 한다: 라벨이 없으면 변수명, 제목이 없으면 룰 ID.
 * 시험은 catalog 를 인자로 넘겨 고정한다(기본값은 모듈 catalog).
 */
import * as defaultCatalog from "../catalog";
import type { CodeMeta, RuleMeta, VarMeta } from "../catalog";
import type { RuleVar, RuleView } from "./types";

export interface Catalog {
  RULES: Record<string, RuleMeta>;
  CODES: Record<string, CodeMeta>;
  SCREEN_RULES: Record<string, string[]>;
  SCREEN_CODES: Record<string, string[]>;
}

export const CATALOG: Catalog = defaultCatalog;

/** 화면 안 룰 묶음(공정 등). 묶음 하나에 룰이 여럿일 수 있다. */
export interface RuleGroup {
  key: string;
  label: string;
  ruleIds: string[];
}

export function ruleMetaOf(
  ruleId: string,
  catalog: Catalog = CATALOG,
): RuleMeta | undefined {
  return catalog.RULES[ruleId];
}

export function ruleTitle(ruleId: string, catalog: Catalog = CATALOG): string {
  return catalog.RULES[ruleId]?.title || ruleId;
}

export function varMetaOf(
  ruleId: string,
  name: string,
  catalog: Catalog = CATALOG,
): VarMeta | undefined {
  const meta = catalog.RULES[ruleId];
  if (!meta) return undefined;
  return (
    meta.conds.find((v) => v.name === name) ??
    meta.results.find((v) => v.name === name)
  );
}

/** 변수 라벨 — catalog 라벨, 없으면 Maru 변수명. */
export function varLabel(
  ruleId: string,
  name: string,
  catalog: Catalog = CATALOG,
): string {
  return varMetaOf(ruleId, name, catalog)?.label || name;
}

export function varUnit(
  ruleId: string,
  name: string,
  catalog: Catalog = CATALOG,
): string | undefined {
  return varMetaOf(ruleId, name, catalog)?.unit || undefined;
}

/** 적중 정책 — 서버 값이 있으면 그것, 없으면 catalog, 둘 다 없으면 FIRST. */
export function hitPolicyOf(
  rule: RuleView | undefined,
  ruleId: string,
  catalog: Catalog = CATALOG,
): string {
  return rule?.hitPolicy || catalog.RULES[ruleId]?.hitPolicy || "FIRST";
}

export const HIT_POLICY_LABEL: Record<string, string> = {
  FIRST: "첫 적중 행 적용",
  COLLECT: "적중 행 모두 적용",
  UNIQUE: "한 행만 적중",
  PRIORITY: "우선순위 적용",
  ANY: "적중 행 아무거나",
};

/**
 * 룰의 변수 순서. 서버 변수(kind 별 seq 순)를 catalog 의 conds·results 순서로 다시 세운다 — catalog 에 없는 변수는 뒤에 seq 순.
 * 서버 정의가 없으면(적용 버전 없음) catalog 목록 그대로.
 */
export function orderedVarNames(
  rule: Pick<RuleView, "vars"> | undefined,
  ruleId: string,
  kind: "COND" | "RESULT",
  catalog: Catalog = CATALOG,
): string[] {
  const meta = catalog.RULES[ruleId];
  const metaNames =
    (kind === "COND" ? meta?.conds : meta?.results)?.map((v) => v.name) ?? [];
  const serverNames = (rule?.vars ?? [])
    .filter((v): v is RuleVar & { name: string } => v.kind === kind && !!v.name)
    .sort((a, b) => a.seq - b.seq || a.varId - b.varId)
    .map((v) => v.name);
  if (serverNames.length === 0) return metaNames;
  const rank = (n: string) => {
    const i = metaNames.indexOf(n);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return serverNames
    .map((n, i) => ({ n, i }))
    .sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i)
    .map((x) => x.n);
}

/** 서버 변수 하나 — 이름으로. */
export function serverVar(
  rule: Pick<RuleView, "vars"> | undefined,
  name: string,
): RuleVar | undefined {
  return rule?.vars.find((v) => v.name === name);
}

/**
 * 룰 ID 목록 → 묶음. catalog 의 group·groupLabel 로 묶고(처음 나온 순서), group 이 없으면 룰 하나가 묶음 하나다(라벨 = 제목).
 */
export function groupsForRules(
  ruleIds: readonly string[],
  catalog: Catalog = CATALOG,
): RuleGroup[] {
  const out: RuleGroup[] = [];
  const byKey = new Map<string, RuleGroup>();
  for (const ruleId of ruleIds) {
    const meta = catalog.RULES[ruleId];
    const key = meta?.group || ruleId;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        label:
          meta?.groupLabel ||
          (meta?.group ? meta.group : ruleTitle(ruleId, catalog)),
        ruleIds: [],
      };
      byKey.set(key, g);
      out.push(g);
    }
    if (!g.ruleIds.includes(ruleId)) g.ruleIds.push(ruleId);
  }
  return out;
}

/** 화면의 룰 묶음 — catalog SCREEN_RULES 순서. */
export function screenGroups(
  screenId: string,
  catalog: Catalog = CATALOG,
): RuleGroup[] {
  return groupsForRules(catalog.SCREEN_RULES[screenId] ?? [], catalog);
}

/** 화면의 코드 ID 목록 — catalog SCREEN_CODES. */
export function screenCodeIds(
  screenId: string,
  catalog: Catalog = CATALOG,
): string[] {
  return catalog.SCREEN_CODES[screenId] ?? [];
}

export function codeTitle(codeId: string, catalog: Catalog = CATALOG): string {
  return catalog.CODES[codeId]?.title || codeId;
}

/**
 * 룰 고르기 선택지 — 묶음 순서대로 룰마다 하나. 묶음에 룰이 하나면 묶음 라벨, 여럿이면 「묶음 · 룰 제목」.
 */
export function ruleOptions(
  groups: readonly RuleGroup[],
  catalog: Catalog = CATALOG,
): { value: string; label: string }[] {
  return groups.flatMap((g) =>
    g.ruleIds.map((ruleId) => ({
      value: ruleId,
      label:
        g.ruleIds.length > 1
          ? `${g.label} · ${ruleTitle(ruleId, catalog)}`
          : g.label,
    })),
  );
}

/** 룰 ID → 그 룰이 든 묶음. */
export function groupOfRule(
  groups: readonly RuleGroup[],
  ruleId: string,
): RuleGroup | undefined {
  return groups.find((g) => g.ruleIds.includes(ruleId));
}
