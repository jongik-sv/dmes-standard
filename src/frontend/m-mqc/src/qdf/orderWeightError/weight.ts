/**
 * 주문단중에러 매트릭스 — Maru 룰 QD_ORDER_WEIGHT_ERROR(FIRST, 단중 EQ × 분할 수 EQ → 분할 단중·허용범위)를 단중 행 × 분할 열 표로 편다.
 * 「수정값」 은 분할 단중이 계산값(단중 ÷ 분할, 소수 둘째 자리 반올림)과 다른 칸이다(시제품의 edited 칸).
 * 허용 단중 범위(Min·Max)는 코드 QC_ORD_WGT_LIMIT 이고, 칸 색은 룰 결과 IN_RANGE_YN 을 따른다. React 에 기대지 않는다.
 */
import type { CodeSet, RuleRow, RuleVersion, RuleView } from "@/common/rule";

import { parseCell } from "../shared/cond";

export const RULE_ID = "QD_ORDER_WEIGHT_ERROR";
export const LIMIT_CODE_ID = "QC_ORD_WGT_LIMIT";

export const WGT_VAR = "ORD_UNT_WGT";
export const SPLIT_VAR = "SPLIT_CNT";
export const VALUE_VAR = "SPLIT_UNT_WGT";
export const RANGE_VAR = "IN_RANGE_YN";

export interface WeightCell {
  weight: number;
  split: number;
  /** 분할 단중(룰 결과). 숫자가 아니면 null. */
  value: number | null;
  /** 룰 결과 IN_RANGE_YN = Y. */
  inRange: boolean;
  /** 계산값과 다른 수정값인가. */
  edited: boolean;
  /** 계산값(단중 ÷ 분할, 둘째 자리 반올림). */
  base: number;
  rowId: number;
  seq: number;
}

export interface WeightMatrix {
  /** 단중(오름차순). */
  weights: number[];
  /** 분할 수(오름차순). */
  splits: number[];
  cells: Map<string, WeightCell>;
  inRangeCount: number;
  editedCount: number;
  /** 단중·분할 EQ 가 아니어서 표에 놓지 못한 행 수. */
  skipped: number;
}

export interface WeightLimit {
  min: number;
  max: number;
  unit: string;
}

export const cellKey = (weight: number, split: number) => `${weight}|${split}`;

export const round2 = (v: number) => Math.round(v * 100) / 100;

/** 단중 표시 — 소수 한 자리(15.0, 22.5). */
export const fmtWeight = (w: number) => w.toFixed(1);

/** 분할 단중 표시 — 소수 두 자리(4.05). */
export const fmtValue = (v: number | null) => (v === null ? "—" : v.toFixed(2));

function eqNumber(
  vars: RuleView["vars"],
  row: RuleRow,
  name: string,
): number | null {
  const v = vars.find((x) => x.name === name);
  if (!v) return null;
  const cond = parseCell(row.cells[String(v.varId)]);
  if (cond.op !== "EQ") return null;
  const n = Number(cond.values[0]);
  return Number.isFinite(n) ? n : null;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 룰 정의(또는 버전) → 매트릭스. */
export function buildWeightMatrix(
  rule: Pick<RuleView, "vars" | "rows"> | undefined,
): WeightMatrix {
  const cells = new Map<string, WeightCell>();
  const weights = new Set<number>();
  const splits = new Set<number>();
  let skipped = 0;
  for (const row of rule?.rows ?? []) {
    const weight = eqNumber(rule!.vars, row, WGT_VAR);
    const split = eqNumber(rule!.vars, row, SPLIT_VAR);
    if (weight === null || split === null || split === 0) {
      skipped += 1;
      continue;
    }
    const key = cellKey(weight, split);
    if (cells.has(key)) continue; // FIRST — 앞 행이 이긴다.
    const value = toNumber(row.results[VALUE_VAR]);
    const base = round2(weight / split);
    cells.set(key, {
      weight,
      split,
      value,
      inRange: String(row.results[RANGE_VAR] ?? "").trim() === "Y",
      edited: value !== null && Math.abs(value - base) > 1e-9,
      base,
      rowId: row.rowId,
      seq: row.seq,
    });
    weights.add(weight);
    splits.add(split);
  }
  let inRangeCount = 0;
  let editedCount = 0;
  for (const c of cells.values()) {
    if (c.inRange) inRangeCount += 1;
    if (c.edited) editedCount += 1;
  }
  return {
    weights: [...weights].sort((a, b) => a - b),
    splits: [...splits].sort((a, b) => a - b),
    cells,
    inRangeCount,
    editedCount,
    skipped,
  };
}

/** 코드 QC_ORD_WGT_LIMIT(MIN·MAX, 속성1 값·속성2 단위) → 허용 범위. 없거나 숫자가 아니면 null. */
export function limitOf(codes: readonly CodeSet[]): WeightLimit | null {
  const set = codes.find((c) => c.codeId === LIMIT_CODE_ID);
  const item = (code: string) => set?.items.find((i) => i.code === code);
  const min = toNumber(item("MIN")?.attrs[0]);
  const max = toNumber(item("MAX")?.attrs[0]);
  if (min === null || max === null) return null;
  return {
    min,
    max,
    unit: item("MIN")?.attrs[1] || item("MAX")?.attrs[1] || "MT/개",
  };
}

/** 허용 범위와 룰 결과가 어긋나는 칸(범위 안인데 N, 범위 밖인데 Y) — 데이터 점검용. */
export function rangeMismatches(
  matrix: WeightMatrix,
  limit: WeightLimit | null,
): WeightCell[] {
  if (!limit) return [];
  const out: WeightCell[] = [];
  for (const c of matrix.cells.values()) {
    if (c.value === null) continue;
    const inside = c.value >= limit.min - 1e-9 && c.value <= limit.max + 1e-9;
    if (inside !== c.inRange) out.push(c);
  }
  return out;
}

/** 단중 하나의 허용범위 안 분할 수(오름차순). */
export function feasibleSplits(matrix: WeightMatrix, weight: number): number[] {
  return matrix.splits.filter(
    (s) => matrix.cells.get(cellKey(weight, s))?.inRange,
  );
}

export type WeightChangeKind = "최초 등록" | "셀 수정" | "셀 추가" | "셀 삭제";

export interface WeightChange {
  key: string;
  ver: string;
  applyFrom: string;
  kind: WeightChangeKind;
  item: string;
  before: string;
  after: string;
}

const cellItem = (c: Pick<WeightCell, "weight" | "split">) =>
  `단중 ${fmtWeight(c.weight)} × ${c.split}분할`;
const cellText = (c: WeightCell) =>
  `${fmtValue(c.value)}${c.inRange ? " (범위 내)" : ""}`;

/**
 * 버전 이력 → 칸 단위 변경 목록(새 버전 먼저). 첫 버전은 「최초 등록 N셀」 한 줄이다.
 * Maru 는 버전을 복사할 때 행을 유지하므로 단중 × 분할 칸으로 맞춘다.
 */
export function weightChanges(
  versions: readonly RuleVersion[],
): WeightChange[] {
  const perVersion: WeightChange[][] = [];
  versions.forEach((v, i) => {
    const next = buildWeightMatrix(v);
    const applyFrom = v.applyFrom ?? "";
    if (i === 0) {
      perVersion.push([
        {
          key: `${v.ver}|init`,
          ver: v.ver,
          applyFrom,
          kind: "최초 등록",
          item: `단중 ${next.weights.length}단 × 분할 ${next.splits.length}열`,
          before: "",
          after: `${next.cells.size}셀 · 범위 내 ${next.inRangeCount}셀`,
        },
      ]);
      return;
    }
    const prev = buildWeightMatrix(versions[i - 1]);
    const keys = new Set([...prev.cells.keys(), ...next.cells.keys()]);
    const changes: (WeightChange & { w: number; s: number })[] = [];
    for (const key of keys) {
      const a = prev.cells.get(key);
      const b = next.cells.get(key);
      const ref = (b ?? a)!;
      const base = {
        key: `${v.ver}|${key}`,
        ver: v.ver,
        applyFrom,
        item: cellItem(ref),
        w: ref.weight,
        s: ref.split,
      };
      if (a && b) {
        if (a.value !== b.value || a.inRange !== b.inRange)
          changes.push({
            ...base,
            kind: "셀 수정",
            before: cellText(a),
            after: cellText(b),
          });
      } else if (b)
        changes.push({
          ...base,
          kind: "셀 추가",
          before: "",
          after: cellText(b),
        });
      else if (a)
        changes.push({
          ...base,
          kind: "셀 삭제",
          before: cellText(a),
          after: "",
        });
    }
    changes.sort((x, y) => x.w - y.w || x.s - y.s);
    perVersion.push(changes.map(({ w: _w, s: _s, ...c }) => c));
  });
  return perVersion.reverse().flat();
}
