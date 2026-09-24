/**
 * 오프셋·총 길이 즉시 재계산(TSK-05-02 design.md §1 — 불변 I1·I2·I4·I11). 정본은 Java `LayoutOffsetCalculator` — 같은 규칙:
 * 오프셋은 0부터, 헤더 항목은 그 헤더 안 상대값, 본문 항목은 메시지 절대값(앞 헤더 길이 합에서 시작).
 * 저장값은 서버가 다시 계산하므로 여기 값은 미리보기다.
 */
import { tryDecodeNumFormat } from "./num-format";
import type { LayoutItemRow } from "./types";

/** FILLER → FILLER 길이 / 숫자 표현 형식 → 표현 자리수 / 아니면 도메인 유효 길이(없으면 0). */
export function itemLength(row: LayoutItemRow): number {
  if (row.FILL_KIND === "FILLER") return row.FILLER_LENGTH != null && row.FILLER_LENGTH > 0 ? row.FILLER_LENGTH : 0;
  const f = tryDecodeNumFormat(row.NUM_FORMAT);
  if (f) return f.width;
  return row.DOMAIN_LENGTH ?? 0;
}

function lay<T extends LayoutItemRow>(rows: T[], base: number): { rows: T[]; end: number } {
  let at = base;
  const out = rows.map((r) => {
    const length = itemLength(r);
    const next = { ...r, OFFSET: at, LENGTH: length };
    at += length;
    return next;
  });
  return { rows: out, end: at };
}

export function placeHeader<T extends LayoutItemRow>(rows: T[]): { rows: T[]; total: number } {
  const { rows: out, end } = lay(rows, 0);
  return { rows: out, total: end };
}

export function placeMessage<T extends LayoutItemRow>(headerTotals: number[], bodyRows: T[]) {
  const headerOffsets: number[] = [];
  let headerLength = 0;
  for (const t of headerTotals) {
    headerOffsets.push(headerLength);
    headerLength += t;
  }
  const { rows, end } = lay(bodyRows, headerLength);
  return { headerOffsets, headerLength, rows, total: end };
}

/** from 행을 to 자리로 옮기고 SEQ 를 1..n 으로 다시 매긴다. */
export function moveRow<T extends LayoutItemRow>(rows: T[], from: number, to: number): T[] {
  const out = [...rows];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return renumber(out);
}

/** 드래그 결과(행 KEY 순서)로 다시 줄 세운다. 모르는 키는 무시하고 빠진 행은 뒤에 둔다. */
export function reorder<T extends LayoutItemRow>(rows: T[], orderedKeys: Array<string | number>): T[] {
  const byKey = new Map(rows.map((r) => [String(r.KEY), r]));
  const out: T[] = [];
  for (const k of orderedKeys) {
    const r = byKey.get(String(k));
    if (r) {
      out.push(r);
      byKey.delete(String(k));
    }
  }
  out.push(...byKey.values());
  return renumber(out);
}

export function renumber<T extends LayoutItemRow>(rows: T[]): T[] {
  return rows.map((r, i) => ({ ...r, SEQ: i + 1 }));
}

/** 1부터 센 위치 — "131-150", 길이 1 이면 "63". */
export function positionLabel(offset: number, length: number): string {
  return length <= 1 ? String(offset + 1) : `${offset + 1}-${offset + length}`;
}

/** `헤더 130 (100 + 30) + 본문 57 (20 + 8 + 4 + 25) = 187 바이트`(html). */
export function summaryText(headerTotals: number[], bodyRows: LayoutItemRow[]): string {
  const h = headerTotals.reduce((a, b) => a + b, 0);
  const lengths = bodyRows.map((r) => r.LENGTH ?? itemLength(r));
  const b = lengths.reduce((a, x) => a + x, 0);
  const hPart = headerTotals.length ? ` (${headerTotals.join(" + ")})` : "";
  const bPart = lengths.length ? ` (${lengths.join(" + ")})` : "";
  return `헤더 ${h}${hPart} + 본문 ${b}${bPart} = ${h + b} 바이트`;
}
