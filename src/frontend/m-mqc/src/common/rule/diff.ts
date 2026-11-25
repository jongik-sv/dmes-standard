/**
 * 버전 이력 — 이웃한 두 버전의 행 차이. Maru 는 버전을 복사할 때 row_id 를 유지하므로 rowId 로 맞춘다.
 * 글(조건 문장 → 결과)이 바뀌면 changed, 글은 같고 순번만 바뀌면 moved(FIRST 정책은 순번이 적중을 가르므로 같음으로 두지 않는다).
 */
import { displayResultText, rowKeyOf, type RuleDisplay } from "./display";
import { CATALOG, type Catalog } from "./meta";
import { NA_TEXT, rowConditionText, rowResultText } from "./text";
import type { RuleRow, RuleVersion } from "./types";

export type RowDiffKind = "added" | "removed" | "changed" | "moved" | "same";

export interface RowDiff {
  rowId: number;
  kind: RowDiffKind;
  /** 정렬용 — 새 버전 순번(삭제 행은 옛 순번). */
  seq: number;
  before?: string;
  after?: string;
  /** 행 키(display.keyVar 값 — 새 버전 행, 삭제 행은 옛 행). 표시 설정이 없으면 「—」. */
  ruleKey: string;
}

export const ROW_DIFF_LABEL: Record<RowDiffKind, string> = {
  added: "추가",
  removed: "삭제",
  changed: "변경",
  moved: "이동",
  same: "같음",
};

/**
 * 행 한 줄 글 — 「조건 문장 → 결과 문장」. 기본 행은 앞에 「[기본 행]」.
 * display 를 주면 결과 문장은 룰 ID(별도 열)·숨김 변수를 빼고 앞 열 변수(우선순위 등)는 넣는다 — 순서를 바꾸는 값이 바뀌어도 변경으로 잡히게.
 */
export function versionRowText(
  ruleId: string,
  version: Pick<RuleVersion, "vars">,
  row: RuleRow,
  catalog: Catalog = CATALOG,
  display?: RuleDisplay,
): string {
  const rule = { ruleId, vars: version.vars };
  const head = row.rowKind === "DEFAULT" ? "[기본 행] " : "";
  const result = display
    ? displayResultText(
        rule,
        row,
        { ...display, leadVars: [], hiddenVars: display.hiddenVars },
        catalog,
      )
    : rowResultText(rule, row, catalog);
  return `${head}${rowConditionText(rule, row, catalog)} → ${result}`;
}

/** prev(없으면 첫 버전 — 모두 추가) → next 의 행 차이. 순번 → 행 ID 순. display 는 versionRowText 와 행 키에 쓴다. */
export function diffVersions(
  ruleId: string,
  prev: RuleVersion | undefined,
  next: RuleVersion,
  catalog: Catalog = CATALOG,
  display?: RuleDisplay,
): RowDiff[] {
  const text = (v: RuleVersion, r: RuleRow) =>
    versionRowText(ruleId, v, r, catalog, display);
  const key = (r: RuleRow) => rowKeyOf(display, r.results) ?? NA_TEXT;
  const before = new Map((prev?.rows ?? []).map((r) => [r.rowId, r]));
  const out: RowDiff[] = [];
  for (const r of next.rows) {
    const b = before.get(r.rowId);
    const after = text(next, r);
    if (!b || !prev)
      out.push({
        rowId: r.rowId,
        kind: "added",
        after,
        seq: r.seq,
        ruleKey: key(r),
      });
    else {
      const was = text(prev, b);
      if (was !== after)
        out.push({
          rowId: r.rowId,
          kind: "changed",
          before: was,
          after,
          seq: r.seq,
          ruleKey: key(r),
        });
      else if (b.seq !== r.seq)
        out.push({
          rowId: r.rowId,
          kind: "moved",
          before: `순번 ${b.seq}`,
          after: `순번 ${r.seq}`,
          seq: r.seq,
          ruleKey: key(r),
        });
      else
        out.push({
          rowId: r.rowId,
          kind: "same",
          before: was,
          after,
          seq: r.seq,
          ruleKey: key(r),
        });
    }
    before.delete(r.rowId);
  }
  if (prev)
    for (const b of before.values())
      out.push({
        rowId: b.rowId,
        kind: "removed",
        before: text(prev, b),
        seq: b.seq,
        ruleKey: key(b),
      });
  return out.sort((a, b) => a.seq - b.seq || a.rowId - b.rowId);
}

/** 차이 건수 — 「추가 2 · 변경 1 …」 머리 글용. 같음은 세지 않는다. */
export function diffSummary(diffs: readonly RowDiff[]): string {
  const counts = new Map<RowDiffKind, number>();
  for (const d of diffs) counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
  const parts = (["added", "removed", "changed", "moved"] as const)
    .filter((k) => counts.get(k))
    .map((k) => `${ROW_DIFF_LABEL[k]} ${counts.get(k)}`);
  return parts.length > 0 ? parts.join(" · ") : "바뀐 행 없음";
}
