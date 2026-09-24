/**
 * ruleEdit 화면의 OASIS 호출(TSK-08-02 design §6.1) — search·view·save(HEADER|TABLE)·delete(VERSION|RULE)·copy·lock·unlock·handover.
 * 표 저장의 행은 params 가 아니라 `grids.rows.rows` 로 보낸다(Build 이탈 B4). 쓰기 뒤에는 화면이 view 를 다시 불러 row_version 을 맞춘다.
 */
import { callOasis } from "@/dme/oasis-call";

import type {
  HitPolicyCode,
  RuleEditView,
  RulePickRow,
  RuleTableSaveResult,
  RuleVersionResult,
} from "./types";

const SERVICE = "ruleEdit";

export async function searchRulePrefix(keyword: string): Promise<RulePickRow[]> {
  const res = await callOasis<{ list?: RulePickRow[] }>(SERVICE, "search", { keyword: keyword.trim() || undefined });
  return res.list ?? [];
}

export function viewRule(ruleId: string, ver?: number | null): Promise<RuleEditView> {
  return callOasis<RuleEditView>(SERVICE, "view", { maruRuleId: ruleId, ver: ver ?? undefined });
}

export interface HeaderForm {
  maruRuleName: string;
  description: string;
  usageNote: string;
}

export function saveHeader(ruleId: string, form: HeaderForm): Promise<unknown> {
  return callOasis(SERVICE, "save", {
    part: "HEADER",
    maruRuleId: ruleId,
    maruRuleName: form.maruRuleName,
    description: form.description,
    usageNote: form.usageNote,
  });
}

/** 표 저장 한 행 — rowId 는 새 행이면 음수 임시 ID, 순서가 곧 표시 순서다(seq 는 서버가 정한다, I10). */
export interface TableSaveRow {
  rowId: number;
  rowKind: "NORMAL" | "DEFAULT";
  cells: string;
  note?: string | null;
}

export function saveTable(
  ruleId: string,
  ver: number,
  rowVersion: number,
  hitPolicy: HitPolicyCode | null,
  rows: TableSaveRow[],
): Promise<RuleTableSaveResult> {
  const gridRows = rows.map((r) => {
    const out: Record<string, unknown> = { rowId: r.rowId, rowKind: r.rowKind, cells: r.cells };
    if (r.note != null && r.note !== "") out.note = r.note;
    return out;
  });
  return callOasis<RuleTableSaveResult>(
    SERVICE,
    "save",
    { part: "TABLE", maruRuleId: ruleId, ver, rowVersion, hitPolicy: hitPolicy ?? undefined },
    { rows: { rows: gridRows } },
  );
}

export function deleteDraft(ruleId: string, ver: number, rowVersion: number): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "delete", { maruRuleId: ruleId, ver, rowVersion, target: "VERSION" });
}

export function deprecateRule(ruleId: string): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "delete", { maruRuleId: ruleId, target: "RULE" });
}

export function newVersion(ruleId: string): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "copy", { maruRuleId: ruleId });
}

export function lockVersion(ruleId: string, ver: number, rowVersion: number): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "lock", { maruRuleId: ruleId, ver, rowVersion });
}

export function unlockVersion(ruleId: string, ver: number, rowVersion: number): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "unlock", { maruRuleId: ruleId, ver, rowVersion });
}

export function handoverVersion(ruleId: string, ver: number, rowVersion: number, newOwnerId: string): Promise<RuleVersionResult> {
  return callOasis<RuleVersionResult>(SERVICE, "handover", { maruRuleId: ruleId, ver, rowVersion, newOwnerId });
}
