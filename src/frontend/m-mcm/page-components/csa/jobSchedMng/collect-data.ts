/**
 * 수집 값 보기 변환 — 서버가 준 (SLOT, 항목 키, 값) 행을 화면 그리드 행으로 바꾼다. 순수 함수만 둔다(m-mcm vitest 가 shared 없이 시험한다).
 */
import type { CollectDataRow, CollectLatestGridRow } from "./types";

/** 이력 보기에서 항목을 열로 펴는 상한 — 항목 키가 이보다 많으면 항목 키 조건으로 좁혀 보게 한다. */
export const PIVOT_MAX_COLUMNS = 60;

/** 한 번에 받는 행 수 상한(서버 상한과 같다). */
export const COLLECT_PAGE_LIMIT = 500;

/** 기간 선택지(일). */
export const COLLECT_DAYS_OPTIONS: readonly number[] = [1, 7, 30, 90];
export const COLLECT_DEFAULT_DAYS = 7;

/** yyyyMMddHHmm → 「yyyy-MM-dd HH:mm」. 형식이 아니면 그대로. */
export function formatSlot(slot: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(slot);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : slot;
}

/** 값 칸에 보일 글자 — 숫자 값이 있으면 숫자(소수 8자리까지, 불필요한 0 없이), 없으면 글자 값. */
export function formatValue(row: Pick<CollectDataRow, "valueNum" | "valueTxt">): string {
  if (row.valueNum !== null) return row.valueNum.toLocaleString("en-US", { maximumFractionDigits: 8 });
  return row.valueTxt;
}

/** 최신 회차 보기 행 — 서버가 항목 키 오름차순으로 주므로 순서를 그대로 둔다. */
export function toLatestRows(rows: readonly CollectDataRow[]): CollectLatestGridRow[] {
  return rows.map((r) => ({ itemKey: r.itemKey, value: formatValue(r), collectedAt: r.collectedAt }));
}

export interface PivotColumn {
  /** 그리드 칸 이름 — 항목 키에 점·공백이 있어도 AG Grid 필드 경로로 읽히지 않게 순번(c0, c1…)으로 둔다. */
  key: string;
  /** 열 머리글 = 항목 키. */
  header: string;
}

export interface PivotResult {
  /** 열이 된 항목(사전순). */
  columns: PivotColumn[];
  /** SLOT 하나가 한 행(`slot`·`slotLabel` 과 항목 칸). 최신 SLOT 이 먼저. */
  rows: Record<string, string>[];
  /** 항목 키가 상한을 넘어 일부 열을 뺐는가. */
  clipped: boolean;
}

/** (SLOT, 항목 키, 값) 행을 SLOT 행 × 항목 열로 편다. */
export function pivotBySlot(rows: readonly CollectDataRow[], maxColumns = PIVOT_MAX_COLUMNS): PivotResult {
  const keys = [...new Set(rows.map((r) => r.itemKey))].sort();
  const clipped = keys.length > maxColumns;
  const kept = clipped ? keys.slice(0, maxColumns) : keys;
  const columns = kept.map((header, i) => ({ key: `c${i}`, header }));
  const colOf = new Map(columns.map((c) => [c.header, c.key]));
  const bySlot = new Map<string, Record<string, string>>();
  for (const r of rows) {
    const col = colOf.get(r.itemKey);
    if (!col) continue;
    let row = bySlot.get(r.slot);
    if (!row) {
      row = { slot: r.slot, slotLabel: formatSlot(r.slot) };
      bySlot.set(r.slot, row);
    }
    row[col] = formatValue(r);
  }
  const out = [...bySlot.values()].sort((a, b) => (a.slot < b.slot ? 1 : a.slot > b.slot ? -1 : 0));
  return { columns, rows: out, clipped };
}

/** 이어 받은 쪽을 합친다 — 같은 (SLOT, 항목 키)가 겹치면 뒤에 온 것(나중에 받은 값)으로 바꾼다. */
export function mergePages(prev: readonly CollectDataRow[], next: readonly CollectDataRow[]): CollectDataRow[] {
  const map = new Map<string, CollectDataRow>();
  for (const r of prev) map.set(`${r.slot}|${r.itemKey}`, r);
  for (const r of next) map.set(`${r.slot}|${r.itemKey}`, r);
  return [...map.values()].sort((a, b) => (a.slot !== b.slot ? (a.slot < b.slot ? 1 : -1) : a.itemKey < b.itemKey ? -1 : a.itemKey > b.itemKey ? 1 : 0));
}

/** 고른 작업이 수집 값 탭을 보일 대상인가: 저장한 수집(COLLECT) 작업이고 읽은 값을 표에 저장(save)하는 것만. */
export function isCollectStored(form: { isNew: boolean; jobKind: string; save: boolean } | null): boolean {
  return !!form && !form.isNew && form.jobKind === "COLLECT" && form.save;
}
