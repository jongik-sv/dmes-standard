/**
 * 그리드 즉시 검사(TSK-08-02 design I13) — evalex `analyzeRule` 을 그대로 부르고 결과를 행·칸·표 단위로 나눈다.
 * 새 분석 알고리즘을 쓰지 않는다. 분석기는 편집 중 셀(예: 값 칸이 없는 셀)에서 예외를 던질 수 있어 잡아서 "분석 불가"로 돌린다
 * (분석기 자체는 TSK-03-04 산출물이라 고치지 않는다 — design Build 이탈 B8).
 */
import { analyzeRule, type HitPolicy } from "@/evalex";

import type { RuleIssueView, StoredRow } from "../types";
import { ruleDefFromStored, type StoredVar } from "./grid-model";

export interface AnalysisResult {
  issues: RuleIssueView[];
  failed: boolean;
  failure?: string;
}

export function runAnalysis(
  ruleId: string,
  ruleKind: "DECISION" | "DERIVE",
  hitPolicy: HitPolicy | null,
  vars: readonly StoredVar[],
  rows: readonly StoredRow[],
): AnalysisResult {
  try {
    const issues = analyzeRule(ruleDefFromStored(ruleId, ruleKind, hitPolicy, vars, rows));
    return { issues: issues.map((i) => ({ ...i, rowIds: [...i.rowIds] })), failed: false };
  } catch (e) {
    return { issues: [], failed: true, failure: e instanceof Error ? e.message : String(e) };
  }
}

/** 표 단위 이슈 — 표 아래 알림 줄에 모은다(시안 "표 단위 검사"). */
const TABLE_CODES = new Set(["VALUE_GAP", "NULL_GAP"]);

export interface SplitIssues {
  byRow: Map<number, { errors: number; warnings: number }>;
  /** `${rowId}:${varId}` → 가장 무거운 심각도. */
  byCell: Map<string, "ERROR" | "WARNING">;
  table: RuleIssueView[];
}

export function splitIssues(issues: readonly RuleIssueView[]): SplitIssues {
  const byRow = new Map<number, { errors: number; warnings: number }>();
  const byCell = new Map<string, "ERROR" | "WARNING">();
  const table: RuleIssueView[] = [];
  for (const i of issues) {
    if (TABLE_CODES.has(i.code)) {
      table.push(i);
      continue;
    }
    for (const rowId of i.rowIds) {
      const c = byRow.get(rowId) ?? { errors: 0, warnings: 0 };
      if (i.severity === "ERROR") c.errors++;
      else c.warnings++;
      byRow.set(rowId, c);
      if (i.varId != null) {
        const key = `${rowId}:${i.varId}`;
        if (byCell.get(key) !== "ERROR") byCell.set(key, i.severity);
      }
    }
  }
  return { byRow, byCell, table };
}

function projection(i: RuleIssueView) {
  return {
    code: i.code,
    severity: i.severity,
    rowIds: [...i.rowIds],
    varId: i.varId ?? null,
    lower: i.lower ?? null,
    upper: i.upper ?? null,
  };
}

/**
 * 분석기(TSK-03-04 이식본·서버 `RuleAnalyzer`)가 내는 코드 — 7종 + TS 의 `DERIVE_ORDER`. 저장 응답에는 이 밖에 서버 저장 검사의 이슈
 * (TSK-08-04 `RuleSaveIssueCode`·`PIVOT_COVER_INCOMPLETE`)가 분석 이슈 뒤에 붙는다.
 */
export const ANALYZER_CODES: ReadonlySet<string> = new Set([
  "ALL_NA_ROW",
  "UNRESOLVED_CELL",
  "OVERLAP",
  "OVERLAP_UNRESOLVED",
  "UNREACHABLE",
  "VALUE_GAP",
  "NULL_GAP",
  "DERIVE_ORDER",
]);

/** 서버 저장 검사만 낸 이슈(분석기 코드가 아닌 것) — 표 아래 "서버 저장 검사" 목록으로 따로 보인다. */
export function serverOnlyIssues(issues: readonly RuleIssueView[]): RuleIssueView[] {
  return issues.filter((i) => !ANALYZER_CODES.has(i.code));
}

/**
 * 서버·화면 분석이 같은가 — 분석기 코드만 견준다(I26, 서버 저장 검사의 이슈는 화면이 계산하지 않는다). message 를 빼고 순서까지
 * 견준다. 없는 칸과 null 은 같다(서버는 값이 없는 칸을 싣지 않는다).
 */
export function sameIssues(a: readonly RuleIssueView[], b: readonly RuleIssueView[]): boolean {
  const analyzed = (xs: readonly RuleIssueView[]) => JSON.stringify(xs.filter((i) => ANALYZER_CODES.has(i.code)).map(projection));
  return analyzed(a) === analyzed(b);
}

/** 저장 전 임시 row_id(음수)를 발급 번호로 바꾼다 — 저장 응답 `rowIdMap{"-1": 5}`. */
export function mapRowIds(issues: readonly RuleIssueView[], rowIdMap: Record<string, number> | undefined): RuleIssueView[] {
  const map = rowIdMap ?? {};
  return issues.map((i) => ({ ...i, rowIds: i.rowIds.map((id) => map[String(id)] ?? id) }));
}
