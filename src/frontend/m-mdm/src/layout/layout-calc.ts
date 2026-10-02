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

/**
 * 헤더 길이 합에서 본문을 놓는다. 헤더 길이 하나라도 null(판정 시각에 확정 헤더 없음)이면 그 뒤 헤더 오프셋·헤더 길이 합·본문 오프셋·
 * 총 길이는 null 이다 — 0 으로 바꿔 계산하지 않는다(서버 composedView 와 같은 규칙). 본문 LENGTH 는 그대로 계산한다.
 */
export function placeMessage<T extends LayoutItemRow>(headerTotals: Array<number | null>, bodyRows: T[]) {
  const headerOffsets: Array<number | null> = [];
  let headerLength: number | null = 0;
  for (const t of headerTotals) {
    headerOffsets.push(headerLength);
    headerLength = headerLength == null || t == null ? null : headerLength + t;
  }
  if (headerLength == null) {
    const rows = bodyRows.map((r) => ({ ...r, OFFSET: null, LENGTH: itemLength(r) }));
    return { headerOffsets, headerLength, rows, total: null };
  }
  const { rows, end } = lay(bodyRows, headerLength);
  return { headerOffsets, headerLength: headerLength as number | null, rows, total: end as number | null };
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

/** 1부터 센 위치 — "131-150", 길이 1 이면 "63". 오프셋·길이를 모르면(null) "-". */
export function positionLabel(offset: number | null | undefined, length: number | null | undefined): string {
  if (offset == null || length == null) return "-";
  return length <= 1 ? String(offset + 1) : `${offset + 1}-${offset + length}`;
}

/** 모르는 길이·오프셋(null)은 "-" 로 보인다. */
export function lengthText(v: number | null | undefined): string {
  return v == null ? "-" : String(v);
}

/**
 * `헤더 130 (100 + 30) + 본문 57 (20 + 8 + 4 + 25) = 187 바이트`(html).
 * 헤더 길이 하나라도 null 이면 헤더 합·총 길이는 "-" 다(`헤더 - (100 + -) + 본문 57 (…) = - 바이트`).
 */
export function summaryText(headerTotals: Array<number | null>, bodyRows: LayoutItemRow[]): string {
  const unknown = headerTotals.some((t) => t == null);
  const h = unknown ? null : headerTotals.reduce<number>((a, b) => a + (b as number), 0);
  const lengths = bodyRows.map((r) => r.LENGTH ?? itemLength(r));
  const b = lengths.reduce((a, x) => a + x, 0);
  const hPart = headerTotals.length ? ` (${headerTotals.map(lengthText).join(" + ")})` : "";
  const bPart = lengths.length ? ` (${lengths.join(" + ")})` : "";
  return `헤더 ${lengthText(h)}${hPart} + 본문 ${b}${bPart} = ${lengthText(h == null ? null : h + b)} 바이트`;
}
