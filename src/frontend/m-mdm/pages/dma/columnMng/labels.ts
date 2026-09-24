/**
 * 표시명 폴백(TSK-04-04 design.md I11, 수용 기준 2). 사전은 셋을 다 내려보내고 고르지 않으므로 표시 쪽이
 * 빈 칸을 짧은 → 중간 → 긴 → 논리명 순으로 더 긴 쪽으로 채운다. 공백만 있는 값은 빈 값이다.
 */
import type { LabelSet } from "./types";

export interface LabelSource {
  columnName: string;
  labelLong?: string | null;
  labelMid?: string | null;
  labelShort?: string | null;
}

function present(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim() === "" ? null : value;
}

export function resolveLabels(row: LabelSource): LabelSet {
  const labelLong = present(row.labelLong) ?? row.columnName;
  const labelMid = present(row.labelMid) ?? labelLong;
  const labelShort = present(row.labelShort) ?? labelMid;
  return { labelLong, labelMid, labelShort };
}

/** 목록 표시용 — 긴 / 중간 / 짧은. */
export function formatLabels(row: LabelSource): string {
  const r = resolveLabels(row);
  return `${r.labelLong} / ${r.labelMid} / ${r.labelShort}`;
}
