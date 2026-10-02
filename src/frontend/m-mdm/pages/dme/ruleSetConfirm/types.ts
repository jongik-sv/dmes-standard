/**
 * ruleSetConfirm 응답 타입(D-144 2단계, 서버 RuleSetConfirmService 의 `data.result` 모양). 버전(ver)은 `"1.001"` 문자열,
 * 날짜는 `yyyy-MM-dd HH:mm:ss`(KST) 문자열이다. 검사 항목·적용 순서·diff 건수 모양은 ruleConfirm 과 같다.
 */
import type { MdmVersionStatus } from "@/shell";

import type { ApplyFromCheck, CaseSummary, CheckIssue, CheckItem, DiffCounts, DiffKind } from "../ruleConfirm/types";

/** 확정 대기 목록 한 행 — 세트의 DRAFT 마다 한 행. */
export interface PendingSetDraft {
  setId: string;
  setName: string;
  ver: string;
  verKind: string;
  ownerId: string | null;
  /** 부모 세트 상태. */
  setStatus: string;
}

export interface SetSearchResult {
  rows?: PendingSetDraft[];
}

export interface SetConfirmSet {
  setId: string;
  setName: string;
  status: string;
}

export interface SetConfirmVersion {
  ver: string;
  verKind: string;
  verLabel: string;
  status: MdmVersionStatus;
  ownerId: string | null;
  rowVersion: number;
  baseVer: string | null;
  applyFrom: string | null;
  applyTo: string | null;
  requestedBy: string | null;
  releasedAt: string | null;
  ruleIds: string[];
}

export interface SetPreviousVersion {
  ver: string;
  verLabel: string;
  applyFrom: string | null;
  applyTo: string | null;
}

/** 흐름 diff 한 행 — key 는 노드·선 ID. ADDED 는 oldValues, REMOVED 는 newValues 가 null 이다. */
export interface SetDiffRow {
  key: string;
  kind: DiffKind;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}

export interface SetConfirmView {
  set: SetConfirmSet;
  version: SetConfirmVersion;
  previous: SetPreviousVersion | null;
  firstVersion: boolean;
  diff: SetDiffRow[];
  diffCounts: DiffCounts;
  /** 저장된 흐름이 손상돼 diff 를 만들지 못했을 때의 사유(없으면 null·생략). */
  diffError?: string | null;
  serverNow: string;
}

/** ruleConfirm `ValidateResult` 에서 입력 계약 경고(`contractWarnings`)를 뺀 모양. */
export interface SetValidateResult {
  items?: CheckItem[];
  applyFromCheck?: ApplyFromCheck;
  caseSummary?: CaseSummary;
  rejectedCount?: number;
  warnedCount?: number;
  applyFrom?: string;
  futureApplyFrom?: boolean;
  serverNow?: string;
}

export interface SetConfirmResult extends Partial<SetConfirmView> {
  confirmed?: { ver: string; rowVersion: number };
  closedPreviousVer?: string | null;
  warnings?: CheckIssue[];
}
