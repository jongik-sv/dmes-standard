/**
 * 값 테스트 표 칠하기(TSK-08-04 design §2.5·§6.7·I33). 칠하기는 서버 판정 결과로만 한다(06:731 "정식 판정은 서버") — 적중 행,
 * 평가했지만 적중하지 않은 행의 첫 거짓 칸, 결과 열 그룹에서 고른 열(강조)과 같은 그룹 나머지 열(흐림, 06:306).
 *
 * 표에 올리는 것은 이 표가 보이는 정의의 결과일 때뿐이다: BODY 는 돌릴 때의 표 rev 와 지금 rev 가 같을 때, VERSION 은 보이는 버전과
 * 같은 버전·같은 row_version 이고 저장 안 한 변경이 없을 때. BODY 결과 뒤 표가 바뀌면 결과를 지우고 안내한다.
 */
import { sameVer } from "@/shell/version-format";

import type { ResolvedVar, ValueTestResult, ValueTestTarget, VarMeta } from "../types";

/** 표에 칠할 값 테스트 표시. chosen·dimmed 는 적중 행마다(COLLECT 는 행마다 고른 열이 다르다). */
export interface TableTestMarks {
  hitRowIds: Set<number>;
  /** row_id → 첫 거짓 칸 var_id(평가했지만 적중하지 않은 행). */
  firstFalse: Map<number, number>;
  chosen: Map<number, Set<number>>;
  dimmed: Map<number, Set<number>>;
}

/** 카드 사이에 나누는 값 테스트 한 번. rev 는 BODY 를 돌릴 때의 표 rev, rowVersion 은 VERSION 을 돌릴 때 그 버전의 row_version. */
export interface TestRunView {
  ruleId: string;
  target: ValueTestTarget;
  ver: string | null;
  rowVersion: number | null;
  rev: number | null;
  result: ValueTestResult;
  /**
   * ⑥ "모두 실행" 으로 케이스만 판정한 것 — 요청에 ④ 입력도 실리지만(서버가 요구) 그 결과는 케이스 결과가 아니므로
   * ⑤ 에 보이지 않고 표에도 칠하지 않는다. 케이스별 결과는 ⑥ 표가 보인다.
   */
  casesOnly?: boolean;
}

/** 지금 표가 보이는 것. */
export interface TableShown {
  ruleId: string;
  ver: string | null;
  rowVersion: number | null;
  rev: number | null;
  dirty: boolean;
}

/**
 * 서버 결과 → 표시. 기본 행이 적용되면 엔진 hits 가 비어 있으므로(`RuleEvaluator` defaultApplied) 보이는 정의의 기본 행 row_id 를 받는다.
 * 그룹은 `varMeta.resGrp`(공백이면 그룹 없음)로 묶는다.
 */
export function testMarksOf(
  result: ValueTestResult,
  vars: readonly ResolvedVar[],
  meta: readonly Pick<VarMeta, "varId" | "resGrp">[] | undefined,
  defaultRowId: number | null,
): TableTestMarks {
  const marks: TableTestMarks = { hitRowIds: new Set(), firstFalse: new Map(), chosen: new Map(), dimmed: new Map() };
  const hits = result.hits ?? [];
  for (const h of hits) marks.hitRowIds.add(h.rowId);
  if (hits.length === 0 && result.defaultApplied && defaultRowId != null) marks.hitRowIds.add(defaultRowId);
  for (const t of result.trace ?? []) {
    if (t.evaluated && !t.hit && t.firstFalseVarId != null) marks.firstFalse.set(t.rowId, t.firstFalseVarId);
    // 판정 오류(UNIQUE 적중 둘 이상 등)면 hits 가 없다 — 서버가 싣는 행 추적의 맞은 행을 칠한다.
    if (result.outcome !== "OK" && t.hit) marks.hitRowIds.add(t.rowId);
  }
  const resultIds = new Set(vars.filter((v) => v.varKind === "RESULT").map((v) => v.varId));
  const groupOf = new Map<string, number[]>();
  for (const m of meta ?? []) {
    const g = m.resGrp?.trim();
    if (!g || !resultIds.has(m.varId)) continue;
    groupOf.set(g, [...(groupOf.get(g) ?? []), m.varId]);
  }
  for (const h of hits) {
    for (const [grp, choice] of Object.entries(h.groupChoices ?? {})) {
      const members = groupOf.get(grp.trim()) ?? [];
      for (const varId of members) {
        const target = varId === choice ? marks.chosen : marks.dimmed;
        const set = target.get(h.rowId) ?? new Set<number>();
        set.add(varId);
        target.set(h.rowId, set);
      }
    }
  }
  return marks;
}

/** 이 결과를 지금 표에 칠하는가(I33). */
export function runShownOnTable(run: TestRunView | null, table: TableShown): boolean {
  if (!run || run.casesOnly || run.ruleId !== table.ruleId || !sameVer(run.ver, table.ver)) return false;
  if (run.target === "BODY") return run.rev != null && run.rev === table.rev;
  return !table.dirty && run.rowVersion === table.rowVersion;
}

/**
 * 표가 바뀐 뒤 결과를 남길지. 룰이 바뀌면(BODY 는 버전이 바뀌어도) 조용히 지우고, 같은 버전의 BODY 결과 뒤 표 rev 가 달라지면
 * 지우고 안내(cleared)한다. VERSION 결과는 표 편집과 무관하게 남는다(표에 칠할지는 `runShownOnTable` 이 본다).
 */
export function testRunAfterTableChange(
  run: TestRunView | null,
  draft: { ruleId: string; ver: string | null; rev: number },
): { run: TestRunView | null; cleared: boolean } {
  if (!run) return { run: null, cleared: false };
  if (run.ruleId !== draft.ruleId) return { run: null, cleared: false };
  if (run.target !== "BODY") return { run, cleared: false };
  if (!sameVer(run.ver, draft.ver)) return { run: null, cleared: false };
  if (run.rev !== draft.rev) return { run: null, cleared: true };
  return { run, cleared: false };
}
