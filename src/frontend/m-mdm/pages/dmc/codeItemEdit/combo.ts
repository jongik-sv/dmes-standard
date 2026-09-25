/**
 * 미리보기 콤보 단계 — 시뮬레이터 `combo()` 규칙(TSK-06-03 design.md §1.4-2). 다음 칸(lvl{depth+1})의 값 가운데
 * 그 칸이 비지 않은 행은 그룹, 비어 있는 행은 코드다. 앞 단계에서 고른 값 하나가 조건이다(그룹 값은 마루 코드 안에서 유일).
 * 정렬은 `ORDER BY is_code DESC, value` — 코드인 항목(그룹+코드 포함)을 먼저, 그 안은 값 순이다(seq 가 아니다).
 */
import { cmp, LVL_KEYS, type HierRow } from "@/hier-tree";

export type ComboKind = "그룹" | "코드" | "그룹+코드";

export interface ComboItem {
  value: string;
  kind: ComboKind;
  name?: string | null;
}

const blank = (v: unknown) => v === null || v === undefined || v === "";

/** path(앞에서 고른 값들) 다음 단계의 항목. */
export function comboStep(rows: HierRow[], path: string[]): ComboItem[] {
  const depth = path.length;
  if (depth >= LVL_KEYS.length) return [];
  const col = LVL_KEYS[depth];
  const last = depth > 0 ? path[depth - 1] : null;
  const scoped = last === null ? rows : rows.filter((r) => r[LVL_KEYS[depth - 1]] === last);
  const acc = new Map<string, { group: boolean; code: boolean; name?: string | null }>();
  const entry = (v: string) => {
    let e = acc.get(v);
    if (!e) {
      e = { group: false, code: false };
      acc.set(v, e);
    }
    return e;
  };
  for (const r of scoped) {
    const v = r[col];
    if (!blank(v)) {
      entry(v as string).group = true;
    } else {
      const e = entry(r.code);
      e.code = true;
      e.name = r.name;
    }
  }
  return [...acc.entries()]
    .sort(([a, ea], [b, eb]) => Number(eb.code) - Number(ea.code) || cmp(a, b))
    .map(([value, e]) => ({
      value,
      kind: e.group && e.code ? "그룹+코드" : e.code ? "코드" : "그룹",
      ...(e.code ? { name: e.name } : {}),
    }));
}

/** 경로 앞부분([] · [p0] · [p0,p1] …)마다 한 단계씩. */
export function comboSteps(rows: HierRow[], path: string[]): ComboItem[][] {
  const steps: ComboItem[][] = [];
  for (let i = 0; i <= path.length; i++) steps.push(comboStep(rows, path.slice(0, i)));
  return steps;
}
