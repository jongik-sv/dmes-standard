/**
 * "고칠 위반" 정의 하나(UX 1차 U25) — 요약 줄·왼쪽 목록 수·노드 머리 수·[표준 위반] 탭이 모두 이 규칙을 쓴다. 순수.
 * 상태 TYPE·DOMAIN·MISS 인 컬럼만 센다. NEW·ALIAS 는 이 화면에서 고칠 수 없어 뺀다(그리드 배지로만 보임).
 * 감사 컬럼은 보기(showAudit)가 켜져 있을 때만 센다.
 */
import { isAuditColumnId } from "../audit-columns";
import type { ErdColumnStatus, ErdModelJson } from "../types";

export const BLOCKING_STATUSES: ReadonlySet<ErdColumnStatus> = new Set<ErdColumnStatus>(["TYPE", "DOMAIN", "MISS"]);

export function isCountedViolation(
  model: ErdModelJson, columnId: string, statuses: Record<string, ErdColumnStatus>, showAudit: boolean,
): boolean {
  const s = statuses[columnId];
  return s !== undefined && model.columns[columnId] !== undefined && BLOCKING_STATUSES.has(s) && (showAudit || !isAuditColumnId(model, columnId));
}

export function countTableViolations(
  model: ErdModelJson, tableId: string, statuses: Record<string, ErdColumnStatus>, showAudit: boolean,
): number {
  const t = model.tables[tableId];
  if (!t) return 0;
  return t.columnOrder.filter((c) => isCountedViolation(model, c, statuses, showAudit)).length;
}

export interface ModelSummary { tables: number; relations: number; inferred: number; violations: number | null }

/** relations = REJECTED 뺀 관계 수, inferred = INFERRED 수, violations = statuses 가 null 이면 null. */
export function modelSummary(model: ErdModelJson, statuses: Record<string, ErdColumnStatus> | null, showAudit: boolean): ModelSummary {
  const rels = Object.values(model.relations);
  const tableIds = Object.keys(model.tables);
  return {
    tables: tableIds.length,
    relations: rels.filter((r) => r.state !== "REJECTED").length,
    inferred: rels.filter((r) => r.state === "INFERRED").length,
    violations: statuses ? tableIds.reduce((n, t) => n + countTableViolations(model, t, statuses, showAudit), 0) : null,
  };
}

/** "표 57 · 관계 113(추정 113) · 고칠 위반 737" — 위반을 아직 못 읽었으면 "…". */
export function summaryText(s: ModelSummary): string {
  return `표 ${s.tables} · 관계 ${s.relations}(추정 ${s.inferred}) · 고칠 위반 ${s.violations ?? "…"}`;
}
